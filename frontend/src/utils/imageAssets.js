const OPTIMIZED_BASE = "/assets/optimized";

// This manifest mirrors the files generated in public/assets/optimized.
// Only keys and widths listed here are allowed to produce WebP URLs/srcsets.
const OPTIMIZED_IMAGE_WIDTHS = {
  ambiance: [320, 480, 640, 960],
  biryani: [320, 480, 640, 960],
  "chef-adnan": [320, 480, 640, 960],
  chicken: [320, 480, 640, 960],
  double: [320, 480, 640, 960],
  exp1: [320, 480, 640, 960],
  exp2: [320, 480, 640, 960],
  exp3: [320, 480, 640, 960],
  exp4: [320, 480, 640, 960],
  food1: [320, 480, 640, 960],
  food2: [320, 480, 640, 960],
  food3: [320, 480, 640, 960],
  haleem: [320, 480, 640, 960],
  "handi-biryani-poster": [320, 480, 576],
  hero: [320, 480, 640, 960],
  kheer: [320, 480, 640, 960],
  kofta: [320, 480, 640, 960],
  lassi: [320, 480, 640, 960],
  mutton: [320, 480, 640, 960],
  naan: [320, 480, 640, 960],
  offer1: [320, 480, 576],
  offer2: [320, 480, 576],
  offer3: [320, 480, 576],
  "owner-portrait": [320, 480, 576],
  paneer: [320, 480, 640, 960],
  res: [320, 480, 640, 960],
  stardust: [320, 480, 640, 960],
};

const IMAGE_ALIASES = {
  "/hero.jpg": "hero",
  "/biryani.png": "biryani",
  "/chicken.png": "chicken",
  "/paneer.png": "paneer",
  "/naan.png": "naan",
  "/lassi.png": "lassi",
  "/kofta.png": "kofta",
  "/haleem.png": "haleem",
  "/mutton.png": "mutton",
  "/double.png": "double",
  "/kheer.png": "kheer",
  "/stardust.png": "stardust",
  "/ambiance.png": "ambiance",
  "/chef_adnan.png": "chef-adnan",
  "/food1.jpg": "food1",
  "/food2.jpg": "food2",
  "/food3.jpg": "food3",
  "/exp1.jpg": "exp1",
  "/exp2.jpg": "exp2",
  "/exp3.jpg": "exp3",
  "/exp4.jpg": "exp4",
  "/res.jpg": "res",
  "/assets/owner-portrait.jpg": "owner-portrait",
  "/assets/owner-portrait.webp": "owner-portrait",
  "/assets/handi-biryani-poster.jpg": "handi-biryani-poster",
  "/assets/handi-biryani-poster.webp": "handi-biryani-poster",
  "/assets/offer1.jpg": "offer1",
  "/assets/offer1.webp": "offer1",
  "/assets/offer2.jpg": "offer2",
  "/assets/offer2.webp": "offer2",
  "/assets/offer3.jpg": "offer3",
  "/assets/offer3.webp": "offer3",
};

function normalizeImagePath(src = "") {
  if (!src) return "";
  const trimmed = String(src).trim();
  if (!trimmed) return "";

  if (/^(data|blob):/i.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed, "https://www.jayadhaba.online");
    if (url.origin !== "https://www.jayadhaba.online") return trimmed;
    return url.pathname;
  } catch {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
}

function filenameKey(path = "") {
  const filename = path.split("?")[0].split("#")[0].split("/").pop() || "";
  return filename
    .replace(/\.(png|jpe?g|webp)$/i, "")
    .replace(/_/g, "-")
    .toLowerCase();
}

export function getImageKey(src = "") {
  const path = normalizeImagePath(src);
  if (!path || /^(https?:|data:|blob:)/i.test(path)) return null;

  const aliasedKey = IMAGE_ALIASES[path];
  if (aliasedKey && OPTIMIZED_IMAGE_WIDTHS[aliasedKey]) return aliasedKey;

  const key = filenameKey(path);
  return OPTIMIZED_IMAGE_WIDTHS[key] ? key : null;
}

export function optimizedImage(src, width = 640) {
  const key = getImageKey(src);
  if (!key) return normalizeImagePath(src) || "/assets/optimized/biryani-640.webp";
  const widths = OPTIMIZED_IMAGE_WIDTHS[key];
  const nextWidth = widths.find((candidate) => candidate >= width) || widths[widths.length - 1];
  return `${OPTIMIZED_BASE}/${key}-${nextWidth}.webp`;
}

export function imageSrcSet(src, widths) {
  const key = getImageKey(src);
  if (!key) return undefined;
  const allowedWidths = OPTIMIZED_IMAGE_WIDTHS[key];
  const requestedWidths = widths || allowedWidths;
  const availableWidths = requestedWidths.filter((width) => allowedWidths.includes(width));
  if (!availableWidths.length) return undefined;
  return availableWidths.map((width) => `${OPTIMIZED_BASE}/${key}-${width}.webp ${width}w`).join(", ");
}

export function originalImage(src) {
  return normalizeImagePath(src);
}

export function fallbackImage() {
  return "/assets/optimized/biryani-640.webp";
}

export function menuImageSrc(item) {
  return item?.image_url || item?.img || item?.image || "/biryani.png";
}
