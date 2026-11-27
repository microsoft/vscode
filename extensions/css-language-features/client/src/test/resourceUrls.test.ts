/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { URI } from 'vscode-uri';
import { createUriListText, shouldInsertCssUrl } from '../dropOrPaste/resourceUrls';
import { UriList } from '../dropOrPaste/uriList';

suite('CSS resource URLs', () => {
	const directory = URI.file('/project/styles');

	const fileCases: readonly { readonly name: string; readonly expected: string }[] = [
		{ name: 'image.png', expected: 'image.png' },
		{ name: 'image with spaces.png', expected: 'image%20with%20spaces.png' },
		{ name: 'image(one).png', expected: 'image(one).png' },
		{ name: 'image"one.png', expected: 'image%22one.png' },
		{ name: 'image\'one.png', expected: 'image\'one.png' },
		{ name: 'image#one?.png', expected: 'image%23one%3F.png' },
		{ name: 'image%20.png', expected: 'image%2520.png' },
		{ name: 'image$1}.png', expected: 'image%241%7D.png' },
		{ name: 'चित्र.png', expected: '%E0%A4%9A%E0%A4%BF%E0%A4%A4%E0%A5%8D%E0%A4%B0.png' },
		{ name: 'image\n.png', expected: 'image%0A.png' },
	];
	for (const { name, expected } of fileCases) {
		test(`formats the filename ${JSON.stringify(name)} as a quoted relative URL`, () => {
			const uri = URI.file('/project/assets/' + name);
			const list = new UriList([{ uri, str: uri.toString() }]);
			assert.strictEqual(createUriListText(directory, list), `url("../assets/${expected}")`);
		});
	}

	test('keeps URL query and fragment suffixes when making paths relative', () => {
		const list = UriList.from('file:///project/assets/image%23one.svg?size=2&label=a%26b#symbol');
		assert.strictEqual(createUriListText(directory, list), 'url("../assets/image%23one.svg?size=2&label=a%26b#symbol")');
	});

	test('preserves a directory URI trailing slash', () => {
		assert.strictEqual(createUriListText(directory, UriList.from('file:///project/assets/')), 'url("../assets/")');
	});

	test('preserves external URL spelling and encoded delimiters', () => {
		const url = 'https://example.com/a%2Fb.svg?x=1&label=a%26b#icon';
		assert.strictEqual(createUriListText(directory, UriList.from(url)), `url("${url}")`);
	});

	test('keeps encoded path separators opaque for same-origin URLs', () => {
		const from = URI.parse('https://example.com/styles');
		const url = 'https://example.com/assets/a%2Fb%5Cc.svg?x=1#icon';
		assert.strictEqual(createUriListText(from, UriList.from(url)), `url("${url}")`);
	});

	test('preserves snippet metacharacters in external URLs as literal text', () => {
		const url = 'https://example.com/$1/${name}.png';
		assert.strictEqual(createUriListText(directory, UriList.from(url)), `url("${url}")`);
	});

	test('escapes quotes and backslashes in external URLs', () => {
		const url = 'https://example.com/a"b\\c.png';
		assert.strictEqual(createUriListText(directory, UriList.from(url)), 'url("https://example.com/a\\"b\\\\c.png")');
	});

	test('CSS-escapes control characters without creating new CSS tokens', () => {
		const uri = URI.parse('https://example.com/image.png');
		const list = new UriList([{ uri, str: 'https://example.com/a\tb\fc\x7f.png' }]);
		assert.strictEqual(createUriListText(directory, list), 'url("https://example.com/a\\9 b\\c c\\7f .png")');
	});

	test('preserves the order of multiple URLs', () => {
		const list = UriList.from('file:///project/assets/one.png\r\nhttps://example.com/two.png\r\n');
		assert.strictEqual(createUriListText(directory, list), 'url("../assets/one.png") url("https://example.com/two.png")');
	});

	test('returns no text for an empty resource list', () => {
		assert.strictEqual(createUriListText(directory, UriList.from('')), '');
	});

	test('uses absolute URLs when there is no document directory', () => {
		assert.strictEqual(createUriListText(undefined, UriList.from('file:///project/image.png')), 'url("file:///project/image.png")');
	});

	test('uses relative paths within a remote workspace', () => {
		const from = URI.parse('vscode-remote://ssh-remote+host/project/styles');
		const list = UriList.from('vscode-remote://ssh-remote+host/project/assets/image.png');
		assert.strictEqual(createUriListText(from, list), 'url("../assets/image.png")');
	});

	test('keeps resources from a different authority absolute', () => {
		const from = URI.parse('vscode-remote://ssh-remote+one/project/styles');
		const url = 'vscode-remote://ssh-remote+two/project/image.png';
		assert.strictEqual(createUriListText(from, UriList.from(url)), `url("${url}")`);
	});

	test('keeps resources on different Windows drives absolute on every host', () => {
		const from = URI.parse('file:///C:/project/styles');
		const url = 'file:///D:/assets/image.png';
		assert.strictEqual(createUriListText(from, UriList.from(url)), `url("${url}")`);
	});

	test('uses a forward slash when generating relative Windows paths', () => {
		const from = URI.parse('file:///C:/project/styles');
		const list = UriList.from('file:///C:/project/assets/image.png');
		assert.strictEqual(createUriListText(from, list), 'url("../assets/image.png")');
	});

	for (const { languageId, url, expected } of [
		{ languageId: 'scss', url: 'https://example.com/icon.svg#{$id}', expected: 'https://example.com/icon.svg\\23 {$id}' },
		{ languageId: 'scss', url: 'https://example.com/#{name}.svg?size=#{size}', expected: 'https://example.com/\\23 {name}.svg?size=\\23 {size}' },
		{ languageId: 'less', url: 'https://example.com/icon.svg?theme=@{theme}', expected: 'https://example.com/icon.svg?theme=\\40 {theme}' },
		{ languageId: 'less', url: 'https://example.com/${path}.svg#@{id}', expected: 'https://example.com/\\24 {path}.svg#\\40 {id}' },
		{ languageId: 'css', url: 'https://example.com/#{name}/@{theme}/${path}', expected: 'https://example.com/#{name}/@{theme}/${path}' },
		{ languageId: 'scss', url: 'https://example.com/icon.svg?theme=@{theme}', expected: 'https://example.com/icon.svg?theme=@{theme}' },
		{ languageId: 'less', url: 'https://example.com/icon.svg#{$id}', expected: 'https://example.com/icon.svg#{$id}' },
	]) {
		test(`${languageId}: preserves literal interpolation in ${url}`, () => {
			assert.strictEqual(createUriListText(directory, UriList.from(url), languageId), `url("${expected}")`);
		});
	}

	for (const languageId of ['scss', 'less']) {
		test(`${languageId}: protects interpolation in relative URL suffixes`, () => {
			const url = languageId === 'scss' ? 'file:///project/assets/icon.svg#{$id}' : 'file:///project/assets/icon.svg?theme=@{theme}';
			const expected = languageId === 'scss' ? '../assets/icon.svg\\23 {$id}' : '../assets/icon.svg?theme=\\40 {theme}';
			assert.strictEqual(createUriListText(directory, UriList.from(url), languageId), `url("${expected}")`);
		});

		test(`${languageId}: preserves already encoded interpolation`, () => {
			const url = 'https://example.com/%23%7Bname%7D.svg?theme=%40%7Btheme%7D#%24%7Bid%7D';
			assert.strictEqual(createUriListText(directory, UriList.from(url), languageId), `url("${url}")`);
		});
	}
});

suite('CSS URL insertion context', () => {
	const cases: readonly { readonly text: string; readonly preferPath: boolean }[] = [
		{ text: 'a { background: |; }', preferPath: false },
		{ text: 'a { background: url(|); }', preferPath: true },
		{ text: 'a { background: url(  |  ); }', preferPath: true },
		{ text: 'a { background: URL(|); }', preferPath: true },
		{ text: 'a { background: url(|', preferPath: true },
		{ text: 'a { background: url(\n  |\n); }', preferPath: true },
		{ text: 'a { background: url("im|age.png"); }', preferPath: true },
		{ text: 'a { background: url(\'im|age.png\'); }', preferPath: true },
		{ text: 'a { background: url("image(one)|.png"); }', preferPath: true },
		{ text: 'a { background: url("one\\\r\n)|.png"); }', preferPath: true },
		{ text: 'a { background: url(image\\)one|.png); }', preferPath: true },
		{ text: 'a { background: url(image\\(one|.png); }', preferPath: true },
		{ text: 'a { background: url(var(--image|)); }', preferPath: true },
		{ text: 'a { background: image-set(url(|) 1x); }', preferPath: true },
		{ text: 'a { background: url(one.png)|; }', preferPath: false },
		{ text: 'a { background: url(one.png) |url(two.png); }', preferPath: false },
		{ text: 'a { background: url(one.png) url(|); }', preferPath: true },
		{ text: 'a { background: myurl(|); }', preferPath: false },
		{ text: 'a { background: --url(|); }', preferPath: false },
		{ text: 'a { background: url2(|); }', preferPath: false },
		{ text: 'a { background: üurl(|); }', preferPath: false },
		{ text: 'a { content: "url(|)"; }', preferPath: true },
		{ text: '/* url(|) */ a {}', preferPath: true },
		{ text: 'a { content: "|"; }', preferPath: true },
		{ text: '@import "|";', preferPath: true },
		{ text: '@import \'|\';', preferPath: true },
		{ text: '/* | */ a {}', preferPath: true },
		{ text: '/* url( */ a { background: |; }', preferPath: false },
		{ text: 'a { background: url(/* ) */ |); }', preferPath: false },
		{ text: 'a { content: "url(\\"text\\")"; background: |; }', preferPath: false },
		{ text: 'a { background: url(https://example.com/im|age.png); }', preferPath: true },
	];
	for (const languageId of ['css', 'scss', 'less']) {
		for (const { text, preferPath } of cases) {
			test(`${languageId}: ${text}`, () => {
				const offset = text.indexOf('|');
				assert.strictEqual(shouldInsertCssUrl(text.replace('|', ''), [offset], languageId), !preferPath);
			});
		}
	}

	for (const languageId of ['scss', 'less']) {
		test(`${languageId}: ignores URL functions in line comments`, () => {
			const text = '// url()\n// url(\na { background: ; }';
			assert.strictEqual(shouldInsertCssUrl(text, [text.indexOf(';')], languageId), true);
		});

		test(`${languageId}: prefers paths inside a line comment`, () => {
			const text = '// ';
			assert.strictEqual(shouldInsertCssUrl(text, [text.length], languageId), false);
		});
	}

	for (const languageId of ['css', 'scss', 'less']) {
		test(`${languageId}: ignores comment markers in unquoted URLs`, () => {
			const text = 'a { background: url(/images/*/icon.png); mask: ; }';
			assert.strictEqual(shouldInsertCssUrl(text, [text.lastIndexOf(';')], languageId), true);
		});
	}
});

suite('CSS URL insertion at multiple selections', () => {
	const cases: readonly { readonly text: string; readonly expected: boolean }[] = [
		{ text: '|a { background: |; mask: |; }|', expected: true },
		{ text: '|a { background: url(|); mask: |; }', expected: false },
		{ text: '|a { background: |; content: "|"; }', expected: false },
		{ text: '/* | */ a { background: |; }', expected: false },
		{ text: '|/* url( */| a { background: |; }', expected: true },
		{ text: '|/*/ a { background: |; }', expected: false },
		{ text: '|/* *|/ a { background: |; }', expected: false },
		{ text: '|a { background: url(/images/*/icon.png); mask: |; }', expected: true },
		{ text: '|a { background: url( /images/*/icon.png); mask: |; }', expected: true },
		{ text: '|a { background: url("icon.png" /* ) */); mask: |; }', expected: true },
		{ text: '|a { background: url(image\\)one.png); mask: |; }', expected: true },
		{ text: '|a { background: url("one\\\r\n).png"); mask: |; }', expected: true },
		{ text: '|a { background: url("one\\\r|\n).png"); mask: |; }', expected: false },
		{ text: '|a { background: url(var(--image)); mask: |; }', expected: true },
	];
	for (const languageId of ['css', 'scss', 'less']) {
		for (const { text, expected } of cases) {
			test(`${languageId}: ${text}`, () => {
				const parts = text.split('|');
				let offset = 0;
				const offsets = parts.slice(0, -1).map(part => offset += part.length);
				assert.strictEqual(shouldInsertCssUrl(parts.join(''), offsets, languageId), expected);
			});
		}
	}

	for (const languageId of ['scss', 'less']) {
		for (const newline of ['\n', '\r', '\r\n']) {
			test(`${languageId}: resumes after a line comment ending in ${JSON.stringify(newline)}`, () => {
				const text = '// url( /* "' + newline + 'a { background: ; }';
				assert.strictEqual(shouldInsertCssUrl(text, [0, text.indexOf(';')], languageId), true);
			});
		}

		test(`${languageId}: rejects a selection inside a line comment`, () => {
			const text = '// url(\na { background: ; }';
			assert.strictEqual(shouldInsertCssUrl(text, [0, 3, text.indexOf(';')], languageId), false);
		});
	}

	test('accepts unsorted and duplicate positions without modifying the input', () => {
		const text = 'a { background: ; mask: ; }';
		const offsets = Object.freeze([text.lastIndexOf(';'), 0, text.indexOf(';'), text.lastIndexOf(';')]);
		assert.strictEqual(shouldInsertCssUrl(text, offsets, 'css'), true);
	});

	test('rejects a blocked position in an unsorted list', () => {
		const text = 'a { background: url(); mask: ; }';
		assert.strictEqual(shouldInsertCssUrl(text, [text.lastIndexOf(';'), text.indexOf(')'), 0], 'css'), false);
	});

	test('does not prefer URL insertion when there are no selections', () => {
		assert.strictEqual(shouldInsertCssUrl('a {}', [], 'css'), false);
	});

	test('handles many selections in a stylesheet', () => {
		const rule = 'a { background: ; }\n';
		const offsets = Array.from({ length: 1000 }, (_, i) => i * rule.length + rule.indexOf(';'));
		assert.strictEqual(shouldInsertCssUrl(rule.repeat(offsets.length), offsets.reverse(), 'css'), true);
	});
});
