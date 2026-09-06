/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import es from 'event-stream';
import { suite, test } from 'node:test';
import { stylelintFilter } from '../../filters.ts';
import gulpstylelint, { resolveStylelintMatches, resolveStylelintSources } from '../../stylelint.ts';

suite('stylelint', () => {

	test('uses the full filter without positional arguments', () => {
		assert.deepStrictEqual(resolveStylelintSources(['node', 'build/stylelint.ts']), {
			sources: Array.from(stylelintFilter),
			explicit: false,
		});

		test('includes production extension CSS but excludes extension tests', () => {
			assert.ok(stylelintFilter.includes('extensions/**/*.css'));
			assert.ok(stylelintFilter.includes('!extensions/**/test/**'));
		});
	});

	test('resolves multiple positional and path arguments', () => {
		assert.deepStrictEqual(resolveStylelintSources([
			'node',
			'build/stylelint.ts',
			'src/vs/base',
			'--path=src/vs/editor/**/*.css',
			'-p',
			'src/vs/platform/example.css',
		]), {
			sources: [
				'src/vs/base/**/*.css',
				'src/vs/editor/**/*.css',
				'src/vs/platform/example.css',
			],
			explicit: true,
		});
	});

	test('excludes test CSS from production selector checks', async () => {
		const [source, sourceTest, sourceTestData, windowsSourceTest, extension, extensionTest] = await Promise.all([
			hasClassAttributeSubstringError('src/vs/workbench/browser/example.css'),
			hasClassAttributeSubstringError('src/vs/workbench/test/browser/componentFixtures/example.css'),
			hasClassAttributeSubstringError('src/vs/workbench/test-data/example.css'),
			hasClassAttributeSubstringError('src\\vs\\workbench\\test\\browser\\componentFixtures\\example.css'),
			hasClassAttributeSubstringError('extensions/example/browser/example.css'),
			hasClassAttributeSubstringError('extensions/example/test/example.css'),
		]);

		assert.deepStrictEqual({
			source,
			sourceTest,
			sourceTestData,
			windowsSourceTest,
			extension,
			extensionTest,
		}, {
			source: true,
			sourceTest: false,
			sourceTestData: false,
			windowsSourceTest: false,
			extension: true,
			extensionTest: false,
		});
	});

	test('rejects missing path argument values', () => {
		assert.throws(() => resolveStylelintSources([
			'node',
			'build/stylelint.ts',
			'--path',
		]), /Missing value for --path/);
	});

	test('rejects unmatched source patterns', () => {
		assert.throws(() => resolveStylelintMatches([
			'does-not-exist/**/*.css',
		]), /No CSS files matched the requested path/);
	});
});

function hasClassAttributeSubstringError(relative: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const errors: string[] = [];
		const stream = gulpstylelint((message, isError) => {
			if (isError) {
				errors.push(message);
			}
		}, false, false);
		stream.on('data', () => undefined);
		stream.once('error', reject);
		stream.once('end', () => resolve(errors.some(message => message.includes('Class attribute substring selectors'))));
		es.readArray([{
			relative,
			contents: Buffer.from('.a[class*=x] {}'),
		}]).pipe(stream);
	});
}
