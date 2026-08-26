from pathlib import Path
from PIL import Image, ExifTags

def extract_exif(path: Path) -> dict:
    try:
        with Image.open(path) as image:
            raw = image.getexif()
            return {ExifTags.TAGS.get(k, str(k)): str(v) for k, v in raw.items()}
    except Exception:
        return {}
