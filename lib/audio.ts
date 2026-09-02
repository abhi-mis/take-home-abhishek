"use client";

/**
 * Record on a phone, upload something the STT API definitely accepts.
 *
 * MediaRecorder gives you whatever the browser feels like: `audio/webm;codecs=opus`
 * on Android Chrome, `audio/mp4` on iOS Safari, `audio/ogg` on Firefox. Sarvam's
 * documented list is WAV / MP3 / AAC / FLAC / OGG, so shipping the raw recording
 * means the iOS and Android paths fail differently and only in production.
 *
 * Instead we decode whatever was captured and re-encode it as 16 kHz mono 16-bit WAV
 * in the browser. One format reaches the server, speech models want 16 kHz anyway,
 * and the upload drops to roughly 32 KB/second - which matters on clinic 4G.
 */

const TARGET_RATE = 16_000;

export const MAX_RECORDING_MS = 60_000;

/** Picks the first mime type this browser will actually record. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export interface Recorder {
  stop: () => Promise<Blob>;
  cancel: () => void;
  /**
   * Current input loudness, 0..1, read straight off the live mic.
   *
   * The meter in VoiceAnswer is driven by this rather than by a canned animation,
   * which matters more than it sounds: a fake animation looks identical whether the mic
   * is working or muted, so a patient in a noisy clinic gets no feedback that they are
   * actually being heard. Real levels make "it is not picking me up" obvious in the
   * first second instead of after the transcript comes back empty.
   */
  getLevel: () => number;
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const mimeType = pickMimeType();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start(250);

  // Analyser tap for the live waveform. Kept separate from the recording path so a
  // browser that refuses an AudioContext still records perfectly well.
  // Uint8Array<ArrayBuffer>, not the default ArrayBufferLike: getByteTimeDomainData
  // rejects a possibly-shared buffer under TS 5.7's stricter TypedArray generics.
  let meter: {
    ctx: AudioContext;
    analyser: AnalyserNode;
    buf: Uint8Array<ArrayBuffer>;
  } | null = null;
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaStreamSource(stream).connect(analyser);
    meter = { ctx, analyser, buf: new Uint8Array(analyser.fftSize) };
  } catch {
    meter = null; // no meter, flat waveform - recording is unaffected
  }

  const getLevel = () => {
    if (!meter) return 0;
    meter.analyser.getByteTimeDomainData(meter.buf);
    // RMS around the 128 midpoint, scaled so normal speech lands near the top.
    let sum = 0;
    for (let i = 0; i < meter.buf.length; i++) {
      const v = ((meter.buf[i] ?? 128) - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / meter.buf.length);
    /**
     * Perceptual curve, not a linear scale. Speech RMS sits around 0.05-0.15, so a
     * linear mapping leaves the meter almost flat for a softly-spoken patient - and a
     * meter that barely moves reads as "not hearing you". The 0.7 exponent lifts quiet
     * input into visible range while still leaving headroom for a loud voice.
     */
    return Math.min(1, Math.pow(rms * 4, 0.7));
  };

  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (meter) {
      void meter.ctx.close();
      meter = null;
    }
  };

  return {
    getLevel,
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        rec.onstop = () => {
          cleanup();
          const raw = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          toWav(raw).then(resolve, reject);
        };
        try {
          rec.stop();
        } catch (err) {
          cleanup();
          reject(err);
        }
      }),
    cancel: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      cleanup();
    },
  };
}

/** Decode any captured format, mix to mono, resample to 16 kHz, encode WAV. */
export async function toWav(input: Blob): Promise<Blob> {
  const bytes = await input.arrayBuffer();
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes.slice(0));
  } finally {
    void ctx.close();
  }

  // OfflineAudioContext does the resample+mixdown for us, correctly and fast.
  const frames = Math.max(1, Math.ceil((decoded.duration * TARGET_RATE) | 0));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function micSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    !!pickMimeType()
  );
}
