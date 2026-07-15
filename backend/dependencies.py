from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import os
from uuid import uuid4

from auth import create_access_token, decode_access_token
from db import SessionLocal
from models import TicketDB, UserDB

bearer_scheme = HTTPBearer(auto_error=False)
optional_bearer_scheme = HTTPBearer(auto_error=False)
SESSION_REFRESH_THRESHOLD_SECONDS = 30 * 60
SESSION_EXPIRE_MINUTES = 60
SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_EXPIRE_MINUTES * 60
SESSION_COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in {"1", "true", "yes", "on"}
SESSION_COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")


def get_session_id_from_request(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    header_session_id = request.headers.get("X-Session-Id")
    if header_session_id:
        return header_session_id
    if credentials:
        return credentials.credentials
    return None


def get_session_cookie_name(session_id: str) -> str:
    return f"fishro_session_{session_id}"


def refresh_session_cookie_if_needed(
    response: Response | None,
    payload: dict,
    user: UserDB,
    session_id: str,
) -> None:
    if response is None:
        return

    expires_at = payload.get("exp")
    now = datetime.utcnow()
    try:
        remaining_seconds = int(expires_at) - int(now.timestamp())
    except (TypeError, ValueError):
        remaining_seconds = 0

    if remaining_seconds > SESSION_REFRESH_THRESHOLD_SECONDS:
        return

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "role": user.role,
            "session_id": session_id,
            "purpose": "session",
        },
        expires_minutes=SESSION_EXPIRE_MINUTES,
    )
    response.set_cookie(
        key=get_session_cookie_name(session_id),
        value=access_token,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        max_age=SESSION_COOKIE_MAX_AGE_SECONDS,
    )


def get_current_ban_ticket(db: Session, user: UserDB) -> TicketDB | None:
    if not user.current_ban_key:
        return None

    return (
        db.query(TicketDB)
        .filter(
            TicketDB.user_id == user.id,
            TicketDB.category == "ban",
            TicketDB.ban_key == user.current_ban_key,
        )
        .order_by(TicketDB.created_at.desc(), TicketDB.id.desc())
        .first()
    )


def get_ban_token_expiry_minutes(user: UserDB) -> int:
    if user.ban_permanent or not user.ban_until:
        return 24 * 60

    remaining_seconds = max(0, int((user.ban_until - datetime.utcnow()).total_seconds()))
    return max(5, (remaining_seconds // 60) + 5)


def build_ban_detail(user: UserDB, db: Session) -> dict:
    if not user.current_ban_key:
        user.current_ban_key = uuid4().hex
        db.commit()
        db.refresh(user)

    support_ticket = get_current_ban_ticket(db, user)
    ban_token = create_access_token(
        data={
            "sub": str(user.id),
            "purpose": "banned_ticket",
            "ban_key": user.current_ban_key,
        },
        expires_minutes=get_ban_token_expiry_minutes(user),
    )

    return {
        "code": "account_banned",
        "message": "Contul este suspendat.",
        "username": user.username,
        "email": user.email,
        "ban_permanent": bool(user.ban_permanent),
        "ban_until": f"{user.ban_until.isoformat()}Z" if user.ban_until else None,
        "ban_reason": user.ban_reason,
        "ban_token": ban_token,
        "support_ticket_id": support_ticket.id if support_ticket else None,
    }


def validate_session_user(
    request: Request,
    db: Session,
    credentials: HTTPAuthorizationCredentials | None,
    response: Response | None = None,
    *,
    required: bool,
) -> UserDB | None:
    session_id = get_session_id_from_request(request, credentials)
    if not session_id:
        if required:
            raise HTTPException(status_code=401, detail="Invalid token")
        return None

    token = request.cookies.get(get_session_cookie_name(session_id))
    if not token:
        if required:
            raise HTTPException(status_code=401, detail="Invalid token")
        return None

    payload = decode_access_token(token)
    if (
        not payload
        or "sub" not in payload
        or payload.get("session_id") != session_id
        or payload.get("purpose") != "session"
    ):
        if required:
            raise HTTPException(status_code=401, detail="Invalid token")
        return None

    user_id = int(payload["sub"])
    user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not user:
        if required:
            raise HTTPException(status_code=401, detail="User not found")
        return None

    if user.current_session_id != session_id:
        if required:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "session_replaced",
                    "message": "Te-ai conectat la acest cont din altă locație.",
                },
            )
        return None

    now = datetime.utcnow()
    if user.ban_permanent or (user.ban_until and user.ban_until > now):
        if required:
            raise HTTPException(status_code=403, detail=build_ban_detail(user, db))
        return None
    if user.ban_until and user.ban_until <= now:
        user.ban_until = None
        user.ban_reason = None
        user.current_ban_key = None
        db.commit()

    should_touch_activity = request.url.path != "/auth/presence"

    if should_touch_activity and (
        not user.last_seen_at or user.last_seen_at < now - timedelta(seconds=10)
    ):
        user.last_seen_at = now
        user.presence_seen_at = now
        db.commit()
    elif not user.presence_seen_at or user.presence_seen_at < now - timedelta(seconds=10):
        user.presence_seen_at = now
        db.commit()

    if should_touch_activity:
        refresh_session_cookie_if_needed(response, payload, user, session_id)

    return user


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserDB:
    return validate_session_user(request, db, credentials, response, required=True)


def get_optional_current_user(
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
    db: Session = Depends(get_db),
) -> UserDB | None:
    return validate_session_user(request, db, credentials, response, required=False)


def require_admin(current_user: UserDB = Depends(get_current_user)) -> UserDB:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


def require_moderator_or_admin(current_user: UserDB = Depends(get_current_user)) -> UserDB:
    if current_user.role not in ["moderator", "admin"]:
        raise HTTPException(status_code=403, detail="Moderator or Admin only")
    return current_user
