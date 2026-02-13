import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/qc-test/', // ใส่ชื่อ Repository ของเพื่อนตรงนี้
  plugins: [
    react(),
    tailwindcss(),
  ],
})