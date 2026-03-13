import os
from contextlib import contextmanager
from typing import Generator

import chromadb
from chromadb.api import ClientAPI
from chromadb.config import Settings

import core.state as state

_chroma_client = None
CHROMA_DIR_NAME = "chroma_data"


def get_chroma_data_dir() -> str:
    """Return the filesystem path used by the persistent Chroma client."""
    return os.path.join(os.getcwd(), CHROMA_DIR_NAME)

def get_chroma_client() -> ClientAPI:
    """
    Returns the singleton ChromaDB client instance.
    During normal operation, this is a PersistentClient.
    During testing, it may be replaced by an EphemeralClient.
    """
    global _chroma_client
    if _chroma_client is None:
        # Avoid creating the actual persistent folder during test runs if the 
        # config is somehow not mocked yet. We rely on conftest.py to 
        # override this for tests.
        chroma_db_dir = get_chroma_data_dir()
        os.makedirs(chroma_db_dir, exist_ok=True)
        
        try:
            _chroma_client = chromadb.PersistentClient(
                path=chroma_db_dir,
                settings=Settings(anonymized_telemetry=False)
            )
        except Exception as e:
            state.add_log(f"Failed to initialize ChromaDB: {e}")
            raise
    
    return _chroma_client

def get_photos_collection():
    """Returns the collection for photo semantic descriptions."""
    client = get_chroma_client()
    # Using L2 distance by default (can be changed if using a specific embedding function)
    return client.get_or_create_collection(
        name="photos_semantic_collection",
        metadata={"description": "Stores LLM descriptions of photos for semantic search"}
    )

def get_clip_collection():
    """Returns the collection for raw multimodal CLIP embeddings."""
    client = get_chroma_client()
    return client.get_or_create_collection(
        name="clip_collection",
        metadata={"description": "Stores 512-dimensional CLIP image embeddings for direct text-to-image search"}
    )

def get_faces_collection():
    """Returns the collection for facial recognition embeddings (DeepFace)."""
    client = get_chroma_client()
    return client.get_or_create_collection(
        name="faces_collection",
        metadata={"description": "Stores 512-dimensional facial embeddings for unsupervised clustering"}
    )

def set_chroma_client_for_testing(client: ClientAPI):
    """Allows injecting an EphemeralClient for unit testing."""
    global _chroma_client
    _chroma_client = client


def reset_chroma_client() -> None:
    """Drop the cached client so future calls reopen the active Chroma store."""
    global _chroma_client
    _chroma_client = None
