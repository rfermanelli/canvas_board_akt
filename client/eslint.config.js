import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Config ESLint (flat) per il client React/Vite.
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  react.configs.flat.recommended, // include react/jsx-uses-vars (riconosce i componenti usati nel JSX)
  react.configs.flat['jsx-runtime'], // nuovo JSX transform: React non serve in scope
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    settings: { react: { version: '18' } },
    rules: {
      ...reactHooks.configs.recommended.rules, // rules-of-hooks (error) + exhaustive-deps (warn)
      'react/prop-types': 'off',
      // Falso positivo sulle factory di componenti (es. SvgShape in Board.jsx crea icone).
      'react/display-name': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
