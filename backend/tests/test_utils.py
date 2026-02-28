import pytest

from services.image_service import _convert_gps_to_decimal, extract_gps_from_exif


@pytest.mark.parametrize(
    "gps_coords, gps_ref, expected",
    [
        # Happy path: valid GPS data
        ((40.0, 42.0, 46.0), "N", 40.71277777777778),
        ((74.0, 0.0, 21.0), "W", -74.00583333333333),
        ((33.0, 51.0, 45.0), "S", -33.8625),
        ((151.0, 12.0, 26.0), "E", 151.20722222222222),
        # Edge case: zero minutes and seconds
        ((40.0, 0.0, 0.0), "N", 40.0),
    ],
)
def test_convert_gps_to_decimal(gps_coords, gps_ref, expected):
    """Test GPS tuple to decimal conversion."""
    result = _convert_gps_to_decimal(gps_coords, gps_ref)
    assert abs(result - expected) < 0.0001


def test_extract_gps_from_exif_no_image(tmp_path):
    """Test extracting GPS from a non-existent file."""
    bad_file = tmp_path / "does_not_exist.jpg"
    result = extract_gps_from_exif(str(bad_file))

    # Defaults to (None, None) when file can't be read or has no EXIF
    assert result == {"gps_lat": None, "gps_lon": None}


def test_extract_gps_from_exif_empty_image(tmp_path):
    """Test extracting GPS from a file that is not a valid image."""
    empty_file = tmp_path / "empty.jpg"
    empty_file.write_bytes(b"not an image at all")

    result = extract_gps_from_exif(str(empty_file))
    assert result == {"gps_lat": None, "gps_lon": None}
