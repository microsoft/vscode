/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { renderMarkdown, renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { parse } from 'vs/base/common/marshalling';
import { isWeb } from 'vs/base/common/platform';
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
			const result: HTMLElement = renderMarkdown(markdown).element;
			assert.strictEqual(result.innerHTML, '<p><img alt="image"></p>');
		});
	});

	suite('Images', () => {
		test('image rendering conforms to default', () => {
			const markdown = { value: `![image](http://example.com/cat.gif 'caption')` };
			const result: HTMLElement = renderMarkdown(markdown).element;
			assertNodeEquals(result, '<div><p><img title="caption" alt="image" src="http://example.com/cat.gif"></p></div>');
		});

		test('image rendering conforms to default without title', () => {
			const markdown = { value: `![image](http://example.com/cat.gif)` };
			const result: HTMLElement = renderMarkdown(markdown).element;
			assertNodeEquals(result, '<div><p><img alt="image" src="http://example.com/cat.gif"></p></div>');
		});

		test('image width from title params', () => {
			const result: HTMLElement = renderMarkdown({ value: `![image](http://example.com/cat.gif|width=100px 'caption')` }).element;
			assertNodeEquals(result, `<div><p><img width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});

		test('image height from title params', () => {
			const result: HTMLElement = renderMarkdown({ value: `![image](http://example.com/cat.gif|height=100 'caption')` }).element;
			assertNodeEquals(result, `<div><p><img height="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});

		test('image width and height from title params', () => {
			const result: HTMLElement = renderMarkdown({ value: `![image](http://example.com/cat.gif|height=200,width=100 'caption')` }).element;
			assertNodeEquals(result, `<div><p><img height="200" width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});

		test('image with file uri should render as same origin uri', () => {
			if (isWeb) {
				return;
			}
			const result: HTMLElement = renderMarkdown({ value: `![image](file:///images/cat.gif)` }).element;
			assertNodeEquals(result, '<div><p><img src="vscode-file://vscode-app/images/cat.gif" alt="image"></p></div>');
		});
	});

	suite('Code block renderer', () => {
		const simpleCodeBlockRenderer = (code: string): Promise<HTMLElement> => {
			const element = document.createElement('code');
			element.textContent = code;
			return Promise.resolve(element);
		};

		test('asyncRenderCallback should be invoked for code blocks', () => {
			const markdown = { value: '```js\n1 + 1;\n```' };
			return new Promise<void>(resolve => {
				renderMarkdown(markdown, {
					asyncRenderCallback: resolve,
					codeBlockRenderer: simpleCodeBlockRenderer
				});
			});
		});

		test('asyncRenderCallback should not be invoked if result is immediately disposed', () => {
			const markdown = { value: '```js\n1 + 1;\n```' };
			return new Promise<void>((resolve, reject) => {
				const result = renderMarkdown(markdown, {
					asyncRenderCallback: reject,
					codeBlockRenderer: simpleCodeBlockRenderer
				});
				result.dispose();
				setTimeout(resolve, 250);
			});
		});

		test('asyncRenderCallback should not be invoked if dispose is called before code block is rendered', () => {
			const markdown = { value: '```js\n1 + 1;\n```' };
			return new Promise<void>((resolve, reject) => {
				let resolveCodeBlockRendering: (x: HTMLElement) => void;
				const result = renderMarkdown(markdown, {
					asyncRenderCallback: reject,
					codeBlockRenderer: () => {
						return new Promise(resolve => {
							resolveCodeBlockRendering = resolve;
						});
					}
				});
				setTimeout(() => {
					result.dispose();
					resolveCodeBlockRendering(document.createElement('code'));
					setTimeout(resolve, 250);
				}, 250);
			});
		});
	});

	suite('ThemeIcons Support On', () => {

		test('render appendText', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendText('$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
		});

		test('render appendMarkdown', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown('$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-zap"></span> $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
		});

		test('render appendMarkdown with escaped icon', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
		});

		test('render icon in link', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown(`[$(zap)-link](#link)`);

			const result: HTMLElement = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p><a data-href="#link" href="" title="#link"><span class="codicon codicon-zap"></span>-link</a></p>`);
		});

		test('render icon in table', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown(`
| text   | text                 |
|--------|----------------------|
| $(zap) | [$(zap)-link](#link) |`);

			const result: HTMLElement = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<table>
<thead>
<tr>
<th>text</th>
<th>text</th>
</tr>
</thead>
<tbody><tr>
<td><span class="codicon codicon-zap"></span></td>
<td><a data-href="#link" href="" title="#link"><span class="codicon codicon-zap"></span>-link</a></td>
</tr>
</tbody></table>
`);
		});
	});

	suite('ThemeIcons Support Off', () => {

		test('render appendText', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: false });
			mds.appendText('$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
		});

		test('render appendMarkdown with escaped icon', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: false });
			mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) $(add)</p>`);
		});
	});

	test('npm Hover Run Script not working #90855', function () {

		const md: IMarkdownString = JSON.parse('{"value":"[Run Script](command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D \\"Run the script as a task\\")","supportThemeIcons":false,"isTrusted":true,"uris":{"__uri_e49443":{"$mid":1,"fsPath":"c:\\\\Users\\\\jrieken\\\\Code\\\\_sample\\\\foo\\\\package.json","_sep":1,"external":"file:///c%3A/Users/jrieken/Code/_sample/foo/package.json","path":"/c:/Users/jrieken/Code/_sample/foo/package.json","scheme":"file"},"command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D":{"$mid":1,"path":"npm.runScriptFromHover","scheme":"command","query":"{\\"documentUri\\":\\"__uri_e49443\\",\\"script\\":\\"echo\\"}"}}}');
		const element = renderMarkdown(md).element;

		const anchor = element.querySelector('a')!;
		assert.ok(anchor);
		assert.ok(anchor.dataset['href']);

		const uri = URI.parse(anchor.dataset['href']!);

		const data = <{ script: string; documentUri: URI }>parse(decodeURIComponent(uri.query));
		assert.ok(data);
		assert.strictEqual(data.script, 'echo');
		assert.ok(data.documentUri.toString().startsWith('file:///c%3A/'));
	});

	test('Should not render command links by default', () => {
		const md = new MarkdownString(`[command1](command:doFoo) <a href="command:doFoo">command2</a>`, {
			supportHtml: true
		});

		const result: HTMLElement = renderMarkdown(md).element;
		assert.strictEqual(result.innerHTML, `<p>command1 command2</p>`);
	});

	test('Should render command links in trusted strings', () => {
		const md = new MarkdownString(`[command1](command:doFoo) <a href="command:doFoo">command2</a>`, {
			isTrusted: true,
			supportHtml: true,
		});

		const result: HTMLElement = renderMarkdown(md).element;
		assert.strictEqual(result.innerHTML, `<p><a data-href="command:doFoo" href="" title="command:doFoo">command1</a> <a data-href="command:doFoo" href="">command2</a></p>`);
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

	suite('supportHtml', () => {
		test('supportHtml is disabled by default', () => {
			const mds = new MarkdownString(undefined, {});
			mds.appendMarkdown('a<b>b</b>c');

			const result = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p>abc</p>`);
		});

		test('Renders html when supportHtml=true', () => {
			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown('a<b>b</b>c');

			const result = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p>a<b>b</b>c</p>`);
		});

		test('Should not include scripts even when supportHtml=true', () => {
			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown('a<b onclick="alert(1)">b</b><script>alert(2)</script>c');

			const result = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p>a<b>b</b>c</p>`);
		});

		test('Should not render html appended as text', () => {
			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendText('a<b>b</b>c');

			const result = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<p>a&lt;b&gt;b&lt;/b&gt;c</p>`);
		});

		test('Should render html images', () => {
			if (isWeb) {
				return;
			}

			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown(`<img src="http://example.com/cat.gif">`);

			const result = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<img src="http://example.com/cat.gif">`);
		});

		test('Should render html images with file uri as same origin uri', () => {
			if (isWeb) {
				return;
			}

			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown(`<img src="file:///images/cat.gif">`);

			const result = renderMarkdown(mds).element;
			assert.strictEqual(result.innerHTML, `<img src="vscode-file://vscode-app/images/cat.gif">`);
		});
	});
});
