/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('MarkdownString', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Escape leading whitespace', function () {
		const mds = new MarkdownString();
		mds.appendText('Hello\n    Not a code block');
		assert.strictEqual(mds.value, 'Hello\n\n&nbsp;&nbsp;&nbsp;&nbsp;Not&nbsp;a&nbsp;code&nbsp;block');
	});

	test('MarkdownString.appendText doesn\'t escape quote #109040', function () {
		const mds = new MarkdownString();
		mds.appendText('> Text\n>More');
		assert.strictEqual(mds.value, '\\>&nbsp;Text\n\n\\>More');
	});

	test('appendText', () => {

		const mds = new MarkdownString();
		mds.appendText('# foo\n*bar*');

		assert.strictEqual(mds.value, '\\#&nbsp;foo\n\n\\*bar\\*');
	});

	test('appendLink', function () {

		function assertLink(target: string, label: string, title: string | undefined, expected: string) {
			const mds = new MarkdownString();
			mds.appendLink(target, label, title);
			assert.strictEqual(mds.value, expected);
		}

		assertLink(
			'https://example.com\\()![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png)', 'hello', undefined,
			'[hello](https://example.com\\(\\)![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png\\))'
		);
		assertLink(
			'https://example.com', 'hello', 'title',
			'[hello](https://example.com "title")'
		);
		assertLink(
			'foo)', 'hello]', undefined,
			'[hello\\]](foo\\))'
		);
		assertLink(
			'foo\\)', 'hello]', undefined,
			'[hello\\]](foo\\))'
		);
		assertLink(
			'fo)o', 'hell]o', undefined,
			'[hell\\]o](fo\\)o)'
		);
		assertLink(
			'foo)', 'hello]', 'title"',
			'[hello\\]](foo\\) "title\\"")'
		);
	});

	suite('appendCodeBlock', () => {
		function assertCodeBlock(lang: string, code: string, result: string) {
			const mds = new MarkdownString();
			mds.appendCodeblock(lang, code);
			assert.strictEqual(mds.value, result);
		}

		test('common cases', () => {
			// no backticks
			assertCodeBlock('ts', 'const a = 1;', `\n${[
				'```ts',
				'const a = 1;',
				'```'
			].join('\n')}\n`);
			// backticks
			assertCodeBlock('ts', 'const a = `1`;', `\n${[
				'```ts',
				'const a = `1`;',
				'```'
			].join('\n')}\n`);
		});

		// @see https://github.com/microsoft/vscode/issues/193746
		test('escape fence', () => {
			// fence in the first line
			assertCodeBlock('md', '```\n```', `\n${[
				'````md',
				'```\n```',
				'````'
			].join('\n')}\n`);
			// fence in the middle of code
			assertCodeBlock('md', '\n\n```\n```', `\n${[
				'````md',
				'\n\n```\n```',
				'````'
			].join('\n')}\n`);
			// longer fence at the end of code
			assertCodeBlock('md', '```\n```\n````\n````', `\n${[
				'`````md',
				'```\n```\n````\n````',
				'`````'
			].join('\n')}\n`);
		});
	});

	suite('ThemeIcons', () => {

		suite('Support On', () => {

			test('appendText', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: true });
				mds.appendText('$(zap) $(not a theme icon) $(add)');

				assert.strictEqual(mds.value, '\\\\$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;\\\\$\\(add\\)');
			});

			test('appendMarkdown', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: true });
				mds.appendMarkdown('$(zap) $(not a theme icon) $(add)');

				assert.strictEqual(mds.value, '$(zap) $(not a theme icon) $(add)');
			});

			test('appendMarkdown with escaped icon', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: true });
				mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');

				assert.strictEqual(mds.value, '\\$(zap) $(not a theme icon) $(add)');
			});

		});

		suite('Support Off', () => {

			test('appendText', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: false });
				mds.appendText('$(zap) $(not a theme icon) $(add)');

				assert.strictEqual(mds.value, '$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;$\\(add\\)');
			});

			test('appendMarkdown', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: false });
				mds.appendMarkdown('$(zap) $(not a theme icon) $(add)');

				assert.strictEqual(mds.value, '$(zap) $(not a theme icon) $(add)');
			});

			test('appendMarkdown with escaped icon', () => {
				const mds = new MarkdownString(undefined, { supportThemeIcons: true });
				mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');

				assert.strictEqual(mds.value, '\\$(zap) $(not a theme icon) $(add)');
			});

		});

	});
});
