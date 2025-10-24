// server.js
// npm i ws uuid
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.PORT || 8080;

// HTTP estático
const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(__dirname, "public", urlPath.replace(/^\/+/, ""));
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(filePath).toLowerCase();
    const type =
      ext === ".html" ? "text/html" :
      ext === ".js"   ? "text/javascript" :
      ext === ".css"  ? "text/css" :
      ext === ".svg"  ? "image/svg+xml" :
      "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

// Sala única
// clients: Map<clientId, { ws, name, isAlive }>
const clients = new Map();
// byName: Map<name, clientId>
const byName  = new Map();

function broadcast(payload, excludeId = null) {
  const msg = JSON.stringify(payload);
  for (const [cid, info] of clients.entries()) {
    if (excludeId && cid === excludeId) continue;
    try { info.ws.send(msg); } catch {}
  }
}

function silentClose(clientId) {
  const info = clients.get(clientId);
  if (!info) return;
  try { info.ws.close(); } catch {}
  clients.delete(clientId);
  if (byName.get(info.name) === clientId) byName.delete(info.name);
}

function leave(clientId, doBroadcast = true) {
  const info = clients.get(clientId);
  if (!info) return;
  clients.delete(clientId);
  if (byName.get(info.name) === clientId) byName.delete(info.name);
  if (doBroadcast) broadcast({ type: "peer-left", clientId, name: info.name });
}

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  let joined = false;
  let name = "Anónimo";
  ws.isAlive = true;

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (buf) => {
    let msg = {};
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    if (msg.type === "join") {
      name = String(msg.name || "Anónimo").slice(0, 64);

      // Reemplazo por nombre: si existe otro con el mismo nombre, lo cerramos en silencio
      const existingId = byName.get(name);
      if (existingId && existingId !== clientId) {
        silentClose(existingId); // sin peer-left para evitar ping-pong de eventos
      }

      clients.set(clientId, { ws, name, isAlive: true });
      byName.set(name, clientId);
      joined = true;

      // Peers actuales (sin mí)
      const peers = [];
      for (const [cid, info] of clients.entries()) {
        if (cid !== clientId) peers.push({ clientId: cid, name: info.name });
      }
      ws.send(JSON.stringify({ type: "joined", clientId, peers }));

      // Aviso a otros: sólo joined del nuevo
      broadcast({ type: "peer-joined", clientId, name }, clientId);
      return;
    }

    if (msg.type === "signal") {
      const { targetId, payload } = msg;
      const target = clients.get(targetId);
      if (target) {
        target.ws.send(JSON.stringify({ type: "signal", fromId: clientId, payload }));
      }
      return;
    }

    if (msg.type === "ice-restart") {
      broadcast({ type: "ice-restart", fromId: clientId }, clientId);
      return;
    }

    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }
  });

  ws.on("close", () => { if (joined) leave(clientId, true); });
  ws.on("error", () => { if (joined) leave(clientId, true); });
});

// Heartbeat: limpia zombis sin duplicar eventos
setInterval(() => {
  for (const [cid, info] of clients.entries()) {
    const ws = info.ws;
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      // Al terminar por heartbeat, emite un solo peer-left
      leave(cid, true);
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`HTTP+WS en http://0.0.0.0:${PORT}`);
});
