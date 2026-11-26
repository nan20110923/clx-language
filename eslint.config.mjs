import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
	{
		ignores: ['dist/**', '.artifacts/**', 'node_modules/**'],
	},
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		plugins: {
			'@typescript-eslint': tseslint,
		},
		rules: {
			// TypeScript already reports these; the ESLint versions disagree with tsc
			// (e.g. on overloads and on ambient declarations) and produce false positives.
			'no-undef': 'off',
			'no-unused-vars': 'off',

			// Real defects worth failing CI on.
			'no-var': 'error',
			'prefer-const': 'error',
			'no-eq-null': 'error',
			'eqeqeq': ['error', 'smart'],
			'no-fallthrough': 'error',
			'no-self-assign': 'error',
			'no-unreachable': 'error',
			'no-constant-condition': ['error', { checkLoops: false }],
			'no-async-promise-executor': 'error',
			'no-promise-executor-return': 'error',
			'no-return-assign': 'error',
			'no-throw-literal': 'error',
			'no-template-curly-in-string': 'error',
			'no-implicit-coercion': ['error', { boolean: false }],
			'no-useless-catch': 'error',
			'no-useless-escape': 'error',

			'@typescript-eslint/no-unused-vars': ['error', {
				args: 'none',
				varsIgnorePattern: '^_',
				caughtErrors: 'none',
			}],
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-this-alias': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
		},
	},
	{
		// The wordPattern in languageConfiguration is a deliberate, fully-escaped
		// character class kept close to the VS Code docs form. The escapes are
		// redundant but harmless, and rewriting them risks changing the meaning.
		// activate.ts's inline values regex has the same shape.
		files: ['src/language/languageConfiguration.ts', 'src/debug/activate.ts'],
		rules: {
			'no-useless-escape': 'off',
		},
	},
];
