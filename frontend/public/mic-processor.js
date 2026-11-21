/* global AudioWorkletProcessor, registerProcessor */
// mic-processor.js
// Runs on a separate audio thread. It grabs microphone samples
// and sends them to the main React code (Voice.jsx).
//
// Gemini expects 16-bit PCM at 16kHz. We capture raw samples here
// and do the number conversion in Voice.jsx.

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Small buffer so we don't send a message for every 128 samples.
    this.buffer = new Float32Array(4096);
    this.index = 0;
  }

  process(inputs) {
    // inputs[0] = all input channels; inputs[0][0] = first channel (mic)
    const input = inputs[0];

    if (!input || !input[0]) {
      return true; // keep the processor alive
    }

    const channel = input[0];

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.index] = channel[i];
      this.index++;

      if (this.index === this.buffer.length) {
        // Send a copy of the samples to the main thread.
        this.port.postMessage(this.buffer);
        this.index = 0;
      }
    }

    return true;
  }
}

registerProcessor("mic-processor", MicProcessor);