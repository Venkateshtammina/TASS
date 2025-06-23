import sqlite3
from datetime import datetime, timedelta

DB_PATH = "traffic_history.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS traffic_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_key TEXT,
            timestamp DATETIME,
            duration_in_traffic INTEGER
        )
    ''')
    conn.commit()
    conn.close()

def save_traffic(route_key, duration_in_traffic):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO traffic_history (route_key, timestamp, duration_in_traffic)
        VALUES (?, ?, ?)
    ''', (route_key, datetime.now(), duration_in_traffic))
    conn.commit()
    conn.close()

def get_traffic_last_24h(route_key):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    since = datetime.now() - timedelta(hours=24)
    c.execute('''
        SELECT timestamp, duration_in_traffic FROM traffic_history
        WHERE route_key = ? AND timestamp >= ?
        ORDER BY timestamp ASC
    ''', (route_key, since))
    rows = c.fetchall()
    conn.close()
    return rows

init_db()