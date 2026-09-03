from __future__ import annotations

import io
import re
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image, ImageFile, UnidentifiedImageError

ImageFile.LOAD_TRUNCATED_IMAGES = False
Image.MAX_IMAGE_PIXELS = 50_000_000
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    pass
MAX_IMAGE_DIMENSION = 12000
SUPPORTED_EXTENSIONS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".svg": "image/svg+xml",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
}
MIME_ALIASES = {
    "image/jpg": "image/jpeg",
    "image/vnd.microsoft.icon": "image/x-icon",
    "application/ico": "image/x-icon",
    "application/x-ico": "image/x-icon",
}


def supported_mime(filename: str, content_type: str) -> bool:
    suffix = Path(filename).suffix.lower()
    mime = MIME_ALIASES.get(content_type.lower(), content_type.lower())
    return suffix in SUPPORTED_EXTENSIONS and mime == SUPPORTED_EXTENSIONS[suffix]


def _validate_svg(data: bytes) -> None:
    if len(data) > 5 * 1024 * 1024:
        raise ValueError("SVG exceeds the 5 MB safety limit")
    root = ElementTree.fromstring(data)
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1].lower()
        attributes = " ".join(str(value) for value in element.attrib.values()).lower()
        if tag in {"script", "foreignobject"} or "javascript:" in attributes or "http://" in attributes or "https://" in attributes:
            raise ValueError("SVG contains scripts or external resources and cannot be analyzed")


def inspect_image(data: bytes, filename: str, content_type: str) -> tuple[str, int, int]:
    if not supported_mime(filename, content_type):
        raise ValueError("Image extension and MIME type do not match")
    suffix = Path(filename).suffix.lower()
    if suffix == ".svg":
        _validate_svg(data)
        width = height = 0
        match = re.search(rb"<svg[^>]*(?:width=[\"']([0-9.]+)|height=[\"']([0-9.]+))", data[:10000], re.I)
        if match:
            values = [float(value) for value in match.groups() if value]
            width = height = int(max(values)) if values else 0
        return "SVG", width, height
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
            image_format = image.format or suffix[1:].upper()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        if suffix in {".heic", ".heif"}:
            raise ValueError("HEIC/HEIF decoding is unavailable; install pillow-heif to validate this image") from exc
        if suffix == ".avif":
            raise ValueError("AVIF decoding is unavailable in this Pillow build") from exc
        raise ValueError(f"The uploaded file is not a valid {suffix[1:].upper()} image") from exc
    if width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
        raise ValueError(f"Image dimensions exceed {MAX_IMAGE_DIMENSION}x{MAX_IMAGE_DIMENSION}")
    return image_format, width, height


def create_analysis_copy(data: bytes, filename: str, content_type: str, destination: Path) -> tuple[Path, str]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".svg":
        try:
            import cairosvg
            _validate_svg(data)
            destination.parent.mkdir(parents=True, exist_ok=True)
            cairosvg.svg2png(bytestring=data, write_to=str(destination), output_width=4096, output_height=4096)
            return destination, "image/png"
        except ImportError as exc:
            raise ValueError("SVG rasterization is unavailable; install cairosvg to analyze SVG images") from exc
        except (OSError, ValueError) as exc:
            raise ValueError("SVG could not be safely rasterized") from exc
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.seek(0)
            image.thumbnail((4096, 4096), Image.Resampling.LANCZOS)
            if image.mode not in {"RGB", "L"}:
                image = image.convert("RGB")
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination, format="PNG", optimize=True)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        if suffix in {".heic", ".heif"}:
            raise ValueError("HEIC/HEIF decoding is unavailable; install pillow-heif to analyze this image") from exc
        if suffix == ".avif":
            raise ValueError("AVIF decoding is unavailable in this Pillow build") from exc
        raise ValueError(f"Unable to create an analysis copy for {content_type}") from exc
    return destination, "image/png"
