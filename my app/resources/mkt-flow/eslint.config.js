import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '.audio-bundle/**',
    '.audio-env/**',
    '**/*-player-script.js',
    'node_modules/**',
    'release/**',
    'runtime/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        __APP_VERSION__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^(_|ignored)',
        caughtErrors: 'none',
        varsIgnorePattern: '^React$',
      }],
      // These effects intentionally hydrate state from localStorage or subscribe to APIs.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: [
      'apps/marketing-flow-desktop/electron-main.js',
      'apps/marketing-flow-desktop/server/**/*.js',
      'packages/**/*.js',
      'scripts/**/*.js',
      'tests/**/*.js',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
])
