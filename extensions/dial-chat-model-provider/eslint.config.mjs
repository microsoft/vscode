import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	...tseslint.configs.recommended,
	eslintConfigPrettier,
	{
		ignores: ['dist/**', 'node_modules/**', 'out/**'],
	},
	{
		files: ['src/**/*.ts'],
		rules: {
			curly: 'error',
			eqeqeq: ['error', 'always'],
			'no-throw-literal': 'error',
			'no-implicit-coercion': 'warn',
			'no-param-reassign': 'error',
			'prefer-const': 'error',
			'no-var': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-non-null-assertion': 'error',
			'@typescript-eslint/consistent-type-imports': [
				'warn',
				{ prefer: 'type-imports', fixStyle: 'inline-type-imports' },
			],
			'@typescript-eslint/no-floating-promises': 'off',
		},
	},
	{
		files: ['src/test/**/*.ts'],
		rules: {
			'@typescript-eslint/no-non-null-assertion': 'off',
		},
	},
);
