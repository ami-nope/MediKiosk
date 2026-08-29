import { defineConfig } from 'vite';

const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8000';
const voiceApiUrl = process.env.VITE_VOICE_API_URL || 'https://voice.amii.lol';
const voiceAudioThreshold = Number(process.env.VITE_VOICE_AUDIO_THRESHOLD || 0.04);
const voiceSilenceMs = Number(process.env.VITE_VOICE_SILENCE_MS || 1800);

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/patients': backendUrl,
      '/sessions': backendUrl,
      '/health': backendUrl,
      '/admin/ai-config': backendUrl,
      '/ws': {
        target: backendUrl,
        ws: true,
      },
    },
  },
  define: {
    __VOICE_API_URL__: JSON.stringify(voiceApiUrl),
    __VOICE_AUDIO_THRESHOLD__: JSON.stringify(Number.isFinite(voiceAudioThreshold) ? voiceAudioThreshold : 0.04),
    __VOICE_SILENCE_MS__: JSON.stringify(Number.isFinite(voiceSilenceMs) ? voiceSilenceMs : 2500),
  },
  build: {
    outDir: 'dist',
  },
});
