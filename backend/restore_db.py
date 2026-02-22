import os
import shutil
import argparse
from datetime import datetime

BACKUP_DIR = "backups"
DB_FILE = "photometadata.db"

def restore_database(backup_filename: str):
    """Restores the database from a backup file, keeping a safety copy of the current DB."""
    
    backup_path = os.path.join(BACKUP_DIR, backup_filename)
    
    # 1. Verification
    if not os.path.exists(backup_path):
        print(f"Error: Backup file '{backup_path}' does not exist.")
        return False
        
    # 2. Safety copy of current DB (if it exists)
    if os.path.exists(DB_FILE):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safety_path = os.path.join(BACKUP_DIR, f"pre_restore_safety_{timestamp}.db")
        if not os.path.exists(BACKUP_DIR):
             os.makedirs(BACKUP_DIR)
        shutil.copy2(DB_FILE, safety_path)
        print(f"Created safety copy of current DB at: {safety_path}")
        
    # 3. Restore
    try:
        shutil.copy2(backup_path, DB_FILE)
        print(f"Success! Database restored from: {backup_filename}")
        return True
    except Exception as e:
        print(f"Critical Error during restore: {e}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore the main library database from a backup.")
    parser.add_argument("backup_file", help="The filename of the backup inside the backups/ folder (e.g. library_backup_20240101_120000.db)")
    args = parser.parse_args()
    
    # allow passing full path by accident
    filename = os.path.basename(args.backup_file)
    print(f"Starting restore operation targeting '{filename}'...")
    restore_database(filename)
