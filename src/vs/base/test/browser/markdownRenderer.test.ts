/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { renderMarkdown, renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { parse } from 'vs/base/common/marshalling';
import { URI } from 'vs/base/common/uri';

function strToNode(str: string): HTMLElement {
	return new DOMParser().parseFromString(str, 'text/html').body.firstChild as HTMLElement;
}

function assertNodeEquals(actualNode: HTMLElement, expectedHtml: string) {
	const expectedNode = strToNode(expectedHtml);
	assert.ok(
		actualNode.isEqualNode(expectedNode),
		`Expected: ${expectedNode.outerHTML}\nActual: ${actualNode.outerHTML}`);
}

suite('MarkdownRenderer', () => {
	suite('Sanitization', () => {
		test('Should not render images with unknown schemes', () => {
			const markdown = { value: `![image](no-such://example.com/cat.gif)` };
			const result: HTMLElement = renderMarkdown(markdown);
			assert.strictEqual(result.innerHTML, '<p><img alt="image"></p>');
		});
	});

	suite('Images', () => {
		test('image rendering conforms to default', () => {
			const markdown = { value: `![image](http://example.com/cat.gif 'caption')` };
			const result: HTMLElement = renderMarkdown(markdown);
			assertNodeEquals(result, '<div><p><img title="caption" alt="image" src="http://example.com/cat.gif"></p></div>');
		});

		test('image rendering conforms to default without title', () => {
			const markdown = { value: `![image](http://example.com/cat.gif)` };
			const result: HTMLElement = renderMarkdown(markdown);
			assertNodeEquals(result, '<div><p><img alt="image" src="http://example.com/cat.gif"></p></div>');
		});

		test('image width from title params', () => {
			const result: HTMLElement = renderMarkdown({ value: `![image](http://example.com/cat.gif|width=100px 'caption')` });
			assertNodeEquals(result, `<div><p><img width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});

		test('image height from title params', () => {
			const result: HTMLElement = renderMarkdown({ value: `![image](http://example.com/cat.gif|height=100 'caption')` });
			assertNodeEquals(result, `<div><p><img height="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});

		test('image width and height from title params', () => {
			const result: HTMLElement = renderMarkdown({ value: `![image](http://example.com/cat.gif|height=200,width=100 'caption')` });
			assertNodeEquals(result, `<div><p><img height="200" width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});
	});

	suite('ThemeIcons Support On', () => {

		test('render appendText', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendText('$(zap) $(not a theme icon) $(add)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
		});

		test('render appendMarkdown', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown('$(zap) $(not a theme icon) $(add)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-zap"></span> $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
		});

		test('render appendMarkdown with escaped icon', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
		});

	});

	suite('ThemeIcons Support Off', () => {

		test('render appendText', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: false });
			mds.appendText('$(zap) $(not a theme icon) $(add)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
		});

		test('render appendMarkdown with escaped icon', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: false });
			mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');

			let result: HTMLElement = renderMarkdown(mds);
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) $(add)</p>`);
		});

	});

	test('npm Hover Run Script not working #90855', function () {

		const md: IMarkdownString = JSON.parse('{"value":"[Run Script](command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D \\"Run the script as a task\\")","supportThemeIcons":false,"isTrusted":true,"uris":{"__uri_e49443":{"$mid":1,"fsPath":"c:\\\\Users\\\\jrieken\\\\Code\\\\_sample\\\\foo\\\\package.json","_sep":1,"external":"file:///c%3A/Users/jrieken/Code/_sample/foo/package.json","path":"/c:/Users/jrieken/Code/_sample/foo/package.json","scheme":"file"},"command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D":{"$mid":1,"path":"npm.runScriptFromHover","scheme":"command","query":"{\\"documentUri\\":\\"__uri_e49443\\",\\"script\\":\\"echo\\"}"}}}');
		const element = renderMarkdown(md);

		const anchor = element.querySelector('a')!;
		assert.ok(anchor);
		assert.ok(anchor.dataset['href']);

		const uri = URI.parse(anchor.dataset['href']!);

		const data = <{ script: string, documentUri: URI }>parse(decodeURIComponent(uri.query));
		assert.ok(data);
		assert.strictEqual(data.script, 'echo');
		assert.ok(data.documentUri.toString().startsWith('file:///c%3A/'));
	});

	suite('PlaintextMarkdownRender', () => {

		test('test code, blockquote, heading, list, listitem, paragraph, table, tablerow, tablecell, strong, em, br, del, text are rendered plaintext', () => {
			const markdown = { value: '`code`\n>quote\n# heading\n- list\n\n\ntable | table2\n--- | --- \none | two\n\n\nbo**ld**\n_italic_\n~~del~~\nsome text' };
			const expected = 'code\nquote\nheading\nlist\ntable table2 one two \nbold\nitalic\ndel\nsome text\n';
			const result: string = renderMarkdownAsPlaintext(markdown);
			assert.strictEqual(result, expected);
		});

		test('test html, hr, image, link are rendered plaintext', () => {
			const markdown = { value: '<div>html</div>\n\n---\n![image](imageLink)\n[text](textLink)' };
			const expected = '\ntext\n';
			const result: string = renderMarkdownAsPlaintext(markdown);
			assert.strictEqual(result, expected);
		});
	});
});
