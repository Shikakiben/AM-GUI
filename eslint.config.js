const js = require('@eslint/js');
const globals = require('globals');

const browserGlobals = {
  ...globals.browser,
  electronAPI: 'readonly',
  appConstants: 'readonly',
  appPreferences: 'readonly',
  appUtils: 'readonly'
};

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**']
  },
  {
    ...js.configs.recommended,
    files: ['main.js', 'preload.js', 'src/main/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node
    },
    rules: {
      'no-console': 'off'
    }
  },
  {
    ...js.configs.recommended,
    files: ['src/renderer/**/*.js', 'renderer.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: browserGlobals
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', {
        args: 'none',
        vars: 'all',
        varsIgnorePattern: '^_',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  }
];
