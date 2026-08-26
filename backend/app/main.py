from fastapi import FastAPI
from app.api import albums, photos, uploads

app = FastAPI(title="Aperture API", version="0.1.0")
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(photos.router, prefix="/api/photos", tags=["photos"])
app.include_router(albums.router, prefix="/api/albums", tags=["albums"])

@app.get("/health")
def health():
    return {"status": "ok"}
