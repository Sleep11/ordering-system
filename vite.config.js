import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

export default defineConfig({
  plugins: [vue(), {
    name: 'copy-backend',
    closeBundle() {
      const dist = resolve(__dirname, 'dist')
      if (!existsSync(dist)) mkdirSync(dist, { recursive: true })
      const copy = (f) => { const s = resolve(__dirname, f); if (existsSync(s)) copyFileSync(s, resolve(dist, f)) }
      copy('api.node.js'); copy('auth.node.js'); copy('kv-adapter.node.js')
      copy('public/restore.html'); copy('public/hash_test.php')
    }
  }],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: { outDir: 'dist', assetsDir: 'assets' }
})
