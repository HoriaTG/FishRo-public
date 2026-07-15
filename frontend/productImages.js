const PRODUCT_IMAGE_EXTENSIONS = ["jpg", "png", "webp", "jpeg"];

export function getProductImageCandidates(code, suffix = "") {
  const safeSuffix = suffix ? `_${suffix}` : "";
  return PRODUCT_IMAGE_EXTENSIONS.map(
    (extension) => `/images/products/${code}${safeSuffix}.${extension}`
  );
}

export function getProductGalleryCandidates(code, maxExtraImages = 6) {
  const candidates = [...getProductImageCandidates(code)];

  for (let index = 1; index <= maxExtraImages; index += 1) {
    candidates.push(...getProductImageCandidates(code, index));
  }

  return candidates;
}

export function loadNextProductImage(event, code, suffix = "") {
  const image = event.currentTarget;
  const candidates = getProductImageCandidates(code, suffix);
  const currentIndex = Number(image.dataset.fallbackIndex || 0);
  const nextIndex = currentIndex + 1;

  if (nextIndex < candidates.length) {
    image.dataset.fallbackIndex = String(nextIndex);
    image.src = candidates[nextIndex];
    return;
  }

  image.onerror = null;
  image.src = "/images/products/placeholder.jpg";
}
