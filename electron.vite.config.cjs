/* eslint-disable no-undef, @typescript-eslint/no-require-imports */

const { defineConfig, externalizeDepsPlugin } = require('electron-vite');
const react = require('@vitejs/plugin-react');
const tailwindcss = require('@tailwindcss/vite').default;

module.exports = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['zod'] })],
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
});
