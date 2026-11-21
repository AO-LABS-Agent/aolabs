import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// AOLABS runs fully client-side: there is no backend server. The app talks
// directly from your browser to your configured LLM endpoint, your RPC
// endpoint, and public market/explorer APIs. `npm run dev` is all you need.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
