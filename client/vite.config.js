import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 相对路径
  build: {
    sourcemap: false, // 关闭 source map
    outDir: '../server/static', // 输出目录
    emptyOutDir: true, // 打包前清空目标目录
  }
})
