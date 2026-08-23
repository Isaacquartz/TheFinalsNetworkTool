import subprocess
import time
import csv
import re
import os
import threading
from datetime import datetime

try:
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
except ImportError:
    print("matplotlib is not installed. Please install it using: pip install matplotlib")
    print("Graphs will not be generated until it is installed.")
    plt = None

def run_traceroute(ip, log_file):
    print(f"\n[+] Running traceroute to {ip}...")
    try:
        # Run tracert on Windows
        process = subprocess.Popen(['tracert', ip], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        with open(log_file, 'w') as f:
            for line in process.stdout:
                print(line, end='')
                f.write(line)
        print(f"[+] Traceroute complete. Saved to {log_file}\n")
    except Exception as e:
        print(f"[-] Failed to run traceroute: {e}")

def ping_server(ip, log_file):
    print(f"[+] Starting ping to {ip}. Press Ctrl+C to stop and generate graph.")
    
    # Write CSV header
    if not os.path.exists(log_file):
        with open(log_file, 'w', newline='') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['Timestamp', 'Latency_ms'])

    # Regex to match the time=XXms part of Windows ping output
    time_regex = re.compile(r"time[=<](\d+)ms")

    try:
        while True:
            # Run a single ping request
            # -n 1 means 1 request, -w 1000 means 1000ms timeout
            result = subprocess.run(['ping', '-n', '1', '-w', '1000', ip], capture_output=True, text=True)
            
            timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            latency = None

            if result.returncode == 0:
                match = time_regex.search(result.stdout)
                if match:
                    latency = int(match.group(1))
            
            # Log to CSV
            with open(log_file, 'a', newline='') as csvfile:
                writer = csv.writer(csvfile)
                # If latency is None, it means request timed out
                writer.writerow([timestamp, latency if latency is not None else -1])
            
            if latency is not None:
                print(f"[{timestamp}] Ping: {latency} ms")
            else:
                print(f"[{timestamp}] Ping: Request timed out")
            
            time.sleep(1) # wait 1 second before next ping
    
    except KeyboardInterrupt:
        print("\n[+] Ping stopped by user.")

def generate_graph(csv_file, output_graph):
    if plt is None:
        return
    
    print("\n[+] Generating graph...")
    timestamps = []
    latencies = []

    try:
        with open(csv_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ts = datetime.strptime(row['Timestamp'], '%Y-%m-%d %H:%M:%S')
                lat = int(row['Latency_ms'])
                if lat >= 0:
                    timestamps.append(ts)
                    latencies.append(lat)
        
        if not latencies:
            print("[-] No successful ping data to graph.")
            return

        plt.figure(figsize=(10, 5))
        plt.plot(timestamps, latencies, color='b', marker='o', linestyle='-', markersize=3)
        plt.title('Ping Latency to Game Server')
        plt.xlabel('Time')
        plt.ylabel('Latency (ms)')
        plt.grid(True)
        
        # Format X axis for dates
        plt.gca().xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        plt.gcf().autofmt_xdate()
        
        plt.tight_layout()
        plt.savefig(output_graph)
        print(f"[+] Graph saved to {output_graph}")

    except Exception as e:
        print(f"[-] Failed to generate graph: {e}")

def main():
    ip = input("Enter the game server IP to track: ").strip()
    if not ip:
        print("[-] IP address is required.")
        return

    traceroute_log = 'traceroute_log.txt'
    ping_log = 'ping_log.csv'
    graph_out = 'ping_graph.png'
    
    # We can run traceroute in a separate thread so it doesn't block the ping from starting
    traceroute_thread = threading.Thread(target=run_traceroute, args=(ip, traceroute_log))
    traceroute_thread.daemon = True
    traceroute_thread.start()

    # Start ping loop (this blocks until Ctrl+C)
    ping_server(ip, ping_log)
    
    # Once stopped, generate graph
    generate_graph(ping_log, graph_out)

if __name__ == '__main__':
    main()
