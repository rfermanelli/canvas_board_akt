import js from '@eslint/js';
import globals from 'globals';

// Config ESLint (flat) per il server Node/ESM.
export default [
  { ignores: ['node_modules/**', 'uploads/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Le variabili/argomenti con prefisso _ sono intenzionalmente inutilizzati (es. (_req, res)).
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
