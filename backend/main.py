"""
Main entrypoint for the Local AI Photo Scanner backend application.

This module initializes the FastAPI instance, mounts the CORS middleware
for the frontend client, triggers database initialization callbacks, and
includes the unified APIRouter containing all refactored domain routes.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router import api_router
from core.config import VERSION
from database_setup import init_db

app = FastAPI(title="Local AI Photo Scanner API", version=VERSION)

# Define Cross-Origin Resource Sharing (CORS) Configuration
origins = ["*"]

# Note: In production, consider hardening origins if exposed over a network.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all HTTP verbs (POST, GET, OPTIONS, DELETE, etc.)
    allow_headers=["*"],
)

# Initialize application endpoints
app.include_router(api_router)


@app.on_event("startup")
async def startup_event() -> None:
    """Application startup hook triggering local database initialization."""
    init_db()


if __name__ == "__main__":
    import uvicorn

    # Optional direct execution capability natively supporting local networking
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
