import base64

import requests
from PIL import Image


class ImageServiceError(Exception):
    """Base exception for errors originating from the image service module."""
    pass


from typing import Any

def _convert_gps_to_decimal(gps_coords: tuple[Any, ...], gps_ref: str) -> float | None:
    """Converts GPS coordinates from degrees/minutes/seconds to decimal.

    Args:
        gps_coords (tuple[Any, ...]): A tuple containing degrees, minutes, and
            seconds extracted from the EXIF data.
        gps_ref (str): The cardinal direction reference ('N', 'S', 'E', 'W').

    Returns:
        float | None: The computed decimal degree, or None if conversion fails.
    """
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
    """Extracts GPS latitude and longitude from a photo's EXIF data.

    Attempts to read the 0x8825 (GPSInfo) IFD tag from the image at the
    specified filepath, parsing the latitude and longitude degrees along
    with their cardinal direction references.

    Args:
        filepath (str): The absolute or relative path to the image file.

    Returns:
        dict[str, float | None]: A dictionary containing `gps_lat` and
            `gps_lon` keys mapped to their decimal float values or None.
    """
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
    """Extracts date_taken, camera_make, camera_model, and GPS from a photo's EXIF.

    Parses standard EXIF tags relevant for gallery filtering, including
    device make/model, original datetime, and geolocation mappings.

    Args:
        filepath (str): The path to the image file to analyze.

    Returns:
        dict[str, str | float | None]: A dictionary containing the parsed
            metadata values mapped to their respective keys. Values are None if
            the corresponding EXIF tag is missing or unparseable.
    """
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
    """Encode an image file to a base64 string.

    Reads the binary data of the file and encodes it into a UTF-8 base64
    string suitable for JSON transmission over REST APIs.

    Args:
        filepath (str): The path to the image file to encode.

    Returns:
        str: The image file encoded as a base64 string.
    """
    with open(filepath, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def process_image_with_ollama(filepath: str, ollama_url: str, model_to_use: str) -> str | None:
    """Sends the image to local Ollama to get a description and pet entities.

    Constructs a JSON payload featuring a vision prompt and the base64-encoded
    image, and POSTs it to the specified Ollama endpoint.

    Args:
        filepath (str): The path to the image file to process.
        ollama_url (str): The full HTTP endpoint to the local Ollama instance
            (e.g., 'http://127.0.0.1:11434/api/generate').
        model_to_use (str): The specific vision model to query (e.g., 'llava:13b').

    Returns:
        str | None: The raw text response containing the description and pet entities.
            Returns None if the network request fails or another exception occurs.
    """
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
