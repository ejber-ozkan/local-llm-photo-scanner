import os
import shutil
import time
import requests

TEST_DIR = "test_duplicates_dir"
if os.path.exists(TEST_DIR):
    shutil.rmtree(TEST_DIR)
os.makedirs(TEST_DIR)

# Generate a dummy image file
dummy_img1 = os.path.join(TEST_DIR, "photo1.jpg")
with open(dummy_img1, "wb") as f:
    f.write(b"fake image data")

# Generate exact duplicates
shutil.copy(dummy_img1, os.path.join(TEST_DIR, "photo2_copy.jpg"))
shutil.copy(dummy_img1, os.path.join(TEST_DIR, "photo3_copy.jpg"))

# Generate a screenshot file 
with open(os.path.join(TEST_DIR, "screenshot_2024.jpg"), "wb") as f:
    f.write(b"fake screenshot data")
    
# Clean MAIN DB before we begin
requests.post("http://localhost:8000/api/database/clean", json={"target": "main", "confirm": True, "confirm2": True})

print(f"Submitting {TEST_DIR} to API...")
res = requests.post("http://localhost:8000/api/scan", json={"directory_path": os.path.abspath(TEST_DIR)})
print(res.json())

print("Waiting 5 seconds for background processor to digest the files...")
time.sleep(5)

print("\n--- QUERYING GALLERY ---")
res = requests.get("http://localhost:8000/api/search")
print(f"Gallery returned {len(res.json())} items")
for item in res.json():
    print(f"  - {item['filename']}")

print("\n--- QUERYING DUPLICATES ---")
res = requests.get("http://localhost:8000/api/duplicates")
try:
    data = res.json()
    print(f"Duplicates found: {len(data)} groups")
    for group in data:
        print(f"  Group Hash: {group['hash']} ({group['count']} copies)")
        print(f"  Original: {group['original']['filename']}")
        for copy in group['copies']:
            print(f"  Copy: {copy['filename']}")
except Exception as e:
    print(f"Failed to parse JSON. Status: {res.status_code}")
    print(f"Response: {res.text}")
