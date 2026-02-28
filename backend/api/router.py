"""
Main APIRouter registry aggregating all individual route namespaces.
"""

from fastapi import APIRouter

from api.routes import entities, gallery, scan, system

api_router = APIRouter()

api_router.include_router(scan.router, prefix="/api/scan", tags=["scan"])
api_router.include_router(gallery.router, prefix="/api", tags=["gallery"])
api_router.include_router(entities.router, prefix="/api", tags=["entities"])
api_router.include_router(system.router, prefix="/api", tags=["system"])
