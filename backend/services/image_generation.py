import os

import httpx


class ImageGenerationError(RuntimeError):
    pass


async def generate_image(prompt: str) -> tuple[bytes, str, str]:
    provider = os.getenv("IMAGE_GENERATION_PROVIDER", "").strip().lower()
    url = os.getenv("IMAGE_GENERATION_URL", "").strip()
    if not provider or not url:
        raise ImageGenerationError(
            "Image generation is not configured yet. Configure an image-generation provider in .env."
        )
    if provider not in {"comfyui", "stable-diffusion"}:
        raise ImageGenerationError(f"Unsupported image-generation provider: {provider}")
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(url, json={"prompt": prompt})
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if "image/" not in content_type:
                raise ImageGenerationError("The image-generation provider did not return an image")
            media_type = response.headers.get("content-type", "image/png").split(";", 1)[0]
            extension = {"image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}.get(media_type, ".png")
            return response.content, media_type, extension
    except httpx.HTTPError as exc:
        raise ImageGenerationError(f"Image-generation provider unavailable: {exc}") from exc
