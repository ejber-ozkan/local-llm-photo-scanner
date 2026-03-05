import os
import core.state as state

_clip_model = None

def get_clip_model():
    """Returns the singleton SentenceTransformer CLIP model."""
    global _clip_model
    if _clip_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            # clip-ViT-B-32 maps both images and text to the same 512-dimensional vector space
            state.add_log("Loading CLIP model into memory (this may take a moment on first launch)...")
            _clip_model = SentenceTransformer('clip-ViT-B-32')
            state.add_log("CLIP model loaded successfully.")
        except ImportError:
            state.add_log("sentence-transformers not installed. CLIP features disabled.")
            return None
        except Exception as e:
            state.add_log(f"Failed to load CLIP model: {e}")
            return None
    return _clip_model
