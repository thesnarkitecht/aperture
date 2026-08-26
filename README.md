# Aperture

A clean, high-performance, self-hosted photo storage and management platform—built for ownership, speed, and a delightful browsing experience.

## Features

- Fast uploads with resumable-friendly API boundaries
- EXIF extraction for capture dates, GPS, camera, and lens metadata
- Timeline browsing with date grouping and responsive thumbnails
- Albums and album membership APIs
- On-demand thumbnail generation with background processing
- Lightbox-ready media URLs and progressive image loading
- SQLite for zero-config development; PostgreSQL for production
- Redis-backed job queue and cache
- Docker Compose deployment with persistent raw-photo storage
- Modular services designed for future deduplication, search, and ML features

## Architecture

```text
Browser (Next.js + Tailwind)
          │ REST/JSON
          ▼
FastAPI API ───── PostgreSQL/SQLite
     │
     └──── Redis queue ─── Worker (EXIF, thumbnails, indexing)
          │
          └──── /data/photos (originals + derivatives)
```

### Backend
Python 3.12, FastAPI, Pydantic, SQLAlchemy, and Pillow/PyExifTool-compatible processing boundaries. Routes live in `backend/app/api`; domain logic belongs in `backend/app/services`.

### Frontend
Next.js App Router with TypeScript and Tailwind CSS. UI components are intentionally small and composable: timeline gallery, lightbox, album view, and upload dropzone.

### Persistence
SQLite is the default local database. Set `DATABASE_URL` to PostgreSQL in production. Redis is used for background jobs and caching. Original files and generated derivatives live in the mounted storage volume.

## Quickstart

Requirements: Docker and Docker Compose.

```bash
git clone https://github.com/thesnarkitecht/aperture.git
cd aperture
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000` for the web UI and `http://localhost:8000/docs` for the API documentation. Originals are stored in `./data/photos`.

For backend-only development:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Repository layout

```text
backend/app/{api,models,services}/  FastAPI application
frontend/{app,components}/          Next.js UI
data/photos/                        Local raw/derivative storage
docker-compose.yml                  Local production-shaped stack
```

## Roadmap

- [x] Upload, metadata, albums, timeline, and thumbnail API boundaries
- [ ] Authentication, multi-user libraries, and sharing permissions
- [ ] Resumable/chunked uploads and duplicate detection
- [ ] Full-text metadata search and saved filters
- [ ] Face/object recognition as an optional worker
- [ ] Mobile-friendly offline upload client
- [ ] S3-compatible storage and configurable retention policies
- [ ] Importers for common photo services

## Contributing

Issues and pull requests are welcome. Please keep changes focused, add tests for behavior, and preserve the self-hosted deployment path.

## License

MIT. See [LICENSE](LICENSE).
