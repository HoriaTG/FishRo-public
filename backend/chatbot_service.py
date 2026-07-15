import re
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app_constants import ASSISTANT_ALLOWED_QUESTIONS, TICKET_CREATE_COOLDOWN_HOURS
from llm_service import ask_llm
from models import OrderDB, ProductDB, TicketDB, UserDB
from schemas import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantProductSuggestion,
)


CATEGORY_KEYWORDS = {
    "undita": ["undita", "undite"],
    "lanseta": ["lanseta", "lansete"],
    "mulineta": ["mulineta", "mulinete"],
    "carlig": ["carlig", "carlige", "cârlig", "cârlige"],
    "plumb": ["plumb", "plumbi"],
    "nailon": ["nailon", "fir", "fire", "monofilament"],
    "echipamente": ["echipament", "echipamente", "accesorii"],
    "momeli": ["momeala", "momeli", "boilies", "pelete"],
    "diverse": ["diverse", "alte produse"],
    "nada": ["nada", "nade"],
    "plute": ["pluta", "plute"],
}

FISHING_STYLE_HINTS = {
    "crap": ["lanseta", "mulineta", "nada", "momeli"],
    "feeder": ["lanseta", "mulineta", "momeli", "nada"],
    "spinning": ["lanseta", "mulineta", "momeli"],
    "stationar": ["undita", "plute", "carlig", "nailon"],
}


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    replacements = {
        "ă": "a",
        "â": "a",
        "î": "i",
        "ș": "s",
        "ş": "s",
        "ț": "t",
        "ţ": "t",
    }
    for src, dest in replacements.items():
        text = text.replace(src, dest)
    return text


NORMALIZED_ALLOWED_QUESTIONS = {normalize_text(q) for q in ASSISTANT_ALLOWED_QUESTIONS}


def format_price(value: float) -> str:
    return f"{value:.2f} lei"


def get_discounted_price(price: float, promotion: int | None) -> float:
    promo = promotion or 0
    promo = max(0, min(90, promo))
    return round(price * (1 - promo / 100), 2)


def serialize_assistant_product(product: ProductDB) -> AssistantProductSuggestion:
    discounted = get_discounted_price(product.price, product.promotion)
    return AssistantProductSuggestion(
        id=product.id,
        name=product.name,
        category=product.category,
        price=product.price,
        discounted_price=discounted,
        promotion=product.promotion or 0,
        image_url=f"/images/products/{product.code}.jpg",
    )


def assistant_response(
    *,
    reply: str,
    intent: str,
    suggestions: list[str] | None = None,
    products: list[AssistantProductSuggestion] | None = None,
    requires_login: bool = False,
) -> AssistantChatResponse:
    return AssistantChatResponse(
        reply=reply,
        intent=intent,
        requires_login=requires_login,
        suggestions=suggestions or [],
        products=products or [],
    )


def build_login_required_response(reply: str, intent: str) -> AssistantChatResponse:
    return assistant_response(
        reply=reply,
        intent=intent,
        requires_login=True,
        suggestions=[
            "Cum mă autentific?",
            "Cum deschid un tichet?",
            "Arată-mi promoțiile",
        ],
        products=[],
    )


def detect_budget_from_text(message: str) -> int | None:
    match = re.search(
        r"(?:sub|maxim|maximum|pana la|pana in|buget(?: de)?)\s*(\d{1,5})",
        message,
    )
    if match:
        return int(match.group(1))
    return None


def is_beginner_request(normalized_message: str) -> bool:
    beginner_words = [
        "incepator",
        "incepatori",
        "incepatoare",
        "inceput",
        "incep",
        "primul pescuit",
        "sunt nou",
    ]
    return any(word in normalized_message for word in beginner_words)


def is_product_recommendation_request(normalized_message: str) -> bool:
    product_request_phrases = [
        "recomand",
        "recomanzi",
        "recomandare",
        "recomandari",
        "sugestie",
        "sugestii",
        "sugereaza",
        "ce sa cumpar",
        "vreau sa cumpar",
        "as vrea sa cumpar",
        "caut",
        "cauta",
        "arata-mi",
        "produse",
        "produs",
        "promo",
        "promotii",
        "reducere",
        "reduceri",
        "buget",
        "sub ",
        "maxim",
        "maximum",
        "ieftin",
        "ieftine",
        "potrivit",
        "potrivite",
        "bun pentru",
        "buna pentru",
        "ai ceva",
    ]

    if any(phrase in normalized_message for phrase in product_request_phrases):
        return True

    return detect_budget_from_text(normalized_message) is not None


def is_greeting_or_smalltalk(normalized_message: str) -> bool:
    compact = re.sub(r"[^\w\s]", " ", normalized_message)
    compact = re.sub(r"\s+", " ", compact).strip()

    greeting_phrases = [
        "salut",
        "buna",
        "hei",
        "hello",
        "ceau",
        "ce faci",
        "cum esti",
        "ce mai faci",
        "salut ce faci",
        "salut fishbot",
        "salut fishbot ce faci",
    ]

    return compact in greeting_phrases


def get_top_promotions(db: Session, limit: int = 4) -> list[ProductDB]:
    return (
        db.query(ProductDB)
        .filter(ProductDB.quantity > 0, ProductDB.promotion > 0)
        .order_by(ProductDB.promotion.desc(), ProductDB.price.asc())
        .limit(limit)
        .all()
    )


def get_products_under_budget(db: Session, budget: int, limit: int = 4) -> list[ProductDB]:
    products = (
        db.query(ProductDB)
        .filter(ProductDB.quantity > 0)
        .order_by(ProductDB.price.asc())
        .all()
    )

    filtered = [
        product
        for product in products
        if get_discounted_price(product.price, product.promotion) <= budget
    ]
    return filtered[:limit]


def get_products_for_style(db: Session, style: str, limit: int = 4) -> list[ProductDB]:
    categories = FISHING_STYLE_HINTS.get(style, [])
    if not categories:
        return []

    return (
        db.query(ProductDB)
        .filter(ProductDB.category.in_(categories), ProductDB.quantity > 0)
        .order_by(ProductDB.promotion.desc(), ProductDB.price.asc())
        .limit(limit)
        .all()
    )


def build_products_context(products: list[ProductDB]) -> str:
    if not products:
        return "Nu există produse relevante disponibile în acest moment."

    lines = []

    for product in products:
        discounted = get_discounted_price(product.price, product.promotion)
        promo_text = f", promoție {product.promotion}%" if product.promotion else ""
        description_text = f", descriere: {product.description}" if product.description else ""

        lines.append(
            f"- {product.name}, categoria {product.category}, "
            f"preț {discounted:.2f} lei{promo_text}, stoc {product.quantity}"
            f"{description_text}"
        )

    return "\n".join(lines)


def get_relevant_products_for_llm(
    db: Session,
    normalized_message: str,
    limit: int = 6,
) -> list[ProductDB]:
    budget = detect_budget_from_text(normalized_message)

    detected_categories = []

    for category, keywords in CATEGORY_KEYWORDS.items():
        normalized_keywords = [normalize_text(keyword) for keyword in keywords]
        if any(keyword in normalized_message for keyword in normalized_keywords):
            detected_categories.append(category)

    if is_beginner_request(normalized_message):
        detected_categories.append("lanseta")

    detected_styles = []
    for style in FISHING_STYLE_HINTS:
        if style in normalized_message:
            detected_styles.append(style)

    style_categories = []
    for style in detected_styles:
        style_categories.extend(FISHING_STYLE_HINTS.get(style, []))

    all_categories = list(set(detected_categories + style_categories))

    query = db.query(ProductDB).filter(ProductDB.quantity > 0)

    if all_categories:
        query = query.filter(ProductDB.category.in_(all_categories))

    products = (
        query
        .order_by(ProductDB.promotion.desc(), ProductDB.price.asc())
        .limit(30)
        .all()
    )

    if budget is not None:
        products = [
            product
            for product in products
            if get_discounted_price(product.price, product.promotion) <= budget
        ]

    return products[:limit]


def build_llm_system_prompt(products_context: str) -> str:
    return f"""
Ești FishBot, asistentul virtual al magazinului online FishRo.

FishRo este un magazin online românesc de articole pentru pescuit.
Răspunzi întotdeauna în limba română, natural, clar și profesionist.

Stil de răspuns:
- vorbește ca un consultant de magazin, nu ca un robot
- folosește exclusiv adresarea informală la persoana a doua singular („tu”, „îți”, „poți”, „ți-am”)
- nu folosi niciodată formulări formale precum „dumneavoastră”, „vă recomand”, „puteți”
- când recomanzi produse, vorbește natural și prietenos
- nu menționa ID-uri interne ale produselor
- nu spune „puteți verifica detalii”
- când recomanzi produse, poți încheia cu formulări naturale precum:
  „Ți-am atașat produsul recomandat mai jos.”
  „Poți vedea produsul recomandat mai jos.”
  „Uite produsul care s-ar putea potrivi.”
- răspunde scurt, util și concret
- folosește maximum 2-4 paragrafe scurte
- nu folosi termeni inventați sau traduși greșit
- folosește termeni corecți: lansetă, undiță, mulinetă, cârlig, fir/nailon, nadă, momeală, plută, plumb
- evită formulări greșite precum „moară”, „șnur”, „sfoară de pescuit”, „cutie atașată la șnur”

Reguli importante:
- Nu inventa produse, prețuri sau stocuri.
- Dacă recomanzi produse concrete, folosește doar produsele din lista de mai jos.
- Dacă lista de produse este goală sau irelevantă, oferă sfaturi generale și recomandă utilizatorului să verifice produsele din magazin.
- Dacă utilizatorul întreabă despre coș, comenzi sau tichete personale, spune că trebuie să fie autentificat și să folosească opțiunile din aplicație.
- Dacă problema necesită intervenția unui moderator, recomandă deschiderea unui tichet.
- Nu promite că ai făcut acțiuni în aplicație. Tu doar oferi informații și recomandări.

Regula pentru atasamente:
- Spune ca ai atasat produse, recomandari sau variante mai jos doar daca lista de produse disponibile relevante contine produse concrete.
- Daca lista este goala, nu spune ca ai atasat produse si nu afirma ca magazinul are o gama de produse pentru cererea respectiva.

Produse disponibile relevante:
{products_context}
"""


def handle_assistant_chat(
    payload: AssistantChatRequest,
    db: Session,
    current_user: UserDB | None,
    build_cart_response,
) -> AssistantChatResponse:
    raw_message = payload.message.strip()
    if not raw_message:
        raise HTTPException(status_code=400, detail="Mesajul nu poate fi gol")

    message = normalize_text(raw_message)

    if message not in NORMALIZED_ALLOWED_QUESTIONS:
        if is_greeting_or_smalltalk(message):
            return assistant_response(
                reply=(
                    "Salut! Sunt aici si te pot ajuta cu produse de pescuit, "
                    "comenzi, cos sau tichete. Spune-mi ce cauti si vedem impreuna."
                ),
                intent="smalltalk_greeting",
                suggestions=[
                    "Arata-mi promotiile",
                    "Ce recomanzi pentru incepatori?",
                    "Cum comand?",
                    "Cum deschid un tichet?",
                ],
                products=[],
            )

        should_suggest_products = is_product_recommendation_request(message)
        relevant_products = (
            get_relevant_products_for_llm(db, message)
            if should_suggest_products
            else []
        )

        if should_suggest_products and not relevant_products:
            return assistant_response(
                reply=(
                    "Nu am gasit momentan produse disponibile care sa se potriveasca "
                    "cererii tale. Pot sa iti dau cateva sfaturi generale despre ce sa "
                    "urmaresti la alegere, dar nu iti atasez produse pentru ca nu am "
                    "gasit ceva potrivit in magazin."
                ),
                intent="llm_product_recommendation_empty",
                suggestions=[
                    "Arata-mi promotiile",
                    "Produse sub 200 lei",
                    "Cum comand?",
                    "Cum deschid un tichet?",
                ],
                products=[],
            )

        products_context = build_products_context(relevant_products)
        system_prompt = build_llm_system_prompt(products_context)

        llm_reply = ask_llm(system_prompt, raw_message)

        return assistant_response(
            reply=llm_reply,
            intent=(
                "llm_product_recommendation"
                if should_suggest_products
                else "llm_general_answer"
            ),
            suggestions=[
                "Arată-mi promoțiile",
                "Ce recomanzi pentru începători?",
                "Produse sub 200 lei",
                "Cum deschid un tichet?",
            ],
            products=[
                serialize_assistant_product(product)
                for product in relevant_products[:4]
            ],
        )

    if message == normalize_text("Arată-mi promoțiile"):
        products = get_top_promotions(db)
        if not products:
            return assistant_response(
                reply="În acest moment nu am găsit produse aflate la promoție.",
                intent="products_on_promotion",
                suggestions=[
                    "Ce recomanzi pentru începători?",
                    "Ce recomanzi pentru pescuit la crap?",
                    "Cum deschid un tichet?",
                ],
                products=[],
            )

        return assistant_response(
            reply="Acestea sunt câteva dintre produsele aflate acum la promoție.",
            intent="products_on_promotion",
            suggestions=[
                "Ce recomanzi pentru începători?",
                "Ce recomanzi pentru pescuit la crap?",
                "Cum comand?",
            ],
            products=[serialize_assistant_product(product) for product in products],
        )

    if message == normalize_text("Ce recomanzi pentru începători?"):
        beginner_products = (
            db.query(ProductDB)
            .filter(ProductDB.quantity > 0, ProductDB.category == "lanseta")
            .order_by(ProductDB.price.asc())
            .limit(1)
            .all()
        )

        return assistant_response(
            reply=(
                "Pentru un începător, o lansetă accesibilă și ușor de folosit este o alegere foarte bună. "
                "Ți-am atașat produsul recomandat mai jos."
            ),
            intent="beginner_recommendation",
            suggestions=[
                "Produse sub 200 lei",
                "Arată-mi promoțiile",
                "Cum comand?",
            ],
            products=[serialize_assistant_product(product) for product in beginner_products],
        )

    if message == normalize_text("Ce recomanzi pentru pescuit la crap?"):
        products = get_products_for_style(db, "crap")
        return assistant_response(
            reply=(
                "Pentru pescuitul la crap, îți recomand în general lansete, mulinete, nade și momeli. "
                "Uite câteva produse care s-ar putea potrivi."
            ),
            intent="products_for_carp",
            suggestions=[
                "Arată-mi promoțiile",
                "Produse sub 200 lei",
                "Cum comand?",
            ],
            products=[serialize_assistant_product(product) for product in products],
        )

    if message == normalize_text("Produse sub 200 lei"):
        budget = detect_budget_from_text(message) or 200
        products = get_products_under_budget(db, budget)

        if not products:
            return assistant_response(
                reply="Nu am găsit momentan produse disponibile sub 200 lei.",
                intent="products_under_budget",
                suggestions=[
                    "Arată-mi promoțiile",
                    "Ce recomanzi pentru începători?",
                    "Cum deschid un tichet?",
                ],
                products=[],
            )

        return assistant_response(
            reply="Am găsit câteva produse disponibile sub 200 lei.",
            intent="products_under_budget",
            suggestions=[
                "Arată-mi promoțiile",
                "Ce recomanzi pentru începători?",
                "Cum comand?",
            ],
            products=[serialize_assistant_product(product) for product in products],
        )

    if message == normalize_text("Cum mă autentific?"):
        return assistant_response(
            reply=(
                "Pentru autentificare, apasă pe butonul de login din site și introdu datele contului tău. "
                "Dacă nu ai cont, îl poți crea din pagina de înregistrare."
            ),
            intent="faq_login_help",
            suggestions=[
                "Cum comand?",
                "Cum deschid un tichet?",
                "Arată-mi promoțiile",
            ],
            products=[],
        )

    if message == normalize_text("Cum comand?"):
        return assistant_response(
            reply=(
                "Pentru a plasa o comandă, adaugi produsele dorite în coș, apoi intri în coș și finalizezi comanda."
            ),
            intent="faq_order_help",
            suggestions=[
                "Ce am în coș?",
                "Care este ultima mea comandă?",
                "Arată-mi promoțiile",
            ],
            products=[],
        )

    if message == normalize_text("Cum deschid un tichet?"):
        if not current_user:
            return build_login_required_response(
                "Ca să poți deschide un tichet, trebuie mai întâi să te autentifici.",
                "ticket_help",
            )

        latest_ticket = (
            db.query(TicketDB)
            .filter(TicketDB.user_id == current_user.id)
            .order_by(TicketDB.created_at.desc(), TicketDB.id.desc())
            .first()
        )

        if latest_ticket and latest_ticket.created_at:
            allowed_at = latest_ticket.created_at + timedelta(hours=TICKET_CREATE_COOLDOWN_HOURS)
            remaining = int((allowed_at - datetime.utcnow()).total_seconds())

            if remaining > 0:
                hours = remaining // 3600
                minutes = (remaining % 3600) // 60
                return assistant_response(
                    reply=(
                        f"Poți deschide un tichet din secțiunea „Tichetele mele”. "
                        f"Momentan mai trebuie să aștepți aproximativ {hours}h și {minutes}m."
                    ),
                    intent="ticket_help",
                    suggestions=[
                        "Am tichete deschise?",
                        "Arată-mi promoțiile",
                        "Cum comand?",
                    ],
                    products=[],
                )

        return assistant_response(
            reply=(
                "Poți deschide un tichet din secțiunea „Tichetele mele”. "
                "Alege categoria potrivită și descrie problema cât mai clar."
            ),
            intent="ticket_help",
            suggestions=[
                "Am tichete deschise?",
                "Arată-mi promoțiile",
                "Cum comand?",
            ],
            products=[],
        )

    if message == normalize_text("Am tichete deschise?"):
        if not current_user:
            return build_login_required_response(
                "Pentru a verifica tichetele tale, trebuie să fii autentificat.",
                "ticket_status",
            )

        open_tickets_count = (
            db.query(func.count(TicketDB.id))
            .filter(TicketDB.user_id == current_user.id, TicketDB.status == "open")
            .scalar()
        ) or 0

        if open_tickets_count == 0:
            return assistant_response(
                reply="Nu ai tichete deschise în acest moment.",
                intent="ticket_status",
                suggestions=[
                    "Cum deschid un tichet?",
                    "Arată-mi promoțiile",
                    "Cum comand?",
                ],
                products=[],
            )

        return assistant_response(
            reply=f"Ai {open_tickets_count} tichet(e) deschise în acest moment.",
            intent="ticket_status",
            suggestions=[
                "Cum deschid un tichet?",
                "Care este ultima mea comandă?",
                "Ce am în coș?",
            ],
            products=[],
        )

    if message == normalize_text("Ce am în coș?"):
        if not current_user:
            return build_login_required_response(
                "Pentru a vedea ce produse ai în coș, trebuie să fii autentificat.",
                "cart_summary",
            )

        cart = build_cart_response(db, current_user)
        total_items = sum(item.quantity for item in cart.items)

        if total_items == 0:
            return assistant_response(
                reply="Coșul tău este gol în acest moment.",
                intent="cart_summary",
                suggestions=[
                    "Arată-mi promoțiile",
                    "Cum comand?",
                    "Cum deschid un tichet?",
                ],
                products=[],
            )

        names = ", ".join(item.product_name for item in cart.items[:3])
        extra = ""
        if len(cart.items) > 3:
            extra = f" și încă {len(cart.items) - 3} produse"

        return assistant_response(
            reply=(
                f"Ai {total_items} produse în coș, în valoare totală de {format_price(cart.total)}. "
                f"În coș se află: {names}{extra}."
            ),
            intent="cart_summary",
            suggestions=[
                "Cum comand?",
                "Care este ultima mea comandă?",
                "Arată-mi promoțiile",
            ],
            products=[],
        )

    if message == normalize_text("Care este ultima mea comandă?"):
        if not current_user:
            return build_login_required_response(
                "Pentru a verifica comenzile tale, trebuie să fii autentificat.",
                "last_order",
            )

        latest_order = (
            db.query(OrderDB)
            .options(joinedload(OrderDB.items))
            .filter(OrderDB.user_id == current_user.id)
            .order_by(OrderDB.created_at.desc(), OrderDB.id.desc())
            .first()
        )

        if not latest_order:
            return assistant_response(
                reply="Nu am găsit încă nicio comandă în contul tău.",
                intent="last_order",
                suggestions=[
                    "Arată-mi promoțiile",
                    "Cum comand?",
                    "Cum deschid un tichet?",
                ],
                products=[],
            )

        item_count = sum(item.quantity for item in latest_order.items)
        return assistant_response(
            reply=(
                f"Ultima ta comandă este {latest_order.order_number}, are statusul "
                f"„{latest_order.status}”, conține {item_count} produse și are totalul de "
                f"{format_price(latest_order.total)}."
            ),
            intent="last_order",
            suggestions=[
                "Ce am în coș?",
                "Cum deschid un tichet?",
                "Arată-mi promoțiile",
            ],
            products=[],
        )

    return assistant_response(
        reply=(
            "Te rog alege una dintre întrebările disponibile de mai jos. "
            "Dacă ai o altă întrebare sau o problemă, deschide un tichet."
        ),
        intent="restricted_to_allowed_questions",
        suggestions=ASSISTANT_ALLOWED_QUESTIONS,
        products=[],
    )
