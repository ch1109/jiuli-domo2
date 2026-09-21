import config from '../playwright.config';
// Reuse the local preview without stopping another task's development server.
const calibrationConfig = {
  ...config,
  testDir: '../e2e',
  outputDir: '../test-results/calibration',
  use: {...config.use, baseURL: process.env.JIULI_DEMO_URL ?? 'http://127.0.0.1:3001'},
  webServer: undefined,
};
export default calibrationConfig;
