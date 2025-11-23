(() => {
  const $ = s => document.querySelector(s);

  const loginCard = $('#loginCard');
  const roomCard = $('#roomCard');
  const nameInput = $('#nameInput');
  const roomInput = $('#roomInput');
  const keyInput   = $('#keyInput');
  const groupInput = $('#groupInput');
  const roleInput  = $('#roleInput');
  const enterBtn  = $('#enterBtn');
  const leaveBtn  = $('#leaveBtn');
  const muteBtn   = $('#muteBtn');
  const turnOnlyChk = $('#turnOnlyChk');
  const roomTitle = $('#roomTitle');
  const loginStatus = $('#loginStatus');
  const callStatus  = $('#callStatus');
  const iceStateEl = $('#iceState');
  const userList = $('#userList');
  const audiosWrap = $('#audios');

  let ws, myId, myName, myRoom, myKey, myGroup, myRole;
  let localStream = null;
  let muted = false;
  let manualLeave = false;

  let reconnectTimer = null;
  function scheduleReconnect() {
    if (manualLeave) return;
    if (reconnectTimer) return;
    L.ws("Intentando reconectar WebSocket...");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWS();
    }, 3000);
  }

  const peers = new Map();
  const users = {};
  let myTargetGroups = ["default"]; // <-- NUEVO: grupos activos del admin

  function speak(text) {
    try {
      const msg = new SpeechSynthesisUtterance(text);
      msg.lang = "es-ES";
      speechSynthesis.speak(msg);
    } catch {}
  }

  const L = {
    login: (msg, cls='') => {
      console.log('[LOGIN]', msg);
      loginStatus.textContent = msg;
      loginStatus.className = `status ${cls}`;
    },
    call: (msg, cls='') => {
      console.log('[CALL]', msg);
      callStatus.textContent = msg;
      callStatus.className = `status ${cls}`;
    },
    ws: (...a) => console.log('[WS]', ...a),
    rtc: (...a) => console.log('[RTC]', ...a),
    ice: (...a) => console.log('[ICE]', ...a),
    err: (...a) => console.error('[ERR]', ...a),
  };

  function showRoomUI(on) {
    loginCard.classList.toggle('hidden', on);
    roomCard.classList.toggle('hidden', !on);
  }

  function renderUserList() {
    userList.innerHTML = "";
    Object.entries(users).forEach(([id, info]) => {
      const li = document.createElement("li");
      const mic = info.muted ? "🔴" : "🟢";
      const me = id === myId ? " (yo)" : "";
      li.innerHTML = `<span class="name">${mic} ${info.name}${me}</span>`;
      userList.appendChild(li);
    });
  }

  function addUser(id, name, isMuted=false) {
    users[id] = { name, muted: isMuted };
    renderUserList();
  }

  function removeUser(id) {
    delete users[id];
    renderUserList();
  }

  function updateUserMute(id, m) {
    if (users[id]) users[id].muted = m;
    renderUserList();
  }

  async function ensureLocalStream() {
    if (localStream && localStream.getTracks().length) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setMicMuted(false);
    return localStream;
  }

  function setMicMuted(m) {
    muted = m;
    if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !m);
    muteBtn.textContent = m ? 'Activar mic' : 'Silenciar mic';
    ws && ws.readyState === 1 && ws.send(JSON.stringify({ type: "mute-changed", muted }));
    updateUserMute(myId, m);
  }

  function buildIceServers(turnOnly=false) {
    const ours = [
      { urls: 'turn:cachofotos.ddns.net:3478?transport=udp', username: 'djcacho', credential: '4+ymh5XaTXzAVkUB' },
      { urls: 'turn:cachofotos.ddns.net:3478?transport=tcp', username: 'djcacho', credential: '4+ymh5XaTXzAVkUB' },
      { urls: 'turns:cachofotos.ddns.net:5349', username: 'djcacho', credential: '4+ymh5XaTXzAVkUB' }
    ];
    const stun = [{ urls: 'stun:stun.l.google.com:19302' }];
    return turnOnly ? ours : [...stun, ...ours];
  }

  function isPoliteAgainst(remoteId) {
    if (!myId || !remoteId) return true;
    return String(myId).localeCompare(String(remoteId)) < 0;
  }

  function shouldAcceptSignalFrom(fromId) {
    const myInfo = users[myId];
    const peerInfo = users[fromId];
    if (!myInfo || !peerInfo) return false;
    if (myInfo.role === "admin") {
      return myTargetGroups.includes(peerInfo.group);
    }
    const sameGroup = peerInfo.group === myInfo.group;
    const eitherAdmin = peerInfo.role === "admin" || myInfo.role === "admin";
    return sameGroup || eitherAdmin;
  }

  function ensurePeer(peerId, label='Usuario') {
    if (peers.has(peerId)) return peers.get(peerId);

    const pc = new RTCPeerConnection({ iceServers: buildIceServers(turnOnlyChk.checked), sdpSemantics: 'unified-plan' });

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      iceStateEl.textContent = `ICE: ${state}`;
      if (state === "disconnected" || state === "failed") {
        L.ice(`Reconectando con ${peerId}...`);
        dropPeer(peerId);
        ensureLocalStream().then(async () => {
          const repaired = ensurePeer(peerId, users[peerId]?.name || "Usuario");
          if (!repaired.polite) await maybeCall(peerId);
        });
      }
    };

    pc.onicecandidate = ev => {
      if (ev.candidate) {
        ws && ws.send(JSON.stringify({
          type: 'signal',
          targetId: peerId,
          payload: { candidate: ev.candidate }
        }));
      }
    };

    const card = document.createElement('div');
    card.className = 'peer-audio';
    const title = document.createElement('h5');
    title.textContent = `🎧 ${users[peerId]?.name || label} (${peerId.slice(0,8)})`;
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.controls = true;
    audio.muted = true;
    card.appendChild(title);
    card.appendChild(audio);
    audiosWrap.appendChild(card);

    pc.ontrack = ev => {
  const stream = ev.streams?.[0] || new MediaStream([ev.track]);
  audio.srcObject = stream;
  audio.play().catch(() => {
    console.warn('[Web] Autoplay bloqueado → esperando clic');
    const unlock = () => {
      audio.play().catch(() => {});
      document.removeEventListener('click', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
  });
};

    const sess = { pc, audioEl: audio, cardEl: card, polite: isPoliteAgainst(peerId), makingOffer: false, pendingCandidates: [] };

    if (localStream) {
      const have = pc.getSenders().map(s => s.track);
      localStream.getAudioTracks().forEach(t => {
        if (!have.includes(t)) pc.addTrack(t, localStream);
      });
    }

    peers.set(peerId, sess);
    return sess;
  }

  function dropPeer(peerId) {
    const sess = peers.get(peerId);
    if (!sess) return;
    try { sess.pc.close(); } catch {}
    if (sess.cardEl?.parentNode) sess.cardEl.parentNode.removeChild(sess.cardEl);
    peers.delete(peerId);
  }

  async function maybeCall(peerId) {
    const sess = peers.get(peerId);
    if (!sess) return;
    const { pc } = sess;
    try {
      sess.makingOffer = true;
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      ws && ws.send(JSON.stringify({
        type: 'signal',
        targetId: peerId,
        payload: { sdp: { type: 'offer', sdp: offer.sdp } }
      }));
    } catch (e) {
      L.err('createOffer/setLocalDescription error', e);
    } finally {
      sess.makingOffer = false;
    }
  }

  async function handleSignalFrom(fromId, payload) {
    const sess = ensurePeer(fromId);
    const { pc } = sess;
    if (payload.sdp) {
      const { type, sdp } = payload.sdp;
      const isOffer = type === 'offer';
      const offerCollision = isOffer && (sess.makingOffer || pc.signalingState !== 'stable');
      if (offerCollision) {
        if (!sess.polite) {
          L.rtc(`⚠️ Colisión de oferta con ${fromId}: impolite → rehago conexión`);
          dropPeer(fromId);
          const repaired = ensurePeer(fromId, users[fromId]?.name || 'Usuario');
          if (localStream) {
            const have = repaired.pc.getSenders().map(s => s.track);
            localStream.getAudioTracks().forEach(t => { if (!have.includes(t)) repaired.pc.addTrack(t, localStream); });
          }
          await maybeCall(fromId);
          return;
        }
        try { await pc.setLocalDescription({ type: 'rollback' }); } catch {}
      }
      if (isOffer) {
        await pc.setRemoteDescription({ type:'offer', sdp });
        if (localStream) {
          const have = pc.getSenders().map(s => s.track);
          localStream.getAudioTracks().forEach(t => {
            if (!have.includes(t)) pc.addTrack(t, localStream);
          });
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws && ws.send(JSON.stringify({
          type:'signal',
          targetId: fromId,
          payload:{ sdp:{ type:'answer', sdp: answer.sdp } }
        }));
        while (sess.pendingCandidates.length) {
          const c = sess.pendingCandidates.shift();
          try { await pc.addIceCandidate(c); } catch {}
        }
        return;
      }
      if (type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({ type:'answer', sdp });
        while (sess.pendingCandidates.length) {
          const c = sess.pendingCandidates.shift();
          try { await pc.addIceCandidate(c); } catch {}
        }
        return;
      }
    }
    if (payload.candidate) {
      if (!pc.remoteDescription) {
        sess.pendingCandidates.push(payload.candidate);
      } else {
        try { await pc.addIceCandidate(payload.candidate); } catch {}
      }
    }
  }

  function connectWS() {
    const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type:'join',
        name:myName,
        room:myRoom,
        key:myKey,
        group:myGroup,
        role:myRole
      }));
    };

    ws.onmessage = async ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      switch(msg.type) {
        case 'auth-failed':
          L.login(`Clave incorrecta para sala "${myRoom}"`, 'err');
          try { ws.close(); } catch {}
          showRoomUI(false);
          break;

        case 'joined':
          myId = msg.clientId;
          roomTitle.textContent = `Sala: ${msg.room}`;
          showRoomUI(true);
          audiosWrap.innerHTML = '';
          for (const [pid] of peers) dropPeer(pid);
          Object.keys(users).forEach(k => delete users[k]);
          addUser(myId, myName, muted);
          (msg.peers || []).forEach(p => addUser(p.clientId, p.name, p.muted));
          L.login(`Unido a sala "${msg.room}"`, 'ok');
          await ensureLocalStream();
          for (const p of (msg.peers || [])) {
            const sess = ensurePeer(p.clientId, p.name);
            if (!sess.polite) await maybeCall(p.clientId);
          }
          if (!Array.isArray(msg.peers) || !msg.peers.length) {
            L.call('Sala vacía. Esperando otros usuarios…');
          }
          break;

        case 'peer-joined':
          const pid = msg.clientId;
          const pname = msg.name || 'un usuario';
          addUser(pid, pname, msg.muted);
          speak(`${pname} se ha unido a la sala`);
          L.call(`👋 ${pname} se ha unido`);
          ensureLocalStream().then(async () => {
            const sess = ensurePeer(pid, pname);
            if (!sess.polite) await maybeCall(pid);
          });
          break;

        case 'peer-left':
          const leftId = msg.clientId;
          const leftName = msg.name || 'un usuario';
          speak(`${leftName} ha salido de la sala`);
          L.call(`❌ ${leftName} salió`);
          removeUser(leftId);
          dropPeer(leftId);
          break;

        case 'mute-changed':
          updateUserMute(msg.clientId, msg.muted);
          break;

        case 'signal':
          if (!shouldAcceptSignalFrom(msg.fromId)) return; // 🔥 IGNORAR si no debe conectarse
          await handleSignalFrom(msg.fromId, msg.payload || {});
          break;
      }
    };

    ws.onclose = () => {
      L.ws("Conexión WebSocket cerrada.");
      scheduleReconnect();
    };

    ws.onerror = () => {
      L.ws("Error en WebSocket. Intentando reconectar...");
      scheduleReconnect();
    };

    setInterval(() => {
      if (ws && ws.readyState === 1)
        ws.send(JSON.stringify({ type: "ping" }));
    }, 10000);
  }

  enterBtn.onclick = async () => {
    myName = nameInput.value.trim();
    myRoom = roomInput.value.trim();
    myKey  = keyInput.value.trim();
    myGroup = groupInput.value.trim() || 'default';
    myRole  = roleInput.value.trim() || 'user';
    myTargetGroups = [myGroup]; // <-- NUEVO: inicializa con su grupo

    if (!myName || !myRoom || !myKey) { L.login('Completa todos los campos','err'); return; }
    manualLeave = false;
    await ensureLocalStream();
    setMicMuted(false);
    connectWS();
  };

  leaveBtn.onclick = () => {
    manualLeave = true;
    try { ws && ws.close(); } catch {}
    for (const [pid] of peers) dropPeer(pid);
    peers.clear();
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    audiosWrap.innerHTML = '';
    showRoomUI(false);
  };

  muteBtn.onclick = () => setMicMuted(!muted);

  showRoomUI(false);
})();
