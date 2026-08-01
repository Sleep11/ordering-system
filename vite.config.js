import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, basename } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

export default defineConfig({
  plugins: [vue(), {
    name: 'copy-backend',
    closeBundle() {
      const dist = resolve(__dirname, 'dist')
      if (!existsSync(dist)) mkdirSync(dist, { recursive: true })
      const cp = (src) => {
        const s = resolve(__dirname, src)
        const d = resolve(dist, basename(src))
        if (existsSync(s)) copyFileSync(s, d)
      }
      cp('api.node.js'); cp('auth.node.js'); cp('kv-adapter.node.js')
      cp('public/restore.html')
    }
  }],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: { outDir: 'dist', assetsDir: 'assets' }
})
