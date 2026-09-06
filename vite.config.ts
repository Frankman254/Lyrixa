import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The Transcriptor service runs on its own port. Proxying it under a
 * same-origin prefix means the app only ever fetches relative paths — no CORS
 * grant is needed on the Python side, and no host or port appears anywhere in
 * `src/`. `VITE_TRANSCRIPTOR_ORIGIN` overrides the target for anyone running
 * the service somewhere else.
 */
const DEFAULT_TRANSCRIPTOR_ORIGIN = 'http://127.0.0.1:8000'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const transcriptorOrigin = env.VITE_TRANSCRIPTOR_ORIGIN || DEFAULT_TRANSCRIPTOR_ORIGIN

  return {
    plugins: [react()],
    server: {
      proxy: {
        // Transcriptor may simply not be running. Vite answers an unreachable
        // target with a gateway error, which `TranscriptorClient` already
        // reads as "offline" — so a missing service degrades instead of
        // breaking the dev server.
        '/transcriptor': {
          target: transcriptorOrigin,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/transcriptor/, '')
        }
      }
    }
  }
})
