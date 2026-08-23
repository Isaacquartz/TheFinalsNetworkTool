# 🎮 The Finals Network Tool

A modern, sleek, and automatic network tracking tool built specifically for **The Finals**. 

Tired of wondering if that lag spike was your internet or the game server? This tool runs locally, automatically detects your active match server IP in real-time, and provides live ping tracking and traceroutes to diagnose network issues on the fly. 

## ✨ Features
- **🎯 Auto-Detect:** Automatically finds the UDP match server IP you are currently connected to without manual packet sniffing.
- **📈 Live Monitor:** Real-time ping tracking charted on a sleek, game-themed UI.
- **🗺️ Traceroute:** Run traceroutes to pinpoint exactly where the packet loss or latency is happening.
- **📓 Session History:** Saves your tracking sessions to a local SQLite database for easy comparison and review. Add custom notes to remember specific matches!
- **📍 Geo-IP:** Quick lookup of the game server's geographical location.

## 🛠️ Tech Stack
- **Backend:** Python, Flask, SQLite, `psutil`
- **Frontend:** Vanilla JS, HTML/CSS (designed to mimic The Finals in-game UI)
- **Charts:** Chart.js

## 🚀 How to Install & Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sgozlan/TheFinalsNetworkTool.git
   cd TheFinalsNetworkTool
   ```

2. **Set up a virtual environment (Recommended):**
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```

3. **Install Dependencies:**
   ```bash
   pip install flask psutil maxminddb
   ```
   
4. **Setup Geo-IP Database (Optional):**
   To enable the geographical location lookups for game servers, you need the free MaxMind GeoLite2 database:
   - Sign up for a free account at [MaxMind](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data).
   - Download the **GeoLite2 City** database (`.mmdb` format).
   - Extract and place the `GeoLite2-City.mmdb` file directly in the root folder of this project.

5. **Run the App:**
   ```bash
   python app.py
   ```
   The app will start a local server. Open your browser and navigate to `http://127.0.0.1:5000/`.

## ⚠️ Limitations
- **Windows Target:** The auto-detect feature relies on Windows-specific connection mapping to sidestep Easy Anti-Cheat memory blocks without getting flagged.
- **Admin Rights:** Depending on your Windows security configuration, `psutil` might require you to run the Python script as Administrator to read active network tables.
- **Game Specific:** The tool currently targets any executable starting with `discovery` and ending with `.exe` (e.g., `discovery.exe`, `discovery-d.exe`). 

## 🗺️ Roadmap Ideas
- [ ] **3D Globe Visualization:** Plot traceroute hops on an interactive 3D globe or map instead of raw text output.
- [ ] **Match Performance Score:** Automatically grade your connection quality at the end of a match.
- [ ] **Background Daemon Mode:** Run silently in the system tray and automatically record sessions whenever a match starts.
- [ ] **Global Server Heatmap:** Crowdsource game server IPs to build a heatmap of server stability by region.

## 🤝 Contributing
Pull requests are welcome! Feel free to fork the project, squash some bugs, or add new features.

---
*Disclaimer: This tool is not affiliated with or endorsed by Embark Studios. It is purely an external network diagnostic tool and does not read or modify game memory.*
