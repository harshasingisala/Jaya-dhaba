from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUT = PUBLIC / "assets" / "optimized"

SOURCES = [
    "hero.jpg",
    "biryani.png",
    "chicken.png",
    "paneer.png",
    "naan.png",
    "lassi.png",
    "kofta.png",
    "haleem.png",
    "mutton.png",
    "double.png",
    "kheer.png",
    "stardust.png",
    "ambiance.png",
    "chef_adnan.png",
    "food1.jpg",
    "food2.jpg",
    "food3.jpg",
    "exp1.jpg",
    "exp2.jpg",
    "exp3.jpg",
    "exp4.jpg",
    "res.jpg",
    "assets/owner-portrait.jpg",
    "assets/handi-biryani-poster.jpg",
    "assets/offer1.jpg",
    "assets/offer2.jpg",
    "assets/offer3.jpg",
]

WIDTHS = (320, 480, 640, 960, 1280)
QUALITY_BY_WIDTH = {
    320: 66,
    480: 68,
    640: 70,
    960: 72,
    1280: 74,
}


def optimized_name(source: str, width: int) -> str:
    name = Path(source).stem.replace("_", "-")
    return f"{name}-{width}.webp"


def convert(source: str) -> None:
    input_path = PUBLIC / source
    if not input_path.exists():
        return

    with Image.open(input_path) as raw:
        image = ImageOps.exif_transpose(raw)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")

        original_width = image.width
        for width in WIDTHS:
            if width > original_width:
                continue
            ratio = width / original_width
            height = max(1, round(image.height * ratio))
            resized = image.resize((width, height), Image.Resampling.LANCZOS)
            destination = OUT / optimized_name(source, width)
            destination.parent.mkdir(parents=True, exist_ok=True)
            resized.save(
                destination,
                "WEBP",
                quality=QUALITY_BY_WIDTH[width],
                method=6,
            )


def main() -> None:
    for source in SOURCES:
        convert(source)


if __name__ == "__main__":
    main()
