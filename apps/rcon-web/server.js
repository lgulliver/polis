const http = require('http');
const net = require('net');

const RCON_HOST = process.env.RCON_HOST || 'mc-server';
const RCON_PORT = parseInt(process.env.RCON_PORT || '25575');
const RCON_PASSWORD = process.env.RCON_PASSWORD || 'polisrcon';

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
          if (id === -1) { clearTimeout(timer); client.destroy(); reject(new Error('auth failed — wrong RCON password?')); }
          else { authed = true; send(2, 2, command); }
        } else {
          clearTimeout(timer); client.destroy(); resolve(payload);
        }
      }
    });

    client.on('error', e => { clearTimeout(timer); reject(e); });
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
];

const page = (result = '') => `<!DOCTYPE html>
<html>
<head>
  <title>Polis Console</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{font-family:monospace;background:#0d1117;color:#c9d1d9;padding:20px;max-width:860px;margin:0 auto}
    h1{color:#58a6ff;margin:0 0 16px}
    form{display:flex;gap:8px;margin-bottom:12px}
    input{flex:1;padding:8px 12px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;font-family:monospace;font-size:14px;border-radius:6px}
    button{padding:8px 16px;background:#238636;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:monospace}
    button:hover{background:#2ea043}
    .quick{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
    .quick a{padding:4px 10px;background:#21262d;color:#8b949e;border:1px solid #30363d;border-radius:20px;text-decoration:none;font-size:12px}
    .quick a:hover{color:#58a6ff;border-color:#58a6ff}
    pre{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:12px;white-space:pre-wrap;min-height:48px;color:#e6edf3}
    .err{color:#f85149}
    .label{color:#8b949e;font-size:12px;margin-bottom:4px}
  </style>
</head>
<body>
  <h1>Polis Console</h1>
  <form method="POST">
    <input name="cmd" placeholder="e.g. time set day" autofocus autocomplete="off">
    <button type="submit">&#9654; Run</button>
  </form>
  <div class="quick">${QUICK.map(([cmd, label]) => `<a href="?q=${encodeURIComponent(cmd)}" title="${cmd}">${label}</a>`).join('')}</div>
  ${result}
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const send = html => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); };

  if (req.method === 'GET') {
    const cmd = new URL(req.url, 'http://x').searchParams.get('q');
    if (!cmd) return send(page());
    try {
      const r = await rconCommand(cmd);
      send(page(`<div class="label">/${cmd}</div><pre>${r || '(ok)'}</pre>`));
    } catch (e) {
      send(page(`<pre class="err">Error: ${e.message}</pre>`));
    }
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      const cmd = new URLSearchParams(body).get('cmd') || '';
      if (!cmd) return send(page());
      try {
        const r = await rconCommand(cmd);
        send(page(`<div class="label">/${cmd}</div><pre>${r || '(ok)'}</pre>`));
      } catch (e) {
        send(page(`<pre class="err">Error: ${e.message}</pre>`));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(4326, () => console.log(`Polis RCON console → http://localhost:4326`));
