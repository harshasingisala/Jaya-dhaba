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

export function getPortionOptions(item = {}) {
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
  const portionNote = `Portion: ${portion.label}`;
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
