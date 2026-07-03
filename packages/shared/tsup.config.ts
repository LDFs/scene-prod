import { defineConfig } from 'tsup'

export default defineConfig({
  // 多入口保持与 exports 一致的 API 面；用对象形式命名产物，避免
  // index.ts 与 src/types/index.ts 都输出成 dist/index.js 而冲突
  entry: {
    index: 'index.ts',
    schema: 'src/schema.ts',
    constants: 'src/constants.ts',
    types: 'src/types/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2020',
  // three 仅类型引用、zod 为运行时依赖，均不打进产物（tsup 默认外置 deps/peerDeps，
  // 这里额外用正则覆盖 three 的子路径以防万一）
  external: [/^three($|\/)/, 'zod'],
})
