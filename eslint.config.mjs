import gts from 'gts';

export default [
  {
    ignores: ['**/*.test.ts', 'dist/**', 'coverage/**', 'tools/**'],
  },
  ...gts,
];
