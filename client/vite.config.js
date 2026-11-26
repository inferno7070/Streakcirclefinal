import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000', '/socket.io': { target: 'http://localhost:5000', ws: true } } },
});
