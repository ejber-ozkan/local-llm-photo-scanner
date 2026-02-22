import sqlite3
import os
import sys

# Paths relative to the root directory where the script will reside
DB_FILE = "backend/photometadata.db"
DB_TEST_FILE = "backend/test_photometadata.db"

# Also support running it directly from the backend folder
if not os.path.exists("backend") and os.path.exists("photometadata.db"):
    DB_FILE = "photometadata.db"
    DB_TEST_FILE = "test_photometadata.db"

def init_db(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Table for Photos
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filepath TEXT UNIQUE,
            filename TEXT,
            description TEXT,
            status TEXT DEFAULT 'pending'
        )
    ''')
    # Table for detected entities
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_id INTEGER,
            entity_type TEXT,
            entity_name TEXT,
            first_name TEXT,
            last_name TEXT,
            bounding_box TEXT,
            embedding TEXT,
            FOREIGN KEY(photo_id) REFERENCES photos(id)
        )
    ''')
    for col in ['date_taken', 'camera_make', 'camera_model', 'gps_lat REAL', 'gps_lon REAL', 'date_created', 'date_modified']:
        try:
            cursor.execute(f'ALTER TABLE photos ADD COLUMN {col}')
        except sqlite3.OperationalError:
            pass
    conn.commit()
    conn.close()

def wipe_database(db_path):
    print(f"[{db_path}] Connecting to database...")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        print(f"[{db_path}] Dropping existing tables...")
        cursor.execute("DROP TABLE IF EXISTS entities")
        cursor.execute("DROP TABLE IF EXISTS photos")
        conn.commit()
        conn.close()
        
        print(f"[{db_path}] Re-initializing empty tables...")
        init_db(db_path)
        print(f"[{db_path}] Database successfully cleaned!")
    except Exception as e:
        print(f"[{db_path}] Error wiping database: {e}")

def main():
    print("========================================")
    print("   Local LLM Photo Scanner - DB Management   ")
    print("========================================")
    print("1) Clean Test Database")
    print("2) Clean Main Gallery Database")
    print("3) Cancel")
    print("========================================")
    
    try:
        choice = input("Select an option (1-3): ").strip()
        
        if choice == '1':
            confirm = input(f"Are you sure you want to completely WIPE the Test Database ({DB_TEST_FILE})? (y/n): ").strip().lower()
            if confirm == 'y':
                wipe_database(DB_TEST_FILE)
            else:
                print("Operation cancelled.")
                
        elif choice == '2':
            confirm1 = input(f"WARNING: Are you sure you want to completely WIPE the Main Gallery Database ({DB_FILE})? (y/n): ").strip().lower()
            if confirm1 == 'y':
                confirm2 = input("Are you REALLY sure? This will delete all processed metadata forever. (y/n): ").strip().lower()
                if confirm2 == 'y':
                    wipe_database(DB_FILE)
                else:
                    print("Operation cancelled at final confirmation.")
            else:
                print("Operation cancelled.")
                
        elif choice == '3':
            print("Operation cancelled.")
        else:
            print("Invalid selection. Exiting.")
            
    except KeyboardInterrupt:
        print("\nOperation cancelled.")
        sys.exit(0)

if __name__ == "__main__":
    main()
