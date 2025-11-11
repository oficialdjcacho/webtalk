// server.js
// npm i ws uuid
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { v4: uuidv4 } = require("uuid");

const PORT = process.env.PORT || 8080;

// --- Servidor HTTP estático ---
const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(__dirname, "public", urlPath.replace(/^\/+/, ""));
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
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

const wss = new WebSocketServer({ server, path: '/ws' });

// --- Estructuras de datos ---
// rooms: Map<roomName, { key, clients: Map<clientId, { ws, name, isAlive, muted }> }>
const rooms = new Map();

// --- Funciones de utilidad ---
function getOrCreateRoom(roomName, key) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, { key, clients: new Map() });
  }
  return rooms.get(roomName);
}

function broadcast(roomName, payload, excludeId = null) {
  const room = rooms.get(roomName);
  if (!room) return;
  const msg = JSON.stringify(payload);
  for (const [cid, info] of room.clients.entries()) {
    if (excludeId && cid === excludeId) continue;
    try { info.ws.send(msg); } catch {}
  }
}

function removeClient(roomName, clientId) {
  const room = rooms.get(roomName);
  if (!room) return;
  room.clients.delete(clientId);
  if (room.clients.size === 0) rooms.delete(roomName);
}

// --- WebSocket principal ---
wss.on("connection", (ws) => {
  const clientId = uuidv4();
  let joined = false;
  let name = "Anónimo";
  let roomName = null;

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (buf) => {
    let msg = {};
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    // ---- JOIN ----
    if (msg.type === "join") {
      name = String(msg.name || "Anónimo").slice(0, 64);
      roomName = String(msg.room || "").trim();
      const key = String(msg.key || "").trim();

      if (!roomName || !key) {
        ws.send(JSON.stringify({ type: "auth-failed", reason: "Sala o clave vacía" }));
        ws.close();
        return;
      }

      const room = getOrCreateRoom(roomName, key);
      if (room.key !== key) {
        ws.send(JSON.stringify({ type: "auth-failed", reason: "Clave incorrecta" }));
        try { ws.close(); } catch {}
        return;
      }

      // Añadir cliente
      room.clients.set(clientId, { ws, name, isAlive: true, muted: false });
      joined = true;

      // Peers actuales (sin mí)
      const peers = [];
      for (const [cid, info] of room.clients.entries()) {
        if (cid !== clientId) peers.push({ clientId: cid, name: info.name, muted: info.muted });
      }

      // Notificar al nuevo
      ws.send(JSON.stringify({ 
        type: "joined", 
        clientId, 
        peers, 
        room: roomName 
      }));

      // Avisar a los demás
      broadcast(roomName, { type: "peer-joined", clientId, name, muted: false }, clientId);
      return;
    }

    // ---- MUTE-CHANGED ----
    if (msg.type === "mute-changed") {
      const room = rooms.get(roomName);
      if (!room) return;
      const info = room.clients.get(clientId);
      if (info) {
        info.muted = !!msg.muted;
        broadcast(roomName, { type: "mute-changed", clientId, muted: info.muted }, clientId);
      }
      return;
    }

    // ---- SIGNAL ----
    if (msg.type === "signal") {
      if (!roomName) return;
      const { targetId, payload } = msg;
      const room = rooms.get(roomName);
      if (!room) return;
      const target = room.clients.get(targetId);
      if (target) {
        target.ws.send(JSON.stringify({ type: "signal", fromId: clientId, payload }));
      }
      return;
    }

    // ---- PING ----
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }
  });

  ws.on("close", () => {
    if (joined && roomName) {
      const room = rooms.get(roomName);
      if (room) {
        removeClient(roomName, clientId);
        broadcast(roomName, { type: "peer-left", clientId, name });
      }
    }
  });

  ws.on("error", () => {
    if (joined && roomName) {
      const room = rooms.get(roomName);
      if (room) {
        removeClient(roomName, clientId);
        broadcast(roomName, { type: "peer-left", clientId, name });
      }
    }
  });
});

// --- Limpieza automática ---
setInterval(() => {
  for (const [roomName, room] of rooms.entries()) {
    for (const [cid, info] of room.clients.entries()) {
      const ws = info.ws;
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch {}
        room.clients.delete(cid);
        broadcast(roomName, { type: "peer-left", clientId: cid, name: info.name });
      } else {
        ws.isAlive = false;
        try { ws.ping(); } catch {}
      }
    }
    if (room.clients.size === 0) rooms.delete(roomName);
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`HTTP+WS activo en http://0.0.0.0:${PORT}`);
});
