import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

function copyBackendPlugin() {
  return {
    name: 'copy-backend',
    closeBundle() {
      const dist = resolve(__dirname, 'dist')
      if (!existsSync(dist)) mkdirSync(dist, { recursive: true })
      const files = ['api.node.js', 'auth.node.js', 'kv-adapter.node.js']
      for (const f of files) {
        const src = resolve(__dirname, f)
        if (existsSync(src)) copyFileSync(src, resolve(dist, f))
      }
      const restoreSrc = resolve(__dirname, 'public', 'restore.html')
      if (existsSync(restoreSrc)) copyFileSync(restoreSrc, resolve(dist, 'restore.html'))
    }
  }
}

export default defineConfig({
  plugins: [vue(), copyBackendPlugin()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  build: { outDir: 'dist', assetsDir: 'assets' },
  server: {
    port: 3000,
    proxy: { '/api.node.js': 'https://bawei.rth1.xyz' }
  }
})
