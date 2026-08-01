import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

function copyPhpPlugin() {
  return {
    name: 'copy-php',
    closeBundle() {
      const dist = resolve(__dirname, 'dist')
      if (!existsSync(dist)) mkdirSync(dist, { recursive: true })
      const files = ['api.php', 'auth.php', 'kv-helper.php']
      for (const f of files) {
        const src = resolve(__dirname, f)
        if (existsSync(src)) copyFileSync(src, resolve(dist, f))
      }
      // Copy restore.html
      const restoreSrc = resolve(__dirname, 'public', 'restore.html')
      if (existsSync(restoreSrc)) copyFileSync(restoreSrc, resolve(dist, 'restore.html'))
    }
  }
}

export default defineConfig({
  plugins: [vue(), copyPhpPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  server: {
    port: 3000,
    proxy: {
      '/api.php': 'https://bawei.rth1.xyz'
    }
  }
})
