/**
 * Rollup 构建配置
 * 用于打包 Infinite MC Launcher Core 模块
 */

import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/mc-launcher.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
      banner: `/**
 * Infinite MC Launcher Core v1.0.0
 * Minecraft启动模块
 * 支持离线登录和Microsoft认证
 * 
 * @license MIT
 * @copyright ${new Date().getFullYear()}
 */`
    },
    {
      file: 'dist/mc-launcher.esm.js',
      format: 'es',
      sourcemap: true
    },
    {
      file: 'dist/mc-launcher.min.js',
      format: 'cjs',
      exports: 'named',
      plugins: [terser()],
      sourcemap: true,
      banner: `/**
 * Infinite MC Launcher Core v1.0.0 (minified)
 * Minecraft启动模块
 * 
 * @license MIT
 * @copyright ${new Date().getFullYear()}
 */`
    }
  ],
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs()
  ],
  external: [
    'node-fetch',
    'uuid',
    'crypto',
    'fs',
    'path',
    'child_process',
    'os',
    'events'
  ]
};