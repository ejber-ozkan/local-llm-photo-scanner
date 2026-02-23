import base64

import requests
from PIL import Image


class ImageServiceError(Exception):
    pass


from typing import Any

def _convert_gps_to_decimal(gps_coords: tuple[Any, ...], gps_ref: str) -> float | None:
    """Converts GPS coordinates from degrees/minutes/seconds to decimal."""
    try:
        d = float(gps_coords[0])
        m = float(gps_coords[1])
        s = float(gps_coords[2])
        decimal = d + (m / 60.0) + (s / 3600.0)
        if gps_ref in ["S", "W"]:
            decimal = -decimal
        return round(decimal, 6)
    except Exception:
        return None


def extract_gps_from_exif(filepath: str) -> dict[str, float | None]:
    """Extracts GPS latitude and longitude from a photo's EXIF data."""
    result: dict[str, float | None] = {"gps_lat": None, "gps_lon": None}
    try:
        with Image.open(filepath) as img:
            exif_data = img.getexif()
            if exif_data and hasattr(exif_data, "get_ifd"):
                try:
                    gps_ifd = exif_data.get_ifd(0x8825)  # GPSInfo IFD
                    if gps_ifd:
                        gps_lat = gps_ifd.get(2)  # GPSLatitude
                        gps_lat_ref = gps_ifd.get(1)  # GPSLatitudeRef (N/S)
                        gps_lon = gps_ifd.get(4)  # GPSLongitude
                        gps_lon_ref = gps_ifd.get(3)  # GPSLongitudeRef (E/W)

                        if gps_lat and gps_lat_ref and gps_lon and gps_lon_ref:
                            result["gps_lat"] = _convert_gps_to_decimal(gps_lat, gps_lat_ref)
                            result["gps_lon"] = _convert_gps_to_decimal(gps_lon, gps_lon_ref)
                except Exception:
                    pass
    except Exception:
        pass
    return result


def extract_exif_for_filters(filepath: str) -> dict[str, str | float | None]:
    """Extracts date_taken, camera_make, camera_model, and GPS from a photo's EXIF."""
    result: dict[str, str | float | None] = {
        "date_taken": None,
        "camera_make": None,
        "camera_model": None,
        "gps_lat": None,
        "gps_lon": None,
    }
    try:
        with Image.open(filepath) as img:
            exif_data = img.getexif()
            if exif_data:
                result["camera_make"] = str(exif_data.get(271, "")) or None  # Tag 271 = Make
                result["camera_model"] = str(exif_data.get(272, "")) or None  # Tag 272 = Model

                # Try DateTimeOriginal from EXIF IFD first, then fallback to DateTime
                if hasattr(exif_data, "get_ifd"):
                    try:
                        ifd = exif_data.get_ifd(0x8769)
                        dt = ifd.get(36867)  # DateTimeOriginal
                        if dt:
                            result["date_taken"] = str(dt)
                    except Exception:
                        pass

                    # GPS extraction
                    try:
                        gps_ifd = exif_data.get_ifd(0x8825)
                        if gps_ifd:
                            gps_lat = gps_ifd.get(2)
                            gps_lat_ref = gps_ifd.get(1)
                            gps_lon = gps_ifd.get(4)
                            gps_lon_ref = gps_ifd.get(3)
                            if gps_lat and gps_lat_ref and gps_lon and gps_lon_ref:
                                result["gps_lat"] = _convert_gps_to_decimal(gps_lat, gps_lat_ref)
                                result["gps_lon"] = _convert_gps_to_decimal(gps_lon, gps_lon_ref)
                    except Exception:
                        pass

                if not result["date_taken"]:
                    dt = exif_data.get(306)  # Tag 306 = DateTime
                    if dt:
                        result["date_taken"] = str(dt)

                # Clean up empty strings
                for k in ["date_taken", "camera_make", "camera_model"]:
                    if result[k] == "" or result[k] == "None":
                        result[k] = None
    except Exception:
        pass
    return result


def encode_image_to_base64(filepath: str) -> str:
    """Encode an image file to a base64 string."""
    with open(filepath, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def process_image_with_ollama(filepath: str, ollama_url: str, model_to_use: str) -> str | None:
    """Sends the image to local Ollama to get a description and pet entities."""
    try:
        base64_image = encode_image_to_base64(filepath)

        prompt = (
            "Describe this image in detail. "
            "Also, explicitly list if there are any pets (dogs, cats, etc.) in the photo. "
            "Format the output strictly as: 'Description: [description]. Entities: [comma separated list of pet entities]'"
        )

        payload = {"model": model_to_use, "prompt": prompt, "stream": False, "images": [base64_image]}

        response = requests.post(ollama_url, json=payload, timeout=60)

        if response.status_code == 404:
            print(
                f"Ollama Error (404): Model '{model_to_use}' not found! Please run 'ollama pull {model_to_use}' in your terminal."
            )
            return f"Error: Model '{model_to_use}' not found in local Ollama. Please open your terminal and run 'ollama pull {model_to_use}' to download it."

        response.raise_for_status()

        result_text = str(response.json().get("response", ""))
        return result_text
    except Exception as e:
        print(f"Error processing {filepath} with Ollama: {e}")
        return None
