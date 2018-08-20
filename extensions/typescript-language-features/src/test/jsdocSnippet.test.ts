/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { templateToSnippet } from '../features/jsDocCompletions';

suite('typescript.jsDocSnippet', () => {
	test('Should do nothing for single line input', async () => {
		const input = `/** */`;
		assert.strictEqual(templateToSnippet(input).value, input);
	});

	test('Should put cursor inside multiline line input', async () => {
		assert.strictEqual(
			templateToSnippet([
				'/**',
				' * ',
				' */'
			].join('\n')).value,
			[
				'/**',
				' * $0',
				' */'
			].join('\n'));
	});

	test('Should add placeholders after each parameter', async () => {
		assert.strictEqual(
			templateToSnippet([
				'/**',
				' * @param a',
				' * @param b',
				' */'
			].join('\n')).value,
			[
				'/**',
				' * @param a ${1}',
				' * @param b ${2}',
				' */'
			].join('\n'));
	});

	test('Should add placeholders for types', async () => {
		assert.strictEqual(
			templateToSnippet([
				'/**',
				' * @param {*} a',
				' * @param {*} b',
				' */'
			].join('\n')).value,
			[
				'/**',
				' * @param {${1:*}} a ${2}',
				' * @param {${3:*}} b ${4}',
				' */'
			].join('\n'));
	});

	test('Should properly escape dollars in parameter names', async () => {
		assert.strictEqual(
			templateToSnippet([
				'/**',
				' * ',
				' * @param $arg',
				' */'
			].join('\n')).value,
			[
				'/**',
				' * $0',
				' * @param \\$arg ${1}',
				' */'
			].join('\n'));
	});
});

