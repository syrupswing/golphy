import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/golphy/',
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5 still uses @import internally; don't report its deprecations as ours.
        quietDeps: true,
        silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
      },
    },
  },
})
