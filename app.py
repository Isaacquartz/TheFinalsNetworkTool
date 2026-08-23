import os
import json
import time
import subprocess
import threading
import psutil
import re
import socket
import maxminddb
from datetime import datetime
from flask import Flask, render_template, jsonify, request, send_from_directory, make_response

app = Flask(__name__)
import database
import threading

# In-memory session state
current_session = {
    'active': False,
    'id': None,
    'ip': '',
    'pings': [],
    'start_time': None,
    'interval': 1,
    'traceroute': None,
    'note': '',
    'point_notes': {}
}
ping_thread = None
stop_ping_event = threading.Event()

import socket

def is_cloudflare(ip):
    try:
        parts = ip.split('.')
        if len(parts) != 4: return False
        
        # Cloudflare ranges commonly used for matchmaking/telemetry APIs
        if parts[0] == '104' and 16 <= int(parts[1]) <= 31: return True
        if parts[0] == '162' and parts[1] == '159': return True
        if parts[0] == '172' and 64 <= int(parts[1]) <= 71: return True
        return False
    except:
        return False

def detect_game_ip():
    game_pids = []
    try:
        for p in psutil.process_iter(['name', 'pid']):
            name = p.info['name']
            if name:
                name_lower = name.lower()
                if name_lower.startswith('discovery') and name_lower.endswith('.exe'):
                    game_pids.append(p.info['pid'])
    except:
        pass
        
    if not game_pids:
        return None
        
    try:
        candidates = []
        for c in psutil.net_connections(kind='inet'):
            if c.pid in game_pids and c.raddr:
                ip = c.raddr.ip
                port = c.raddr.port
                
                if ip.startswith('127.') or ip.startswith('192.168.') or ip.startswith('10.'):
                    continue
                    
                if port in [80, 443] and is_cloudflare(ip):
                    continue
                        
                if c.type == socket.SOCK_DGRAM or c.status == 'ESTABLISHED':
                    candidates.append(f"{ip}:{port}")
                    
        if candidates:
            return max(set(candidates), key=candidates.count)
    except Exception as e:
        print("Error getting connections:", e)
        
    return "NOT_IN_MATCH"

def tcp_ping(host, port, timeout=1.0):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        start = time.perf_counter()
        s.connect((host, port))
        latency = int((time.perf_counter() - start) * 1000)
        s.close()
        return latency
    except Exception:
        return -1

def ping_worker(target, interval):
    time_regex = re.compile(r"time[=<](\d+)ms")
    
    is_tcp = False
    host = target
    port = 80
    if ':' in target:
        parts = target.split(':')
        host = parts[0]
        try:
            port = int(parts[1])
            is_tcp = True
        except:
            pass

    while not stop_ping_event.is_set():
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        latency = -1
        
        if is_tcp:
            # Use TCP Ping to bypass ICMP blocks
            latency = tcp_ping(host, port)
            # Fallback to ICMP if TCP fails completely (e.g. game disconnected)
            if latency == -1:
                result = subprocess.run(['ping', '-n', '1', '-w', '1000', host], capture_output=True, text=True)
                if result.returncode == 0:
                    match = time_regex.search(result.stdout)
                    if match:
                        latency = int(match.group(1))
        else:
            # Use standard ICMP Ping
            result = subprocess.run(['ping', '-n', '1', '-w', '1000', host], capture_output=True, text=True)
            if result.returncode == 0:
                match = time_regex.search(result.stdout)
                if match:
                    latency = int(match.group(1))
        
        current_session['pings'].append({
            'timestamp': timestamp,
            'latency': latency
        })
        time.sleep(interval)

def tracert_worker(target):
    host = target.split(':')[0] if ':' in target else target
    try:
        process = subprocess.Popen(['tracert', host], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        timeout_count = 0
        for line in process.stdout:
            current_session['traceroute'].append(line.strip())
            
            # Check for full hop timeouts
            if re.match(r'^\s*\d+\s+\*\s+\*\s+\*', line):
                timeout_count += 1
            elif re.match(r'^\s*\d+', line):
                timeout_count = 0
                
            # If we hit 3 consecutive complete timeouts, the destination firewall is dropping ICMP.
            if timeout_count >= 3:
                current_session['traceroute'].append("Trace aborted: ICMP blocked by target firewall.")
                process.kill()
                break
                
            if not current_session['active']:
                process.kill()
                break
    except:
        pass

@app.route('/')
def index():
    response = make_response(render_template('index.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/detect_ip', methods=['GET'])
def api_detect_ip():
    result = detect_game_ip()
    if result == "NOT_IN_MATCH":
        return jsonify({"ip": None, "message": "Game detected, but no match server found. Are you currently in a match?"})
    elif result:
        return jsonify({"ip": result, "message": "Game server detected successfully!"})
    else:
        return jsonify({"ip": None, "message": "Could not detect game server. Is The Finals running?"})

@app.route('/api/geo/<ip>')
def api_geo(ip):
    try:
        reader = maxminddb.open_database('GeoLite2-City.mmdb')
        data = reader.get(ip)
        reader.close()
        
        if data:
            city = data.get('city', {}).get('names', {}).get('en', 'Unknown City')
            country = data.get('country', {}).get('iso_code', 'Unknown')
            return jsonify({'status': 'success', 'city': city, 'countryCode': country, 'isp': 'Private Geo-IP'})
    except Exception as e:
        pass
    return jsonify({'status': 'fail'})

@app.route('/api/profiles')
def api_profiles():
    return jsonify([{'name': 'Default', 'interval': 1}])

@app.route('/api/sessions')
def api_sessions():
    sessions = database.get_all_sessions()
    return jsonify(sessions)

@app.route('/api/start_session', methods=['POST'])
def api_start_session():
    global ping_thread
    req = request.json
    ip = req.get('ip')
    interval = float(req.get('interval', 1.0))
    
    if current_session['active']:
        return jsonify({'success': False, 'message': 'Session already active.'})
    
    current_session['active'] = True
    current_session['id'] = str(int(time.time() * 1000))
    current_session['ip'] = ip
    current_session['pings'] = []
    current_session['start_time'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_session['interval'] = interval
    current_session['traceroute'] = []
    current_session['note'] = ''
    current_session['point_notes'] = {}
    
    stop_ping_event.clear()
    
    # Start workers
    ping_thread = threading.Thread(target=ping_worker, args=(ip, interval))
    ping_thread.daemon = True
    ping_thread.start()
    
    t_thread = threading.Thread(target=tracert_worker, args=(ip,))
    t_thread.daemon = True
    t_thread.start()
    
    return jsonify({'success': True, 'session_id': current_session['id']})

@app.route('/api/stop_session', methods=['POST'])
def api_stop_session():
    if not current_session['active']:
        return jsonify({'success': False, 'message': 'No active session.'})
    
    stop_ping_event.set()
    current_session['active'] = False
    
    session_to_save = {
        'id': current_session['id'],
        'ip': current_session['ip'],
        'start_time': current_session.get('start_time', datetime.now().strftime('%Y-%m-%d %H:%M:%S')),
        'pings': current_session['pings'],
        'traceroute': current_session['traceroute'],
        'note': current_session.get('note', ''),
        'point_notes': current_session.get('point_notes', {})
    }
    database.save_session(session_to_save)
    
    return jsonify({'success': True})

@app.route('/api/live_data')
def api_live_data():
    if not current_session['active']:
        return jsonify({'active': False})
    
    recent_pings = current_session['pings'][-60:]
    return jsonify({
        'active': True,
        'ip': current_session['ip'],
        'pings': recent_pings,
        'traceroute': current_session['traceroute'][-10:],
        'note': current_session['note']
    })

@app.route('/api/live_note', methods=['POST'])
def api_live_note():
    if current_session['active']:
        current_session['note'] = request.json.get('note', '')
    return jsonify({'success': True})

@app.route('/api/session/<session_id>/note', methods=['POST'])
def api_update_session_note(session_id):
    note = request.json.get('note', '')
    point_notes = request.json.get('point_notes', None)
    
    success = database.update_session_note(session_id, note, point_notes)
    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Failed to update note'}), 500

if __name__ == '__main__':
    database.init_db()
    database.migrate_json_to_sqlite()
    app.run(port=5000, debug=False)
