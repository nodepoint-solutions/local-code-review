import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  build: {
    target: 'node18',
    ssr: true,
    lib: {
      entry: path.resolve(__dirname, 'src/mcp-server/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    outDir: 'dist/mcp-server',
    rollupOptions: {
      external: ['fs', 'path', 'net', 'os', 'crypto', 'events', 'stream', 'util', 'buffer'],
    },
    minify: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer/src'),
    },
  },
})
