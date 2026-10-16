/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import es from 'event-stream';
import { readFile } from 'fs/promises';
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

	test('requires native control color schemes on the workbench', async () => {
		const globalStyles = await readFile(new URL('../../../src/vs/workbench/browser/media/style.css', import.meta.url), 'utf8');
		const [themed, missing, commentedOut] = await Promise.all([
			hasNativeScrollbarThemingError(globalStyles),
			hasNativeScrollbarThemingError(`
				.monaco-workbench {
					color: var(--vscode-foreground);
				}
			`),
			hasNativeScrollbarThemingError(globalStyles.replace(
				'color-scheme: dark;',
				'/* color-scheme: dark; */'
			)),
		]);

		assert.deepStrictEqual({
			themed,
			missing,
			commentedOut,
		}, {
			themed: false,
			missing: true,
			commentedOut: true,
		});
	});

	test('rejects hardcoded native scrollbar colors in production CSS', async () => {
		const [themedPseudo, hardcodedPseudo, themedStandard, hardcodedStandard, testCss] = await Promise.all([
			hasHardcodedNativeScrollbarColorError('src/vs/workbench/browser/example.css', '.scrollable::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background) }'),
			hasHardcodedNativeScrollbarColorError('src/vs/workbench/browser/example.css', '.scrollable::-webkit-scrollbar-track { background: white; }'),
			hasHardcodedNativeScrollbarColorError('src/vs/workbench/browser/example.css', '.scrollable { scrollbar-color: var(--vscode-scrollbarSlider-background) transparent; }'),
			hasHardcodedNativeScrollbarColorError('src/vs/workbench/browser/example.css', '.scrollable { scrollbar-color: var(--vscode-scrollbarSlider-background) white; }'),
			hasHardcodedNativeScrollbarColorError('src/vs/workbench/test/browser/example.css', '.scrollable::-webkit-scrollbar-track { background: white; }'),
		]);

		assert.deepStrictEqual({
			themedPseudo,
			hardcodedPseudo,
			themedStandard,
			hardcodedStandard,
			testCss,
		}, {
			themedPseudo: false,
			hardcodedPseudo: true,
			themedStandard: false,
			hardcodedStandard: true,
			testCss: false,
		});
	});
});

function hasClassAttributeSubstringError(relative: string): Promise<boolean> {
	return getStylelintErrors(relative, '.a[class*=x] {}')
		.then(errors => errors.some(message => message.includes('Class attribute substring selectors')));
}

function hasNativeScrollbarThemingError(contents: string): Promise<boolean> {
	return getStylelintErrors('src/vs/workbench/browser/media/style.css', contents)
		.then(errors => errors.some(message => message.includes('Workbench theme classes')));
}

function hasHardcodedNativeScrollbarColorError(relative: string, contents: string): Promise<boolean> {
	return getStylelintErrors(relative, contents)
		.then(errors => errors.some(message => message.includes('Native scrollbar colors')));
}

function getStylelintErrors(relative: string, contents: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const errors: string[] = [];
		const stream = gulpstylelint((message, isError) => {
			if (isError) {
				errors.push(message);
			}
		}, false, false);
		stream.on('data', () => undefined);
		stream.once('error', reject);
		stream.once('end', () => resolve(errors));
		es.readArray([{
			relative,
			contents: Buffer.from(contents),
		}]).pipe(stream);
	});
}
