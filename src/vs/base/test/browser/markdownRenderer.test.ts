/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { fillInIncompleteTokens, renderMarkdown, renderMarkdownAsPlaintext } from '../../browser/markdownRenderer.js';
import { IMarkdownString, MarkdownString } from '../../common/htmlContent.js';
import * as marked from '../../common/marked/marked.js';
import { parse } from '../../common/marshalling.js';
import { isWeb } from '../../common/platform.js';
import { URI } from '../../common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

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

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('Sanitization', () => {
		test('Should not render images with unknown schemes', () => {
			const markdown = { value: `![image](no-such://example.com/cat.gif)` };
			const result: HTMLElement = store.add(renderMarkdown(markdown)).element;
			assert.strictEqual(result.innerHTML, '<p><img alt="image"></p>');
		});
	});

	suite('Images', () => {
		test('image rendering conforms to default', () => {
			const markdown = { value: `![image](http://example.com/cat.gif 'caption')` };
			const result: HTMLElement = store.add(renderMarkdown(markdown)).element;
			assertNodeEquals(result, '<div><p><img title="caption" alt="image" src="http://example.com/cat.gif"></p></div>');
		});

		test('image rendering conforms to default without title', () => {
			const markdown = { value: `![image](http://example.com/cat.gif)` };
			const result: HTMLElement = store.add(renderMarkdown(markdown)).element;
			assertNodeEquals(result, '<div><p><img alt="image" src="http://example.com/cat.gif"></p></div>');
		});

		test('image width from title params', () => {
			const result: HTMLElement = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|width=100px 'caption')` })).element;
			assertNodeEquals(result, `<div><p><img width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});

		test('image height from title params', () => {
			const result: HTMLElement = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|height=100 'caption')` })).element;
			assertNodeEquals(result, `<div><p><img height="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});

		test('image width and height from title params', () => {
			const result: HTMLElement = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|height=200,width=100 'caption')` })).element;
			assertNodeEquals(result, `<div><p><img height="200" width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
		});

		test('image with file uri should render as same origin uri', () => {
			if (isWeb) {
				return;
			}
			const result: HTMLElement = store.add(renderMarkdown({ value: `![image](file:///images/cat.gif)` })).element;
			assertNodeEquals(result, '<div><p><img src="vscode-file://vscode-app/images/cat.gif" alt="image"></p></div>');
		});
	});

	suite('Code block renderer', () => {
		const simpleCodeBlockRenderer = (lang: string, code: string): Promise<HTMLElement> => {
			const element = document.createElement('code');
			element.textContent = code;
			return Promise.resolve(element);
		};

		test('asyncRenderCallback should be invoked for code blocks', () => {
			const markdown = { value: '```js\n1 + 1;\n```' };
			return new Promise<void>(resolve => {
				store.add(renderMarkdown(markdown, {
					asyncRenderCallback: resolve,
					codeBlockRenderer: simpleCodeBlockRenderer
				}));
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
				setTimeout(resolve, 10);
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
					setTimeout(resolve, 10);
				}, 10);
			});
		});

		test('Code blocks should use leading language id (#157793)', async () => {
			const markdown = { value: '```js some other stuff\n1 + 1;\n```' };
			const lang = await new Promise<string>(resolve => {
				store.add(renderMarkdown(markdown, {
					codeBlockRenderer: async (lang, value) => {
						resolve(lang);
						return simpleCodeBlockRenderer(lang, value);
					}
				}));
			});
			assert.strictEqual(lang, 'js');
		});
	});

	suite('ThemeIcons Support On', () => {

		test('render appendText', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendText('$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
		});

		test('render appendMarkdown', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown('$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-zap"></span> $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
		});

		test('render appendMarkdown with escaped icon', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
		});

		test('render icon in link', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown(`[$(zap)-link](#link)`);

			const result: HTMLElement = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p><a data-href="#link" href="" title="#link" draggable="false"><span class="codicon codicon-zap"></span>-link</a></p>`);
		});

		test('render icon in table', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true });
			mds.appendMarkdown(`
| text   | text                 |
|--------|----------------------|
| $(zap) | [$(zap)-link](#link) |`);

			const result: HTMLElement = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<table>
<thead>
<tr>
<th>text</th>
<th>text</th>
</tr>
</thead>
<tbody><tr>
<td><span class="codicon codicon-zap"></span></td>
<td><a data-href="#link" href="" title="#link" draggable="false"><span class="codicon codicon-zap"></span>-link</a></td>
</tr>
</tbody></table>
`);
		});

		test('render icon in <a> without href (#152170)', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: true, supportHtml: true });
			mds.appendMarkdown(`<a>$(sync)</a>`);

			const result: HTMLElement = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-sync"></span></p>`);
		});
	});

	suite('ThemeIcons Support Off', () => {

		test('render appendText', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: false });
			mds.appendText('$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
		});

		test('render appendMarkdown with escaped icon', () => {
			const mds = new MarkdownString(undefined, { supportThemeIcons: false });
			mds.appendMarkdown('\\$(zap) $(not a theme icon) $(add)');

			const result: HTMLElement = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) $(add)</p>`);
		});
	});

	test('npm Hover Run Script not working #90855', function () {

		const md: IMarkdownString = JSON.parse('{"value":"[Run Script](command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D \\"Run the script as a task\\")","supportThemeIcons":false,"isTrusted":true,"uris":{"__uri_e49443":{"$mid":1,"fsPath":"c:\\\\Users\\\\jrieken\\\\Code\\\\_sample\\\\foo\\\\package.json","_sep":1,"external":"file:///c%3A/Users/jrieken/Code/_sample/foo/package.json","path":"/c:/Users/jrieken/Code/_sample/foo/package.json","scheme":"file"},"command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D":{"$mid":1,"path":"npm.runScriptFromHover","scheme":"command","query":"{\\"documentUri\\":\\"__uri_e49443\\",\\"script\\":\\"echo\\"}"}}}');
		const element = store.add(renderMarkdown(md)).element;

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

		const result: HTMLElement = store.add(renderMarkdown(md)).element;
		assert.strictEqual(result.innerHTML, `<p>command1 command2</p>`);
	});

	test('Should render command links in trusted strings', () => {
		const md = new MarkdownString(`[command1](command:doFoo) <a href="command:doFoo">command2</a>`, {
			isTrusted: true,
			supportHtml: true,
		});

		const result: HTMLElement = store.add(renderMarkdown(md)).element;
		assert.strictEqual(result.innerHTML, `<p><a data-href="command:doFoo" href="" title="command:doFoo" draggable="false">command1</a> <a data-href="command:doFoo" href="">command2</a></p>`);
	});

	suite('PlaintextMarkdownRender', () => {

		test('test code, blockquote, heading, list, listitem, paragraph, table, tablerow, tablecell, strong, em, br, del, text are rendered plaintext', () => {
			const markdown = { value: '`code`\n>quote\n# heading\n- list\n\ntable | table2\n--- | --- \none | two\n\n\nbo**ld**\n_italic_\n~~del~~\nsome text' };
			const expected = 'code\nquote\nheading\nlist\n\ntable table2\none two\nbold\nitalic\ndel\nsome text';
			const result: string = renderMarkdownAsPlaintext(markdown);
			assert.strictEqual(result, expected);
		});

		test('test html, hr, image, link are rendered plaintext', () => {
			const markdown = { value: '<div>html</div>\n\n---\n![image](imageLink)\n[text](textLink)' };
			const expected = 'text';
			const result: string = renderMarkdownAsPlaintext(markdown);
			assert.strictEqual(result, expected);
		});

		test(`Should not remove html inside of code blocks`, () => {
			const markdown = {
				value: [
					'```html',
					'<form>html</form>',
					'```',
				].join('\n')
			};
			const expected = [
				'```',
				'<form>html</form>',
				'```',
			].join('\n');
			const result: string = renderMarkdownAsPlaintext(markdown, true);
			assert.strictEqual(result, expected);
		});
	});

	suite('supportHtml', () => {
		test('supportHtml is disabled by default', () => {
			const mds = new MarkdownString(undefined, {});
			mds.appendMarkdown('a<b>b</b>c');

			const result = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p>abc</p>`);
		});

		test('Renders html when supportHtml=true', () => {
			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown('a<b>b</b>c');

			const result = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p>a<b>b</b>c</p>`);
		});

		test('Should not include scripts even when supportHtml=true', () => {
			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown('a<b onclick="alert(1)">b</b><script>alert(2)</script>c');

			const result = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p>a<b>b</b>c</p>`);
		});

		test('Should not render html appended as text', () => {
			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendText('a<b>b</b>c');

			const result = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<p>a&lt;b&gt;b&lt;/b&gt;c</p>`);
		});

		test('Should render html images', () => {
			if (isWeb) {
				return;
			}

			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown(`<img src="http://example.com/cat.gif">`);

			const result = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<img src="http://example.com/cat.gif">`);
		});

		test('Should render html images with file uri as same origin uri', () => {
			if (isWeb) {
				return;
			}

			const mds = new MarkdownString(undefined, { supportHtml: true });
			mds.appendMarkdown(`<img src="file:///images/cat.gif">`);

			const result = store.add(renderMarkdown(mds)).element;
			assert.strictEqual(result.innerHTML, `<img src="vscode-file://vscode-app/images/cat.gif">`);
		});
	});

	suite('fillInIncompleteTokens', () => {
		function ignoreRaw(...tokenLists: marked.Token[][]): void {
			tokenLists.forEach(tokens => {
				tokens.forEach(t => t.raw = '');
			});
		}

		const completeTable = '| a | b |\n| --- | --- |';

		suite('table', () => {
			test('complete table', () => {
				const tokens = marked.marked.lexer(completeTable);
				const newTokens = fillInIncompleteTokens(tokens);
				assert.equal(newTokens, tokens);
			});

			test('full header only', () => {
				const incompleteTable = '| a | b |';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(completeTable);

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('full header only with trailing space', () => {
				const incompleteTable = '| a | b | ';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(completeTable);

				const newTokens = fillInIncompleteTokens(tokens);
				if (newTokens) {
					ignoreRaw(newTokens, completeTableTokens);
				}
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('incomplete header', () => {
				const incompleteTable = '| a | b';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(completeTable);

				const newTokens = fillInIncompleteTokens(tokens);

				if (newTokens) {
					ignoreRaw(newTokens, completeTableTokens);
				}
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('incomplete header one column', () => {
				const incompleteTable = '| a ';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(incompleteTable + '|\n| --- |');

				const newTokens = fillInIncompleteTokens(tokens);

				if (newTokens) {
					ignoreRaw(newTokens, completeTableTokens);
				}
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('full header with extras', () => {
				const incompleteTable = '| a **bold** | b _italics_ |';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(incompleteTable + '\n| --- | --- |');

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('full header with leading text', () => {
				// Parsing this gives one token and one 'text' subtoken
				const incompleteTable = 'here is a table\n| a | b |';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(incompleteTable + '\n| --- | --- |');

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('full header with leading other stuff', () => {
				// Parsing this gives one token and one 'text' subtoken
				const incompleteTable = '```js\nconst xyz = 123;\n```\n| a | b |';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(incompleteTable + '\n| --- | --- |');

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('full header with incomplete separator', () => {
				const incompleteTable = '| a | b |\n| ---';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(completeTable);

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('full header with incomplete separator 2', () => {
				const incompleteTable = '| a | b |\n| --- |';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(completeTable);

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('full header with incomplete separator 3', () => {
				const incompleteTable = '| a | b |\n|';
				const tokens = marked.marked.lexer(incompleteTable);
				const completeTableTokens = marked.marked.lexer(completeTable);

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, completeTableTokens);
			});

			test('not a table', () => {
				const incompleteTable = '| a | b |\nsome text';
				const tokens = marked.marked.lexer(incompleteTable);

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, tokens);
			});

			test('not a table 2', () => {
				const incompleteTable = '| a | b |\n| --- |\nsome text';
				const tokens = marked.marked.lexer(incompleteTable);

				const newTokens = fillInIncompleteTokens(tokens);
				assert.deepStrictEqual(newTokens, tokens);
			});
		});

		function simpleMarkdownTestSuite(name: string, delimiter: string): void {
			test(`incomplete ${name}`, () => {
				const incomplete = `${delimiter}code`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + delimiter);
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test(`complete ${name}`, () => {
				const text = `leading text ${delimiter}code${delimiter} trailing text`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});

			test(`${name} with leading text`, () => {
				const incomplete = `some text and ${delimiter}some code`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + delimiter);
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test(`single loose "${delimiter}"`, () => {
				const text = `some text and ${delimiter}by itself\nmore text here`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});

			test(`incomplete ${name} after newline`, () => {
				const text = `some text\nmore text here and ${delimiter}text`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + delimiter);
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test(`incomplete after complete ${name}`, () => {
				const text = `leading text ${delimiter}code${delimiter} trailing text and ${delimiter}another`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + delimiter);
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test(`incomplete ${name} in list`, () => {
				const text = `- list item one\n- list item two and ${delimiter}text`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + delimiter);
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test(`incomplete ${name} in asterisk list`, () => {
				const text = `* list item one\n* list item two and ${delimiter}text`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + delimiter);
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test(`incomplete ${name} in numbered list`, () => {
				const text = `1. list item one\n2. list item two and ${delimiter}text`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + delimiter);
				assert.deepStrictEqual(newTokens, completeTokens);
			});
		}

		suite('list', () => {
			test('list with complete codeblock', () => {
				const list = `-
	\`\`\`js
	let x = 1;
	\`\`\`
- list item two
`;
				const tokens = marked.marked.lexer(list);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});

			test.skip('list with incomplete codeblock', () => {
				const incomplete = `- list item one

	\`\`\`js
	let x = 1;`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '\n	```');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('list with subitems', () => {
				const list = `- hello
	- sub item
- text
	newline for some reason
`;
				const tokens = marked.marked.lexer(list);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});

			test('ordered list with subitems', () => {
				const list = `1. hello
	- sub item
2. text
	newline for some reason
`;
				const tokens = marked.marked.lexer(list);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});

			test('list with stuff', () => {
				const list = `- list item one \`codespan\` **bold** [link](http://microsoft.com) more text`;
				const tokens = marked.marked.lexer(list);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});

			test('list with incomplete link text', () => {
				const incomplete = `- list item one
- item two [link`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '](https://microsoft.com)');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('list with incomplete link target', () => {
				const incomplete = `- list item one
- item two [link](`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + ')');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('ordered list with incomplete link target', () => {
				const incomplete = `1. list item one
2. item two [link](`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + ')');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('ordered list with extra whitespace', () => {
				const incomplete = `1. list item one
2. item two [link](`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + ')');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('list with extra whitespace', () => {
				const incomplete = `- list item one
- item two [link](`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + ')');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('list with incomplete link with other stuff', () => {
				const incomplete = `- list item one
- item two [\`link`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '\`](https://microsoft.com)');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('ordered list with incomplete link with other stuff', () => {
				const incomplete = `1. list item one
1. item two [\`link`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '\`](https://microsoft.com)');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('list with incomplete subitem', () => {
				const incomplete = `1. list item one
	- `;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '&nbsp;');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('list with incomplete nested subitem', () => {
				const incomplete = `1. list item one
	- item 2
		- `;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '&nbsp;');
				assert.deepStrictEqual(newTokens, completeTokens);
			});
		});

		suite('codespan', () => {
			simpleMarkdownTestSuite('codespan', '`');

			test(`backtick between letters`, () => {
				const text = 'a`b';
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeCodespanTokens = marked.marked.lexer(text + '`');
				assert.deepStrictEqual(newTokens, completeCodespanTokens);
			});

			test(`nested pattern`, () => {
				const text = 'sldkfjsd `abc __def__ ghi';
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + '`');
				assert.deepStrictEqual(newTokens, completeTokens);
			});
		});

		suite('star', () => {
			simpleMarkdownTestSuite('star', '*');

			test(`star between letters`, () => {
				const text = 'sldkfjsd a*b';
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + '*');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test(`nested pattern`, () => {
				const text = 'sldkfjsd *abc __def__ ghi';
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + '*');
				assert.deepStrictEqual(newTokens, completeTokens);
			});
		});

		suite('double star', () => {
			simpleMarkdownTestSuite('double star', '**');

			test(`double star between letters`, () => {
				const text = 'a**b';
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(text + '**');
				assert.deepStrictEqual(newTokens, completeTokens);
			});
		});

		suite('underscore', () => {
			simpleMarkdownTestSuite('underscore', '_');

			test(`underscore between letters`, () => {
				const text = `this_not_italics`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});
		});

		suite('double underscore', () => {
			simpleMarkdownTestSuite('double underscore', '__');

			test(`double underscore between letters`, () => {
				const text = `this__not__bold`;
				const tokens = marked.marked.lexer(text);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});
		});

		suite('link', () => {
			test('incomplete link text', () => {
				const incomplete = 'abc [text';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '](https://microsoft.com)');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('incomplete link target', () => {
				const incomplete = 'foo [text](http://microsoft';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + ')');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('incomplete link target 2', () => {
				const incomplete = 'foo [text](http://microsoft.com';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + ')');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('incomplete link target with extra stuff', () => {
				const incomplete = '[before `text` after](http://microsoft.com';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + ')');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('incomplete link target with extra stuff and incomplete arg', () => {
				const incomplete = '[before `text` after](http://microsoft.com "more text ';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '")');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('incomplete link target with incomplete arg', () => {
				const incomplete = 'foo [text](http://microsoft.com "more text here ';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '")');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('incomplete link target with incomplete arg 2', () => {
				const incomplete = '[text](command:_github.copilot.openRelativePath "arg';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '")');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('incomplete link target with complete arg', () => {
				const incomplete = 'foo [text](http://microsoft.com "more text here"';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + ')');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('link text with incomplete codespan', () => {
				const incomplete = `text [\`codespan`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '`](https://microsoft.com)');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('link text with incomplete stuff', () => {
				const incomplete = `text [more text \`codespan\` text **bold`;
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '**](https://microsoft.com)');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('Looks like incomplete link target but isn\'t', () => {
				const complete = '**bold** `codespan` text](';
				const tokens = marked.marked.lexer(complete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(complete);
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test.skip('incomplete link in list', () => {
				const incomplete = '- [text';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				const completeTokens = marked.marked.lexer(incomplete + '](https://microsoft.com)');
				assert.deepStrictEqual(newTokens, completeTokens);
			});

			test('square brace between letters', () => {
				const incomplete = 'a[b';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});

			test('square brace on previous line', () => {
				const incomplete = 'text[\nmore text';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});

			test('complete link', () => {
				const incomplete = 'text [link](http://microsoft.com)';
				const tokens = marked.marked.lexer(incomplete);
				const newTokens = fillInIncompleteTokens(tokens);

				assert.deepStrictEqual(newTokens, tokens);
			});
		});
	});
});
