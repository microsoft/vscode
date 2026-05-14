/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { InMemoryDocument } from '../client/inMemoryDocument';
import { createNewMarkdownEngine } from './engine';


const testFileName = vscode.Uri.file('test.md');

suite('markdown.engine', () => {
	suite('rendering', () => {
		const input = '# hello\n\nworld!';
		const output = '<h1 data-line="0" class="code-line" dir="auto" id="hello">hello</h1>\n'
			+ '<p data-line="2" class="code-line" dir="auto">world!</p>\n';

		test('Renders a document', async () => {
			const doc = new InMemoryDocument(testFileName, input);
			const engine = createNewMarkdownEngine();
			assert.strictEqual((await engine.render(doc)).html, output);
		});

		test('Renders a string', async () => {
			const engine = createNewMarkdownEngine();
			assert.strictEqual((await engine.render(input)).html, output);
		});
	});

	suite('image-caching', () => {
		const input = '![](img.png) [](no-img.png) ![](http://example.org/img.png) ![](img.png) ![](./img2.png)';

		test('Extracts all images', async () => {
			const engine = createNewMarkdownEngine();
			const result = await engine.render(input);
			assert.deepStrictEqual(result.html,
				'<p data-line="0" class="code-line" dir="auto">'
				+ '<img src="img.png" alt="" data-src="img.png"> '
				+ '<a href="no-img.png" data-href="no-img.png"></a> '
				+ '<img src="http://example.org/img.png" alt="" data-src="http://example.org/img.png"> '
				+ '<img src="img.png" alt="" data-src="img.png"> '
				+ '<img src="./img2.png" alt="" data-src="./img2.png">'
				+ '</p>\n'
			);

			assert.deepStrictEqual([...result.containingImages], ['img.png', 'http://example.org/img.png', './img2.png']);
		});
	});

	suite('front-matter', () => {
		const settingName = 'preview.frontMatter';
		const input = '---\ntitle: Hello\n---\n\n# World';

		let originalValue: string | undefined;

		suiteSetup(() => {
			originalValue = vscode.workspace.getConfiguration('markdown').inspect<string>(settingName)?.globalValue;
		});

		suiteTeardown(async () => {
			await vscode.workspace.getConfiguration('markdown').update(settingName, originalValue, vscode.ConfigurationTarget.Global);
		});

		async function setStyle(style: string) {
			await vscode.workspace.getConfiguration('markdown').update(settingName, style, vscode.ConfigurationTarget.Global);
		}

		test('Hides front matter when style is "hide"', async () => {
			await setStyle('hide');
			const engine = createNewMarkdownEngine();
			assert.strictEqual(
				(await engine.render(input)).html,
				'<h1 data-line="4" class="code-line" dir="auto" id="world">World</h1>\n'
			);
		});

		test('Renders front matter as a code block when style is "codeBlock"', async () => {
			await setStyle('codeBlock');
			const engine = createNewMarkdownEngine();
			const html = (await engine.render(input)).html;
			assert.match(html, /<pre[^>]*class="[^"]*frontmatter[^"]*"[^>]*>[\s\S]*<\/pre>/);
			assert.ok(html.includes('title'), `Expected front matter content to be rendered. Got: ${html}`);
			assert.ok(html.includes('<h1 data-line="4"'), `Expected body to render after front matter. Got: ${html}`);
		});

		test('Renders front matter as a table when style is "table"', async () => {
			await setStyle('table');
			const engine = createNewMarkdownEngine();
			assert.strictEqual(
				(await engine.render(input)).html,
				'<table class="frontmatter" title="Frontmatter" data-vscode-context=\'{&quot;webviewSection&quot;:&quot;frontMatter&quot;}\'><tbody><tr><th>title</th><td>Hello</td></tr></tbody></table>\n'
				+ '<h1 data-line="4" class="code-line" dir="auto" id="world">World</h1>\n'
			);
		});

		test('Shows an error when front matter has invalid YAML', async () => {
			await setStyle('table');
			const engine = createNewMarkdownEngine();
			const html = (await engine.render('---\nfoo: [unclosed\n---\n\n# Body')).html;
			assert.match(html, /<div class="frontmatter-error"[\s\S]*<\/div>/);
			assert.ok(html.includes('<h1 data-line="4"'), `Expected body to render after error. Got: ${html}`);
		});

		test('Ignores front matter that is not at the start of the document', async () => {
			await setStyle('table');
			const engine = createNewMarkdownEngine();
			const html = (await engine.render('# World\n\n---\ntitle: Hello\n---')).html;
			assert.ok(!html.includes('<table class="frontmatter">'), `Expected no front matter table. Got: ${html}`);
		});

		test('Ignores front matter without a closing delimiter', async () => {
			await setStyle('table');
			const engine = createNewMarkdownEngine();
			const html = (await engine.render('---\ntitle: Hello\n\n# World')).html;
			assert.ok(!html.includes('<table class="frontmatter">'), `Expected no front matter table. Got: ${html}`);
		});
	});
});
