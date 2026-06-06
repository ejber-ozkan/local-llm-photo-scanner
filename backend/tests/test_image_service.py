import os
import sys
import base64
import pytest
import responses
from unittest.mock import MagicMock, patch
from PIL import Image

from services import image_service


def test_convert_gps_to_decimal():
    # Test valid conversion
    assert image_service._convert_gps_to_decimal((40, 42, 46.0), "N") == 40.712778
    assert image_service._convert_gps_to_decimal((74, 0, 21.0), "W") == -74.005833
    
    # Test invalid coordinates / type error / exception
    assert image_service._convert_gps_to_decimal(None, "N") is None
    assert image_service._convert_gps_to_decimal((40,), "N") is None


def test_extract_gps_from_exif_no_exif():
    # Mock Image.open returning an image without exif
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_img_entered.getexif.return_value = None
    
    with patch("PIL.Image.open", return_value=mock_img):
        res = image_service.extract_gps_from_exif("dummy.jpg")
        assert res == {"gps_lat": None, "gps_lon": None}


def test_extract_gps_from_exif_with_data():
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_exif = MagicMock()
    
    # Tag 0x8825 is GPSInfo
    # coordinates structure: 2: lat, 1: latRef, 4: lon, 3: lonRef
    mock_gps_ifd = {
        2: (40, 42, 46.0),
        1: "N",
        4: (74, 0, 21.0),
        3: "W"
    }
    mock_exif.get_ifd.return_value = mock_gps_ifd
    mock_img_entered.getexif.return_value = mock_exif
    
    with patch("PIL.Image.open", return_value=mock_img):
        res = image_service.extract_gps_from_exif("dummy.jpg")
        assert res["gps_lat"] == 40.712778
        assert res["gps_lon"] == -74.005833


def test_extract_gps_from_exif_incomplete_data():
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_exif = MagicMock()
    # Missing longitude
    mock_gps_ifd = {
        2: (40, 42, 46.0),
        1: "N"
    }
    mock_exif.get_ifd.return_value = mock_gps_ifd
    mock_img_entered.getexif.return_value = mock_exif
    
    with patch("PIL.Image.open", return_value=mock_img):
        res = image_service.extract_gps_from_exif("dummy.jpg")
        assert res == {"gps_lat": None, "gps_lon": None}


def test_extract_gps_from_exif_exception():
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_img_entered.getexif.side_effect = Exception("corrupted exif")
    
    with patch("PIL.Image.open", return_value=mock_img):
        res = image_service.extract_gps_from_exif("dummy.jpg")
        assert res == {"gps_lat": None, "gps_lon": None}


def test_extract_exif_for_filters_fallback_mtime():
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_img_entered.getexif.return_value = None
    
    with patch("PIL.Image.open", return_value=mock_img), \
         patch("os.path.getmtime", return_value=1716634800.0): # 2024-05-25 12:00:00 UTC approx
        res = image_service.extract_exif_for_filters("dummy.jpg")
        assert res["camera_make"] is None
        assert res["camera_model"] is None
        assert res["date_taken"] is not None  # Fallback to mtime


def test_extract_exif_for_filters_with_tags():
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_exif = MagicMock()
    mock_exif.get.side_effect = lambda tag, default=None: {
        271: "Nikon",
        272: "D850",
        306: "2024:05:25 12:00:00"
    }.get(tag, default)
    mock_exif.get_ifd.side_effect = Exception("no IFD")
    mock_img_entered.getexif.return_value = mock_exif
    
    with patch("PIL.Image.open", return_value=mock_img):
        res = image_service.extract_exif_for_filters("dummy.jpg")
        assert res["camera_make"] == "Nikon"
        assert res["camera_model"] == "D850"
        assert res["date_taken"] == "2024:05:25 12:00:00"


def test_extract_exif_for_filters_exception_handling():
    # If PIL raises exception, fallback to file mtime
    with patch("PIL.Image.open", side_effect=Exception("unreadable")), \
         patch("os.path.getmtime", return_value=1716634800.0):
        res = image_service.extract_exif_for_filters("dummy.jpg")
        assert res["date_taken"] is not None
        assert res["camera_make"] is None


def test_extract_all_exif():
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_exif = MagicMock()
    mock_exif.items.return_value = [
        (271, "Nikon"),
        (272, b"D850\x00invalid-utf8-\xff"), # invalid UTF8 bytes
        (306, b"2024:05:25 12:00:00")
    ]
    mock_img_entered.getexif.return_value = mock_exif
    
    with patch("PIL.Image.open", return_value=mock_img):
        res = image_service.extract_all_exif("dummy.jpg")
        assert res["Make"] == "Nikon"
        assert "D850" in res["Model"] or res["Model"] == "<binary data>" or "invalid-utf8" in res["Model"]


def test_resize_image_for_ollama_small(tmp_path):
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_img_entered.size = (800, 600)
    
    with patch("PIL.Image.open", return_value=mock_img):
        # Should return original filepath since max dimension is <= 1024
        assert image_service.resize_image_for_ollama("original.jpg") == "original.jpg"


def test_resize_image_for_ollama_large_horizontal(tmp_path):
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_img_entered.size = (2000, 1000)
    mock_resized = MagicMock()
    mock_img_entered.resize.return_value = mock_resized
    
    with patch("PIL.Image.open", return_value=mock_img):
        res = image_service.resize_image_for_ollama("original.jpg")
        assert res is not None
        assert "resized_ollama_" in res
        # Verify resize was called on entered image
        mock_img_entered.resize.assert_called_once_with((1024, 512), Image.Resampling.LANCZOS)
        mock_resized.save.assert_called_once()


def test_resize_image_for_ollama_large_vertical(tmp_path):
    mock_img = MagicMock()
    mock_img_entered = mock_img.__enter__.return_value
    mock_img_entered.size = (1000, 2000)
    mock_resized = MagicMock()
    mock_img_entered.resize.return_value = mock_resized
    
    with patch("PIL.Image.open", return_value=mock_img):
        res = image_service.resize_image_for_ollama("original.jpg")
        assert res is not None
        assert "resized_ollama_" in res
        # Verify resize was called on entered image
        mock_img_entered.resize.assert_called_once_with((512, 1024), Image.Resampling.LANCZOS)
        mock_resized.save.assert_called_once()


def test_resize_image_for_ollama_exception():
    with patch("PIL.Image.open", side_effect=Exception("Corrupt image")):
        assert image_service.resize_image_for_ollama("original.jpg") is None


def test_encode_image_to_base64(tmp_path):
    temp_file = tmp_path / "test.txt"
    temp_file.write_bytes(b"hello world")
    
    encoded = image_service.encode_image_to_base64(str(temp_file))
    assert encoded == base64.b64encode(b"hello world").decode("utf-8")


@responses.activate
def test_process_image_with_ollama_success():
    url = "http://localhost:11434/api/generate"
    model = "llava:13b"
    
    responses.add(
        responses.POST,
        url,
        json={"response": "Description: a cute dog. Entities: dog"},
        status=200
    )
    
    with patch("services.image_service.encode_image_to_base64", return_value="encoded_data"):
        res = image_service.process_image_with_ollama("dummy.jpg", url, model)
        assert res == "Description: a cute dog. Entities: dog"


@responses.activate
def test_process_image_with_ollama_model_not_found():
    url = "http://localhost:11434/api/generate"
    model = "non-existent-model"
    
    responses.add(
        responses.POST,
        url,
        status=404
    )
    
    with patch("services.image_service.encode_image_to_base64", return_value="encoded_data"):
        res = image_service.process_image_with_ollama("dummy.jpg", url, model)
        assert "not found" in res.lower()


@responses.activate
def test_process_image_with_ollama_failure():
    url = "http://localhost:11434/api/generate"
    model = "llava:13b"
    
    responses.add(
        responses.POST,
        url,
        status=500
    )
    
    with patch("services.image_service.encode_image_to_base64", return_value="encoded_data"):
        res = image_service.process_image_with_ollama("dummy.jpg", url, model)
        assert res is None
