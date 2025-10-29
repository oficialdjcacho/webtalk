class PCMInjectorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readIndex = 0;
    this.current = null;
    this.port.onmessage = (ev) => {
      const chunk = ev.data;
      if (chunk && chunk.length) this.queue.push(chunk);
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const ch = output[0];

    for (let i = 0; i < ch.length; i++) {
      if (!this.current || this.readIndex >= this.current.length) {
        this.current = this.queue.length ? this.queue.shift() : null;
        this.readIndex = 0;
      }
      ch[i] = this.current ? this.current[this.readIndex++] : 0.0;
    }
    return true;
  }
}
registerProcessor('pcm-injector', PCMInjectorProcessor);
