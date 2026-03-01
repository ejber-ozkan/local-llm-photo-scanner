"""
Pydantic data transfer objects (DTOs) for the application's API endpoints.
"""

from typing import Any

from pydantic import BaseModel


class ScanRequest(BaseModel):
    """Payload specifying the absolute directory path to scan."""

    directory_path: str
    force_rescan: bool = False
    ignore_screenshots: bool = False


class SettingsUpdateRequest(BaseModel):
    """Payload to update application settings, such as active LLM models."""

    active_model: str


class SearchResponse(BaseModel):
    """Response payload containing database items conforming to the query."""

    items: list[dict[str, Any]]


class UpdateEntityRequest(BaseModel):
    """Payload describing an entity renaming operation."""

    entity_id: str | int
    new_name: str | None


class ScanControlRequest(BaseModel):
    """Payload dictating control signals ('pause', 'resume', 'cancel') to the scanner."""

    action: str


class DatabaseCleanRequest(BaseModel):
    """Payload to obliterate all existing table architectures and recreate them."""

    target: str  # 'main' or 'test'


class RestoreRequest(BaseModel):
    """Payload conveying the filename of an SQL dump to restore."""

    filename: str
