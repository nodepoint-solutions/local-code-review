import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    target: 'node18',
    lib: {
      entry: path.resolve(__dirname, 'src/mcp-server/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    outDir: 'dist/mcp-server',
    rollupOptions: {
      external: ['fs', 'path', 'net', 'os', 'crypto', 'events', 'stream', 'util', 'buffer', 'http', 'https', 'url', 'zlib', 'tls', 'querystring', 'child_process', 'worker_threads'],
    },
    minify: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer/src'),
    },
  },
})
