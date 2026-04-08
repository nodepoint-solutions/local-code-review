import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'main',
      include: ['src/main/__tests__/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'renderer',
      include: ['src/renderer/src/__tests__/**/*.test.tsx'],
      environment: 'jsdom',
      setupFiles: ['src/renderer/src/test-setup.ts'],
    },
  },
])
