const http = require('http');
const net = require('net');

const RCON_HOST = process.env.RCON_HOST || 'mc-server';
const RCON_PORT = parseInt(process.env.RCON_PORT || '25575');
const RCON_PASSWORD = process.env.RCON_PASSWORD || 'polisrcon';
const COLONY_API = process.env.COLONY_API || 'http://colony:4327';

function rconCommand(command) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let buf = Buffer.alloc(0);
    let authed = false;

    const send = (id, type, payload) => {
      const p = Buffer.from(payload, 'utf8');
      const pkt = Buffer.alloc(14 + p.length);
      pkt.writeInt32LE(10 + p.length, 0);
      pkt.writeInt32LE(id, 4);
      pkt.writeInt32LE(type, 8);
      p.copy(pkt, 12);
      client.write(pkt);
    };

    const timer = setTimeout(() => { client.destroy(); reject(new Error('timeout')); }, 5000);

    client.connect(RCON_PORT, RCON_HOST, () => send(1, 3, RCON_PASSWORD));

    client.on('data', data => {
      buf = Buffer.concat([buf, data]);
      while (buf.length >= 14) {
        const len = buf.readInt32LE(0);
        if (buf.length < 4 + len) break;
        const id = buf.readInt32LE(4);
        const payload = buf.slice(12, 4 + len - 2).toString('utf8');
        buf = buf.slice(4 + len);
        if (!authed) {
          if (id === -1) { clearTimeout(timer); client.destroy(); reject(new Error('auth failed')); }
          else { authed = true; send(2, 2, command); }
        } else {
          clearTimeout(timer); client.destroy(); resolve(payload);
        }
      }
    });

    client.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

function colonyFetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(COLONY_API + path);
    const req = http.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname, method: options.method || 'GET', headers: options.headers || {} }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const QUICK = [
  ['list', 'who\'s online'],
  ['time set day', 'set day'],
  ['gamerule doDaylightCycle false', 'freeze time'],
  ['gamerule doDaylightCycle true', 'start time'],
  ['gamerule doMobSpawning false', 'stop mobs'],
  ['gamerule doMobSpawning true', 'start mobs'],
  ['difficulty normal', 'normal diff'],
  ['say polis spawn', 'spawn bot'],
  ['say polis list', 'list bots'],
  ['say polis locate', 'locate bots'],
];

const page = (rconResult = '', agents = []) => `<!DOCTYPE html>
<html>
<head>
  <title>Polis Console</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{font-family:monospace;background:#0d1117;color:#c9d1d9;padding:20px;max-width:960px;margin:0 auto}
    h1{color:#58a6ff;margin:0 0 4px}
    h2{color:#79c0ff;margin:16px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}
    @media(max-width:640px){.grid{grid-template-columns:1fr}}
    .panel{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
    form{display:flex;gap:8px;margin-bottom:10px}
    input,select{flex:1;padding:8px 10px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;font-family:monospace;font-size:13px;border-radius:6px;min-width:0}
    button{padding:8px 14px;background:#238636;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:monospace;white-space:nowrap}
    button:hover{background:#2ea043}
    .quick{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px}
    .quick a{padding:3px 9px;background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:20px;text-decoration:none;font-size:11px}
    .quick a:hover{color:#58a6ff;border-color:#58a6ff}
    pre{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px;white-space:pre-wrap;min-height:40px;color:#e6edf3;font-size:12px;margin:0}
    .err{color:#f85149}
    .label{color:#8b949e;font-size:11px;margin-bottom:4px}
    .agent-card{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px;margin-bottom:8px}
    .agent-name{color:#58a6ff;font-weight:bold;font-size:13px}
    .agent-state{display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;margin-left:6px;background:#21262d;color:#8b949e}
    .agent-state.Exploring{background:#0e4429;color:#3fb950}
    .agent-state.Gathering{background:#3d1f00;color:#f0883e}
    .agent-state.Resting{background:#3d0014;color:#f85149}
    .agent-state.Socialising{background:#1a1a3d;color:#79c0ff}
    .agent-meta{color:#8b949e;font-size:11px;margin-top:4px}
    .chat-log{height:160px;overflow-y:auto;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:8px;margin-bottom:8px;font-size:12px}
    .chat-log .sent{color:#58a6ff}
    .chat-log .ok{color:#3fb950}
    .chat-log .info{color:#8b949e}
    .tip{color:#8b949e;font-size:11px;margin-top:6px}
    #chat-sender{flex:0 0 120px}
  </style>
</head>
<body>
  <h1>Polis Console</h1>

  <div class="grid">
    <!-- Left: RCON -->
    <div class="panel">
      <h2>Server Commands</h2>
      <form method="POST" action="/">
        <input name="cmd" placeholder="e.g. time set day" autofocus autocomplete="off">
        <button type="submit">&#9654; Run</button>
      </form>
      <div class="quick">${QUICK.map(([cmd, label]) => `<a href="/?q=${encodeURIComponent(cmd)}" title="${cmd}">${label}</a>`).join('')}</div>
      ${rconResult}
    </div>

    <!-- Right: Agent Chat -->
    <div class="panel">
      <h2>Talk to Agents</h2>
      <div class="chat-log" id="chatLog">
        <div class="info">Type a message below. Address agents by name (e.g. "Ada, go find wood").</div>
      </div>
      <form id="chatForm" style="display:flex;gap:6px;margin-bottom:8px">
        <input id="chat-sender" type="text" placeholder="Your name" value="ironspark_V">
        <input id="chat-msg" type="text" placeholder="Ada, go scout the area north..." autocomplete="off">
        <button type="submit">Send</button>
      </form>
      <div class="tip">Named agents respond immediately. General chat reaches all agents on their next tick.</div>
    </div>
  </div>

  <!-- Agent Status -->
  <div class="panel" style="margin-top:16px">
    <h2>Agent Status <span id="agent-count" style="color:#8b949e;font-size:11px;font-weight:normal">(${agents.length} online)</span></h2>
    <div id="agents">
      ${agents.length === 0
        ? '<div style="color:#8b949e;font-size:12px">No agents connected. Colony may still be starting up.</div>'
        : agents.map(a => `
        <div class="agent-card">
          <span class="agent-name">${a.name}</span>
          <span class="agent-state ${a.state}">${a.state}</span>
          <div class="agent-meta">
            HP: ${a.health !== null ? Math.round(a.health * 5) + '%' : '?'} &nbsp;|&nbsp;
            Food: ${a.food ?? '?'}/20 &nbsp;|&nbsp;
            ${a.position ? `${a.position.x}, ${a.position.y}, ${a.position.z}` : 'position unknown'}
          </div>
        </div>`).join('')}
    </div>
  </div>

  <script>
    const chatLog = document.getElementById('chatLog');
    function addLog(text, cls) {
      const d = document.createElement('div');
      d.className = cls; d.textContent = text;
      chatLog.appendChild(d);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    document.getElementById('chatForm').addEventListener('submit', async e => {
      e.preventDefault();
      const sender = document.getElementById('chat-sender').value.trim() || 'player';
      const message = document.getElementById('chat-msg').value.trim();
      if (!message) return;
      document.getElementById('chat-msg').value = '';
      addLog('[' + sender + '] ' + message, 'sent');
      try {
        const r = await fetch('/colony/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender, message })
        });
        const j = await r.json();
        if (j.triggered && j.triggered.length > 0) {
          addLog('→ triggered immediate response from: ' + j.triggered.join(', '), 'ok');
        } else {
          addLog('→ message delivered to all agents', 'info');
        }
      } catch(err) {
        addLog('Error: ' + err.message, 'err');
      }
    });

    // Poll agent status every 10s
    async function refreshAgents() {
      try {
        const r = await fetch('/colony/status');
        const j = await r.json();
        const div = document.getElementById('agents');
        const count = document.getElementById('agent-count');
        count.textContent = '(' + (j.count || 0) + ' online)';
        if (!j.agents || j.agents.length === 0) {
          div.innerHTML = '<div style="color:#8b949e;font-size:12px">No agents connected.</div>';
          return;
        }
        div.innerHTML = j.agents.map(a => \`
          <div class="agent-card">
            <span class="agent-name">\${a.name}</span>
            <span class="agent-state \${a.state}">\${a.state}</span>
            <div class="agent-meta">
              HP: \${a.health !== null ? Math.round((a.health / 20) * 100) + '%' : '?'} &nbsp;|&nbsp;
              Food: \${a.food ?? '?'}/20 &nbsp;|&nbsp;
              \${a.position ? a.position.x + ', ' + a.position.y + ', ' + a.position.z : 'position unknown'}
            </div>
          </div>\`).join('');
      } catch {}
    }
    setInterval(refreshAgents, 10000);
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const sendHtml = html => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); };
  const sendJson = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

  // Proxy /colony/* to colony API
  if (url.pathname.startsWith('/colony/')) {
    const colonyPath = '/' + url.pathname.slice('/colony/'.length);
    if (req.method === 'GET') {
      try { const r = await colonyFetch(colonyPath); sendJson(200, r); }
      catch (e) { sendJson(503, { error: e.message }); }
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const r = await colonyFetch(colonyPath, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
          sendJson(200, r);
        } catch (e) { sendJson(503, { error: e.message }); }
      });
      return;
    }
  }

  if (req.method === 'GET') {
    const cmd = url.searchParams.get('q');
    let rconResult = '';
    let agents = [];
    try { const s = await colonyFetch('/status'); agents = s.agents || []; } catch {}
    if (!cmd) return sendHtml(page('', agents));
    try {
      const r = await rconCommand(cmd);
      rconResult = `<div class="label">/${cmd}</div><pre>${r || '(ok)'}</pre>`;
    } catch (e) {
      rconResult = `<pre class="err">Error: ${e.message}</pre>`;
    }
    return sendHtml(page(rconResult, agents));
  }

  if (req.method === 'POST' && url.pathname === '/') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      const cmd = new URLSearchParams(body).get('cmd') || '';
      let rconResult = '';
      let agents = [];
      try { const s = await colonyFetch('/status'); agents = s.agents || []; } catch {}
      if (!cmd) return sendHtml(page('', agents));
      try {
        const r = await rconCommand(cmd);
        rconResult = `<div class="label">/${cmd}</div><pre>${r || '(ok)'}</pre>`;
      } catch (e) {
        rconResult = `<pre class="err">Error: ${e.message}</pre>`;
      }
      sendHtml(page(rconResult, agents));
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(4326, () => console.log('Polis Console → http://localhost:4326'));
