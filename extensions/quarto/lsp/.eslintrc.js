module.exports = {
  root: true,
  extends: ["custom-server"],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
