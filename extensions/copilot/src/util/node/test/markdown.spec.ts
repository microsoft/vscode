/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { createFilepathRegexp, extractCodeBlocks, mdCodeBlockLangToLanguageId } from '../../common/markdown';

suite('markdown', () => {
	suite('extractCodeBlocks', () => {
		test('should extract single code block', () => {
			{
				const result = extractCodeBlocks([
					'```',
					'single',
					'```',
				].join('\n'));
				assert.strictEqual(result.length, 1);
				assert.deepStrictEqual(result[0].code, 'single');
			}
			{
				const result = extractCodeBlocks([
					'```ts',
					'single',
					'```',
				].join('\n'));
				assert.strictEqual(result.length, 1);
				assert.deepStrictEqual(result[0].code, 'single');
				assert.deepStrictEqual(result[0].language, 'ts');
			}
		});

		test('should extract multiple code blocks', () => {
			const result = extractCodeBlocks([
				'```',
				'one',
				'```',
				'',
				'code',
				'',
				'```php',
				'two',
				'```',
			].join('\n'));
			assert.strictEqual(result.length, 2);
			assert.deepStrictEqual(result[0].code, 'one');
			assert.deepStrictEqual(result[0].language, '');

			assert.deepStrictEqual(result[1].code, 'two');
			assert.deepStrictEqual(result[1].language, 'php');
		});

		test('should detect nested code blocks', () => {
			const result = extractCodeBlocks([
				'```',
				'one',
				'```',
				'',
				'- code',
				'  ',
				'  ```php',
				'  two',
				'  ```',
			].join('\n'));
			assert.strictEqual(result.length, 2);
			assert.deepStrictEqual(result[0].code, 'one');
			assert.deepStrictEqual(result[0].language, '');

			assert.deepStrictEqual(result[1].code, 'two');
			assert.deepStrictEqual(result[1].language, 'php');
		});
	});

	suite('createFilepathRegexp', () => {
		test('should match filepath comment with //', () => {
			const regexp = createFilepathRegexp('typescript');
			const result = regexp.exec('// filepath: /path/to/file');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should match filepath comment with // with newline', () => {
			const regexp = createFilepathRegexp('typescript');
			const result = regexp.exec('// filepath: /path/to/file\n');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should match filepath comment with // with newline \r\n', () => {
			const regexp = createFilepathRegexp('typescript');
			const result = regexp.exec('// filepath: /path/to/file\r\n');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should match filepath comment with #', () => {
			const regexp = createFilepathRegexp('python');
			const result = regexp.exec('# filepath: /path/to/file');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should match filepath comment with <!--', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec('<!-- filepath: /path/to/file -->');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should match filepath comment with <!-- but no -->', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec('<!-- filepath: /path/to/file');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should match filepath comment with <!-- and spaces in path', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec('<!-- filepath: /path/to/file with spaces -->');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file with spaces');
		});

		test('should match filepath comment with <!-- and spaces in path no spaces at end', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec('<!-- filepath: /path/to/file with spaces-->');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file with spaces');
		});

		test('should match filepath comment with <!-- and spaces in path no spaces at end with newline', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec('<!-- filepath: /path/to/file with spaces-->\n');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file with spaces');
		});

		test('should match alternative BAT line comments', () => {
			const regexp = createFilepathRegexp('bat');
			const result = regexp.exec(':: filepath: /path/to/file');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should match BAT line comments', () => {
			const regexp = createFilepathRegexp('bat');
			const result = regexp.exec('REM filepath: /path/to/file');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should always match #', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec('# filepath: /path/to/file');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should always match //', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec('// filepath: /path/to/file');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should accept extra whitespaces', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec(' //   filepath:/path/to/file   ');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});

		test('should accept extra whitespaces in path', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec(' //   filepath:/path/to/file with spaces.py   ');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file with spaces.py');
		});

		test('should accept extra whitespaces in path and newline', () => {
			const regexp = createFilepathRegexp('html');
			const result = regexp.exec(' //   filepath:/path/to/file with spaces.py   \n');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file with spaces.py');
		});

		test('should accept empty language', () => {
			const regexp = createFilepathRegexp();
			const result = regexp.exec(' //   filepath:    /path/to/file   ');
			assert.ok(result);
			assert.strictEqual(result[1], '/path/to/file');
		});
	});

	suite('mdCodeBlockLangToLanguageId', () => {
		test('ts is typescript', () => {
			const result = mdCodeBlockLangToLanguageId('ts');
			assert.strictEqual(result, 'typescript');
		});

		test('tsreact is typescriptreact', () => {
			const result = mdCodeBlockLangToLanguageId('tsx');
			assert.strictEqual(result, 'typescriptreact');
		});

		test('python is python', () => {
			const result = mdCodeBlockLangToLanguageId('python');
			assert.strictEqual(result, 'python');
		});

	});
});

