from fastapi import APIRouter
from app.services.thumbnails import thumbnail_url

router = APIRouter()

@router.get("")
def timeline(limit: int = 100, offset: int = 0):
    return {"items": [], "limit": limit, "offset": offset}

@router.get("/{photo_id}/thumbnail")
def thumbnail(photo_id: str, size: int = 512):
    return {"id": photo_id, "size": size, "url": thumbnail_url(photo_id, size)}
