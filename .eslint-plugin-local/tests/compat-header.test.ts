/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RuleTester } from 'oxlint/plugins-dev';
import { suite, test } from 'node:test';
import plugin from '../compat/header.ts';

RuleTester.describe = suite;
RuleTester.it = test;

const headerLines = [
	'---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------',
];
const header = `/*${headerLines.join('\n')}*/`;
const options = ['block', headerLines, 1, { lineEndings: 'unix' }];

new RuleTester({ languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } } }).run('header', plugin.rules.header, {
	valid: [
		{ name: 'header', code: `${header}\nconst a = 1;`, options },
		{ name: 'header and blank line', code: `${header}\n\nconst a = 1;`, options },
		{ name: 'header after a shebang', code: `#!/usr/bin/env node\n${header}\nconst a = 1;`, options },
		{ name: 'line comments', code: '//a\n//b\nconst a = 1;', options: ['line', ['a', 'b'], 1, { lineEndings: 'unix' }] },
		{ name: 'pattern', code: '/* Copyright 2024 */\nconst a = 1;', options: ['block', { pattern: ' Copyright \\d{4} ' }] },
	],
	invalid: [
		{
			name: 'missing header',
			code: 'const a = 1;',
			options,
			errors: [{ message: 'missing header', line: 1, column: 0 }],
			output: `${header}\nconst a = 1;`,
		},
		{
			name: 'line comment header',
			code: '// Copyright 2025 Someone\n// License\n\nconst a = 1;',
			options,
			errors: [{ message: 'header should be a block comment', line: 4, column: 0 }],
			output: `${header}\n\nconst a = 1;`,
		},
		{
			name: 'incorrect block header',
			code: '/* wrong */\nconst a = 1;',
			options,
			errors: [{ message: 'incorrect header', line: 2, column: 0 }],
			output: `${header}\nconst a = 1;`,
		},
		{
			name: 'header with an extra line',
			code: `${header.slice(0, -2)}\n * extra\n */\nconst a = 1;`,
			options,
			errors: [{ message: 'incorrect header', line: 7, column: 0 }],
			output: `${header}\nconst a = 1;`,
		},
		{
			name: 'no line break after the header',
			code: `${header} const a = 1;`,
			options,
			errors: [{ message: 'no newline after header', line: 4, column: 97 }],
			output: `${header}\n const a = 1;`,
		},
		{
			name: 'incorrect line header',
			code: '//a\n//c\nconst a = 1;',
			options: ['line', ['a', 'b'], 1, { lineEndings: 'unix' }],
			errors: [{ message: 'incorrect header', line: 3, column: 0 }],
			output: '//a\n//b\nconst a = 1;',
		},
		{
			name: 'pattern without a template cannot be fixed',
			code: '/* Copyright */\nconst a = 1;',
			options: ['block', { pattern: ' Copyright \\d{4} ' }],
			errors: [{ message: 'incorrect header', line: 2, column: 0 }],
			output: null,
		},
	],
});
