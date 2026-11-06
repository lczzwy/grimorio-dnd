/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' + hash routing lets the build run from any GitHub Pages sub-path
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
})
