export default {
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/renderer/src/test/setup.ts'],
  },
};
