import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/**/*.{ts,tsx}'],
  dts: true,
  format: ['cjs', 'esm'],
  external: ['bun'],
  unbundle: true,

  exports: {
    devExports: '@zenstack-cache/source',
  },
})
