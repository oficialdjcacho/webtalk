// Convierte Int16 PCM → Float32 [-1,1]
function pcm16ToFloat32(int16Buf) {
  const out = new Float32Array(int16Buf.length);
  for (let i = 0; i < int16Buf.length; i++) out[i] = Math.max(-1, Math.min(1, int16Buf[i] / 32768));
  return out;
}

// Base64 → Int16Array
function b64ToInt16(b64) {
  const bin = atob(b64);
  const len = bin.length / 2;
  const arr = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const lo = bin.charCodeAt(i*2);
    const hi = bin.charCodeAt(i*2+1);
    const val = (hi << 8) | lo;
    arr[i] = (val & 0x8000) ? val - 0x10000 : val;
  }
  return arr;
}

async function createNativeMicTrack() {
  const Cap = window.Capacitor;
  if (!Cap?.Plugins?.NativeMic) return null; // Navegadores/iOS: no hace nada

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  await audioCtx.audioWorklet.addModule('/js/native-mic-worklet.js');

  const node = new AudioWorkletNode(audioCtx, 'pcm-injector', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
  const dest = audioCtx.createMediaStreamDestination();
  node.connect(dest);

  Cap.Plugins.NativeMic.addListener('pcm', (payload) => {
    try {
      const int16 = b64ToInt16(payload.pcm);
      const f32 = pcm16ToFloat32(int16);
      node.port.postMessage(f32);
    } catch (e) {
      console.warn('Error decodificando PCM:', e);
    }
  });

  await Cap.Plugins.NativeMic.start();

  const track = dest.stream.getAudioTracks()[0];
  track.enabled = true;
  return track;
}

window.replaceMicWithNative = async function (pc) {
  try {
    const track = await createNativeMicTrack();
    if (!track) return false;

    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
    if (sender) await sender.replaceTrack(track);
    else {
      const stream = new MediaStream([track]);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
    }
    console.log('[NativeMic] Reemplazo de micrófono realizado.');
    return true;
  } catch (e) {
    console.warn('[NativeMic] No disponible / error:', e);
    return false;
  }
};
