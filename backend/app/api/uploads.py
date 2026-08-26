from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, UploadFile, File
from app.services.exif import extract_exif

router = APIRouter()

@router.post("")
async def upload_photo(file: UploadFile = File(...)):
    photo_id = str(uuid4())
    destination = Path("/data/photos") / f"{photo_id}-{file.filename}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(await file.read())
    return {"id": photo_id, "filename": file.filename, "exif": extract_exif(destination)}
