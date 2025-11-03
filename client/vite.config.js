import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHtmlPlugin } from 'vite-plugin-html'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    createHtmlPlugin({
      minify: {
        collapseWhitespace: true,
        removeComments: true,
        removeRedundantAttributes: true,
        removeEmptyAttributes: true,
        minifyCSS: true,
        minifyJS: true,
      },
    })
  ],
  base: './', // 相对路径
  build: {
    sourcemap: false, // 关闭 source map
    outDir: '../server/static', // 输出目录
    emptyOutDir: true, // 打包前清空目标目录
  }
})
