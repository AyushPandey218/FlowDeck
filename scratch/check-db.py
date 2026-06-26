import sqlite3
import os

db_path = os.path.expandvars(r'%APPDATA%\com.flowdeck.app\flowdeck.db')
print(f"Connecting to database at: {db_path}")

if not os.path.exists(db_path):
    print("Error: Database file does not exist!")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]

print("\nTables found in database:")
for t in tables:
    print(f"- {t}")

try:
    cursor.execute("SELECT value FROM settings WHERE key='desktop_id';")
    row = cursor.fetchone()
    if row:
        print(f"\nDesktop ID: {row[0]}")
    else:
        print("\nDesktop ID not found in settings.")
except Exception as e:
    print(f"Error checking desktop_id: {e}")

conn.close()
