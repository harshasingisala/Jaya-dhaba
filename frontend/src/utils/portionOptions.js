import { PAPER_MENU_PORTIONS, normalizePaperMenuName } from "../data/paperMenuPortions";

const PRICE_PORTIONS = [
  { key: "price_single", id: "single", label: "Single" },
  { key: "price_mini", id: "mini", label: "Mini" },
  { key: "price_half", id: "half", label: "Half" },
  { key: "price_full", id: "full", label: "Full" },
  { key: "price_family", id: "family", label: "Family" },
  { key: "price_jumbo", id: "jumbo", label: "Jumbo" },
  { key: "price_handi", id: "handi", label: "Handi" },
];

const BIRYANI_PORTIONS = [
  { id: "single", label: "Single" },
  { id: "full", label: "Full" },
  { id: "family", label: "Family" },
  { id: "jumbo", label: "Jumbo" },
];

function toPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function parsePortionsFromText(text = "") {
  const value = String(text || "");
  const lower = value.toLowerCase();
  if (!/(half|single|full|family|jumbo|mini)/.test(lower)) return [];

  const options = [];
  const patterns = [
    { id: "single", label: "Single", re: /\bsingle\b\s*(?:rs\.?|₹|:|-)?\s*(\d+)/i },
    { id: "mini", label: "Mini", re: /\bmini\b\s*(?:rs\.?|₹|:|-)?\s*(\d+)/i },
    { id: "half", label: "Half", re: /\bhalf\b\s*(?:rs\.?|₹|:|-)?\s*(\d+)/i },
    { id: "full", label: "Full", re: /\bfull\b\s*(?:rs\.?|₹|:|-)?\s*(\d+)/i },
    { id: "family", label: "Family", re: /\bfamily\b\s*(?:pack)?\s*(?:rs\.?|₹|:|-)?\s*(\d+)/i },
    { id: "jumbo", label: "Jumbo", re: /\bjumbo\b\s*(?:pack)?\s*(?:rs\.?|₹|:|-)?\s*(\d+)/i },
  ];

  patterns.forEach((pattern) => {
    const match = value.match(pattern.re);
    const price = match ? toPrice(match[1]) : null;
    if (price) options.push({ id: pattern.id, label: pattern.label, price, priced: true });
  });

  return options;
}

export function isOnlyPortionPriceText(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  if (parsePortionsFromText(value).length < 2) return false;
  return value
    .replace(/\b(single|mini|half|full|family|jumbo|pack)\b/gi, "")
    .replace(/rs\.?|₹|\/|:|-|•|\d+/gi, "")
    .trim().length === 0;
}

export function isOnlySinglePriceText(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  return /^price\s*(?:rs\.?|₹)?\s*\d+$/i.test(value) || /^(?:rs\.?|₹)\s*\d+$/i.test(value);
}

export function getPortionOptions(item = {}) {
  const paperPrices = PAPER_MENU_PORTIONS[normalizePaperMenuName(item.name)];
  if (paperPrices) {
    return Object.entries(paperPrices).map(([id, price]) => ({
      id,
      label: id === "single" ? "Single" : id === "full" ? "Full" : id === "family" ? "Family" : id === "jumbo" ? "Jumbo" : id,
      price,
      priced: true,
    }));
  }

  const textPortions = parsePortionsFromText(item.description || item.desc || "");
  if (textPortions.length > 0) return textPortions;

  const priced = PRICE_PORTIONS
    .map((portion) => {
      const price = toPrice(item[portion.key]);
      return price ? { ...portion, price, priced: true } : null;
    })
    .filter(Boolean);

  if (priced.length > 0) return priced;

  const basePrice = toPrice(item.price ?? item.price_full);
  const text = `${item.name || ""} ${item.category || ""}`.toLowerCase();
  if (text.includes("biryani") && basePrice) {
    return BIRYANI_PORTIONS.map((portion) => ({
      ...portion,
      price: basePrice,
      priced: false,
    }));
  }

  if (basePrice) {
    return [{ id: "regular", label: "Regular", price: basePrice, priced: true }];
  }

  return [];
}

export function getDefaultPortion(item = {}) {
  const options = getPortionOptions(item);
  return options.find((option) => option.id === "full") || options[0] || null;
}

export function applyPortionToItem(item, portion) {
  if (!portion) return item;
  const baseId = item.menu_item_id || item.id;
  const existingInstructions = String(item.instructions || item.special_note || "").trim();
  const portionNote = `Portion: ${portion.label} (${portion.price})`;
  return {
    ...item,
    id: baseId,
    menu_item_id: baseId,
    price: portion.price,
    selectedSize: portion.id,
    portion: portion.id,
    portionLabel: portion.label,
    instructions: [portionNote, existingInstructions].filter(Boolean).join(" | "),
  };
}
