import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2020',
  // three / three-mesh-bvh / @tweenjs/tween.js / @scene-prod/* 都不打进产物：
  // - three 及其子路径（three/examples/jsm/...）必须外置，保证宿主与 core 共用同一份 THREE 实例（单例）
  // - tsup 默认会把 dependencies / peerDependencies 标记为 external，这里额外用正则覆盖 three 的子路径
  external: [/^three($|\/)/, 'three-mesh-bvh', '@tweenjs/tween.js', /^@scene-prod\//],
})
