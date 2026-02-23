import os
import shutil
from datetime import datetime

BACKUP_DIR = "backups"
DB_FILE = "photometadata.db"


def backup_database() -> dict[str, str]:
    """Duplicates the main library database into the backups folder."""
    if not os.path.exists(DB_FILE):
        print(f"Error: Database file '{DB_FILE}' not found. Cannot create backup.")
        return False

    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"photometadata_backup_{timestamp}.db"
    backup_path = os.path.join(BACKUP_DIR, backup_filename)

    try:
        shutil.copy2(DB_FILE, backup_path)
        print(f"Success! Database backed up to: {backup_path}")
        return backup_path
    except Exception as e:
        print(f"Error creating backup: {e}")
        return False


if __name__ == "__main__":
    print("Starting database backup...")
    backup_database()
