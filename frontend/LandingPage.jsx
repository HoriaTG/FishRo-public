import { Link } from "react-router-dom";
import "./LandingPage.css";

const FEATURE_CARDS = [
  {
    title: "Livrari rapide",
    text: "Pregatim comenzile atent si le trimitem rapid oriunde in Romania.",
    image: "/images/home/fast-delivery.jpg",
  },
  {
    title: "Produse testate",
    text: "Selectam articole pentru pescari incepatori si pasionati cu experienta.",
    image: "/images/home/quality-products.jpg",
  },
  {
    title: "Promotii utile",
    text: "Gasesti reduceri reale la echipamentele pe care le folosesti frecvent.",
    image: "/images/home/deals.jpg",
  },
  {
    title: "Suport prietenos",
    text: "FishBot si echipa FishRo te ajuta sa alegi produsul potrivit.",
    image: "/images/home/support.jpg",
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-kicker">Magazin romanesc pentru pescuitul recreativ</p>
          <h1>FishRo</h1>
          <p>
            Echipamente, accesorii si recomandari pentru iesiri mai simple,
            mai bine pregatite si mai placute pe apa.
          </p>
        </div>

        <div className="landing-hero-gallery" aria-hidden="true">
          <img src="/images/home/hero-main.jpg" alt="" />
          <img src="/images/home/hero-side-1.jpg" alt="" />
          <img src="/images/home/hero-side-2.jpg" alt="" />
        </div>
      </section>

      <section className="landing-features" aria-label="Avantaje FishRo">
        {FEATURE_CARDS.map((feature) => (
          <article className="landing-feature-card" key={feature.title}>
            <img src={feature.image} alt="" />
            <div>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </div>
          </article>
        ))}
      </section>

      <div className="landing-cta-wrap">
        <Link className="landing-store-btn" to="/store">
          Catre magazin
        </Link>
      </div>

      <footer className="landing-footer">
        <div>
          <strong>FishRo</strong>
          <span>Copyright 2026 FishRo. Toate drepturile rezervate.</span>
        </div>
        <div>
          <span>Strada Leilor nr. 12, Bucuresti, Romania</span>
          <span>Telefon: +40 721 234 567</span>
          <span>Email: contact@fishro.ro</span>
        </div>
      </footer>
    </main>
  );
}
