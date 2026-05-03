import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react({ fastRefresh: false }),
    tailwindcss(),
  ],
  test: {
    globals: true,
    setupFiles: './src/tests/setup.js',
  },
})
