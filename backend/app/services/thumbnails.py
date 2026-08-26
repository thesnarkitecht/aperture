def thumbnail_url(photo_id: str, size: int = 512) -> str:
    return f"/api/photos/{photo_id}/thumbnail?size={size}"
