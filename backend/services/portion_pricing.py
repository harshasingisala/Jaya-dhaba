from __future__ import annotations

import re


PAPER_MENU_PORTIONS: dict[str, dict[str, int]] = {
    "mixed veg curry": {"single": 130, "full": 240},
    "kadai veg": {"single": 130, "full": 220},
    "veg kheema masala": {"single": 140, "full": 260},
    "veg kolhapuri": {"single": 140, "full": 260},
    "palak paneer": {"single": 179, "full": 249},
    "kadai paneer": {"single": 179, "full": 249},
    "paneer butter masala": {"single": 179, "full": 249},
    "punjabi paneer": {"single": 179, "full": 249},
    "paneer hyderabadi": {"single": 179, "full": 249},
    "mushroom masala": {"single": 179, "full": 299},
    "mushroom chatpat": {"single": 179, "full": 299},
    "baby corn masala": {"single": 179, "full": 249},
    "kaju paneer": {"single": 199, "full": 349},
    "gongura paneer": {"single": 179, "full": 299},
    "veg corn chatpat": {"single": 159, "full": 249},
    "mutter paneer": {"single": 169, "full": 249},
    "aloo mutter": {"single": 159, "full": 230},
    "corn masala": {"single": 159, "full": 249},
    "coriander paneer": {"single": 179, "full": 299},
    "paneer kulchan": {"single": 179, "full": 249},
    "chicken curry": {"single": 140, "full": 240},
    "chk. masala": {"single": 170, "full": 290},
    "kadai chicken": {"single": 189, "full": 290},
    "chicken hyderabadi": {"single": 189, "full": 290},
    "gongura chicken": {"full": 280},
    "butter chicken(boneless)": {"single": 189, "full": 290},
    "chicken moghlai": {"single": 199, "full": 299},
    "andhra chicken": {"full": 250},
    "afghani chicken": {"single": 220, "full": 399},
    "chk.rogan josh": {"single": 190, "full": 350},
    "chicken chatpat": {"single": 179, "full": 299},
    "coriander chicken": {"single": 189, "full": 349},
    "mint chicken": {"single": 189, "full": 349},
    "jd spl.chicken": {"single": 220, "full": 399},
    "mutton masala": {"single": 249, "full": 449},
    "coriander mutton": {"single": 249, "full": 449},
    "mutton curry": {"single": 239, "full": 439},
    "mutton fry": {"full": 350},
    "kadai mutton": {"full": 480},
    "gongura mutton": {"full": 480},
    "egg curry": {"single": 100, "full": 190},
    "egg masala": {"single": 130, "full": 250},
    "kadai egg": {"single": 140, "full": 260},
    "egg kheema masala": {"single": 150, "full": 280},
    "dal fry": {"single": 80, "full": 150},
    "dal tadka": {"single": 90, "full": 160},
    "kadai dal": {"single": 100, "full": 190},
    "tomato dal": {"single": 100, "full": 170},
    "butter dal": {"single": 130, "full": 220},
    "fish curry": {"single": 110, "full": 199},
    "fish masala": {"single": 140, "full": 240},
    "apollo fish": {"single": 240, "full": 350},
    "chilli fish": {"single": 240, "full": 350},
    "fish 65": {"single": 210, "full": 350},
    "finger fish": {"full": 350},
    "chilli prawns": {"single": 249, "full": 480},
    "prawns curry": {"single": 249, "full": 480},
    "veg biryani": {"single": 120, "full": 220},
    "paneer biryani": {"single": 149, "full": 280},
    "kaju biryani": {"single": 199, "full": 380},
    "kaju paneer biryani": {"single": 249, "full": 399},
    "mushroom biryani": {"single": 179, "full": 339},
    "chicken biryani mini": {"single": 140},
    "chicken biryani handi": {"single": 180},
    "chicken 65 biryani": {"single": 249, "full": 449},
    "chicken lollypop biryani": {"single": 210, "full": 399},
    "chilli chicken biryani": {"single": 249, "full": 449},
    "spl.chicken biryani (boneless)": {"single": 249, "full": 449},
    "spl. fry piece biryani": {"single": 249, "full": 449},
    "gongura chicken biryani": {"single": 249, "full": 449},
    "fish biryani": {"single": 239, "full": 399},
    "prawns biryani": {"single": 279, "full": 449},
    "mutton biryani": {"single": 249, "full": 449},
    "gongura mutton biryani": {"single": 249, "full": 449},
    "egg biryani": {"single": 110, "full": 210},
    "chk family pack": {"family": 549},
    "chk. jumbo pack": {"jumbo": 799},
    "mutton family pack": {"family": 899},
    "mutton jumbo pack": {"jumbo": 1399},
}


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip().lower())


def extract_portion(note: str) -> str | None:
    match = re.search(r"portion:\s*([a-zA-Z ]+)", str(note or ""), flags=re.IGNORECASE)
    if not match:
        return None
    value = normalize_name(match.group(1))
    if value in {"single", "mini"}:
        return "single"
    if value in {"full", "regular"}:
        return "full"
    if value in {"family", "family pack"}:
        return "family"
    if value in {"jumbo", "jumbo pack"}:
        return "jumbo"
    if value == "handi":
        return "single"
    return value or None


def portion_options_for_name(name: str) -> dict[str, int]:
    return PAPER_MENU_PORTIONS.get(normalize_name(name), {})


def resolve_unit_price(menu_item, special_note: str = "") -> int:
    options = portion_options_for_name(getattr(menu_item, "name", ""))
    portion = extract_portion(special_note)
    if portion and portion in options:
        return int(options[portion])
    if "full" in options:
        return int(options["full"])
    if "single" in options:
        return int(options["single"])
    return int(getattr(menu_item, "price", 0) or 0)
