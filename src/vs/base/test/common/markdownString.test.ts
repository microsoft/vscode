/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IMarkdownString, MarkdownString } from '../../common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { URI } from '../../common/uri.js';

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
		function link(target: string, label: string, title?: string) {
			return new MarkdownString().appendLink(target, label, title).value;
		}

		assert.deepStrictEqual([
			link('https://example.com\\()![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png)', 'hello'),
			link('https://example.com', 'hello', 'title'),
			link('foo)', 'hello]'),
			link('foo\\)', 'hello]'),
			link('fo)o', 'hell]o'),
			link('foo)', 'hello]', 'title"'),
		], [
			'[hello](https://example.com\\\\\\(\\)![]\\(file:///Users/jrieken/Code/_samples/devfest/foo/img.png\\))',
			'[hello](https://example.com "title")',
			'[hello\\]](foo\\))',
			'[hello\\]](foo\\\\\\))',
			'[hell\\]o](fo\\)o)',
			'[hello\\]](foo\\) "title&#34;")',
		]);
	});

	test('appendLink uses target and title literally', function () {
		function link(target: string, title?: string) {
			return new MarkdownString().appendLink(target, 'x', title).value;
		}

		assert.deepStrictEqual([
			link('a\\\\)b'),
			link('a\\'),
			link('a<b>c'),
			link('a b\tc\u00a0d\ne\u2028f\u0000g'),
			link('a', 't\\\\"u'),
			link('a', 't\\'),
			link('a', 'b\n\nc\r\nd(e)'),
			link('a', 'x&#41;&amp;y'),
		], [
			'[x](a\\\\\\\\\\)b)',
			'[x](a\\\\)',
			'[x](a\\<b\\>c)',
			'[x](a%20b%09c%C2%A0d%0Ae%E2%80%A8f%00g)',
			'[x](a "t&#92;&#92;&#34;u")',
			'[x](a "t&#92;")',
			'[x](a "b  c d&#40;e&#41;")',
			'[x](a "x&#38;#41;&#38;amp;y")',
		]);
	});

	test('appendLink label: delimiters are escaped after an even number of backslashes', function () {
		function link(label: string) {
			return new MarkdownString().appendLink('a', label).value;
		}

		assert.deepStrictEqual([
			link('x\\]y'),
			link('x\\\\]y'),
			link('x\\'),
		], [
			'[x\\]y](a)',
			'[x\\\\\\]y](a)',
			'[x\\\\](a)',
		]);
	});

	test('appendLink escapes long backslash runs in linear time', function () {
		const backslashes = '\\'.repeat(200_000);
		const start = Date.now();
		const value = new MarkdownString().appendLink(`${backslashes}a`, `${backslashes}b`, `${backslashes}c`).value;
		assert.ok(Date.now() - start < 1000, 'escaping must not be quadratic');
		assert.strictEqual(value, `[${backslashes}b](${backslashes}${backslashes}a "${'&#92;'.repeat(200_000)}c")`);
	});

	test('lift', () => {
		const dto: IMarkdownString = {
			value: 'hello',
			baseUri: URI.file('/foo/bar'),
			supportThemeIcons: true,
			isTrusted: true,
			supportHtml: true,
			uris: {
				[URI.file('/foo/bar2').toString()]: URI.file('/foo/bar2'),
				[URI.file('/foo/bar3').toString()]: URI.file('/foo/bar3')
			}
		};
		const mds = MarkdownString.lift(dto);
		assert.strictEqual(mds.value, dto.value);
		assert.strictEqual(mds.baseUri?.toString(), dto.baseUri?.toString());
		assert.strictEqual(mds.supportThemeIcons, dto.supportThemeIcons);
		assert.strictEqual(mds.isTrusted, dto.isTrusted);
		assert.strictEqual(mds.supportHtml, dto.supportHtml);
		assert.deepStrictEqual(mds.uris, dto.uris);
	});

	test('lift returns new instance', () => {
		const instance = new MarkdownString('hello');
		const mds2 = MarkdownString.lift(instance).appendText('world');
		assert.strictEqual(mds2.value, 'helloworld');
		assert.strictEqual(instance.value, 'hello');
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
