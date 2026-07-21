// Flat ESLint config. The game core is dependency-free ES modules that run in
// both the browser (main/reels/fx/ui) and Node (engine/rtp/bank + tests).
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        performance: 'readonly',
        URLSearchParams: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        PIXI: 'readonly',
        // Shared
        globalThis: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
