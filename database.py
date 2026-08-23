import sqlite3
import json
import os
from datetime import datetime

DB_FILE = 'database.db'
JSON_FILE = 'data.json'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            ip TEXT,
            timestamp TEXT,
            note TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS pings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            timestamp TEXT,
            latency INTEGER,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
    ''')
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS traceroutes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            hop_index INTEGER,
            content TEXT,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
    ''')
    
    c.execute('''
        CREATE TABLE IF NOT EXISTS point_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            timestamp TEXT,
            note TEXT,
            FOREIGN KEY(session_id) REFERENCES sessions(id)
        )
    ''')
    
    conn.commit()
    conn.close()

def migrate_json_to_sqlite():
    if not os.path.exists(JSON_FILE):
        return
        
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM sessions")
    count = c.fetchone()[0]
    if count > 0:
        conn.close()
        return

    print("Migrating data.json to SQLite database...")
    try:
        with open(JSON_FILE, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print("Error reading json:", e)
        conn.close()
        return

    sessions = data.get('sessions', [])
    for sess in sessions:
        sess_id = str(sess.get('id', ''))
        if not sess_id: continue
        
        c.execute("INSERT INTO sessions (id, ip, timestamp, note) VALUES (?, ?, ?, ?)",
                  (sess_id, sess.get('ip', ''), sess.get('timestamp', ''), sess.get('note', '')))
        
        for p in sess.get('pings', []):
            c.execute("INSERT INTO pings (session_id, timestamp, latency) VALUES (?, ?, ?)",
                      (sess_id, p.get('timestamp', ''), p.get('latency', -1)))
                      
        tr = sess.get('traceroute', [])
        for i, line in enumerate(tr):
            c.execute("INSERT INTO traceroutes (session_id, hop_index, content) VALUES (?, ?, ?)",
                      (sess_id, i, line))
                      
        pn = sess.get('point_notes', {})
        for ts, note in pn.items():
            c.execute("INSERT INTO point_notes (session_id, timestamp, note) VALUES (?, ?, ?)",
                      (sess_id, ts, note))
                      
    conn.commit()
    conn.close()
    
    try:
        os.rename(JSON_FILE, JSON_FILE + '.bak')
        print("Migration complete. data.json backed up to data.json.bak")
    except Exception as e:
        print("Could not rename file:", e)

def save_session(session_data):
    sess_id = session_data.get('id')
    if not sess_id: return
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute("INSERT INTO sessions (id, ip, timestamp, note) VALUES (?, ?, ?, ?)",
              (sess_id, session_data.get('ip', ''), session_data.get('start_time', datetime.now().strftime('%Y-%m-%d %H:%M:%S')), session_data.get('note', '')))
              
    for p in session_data.get('pings', []):
        c.execute("INSERT INTO pings (session_id, timestamp, latency) VALUES (?, ?, ?)",
                  (sess_id, p.get('timestamp', ''), p.get('latency', -1)))
                  
    for i, line in enumerate(session_data.get('traceroute', [])):
        c.execute("INSERT INTO traceroutes (session_id, hop_index, content) VALUES (?, ?, ?)",
                  (sess_id, i, line))
                  
    for ts, note in session_data.get('point_notes', {}).items():
        c.execute("INSERT INTO point_notes (session_id, timestamp, note) VALUES (?, ?, ?)",
                  (sess_id, ts, note))
                  
    conn.commit()
    conn.close()

def get_all_sessions():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    c.execute("SELECT * FROM sessions ORDER BY timestamp ASC")
    sessions_rows = c.fetchall()
    
    result = []
    for row in sessions_rows:
        sess_id = row['id']
        session_obj = {
            'id': sess_id,
            'ip': row['ip'],
            'timestamp': row['timestamp'],
            'note': row['note'],
            'pings': [],
            'traceroute': [],
            'point_notes': {}
        }
        
        c.execute("SELECT timestamp, latency FROM pings WHERE session_id = ? ORDER BY id ASC", (sess_id,))
        for p in c.fetchall():
            session_obj['pings'].append({'timestamp': p['timestamp'], 'latency': p['latency']})
            
        c.execute("SELECT content FROM traceroutes WHERE session_id = ? ORDER BY hop_index ASC", (sess_id,))
        for t in c.fetchall():
            session_obj['traceroute'].append(t['content'])
            
        c.execute("SELECT timestamp, note FROM point_notes WHERE session_id = ?", (sess_id,))
        for n in c.fetchall():
            session_obj['point_notes'][n['timestamp']] = n['note']
            
        result.append(session_obj)
        
    conn.close()
    return result

def update_session_note(session_id, note, point_notes=None):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute("UPDATE sessions SET note = ? WHERE id = ?", (note, session_id))
    
    if point_notes is not None:
        c.execute("DELETE FROM point_notes WHERE session_id = ?", (session_id,))
        for ts, pnote in point_notes.items():
            c.execute("INSERT INTO point_notes (session_id, timestamp, note) VALUES (?, ?, ?)", (session_id, ts, pnote))
            
    conn.commit()
    conn.close()
    return True
