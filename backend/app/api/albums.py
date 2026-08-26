from fastapi import APIRouter

router = APIRouter()

@router.get("")
def list_albums():
    return {"items": []}

@router.post("")
def create_album(name: str):
    return {"id": "pending", "name": name, "photo_ids": []}
