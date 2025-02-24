import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    open: 'example/index.html',
  },
  build: {
    target: 'esnext',
    minify: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      fileName: 'three-vr-postfx',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['three', /^three\/.*/]
    }
  },
  publicDir: 'www/public/',
  resolve: {
    alias: [
      { find: '@fern-solutions/three-vr-postfx', replacement: resolve(__dirname, './src') }
    ]
  }
})