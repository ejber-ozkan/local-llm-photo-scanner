import sqlite3
import os

print("Testing photo backend database setup...")
# Check if date_created and date_modified columns exist
conn = sqlite3.connect("photometadata.db")
cursor = conn.cursor()

try:
    cursor.execute("SELECT date_created, date_modified FROM photos LIMIT 1")
    print("SUCCESS: date_created and date_modified columns exist!")
except Exception as e:
    print(f"FAILED: columns missing - {e}")

try:
    cursor.execute("SELECT * FROM photos ORDER BY date_modified DESC LIMIT 1")
    print("SUCCESS: Sorting by date_modified works!")
except Exception as e:
    print(f"FAILED: sorting by date_modified failed - {e}")
    
conn.close()
