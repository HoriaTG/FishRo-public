import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearProductImages, createProduct, uploadProductImage } from "../api";
import "./AddProductPage.css";

const CATEGORIES = [
  "undita",
  "lanseta",
  "mulineta",
  "carlig",
  "plumb",
  "nailon",
  "echipamente",
  "momeli",
  "diverse",
  "nada",
  "plute",
];

const PROMOTION_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function ImagePreview({ file, label }) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  return (
    <div className="add-product-preview-card">
      <img src={previewUrl} alt={label} />
      <div className="add-product-preview-label">{label}</div>
      <div className="add-product-preview-name">{file.name}</div>
    </div>
  );
}

function validateImage(file) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return "Sunt acceptate doar imagini JPG, PNG sau WEBP.";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return `Imaginea ${file.name} depășește limita de 8 MB.`;
  }
  return "";
}

export default function AddProductPage({ me }) {
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [promotion, setPromotion] = useState(0);
  const [description, setDescription] = useState("");
  const [techDetails, setTechDetails] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [mainImage, setMainImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState([]);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const isAdmin = !!me && me.role === "admin";

  useEffect(() => {
    if (!isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) return null;

  function handleMainImageChange(event) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setMainImage(null);
      return;
    }

    const validationError = validateImage(file);
    if (validationError) {
      setError(validationError);
      event.target.value = "";
      return;
    }

    setError("");
    setMainImage(file);
  }

  function handleGalleryImagesChange(event) {
    const files = Array.from(event.target.files || []);
    if (files.length > 6) {
      setError("Poți selecta maximum 6 imagini secundare.");
      event.target.value = "";
      return;
    }

    const validationError = files.map(validateImage).find(Boolean);
    if (validationError) {
      setError(validationError);
      event.target.value = "";
      return;
    }

    setError("");
    setGalleryImages(files);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMsg("");

    const cleanCode = code.trim();
    const cleanName = name.trim();

    if (!cleanCode) return setError("Codul este obligatoriu.");
    if (!/^\d+$/.test(cleanCode)) {
      return setError("Codul trebuie să conțină doar cifre.");
    }
    if (!cleanName) return setError("Numele este obligatoriu.");
    if (!CATEGORIES.includes(category)) {
      return setError("Categoria selectată este invalidă.");
    }
    if (!PROMOTION_OPTIONS.includes(Number(promotion))) {
      return setError("Promoția selectată este invalidă.");
    }

    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return setError("Preț invalid.");
    }

    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity < 1) {
      return setError("Cantitate invalidă (minim 1).");
    }
    if (!mainImage) {
      return setError("Selectează imaginea principală a produsului.");
    }

    const cleanDescription = description.trim();
    const cleanTechDetails = techDetails.trim();
    const cleanVideoUrl = videoUrl.trim();

    if (cleanTechDetails) {
      try {
        JSON.parse(cleanTechDetails);
      } catch {
        return setError(
          'Detaliile tehnice trebuie sa fie JSON valid. Ex: [["Lungime","2.7 m"],["Material","Carbon"]]'
        );
      }
    }

    try {
      setIsSubmitting(true);
      const product = await createProduct({
        code: cleanCode,
        name: cleanName,
        category,
        price: numericPrice,
        quantity: numericQuantity,
        promotion: Number(promotion),
        description: cleanDescription || null,
        tech_details: cleanTechDetails || null,
        video_url: cleanVideoUrl || null,
      });

      await clearProductImages(product.id);
      await uploadProductImage(product.id, 0, mainImage);
      for (let index = 0; index < galleryImages.length; index += 1) {
        await uploadProductImage(product.id, index + 1, galleryImages[index]);
      }

      const galleryCount = galleryImages.length;
      setCode("");
      setName("");
      setCategory(CATEGORIES[0]);
      setPrice("");
      setQuantity(1);
      setPromotion(0);
      setDescription("");
      setTechDetails("");
      setVideoUrl("");
      setMainImage(null);
      setGalleryImages([]);
      setImageInputKey((value) => value + 1);
      setMsg(
        `Produs salvat cu imaginea principală și ${galleryCount} imagini de galerie.`
      );
    } catch (err) {
      setError(
        err.message ||
          "Produsul sau imaginile nu au putut fi salvate. Verifică produsul în administrare."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="add-product-page">
      <section className="add-product-shell">
        <div className="add-product-header">
          <div>
            <p className="add-product-eyebrow">Administrare catalog</p>
            <h1>Adaugă un produs nou</h1>
            <p>Completează informațiile și pregătește galeria produsului.</p>
          </div>
          <button
            type="button"
            className="add-product-back-btn"
            onClick={() => navigate("/admin/products")}
          >
            Înapoi la produse
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-product-form">
          <div className="add-product-fields">
            <label className="add-product-field add-product-field-wide">
              <span>Cod produs</span>
              <input
                placeholder="Ex: 000006"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              />
            </label>

            <label className="add-product-field add-product-field-wide">
              <span>Nume produs</span>
              <input
                placeholder="Ex: Vobler pentru știucă"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <label className="add-product-field">
              <span>Categorie</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="add-product-field">
              <span>Preț</span>
              <div className="add-product-input-unit">
                <input
                  placeholder="0.00"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
                <span>lei</span>
              </div>
            </label>

            <label className="add-product-field">
              <span>Cantitate</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) =>
                  setQuantity(parseInt(event.target.value || "1", 10))
                }
              />
            </label>

            <label className="add-product-field">
              <span>Promoție</span>
              <select
                value={promotion}
                onChange={(event) => setPromotion(Number(event.target.value))}
              >
                {PROMOTION_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="add-product-extra-fields">
            <label className="add-product-field add-product-field-full">
              <span>Descriere produs</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Descrie produsul, pentru cine este potrivit si ce avantaje are."
                rows={5}
              />
            </label>

            <label className="add-product-field add-product-field-full">
              <span>Detalii tehnice JSON</span>
              <textarea
                value={techDetails}
                onChange={(event) => setTechDetails(event.target.value)}
                placeholder='Ex: [["Lungime","2.7 m"],["Material","Carbon"],["Greutate","180 g"]]'
                rows={4}
              />
            </label>

            <label className="add-product-field add-product-field-full">
              <span>Video produs</span>
              <input
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </label>
          </div>

          <div className="add-product-media-grid">
            <div className="add-product-upload-card main">
              <div className="add-product-upload-heading">
                <span className="add-product-upload-icon">◆</span>
                <div>
                  <h2>Imagine principală</h2>
                  <p>Coperta afișată în lista de produse.</p>
                </div>
              </div>

              <label className="add-product-file-picker">
                <span>Alege coperta</span>
                <small>{mainImage?.name || "Niciun fișier selectat"}</small>
                <input
                  key={`main-${imageInputKey}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleMainImageChange}
                />
              </label>

              <p className="add-product-hint">
                JPG, PNG sau WEBP, maximum 8 MB. Va deveni automat{" "}
                <strong>{code || "000006"}.ext</strong>.
              </p>

              {mainImage && <ImagePreview file={mainImage} label="Copertă" />}
            </div>

            <div className="add-product-upload-card">
              <div className="add-product-upload-heading">
                <span className="add-product-upload-icon gallery">▦</span>
                <div>
                  <h2>Galerie produs</h2>
                  <p>Adaugă până la 6 imagini secundare.</p>
                </div>
              </div>

              <label className="add-product-file-picker">
                <span>Alege imaginile</span>
                <small>
                  {galleryImages.length
                    ? `${galleryImages.length} imagini selectate`
                    : "Niciun fișier selectat"}
                </small>
                <input
                  key={`gallery-${imageInputKey}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={handleGalleryImagesChange}
                />
              </label>

              <p className="add-product-hint">
                Imaginile vor fi ordonate și redenumite automat{" "}
                <strong>cod_1, cod_2...</strong>
              </p>

              {galleryImages.length > 0 && (
                <div className="add-product-preview-grid">
                  {galleryImages.map((file, index) => (
                    <ImagePreview
                      key={`${file.name}-${file.lastModified}`}
                      file={file}
                      label={`Galerie ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {msg && <p className="add-product-feedback success">{msg}</p>}
          {error && <p className="add-product-feedback error">{error}</p>}

          <div className="add-product-actions">
            <button
              type="button"
              className="add-product-secondary-btn"
              onClick={() => navigate("/admin/products")}
            >
              Renunță
            </button>
            <button
              className="add-product-primary-btn"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Se salvează produsul și imaginile..."
                : "Adaugă produsul"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
