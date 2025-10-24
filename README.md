# 🗣️ WebTalk — Real-Time Motorcycle Intercom

### Description
**WebTalk** is a lightweight real-time voice communication web app.  
It allows 2–8 users to join a single global room and talk bidirectionally.  
Built with **WebRTC** and **Node.js**, the server only handles signaling — audio streams travel peer-to-peer for minimum latency.

### Features
- 🔊 Real-time bidirectional audio (WebRTC)
- 🔁 Automatic reconnection after network loss
- 🗣️ Voice notifications when users join or leave
- 📱 Works on Android/iOS via Chrome or Safari
- 🚫 No registration or login required
- ⚡ “Motorcycle mode” to keep the screen awake

### Tech Stack
- **Server:** Node.js + `ws` (WebSocket)
- **Client:** Vanilla JavaScript (WebRTC)
- **Dependencies:** `uuid`, `ws`
- **Deployment:** [Render.com](https://render.com) (Free Node Web Service)

### Project structure
```
webtalk/
│
├── server.js
├── package.json
└── public/
    └── index.html
```

### Run locally
```bash
npm install
node server.js
```
Then open [http://localhost:8080](http://localhost:8080) in two different browsers to test.

### Deploy to Render
1. Create a free account on [Render.com](https://render.com)
2. Click **New → Web Service → Node**
3. Connect this GitHub repository or upload a ZIP
4. In the “Start Command”, enter:
   ```
   node server.js
   ```
5. Once deployed, Render provides a public URL, for example:  
   `https://webtalk-xxxx.onrender.com`  
   The WebSocket endpoint will be `wss://webtalk-xxxx.onrender.com/ws`.

### License
MIT License © 2025 — Personal Project

---

### Descripción
**WebTalk** es una aplicación web ligera de comunicación por voz en tiempo real.  
Permite que entre 2 y 8 usuarios se conecten a una misma sala global y hablen de forma bidireccional.  
Desarrollada con **WebRTC** y **Node.js**, el servidor solo gestiona la señalización; el audio se transmite directamente entre los usuarios para reducir la latencia.

### Características
- 🔊 Comunicación de audio bidireccional en tiempo real (WebRTC)
- 🔁 Reconexión automática al recuperar la red
- 🗣️ Locuciones cuando un usuario se conecta o se desconecta
- 📱 Compatible con navegadores móviles (Chrome/Safari en Android/iOS)
- 🚫 Sin registro ni autenticación
- ⚡ Modo “Moto” para mantener la pantalla encendida

### Tecnologías
- **Servidor:** Node.js + `ws` (WebSocket)
- **Cliente:** JavaScript puro (WebRTC)
- **Dependencias:** `uuid`, `ws`
- **Despliegue:** [Render.com](https://render.com) (servicio gratuito de Node)

### Estructura del proyecto
```
webtalk/
│
├── server.js
├── package.json
└── public/
    └── index.html
```

### Ejecutar en local
```bash
npm install
node server.js
```
Después abre [http://localhost:8080](http://localhost:8080) en dos navegadores distintos para probar.

### Desplegar en Render
1. Crea una cuenta gratuita en [Render.com](https://render.com)
2. Nuevo → Web Service → “Node”
3. Conecta este repositorio de GitHub o sube un ZIP
4. En “Start Command”, escribe:
   ```
   node server.js
   ```
5. Render generará una URL pública, por ejemplo:  
   `https://webtalk-xxxx.onrender.com`  
   El WebSocket estará disponible en `wss://webtalk-xxxx.onrender.com/ws`.

### Licencia
MIT License © 2025 — Personal Project
