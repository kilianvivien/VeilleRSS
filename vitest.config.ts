import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'node:fs'

/** Miroir du `define` de vite.config.ts : les composants qui affichent la
 *  version doivent pouvoir être rendus sous test. */
const APP_VERSION = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
).version as string

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
