let pingChart = null;
let historyChart = null;
let liveInterval = null;
let isTracking = false;

// Initialize Chart.js defaults
Chart.defaults.color = '#f0f0f0';
Chart.defaults.font.family = "'Inter', sans-serif";

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    
    document.getElementById('themeIcon').innerText = isLight ? 'dark_mode' : 'light_mode';
    
    Chart.defaults.color = isLight ? '#111' : '#f0f0f0';
    
    const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const titleColor = isLight ? '#666' : '#aaa';
    
    if (pingChart) {
        pingChart.options.scales.y.grid.color = gridColor;
        pingChart.options.scales.y.title.color = titleColor;
        pingChart.update();
    }
    if (historyChart) {
        historyChart.options.scales.y.grid.color = gridColor;
        historyChart.options.scales.y.title.color = titleColor;
        historyChart.update();
    }
}

function setIntervalVal(btn) {
    document.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('pingInterval').value = btn.getAttribute('data-val');
}

function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    const tabEl = document.getElementById(tabId);
    if (tabEl.classList.contains('grid-layout')) {
        tabEl.style.display = 'grid';
    } else {
        tabEl.style.display = 'block';
    }
    
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    if (btnElement) {
        btnElement.classList.add('active');
    } else if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    }

    if (tabId === 'history') {
        loadHistory();
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    
    container.appendChild(toast);
    
    // Remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

async function autoDetect() {
    const btn = document.getElementById('autoDetectBtn');
    btn.disabled = true;
    btn.innerText = 'Detecting...';
    
    try {
        const response = await fetch('/api/detect_ip');
        const data = await response.json();
        
        if (data.ip) {
            document.getElementById('targetIp').value = data.ip;
            showToast(data.message || 'Game server detected successfully!', 'success');
            
            // Try Geo-IP lookup
            try {
                const ipOnly = data.ip.split(':')[0];
                const geoResp = await fetch(`/api/geo/${ipOnly}`);
                const geoData = await geoResp.json();
                if (geoData.status === 'success') {
                    const tag = document.getElementById('geoTag');
                    tag.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1.2em;">location_on</span> ${geoData.city}, ${geoData.countryCode} (${geoData.isp})`;
                    tag.style.display = 'flex';
                }
            } catch(e) {}
            
        } else {
            showToast(data.message || 'Could not detect game server. Is The Finals running?', 'error');
        }
    } catch (e) {
        showToast('Error connecting to backend.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = 'Auto-Detect';
    }
}

async function saveLiveNote(shouldShowToast = false) {
    const note = document.getElementById('liveNotesInput').value;
    fetch('/api/live_note', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({note: note})
    }).then(() => {
        if (shouldShowToast) {
            showToast('Live note saved!', 'success');
        }
    }).catch(e => {
        console.error("Failed to save live note", e);
    });
}

let activeHistorySessionId = null;
let activeHistoryPointNotes = {};

async function saveHistoryNote() {
    if (!activeHistorySessionId) return;
    const note = document.getElementById('historyNotesInput').value;
    try {
        const res = await fetch(`/api/session/${activeHistorySessionId}/note`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({note: note, point_notes: activeHistoryPointNotes})
        });
        if (res.ok) {
            showToast('Note saved successfully!', 'success');
        }
    } catch(e) {
        showToast('Error saving note.', 'error');
    }
}

function initChart() {
    const ctx = document.getElementById('pingChart').getContext('2d');
    if (pingChart) {
        pingChart.destroy();
    }
    
    pingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Ping (ms)',
                data: [],
                borderColor: '#FFF100', // The Finals Yellow
                backgroundColor: 'rgba(255, 241, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Latency (ms)', color: '#aaa' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                x: {
                    grid: { display: false }
                }
            },
            animation: {
                duration: 0 // turn off animation for live updates
            }
        }
    });
}

async function toggleSession() {
    const btn = document.getElementById('startBtn');
    
    if (!isTracking) {
        // START
        const ip = document.getElementById('targetIp').value;
        const interval = document.getElementById('pingInterval').value;
        
        if (!ip) {
            alert("Please enter or auto-detect a target IP.");
            return;
        }

        const res = await fetch('/api/start_session', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ip, interval })
        });
        const data = await res.json();

        if (data.success) {
            isTracking = true;
            btn.innerText = "STOP TRACKING";
            btn.className = "btn btn-danger";
            initChart();
            document.getElementById('tracertOutput').innerText = "Traceroute running...";
            document.getElementById('liveNotesInput').value = '';
            const ipOnly = ip.split(':')[0];
            fetch(`/api/geo/${ipOnly}`)
                .then(r => r.json())
                .then(geoData => {
                    if (geoData.status === 'success') {
                        const tag = document.getElementById('geoTag');
                        tag.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1.2em;">location_on</span> ${geoData.city}, ${geoData.countryCode} (${geoData.isp})`;
                        tag.style.display = 'flex';
                    }
                }).catch(() => {});
            liveInterval = setInterval(fetchLiveData, 1000);
        } else {
            alert(data.message);
        }
    } else {
        // STOP
        await fetch('/api/stop_session', { method: 'POST' });
        isTracking = false;
        btn.innerText = "START TRACKING";
        btn.className = "btn btn-primary";
        clearInterval(liveInterval);
    }
}

async function fetchLiveData() {
    try {
        const res = await fetch('/api/live_data');
        const data = await res.json();
        
        if (data.active) {
            // Update chart
            const labels = data.pings.map(p => p.timestamp.split(' ')[1]);
            const values = data.pings.map(p => p.latency < 0 ? 0 : p.latency);
            
            pingChart.data.labels = labels;
            pingChart.data.datasets[0].data = values;
            pingChart.update();

            // Update Live Stats
            const pings = data.pings;
            const validPings = pings.filter(p => p.latency >= 0).map(p => p.latency);
            
            if (pings.length > 0) {
                const lastPing = pings[pings.length - 1].latency;
                document.getElementById('currentPing').innerText = lastPing >= 0 ? lastPing + ' ms' : 'Timeout';
            }
            
            if (validPings.length > 0) {
                const avg = validPings.reduce((a,b)=>a+b, 0) / validPings.length;
                document.getElementById('avgPing').innerText = Math.round(avg) + ' ms';
                document.getElementById('minPing').innerText = Math.min(...validPings) + ' ms';
                document.getElementById('maxPing').innerText = Math.max(...validPings) + ' ms';
                
                // Calculate Jitter
                if (validPings.length > 1) {
                    let totalJitter = 0;
                    for (let i = 1; i < validPings.length; i++) {
                        totalJitter += Math.abs(validPings[i] - validPings[i-1]);
                    }
                    const jitter = totalJitter / (validPings.length - 1);
                    document.getElementById('liveJitter').innerText = jitter.toFixed(1) + ' ms';
                } else {
                    document.getElementById('liveJitter').innerText = '-- ms';
                }
            } else {
                document.getElementById('avgPing').innerText = '-- ms';
                document.getElementById('minPing').innerText = '-- ms';
                document.getElementById('maxPing').innerText = '-- ms';
                document.getElementById('liveJitter').innerText = '-- ms';
            }
            
            const lossCount = pings.filter(p => p.latency < 0).length;
            const lossPct = pings.length > 0 ? (lossCount / pings.length) * 100 : 0;
            document.getElementById('liveLoss').innerText = lossPct.toFixed(1) + ' %';
            document.getElementById('liveLoss').style.color = lossPct > 5 ? 'var(--red)' : 'white';

            // Update tracert
            if (data.traceroute.length > 0) {
                document.getElementById('tracertOutput').innerText = data.traceroute.join('\n');
            }
        } else if (isTracking) {
            // Backend session stopped unexpectedly
            toggleSession();
        }
    } catch (e) {
        console.error(e);
    }
}

let currentHistoryPage = 1;
const SESSIONS_PER_PAGE = 8;
let allHistorySessions = [];

async function loadHistory() {
    const res = await fetch('/api/sessions');
    const sessions = await res.json();
    allHistorySessions = sessions.reverse();
    currentHistoryPage = 1;
    renderHistoryList();
}

function changeHistoryPage(delta) {
    const totalPages = Math.ceil(allHistorySessions.length / SESSIONS_PER_PAGE) || 1;
    currentHistoryPage += delta;
    if (currentHistoryPage < 1) currentHistoryPage = 1;
    if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;
    renderHistoryList();
}

function renderHistoryList() {
    const list = document.getElementById('sessionList');
    list.innerHTML = '';
    
    const totalPages = Math.ceil(allHistorySessions.length / SESSIONS_PER_PAGE) || 1;
    document.getElementById('historyPageLabel').innerText = `Page ${currentHistoryPage} of ${totalPages}`;
    
    const startIndex = (currentHistoryPage - 1) * SESSIONS_PER_PAGE;
    const endIndex = startIndex + SESSIONS_PER_PAGE;
    const pageSessions = allHistorySessions.slice(startIndex, endIndex);
    
    pageSessions.forEach(sess => {
        const li = document.createElement('li');
        
        let noteHtml = '';
        if (sess.note && sess.note.trim() !== '') {
            const truncatedNote = sess.note.length > 60 ? sess.note.substring(0, 60) + '...' : sess.note;
            noteHtml = `
                <div style="color: var(--yellow); font-size: 0.85em; margin-top: 6px; display: flex; align-items: center; gap: 5px;">
                    <span class="material-symbols-outlined" style="font-size: 1.2em;">edit_note</span>
                    <i>${truncatedNote}</i>
                </div>
            `;
        }

        li.innerHTML = `
            <div style="flex: 1; margin-right: 15px;">
                <strong>${sess.timestamp}</strong><br>
                <small>IP: ${sess.ip} | Pings: ${sess.pings.length}</small>
                ${noteHtml}
            </div>
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;">View Graph</button>
        `;
        li.onclick = () => renderHistoryChart(sess);
        list.appendChild(li);
    });
}

function renderHistoryChart(session) {
    document.getElementById('historyViewIp').innerText = session.ip;
    document.getElementById('historyViewTime').innerText = session.timestamp;
    
    const geoTag = document.getElementById('historyGeoTag');
    geoTag.style.display = 'none';
    if (session.ip) {
        const ipOnly = session.ip.split(':')[0];
        fetch(`/api/geo/${ipOnly}`)
            .then(r => r.json())
            .then(geoData => {
                if (geoData.status === 'success') {
                    geoTag.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1.1em; vertical-align: middle;">location_on</span> ${geoData.city}, ${geoData.countryCode} (${geoData.isp})`;
                    geoTag.style.display = 'inline-flex';
                    geoTag.style.alignItems = 'center';
                }
            }).catch(() => {});
    }
    
    activeHistorySessionId = session.id;
    activeHistoryPointNotes = session.point_notes || {};
    document.getElementById('historyNotesInput').value = session.note || '';
    document.getElementById('statsPanel').style.display = 'grid';
    
    const ctx = document.getElementById('historyChart').getContext('2d');
    if (historyChart) {
        historyChart.destroy();
    }
    
    const labels = session.pings.map(p => p.timestamp.split(' ')[1]);
    const values = session.pings.map(p => p.latency < 0 ? 0 : p.latency);

    // Calculate Stats
    const successfulPings = session.pings.filter(p => p.latency >= 0).map(p => p.latency);
    const lossCount = session.pings.filter(p => p.latency < 0).length;
    const totalCount = session.pings.length;
    
    if (successfulPings.length > 0) {
        successfulPings.sort((a, b) => a - b);
        
        const min = successfulPings[0];
        const max = successfulPings[successfulPings.length - 1];
        const sum = successfulPings.reduce((a, b) => a + b, 0);
        const avg = Math.round(sum / successfulPings.length);
        
        const mid = Math.floor(successfulPings.length / 2);
        const median = successfulPings.length % 2 !== 0 ? successfulPings[mid] : Math.round((successfulPings[mid - 1] + successfulPings[mid]) / 2);
        
        // 1% Lows (average of the top 1% highest pings - meaning worst pings)
        // Actually, 1% lows in gaming usually means the bottom 1% of framerates. For ping, we care about the 99th percentile (top 1% highest latency).
        const p99Index = Math.floor(successfulPings.length * 0.99);
        const p99Lows = p99Index < successfulPings.length ? successfulPings[p99Index] : max;
        
        document.getElementById('statMin').innerText = min + ' ms';
        document.getElementById('statMax').innerText = max + ' ms';
        document.getElementById('statAvg').innerText = avg + ' ms';
        document.getElementById('statMedian').innerText = median + ' ms';
        document.getElementById('stat1Low').innerText = p99Lows + ' ms';
    } else {
        document.getElementById('statMin').innerText = '-';
        document.getElementById('statMax').innerText = '-';
        document.getElementById('statAvg').innerText = '-';
        document.getElementById('statMedian').innerText = '-';
        document.getElementById('stat1Low').innerText = '-';
    }

    const lossPct = totalCount > 0 ? Math.round((lossCount / totalCount) * 100) : 0;
    document.getElementById('statLoss').innerText = lossPct + '%';
    document.getElementById('statLoss').style.color = lossPct > 5 ? 'var(--red)' : 'white';

    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Session: ${session.timestamp} (${session.ip})`,
                data: values,
                borderColor: '#FF003C', // The Finals Red for history
                backgroundColor: 'rgba(255, 0, 60, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: values.map((v, idx) => activeHistoryPointNotes[session.pings[idx].timestamp] ? 6 : 1),
                pointBackgroundColor: values.map((v, idx) => activeHistoryPointNotes[session.pings[idx].timestamp] ? '#FFF100' : '#FF003C'),
                pointBorderColor: values.map((v, idx) => activeHistoryPointNotes[session.pings[idx].timestamp] ? '#FFF100' : '#FF003C')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements, chart) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const timestamp = session.pings[idx].timestamp;
                    const existingNote = activeHistoryPointNotes[timestamp] || '';
                    const note = prompt(`Add a note for the data point at ${timestamp.split(' ')[1]}:`, existingNote);
                    if (note !== null) {
                        if (note.trim() === '') {
                            delete activeHistoryPointNotes[timestamp];
                            chart.data.datasets[0].pointRadius[idx] = 1;
                            chart.data.datasets[0].pointBackgroundColor[idx] = '#FF003C';
                            chart.data.datasets[0].pointBorderColor[idx] = '#FF003C';
                        } else {
                            activeHistoryPointNotes[timestamp] = note.trim();
                            chart.data.datasets[0].pointRadius[idx] = 6;
                            chart.data.datasets[0].pointBackgroundColor[idx] = '#FFF100';
                            chart.data.datasets[0].pointBorderColor[idx] = '#FFF100';
                        }
                        saveHistoryNote(); // Save immediately
                        chart.update(); // Redraw chart tooltips and points
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const idx = context.dataIndex;
                            const timestamp = session.pings[idx].timestamp;
                            const note = activeHistoryPointNotes[timestamp];
                            if (note) {
                                return `📝 Note: ${note}`;
                            }
                            return null;
                        }
                    }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    title: { display: true, text: 'Latency (ms)', color: '#aaa' },
                    grid: { color: 'rgba(255,255,255,0.1)' } 
                },
                x: { grid: { display: false } }
            }
        }
    });

    // Render Traceroute
    const tracertLines = session.traceroute || [];
    if (tracertLines.length > 0) {
        document.getElementById('historyTracertPanel').style.display = 'block';
        document.getElementById('historyTracertOutput').innerText = tracertLines.join('\n');
        
        const visualContainer = document.getElementById('tracertVisual');
        visualContainer.innerHTML = '';
        
        const hops = [];
        tracertLines.forEach(line => {
            const match = line.match(/^\s*(\d+)\s+(.*)/);
            if (match) {
                const isTimeout = match[2].includes('*        *        *') || match[2].includes('Request timed out');
                const fullText = match[2].toLowerCase();
                let hopName = isTimeout ? "Timeout" : match[2].split(/\s+/).pop();
                hopName = hopName.replace(/[\[\]]/g, ''); // Strip ugly brackets
                
                // Parse latencies
                const timeMatches = match[2].match(/<?\d+\s+ms/g);
                let avgTime = null;
                if (timeMatches) {
                    const times = timeMatches.map(t => parseInt(t.replace(/[<ms\s]/g, '')));
                    avgTime = times.reduce((a,b)=>a+b,0) / times.length;
                }
                
                let icon = '<span class="material-symbols-outlined" style="font-size: 20px;">public</span>'; // Default to ISP / Internet
                if (isTimeout) {
                    icon = '<span class="material-symbols-outlined" style="font-size: 20px;">close</span>';
                } else if (fullText.includes('192.168.') || fullText.includes('10.') || fullText.includes('.lan') || fullText.includes('.local') || fullText.includes('sbe1v1k')) {
                    icon = '<span class="material-symbols-outlined" style="font-size: 20px;">router</span>'; // Local Network
                } else if (fullText.includes('aws') || fullText.includes('amazon') || fullText.includes('compute') || fullText.includes('googleusercontent') || fullText.includes('gcp')) {
                    icon = '<span class="material-symbols-outlined" style="font-size: 20px;">cloud</span>'; // Cloud / Game Server
                }

                hops.push({ num: match[1], name: hopName, isTimeout, icon, avgTime });
            }
        });
        
        hops.forEach((hop, idx) => {
            visualContainer.innerHTML += `
                <div class="hop-container">
                    <div class="hop-node ${hop.isTimeout ? 'hop-timeout' : ''}">
                        <div class="hop-circle" style="font-size: 1.2rem;">${hop.icon}</div>
                        <div class="hop-info" title="${hop.name}">
                            <strong>#${hop.num}</strong><br>
                            ${hop.name}
                        </div>
                    </div>
                    ${idx < hops.length - 1 ? '<div class="hop-line"></div>' : ''}
                </div>
            `;
        });
        
        // ------------------
        // ANALYSIS ENGINE
        // ------------------
        let insights = [];
        
        if (hops.length > 0 && hops[0].avgTime !== null) {
            if (hops[0].avgTime > 15) {
                insights.push(`⚠️ <strong style="color: var(--yellow);">Local Network Lag:</strong> Your router/Wi-Fi is adding ${Math.round(hops[0].avgTime)}ms of latency. Consider using an Ethernet cable.`);
            } else {
                insights.push(`✅ <strong style="color: #00ff00;">Local Network:</strong> Healthy (${Math.round(hops[0].avgTime)}ms)`);
            }
        }
        
        let majorSpike = null;
        for (let i = 1; i < hops.length; i++) {
            let current = hops[i];
            let prev = hops[i-1];
            if (current.avgTime !== null && prev.avgTime !== null) {
                let diff = current.avgTime - prev.avgTime;
                if (diff >= 30 && (!majorSpike || diff > majorSpike.diff)) {
                    majorSpike = { hop: current, diff: diff };
                }
            }
        }
        
        if (majorSpike) {
            insights.push(`⚠️ <strong style="color: var(--red);">Routing Bottleneck:</strong> Hop #${majorSpike.hop.num} (${majorSpike.hop.name}) added a massive +${Math.round(majorSpike.diff)}ms latency spike to your route.`);
        } else if (hops.length > 2) {
            insights.push(`✅ <strong style="color: #00ff00;">ISP Routing:</strong> Smooth and stable with no major ISP peering bottlenecks detected.`);
        }
        
        let validHops = hops.filter(h => !h.isTimeout).length;
        if (validHops >= 15) {
            insights.push(`ℹ️ <strong style="color: var(--yellow);">Route Length:</strong> Highly indirect route (${validHops} hops). A gaming VPN might provide a more direct path to the server.`);
        } else if (validHops > 0) {
            insights.push(`✅ <strong style="color: #00ff00;">Route Length:</strong> Direct routing (${validHops} hops).`);
        }

        document.getElementById('tracertAnalysis').innerHTML = insights.map(i => `<span style="font-size: 0.95rem;">${i}</span>`).join('');
        
    } else {
        document.getElementById('historyTracertPanel').style.display = 'none';
    }
    
    // Scroll to chart smoothly
    document.getElementById('historyChart').scrollIntoView({ behavior: 'smooth' });
}

// Initial setup
initChart();

if (localStorage.getItem('theme') === 'light') {
    // Wait slightly for charts to finish initializing
    setTimeout(() => {
        if (!document.body.classList.contains('light-mode')) toggleTheme();
    }, 50);
}
