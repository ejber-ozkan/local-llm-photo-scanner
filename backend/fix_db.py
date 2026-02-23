import sqlite3


def run_migration(db_name):
    conn = sqlite3.connect(db_name)
    cursor = conn.cursor()
    for col in ["date_created", "date_modified"]:
        try:
            cursor.execute(f"ALTER TABLE photos ADD COLUMN {col}")
            print(f"Added {col} to {db_name}")
        except sqlite3.OperationalError as e:
            print(f"Column {col} already exists in {db_name}: {e}")
    conn.commit()
    conn.close()


run_migration("photometadata.db")
run_migration("test_photometadata.db")
print("Migration complete.")
