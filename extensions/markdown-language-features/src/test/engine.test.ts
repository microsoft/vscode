/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { InMemoryDocument } from '../client/inMemoryDocument';
import { ITextDocument } from '../types/textDocument';
import { createNewMarkdownEngine } from './engine';


const testFileName = vscode.Uri.file('test.md');

class MutableDocument implements ITextDocument {

	#contents: string;

	constructor(
		readonly uri: vscode.Uri,
		contents: string,
		public version: number = 0,
	) {
		this.#contents = contents;
	}

	public update(contents: string): void {
		this.#contents = contents;
		this.version++;
	}

	public getText(): string {
		return this.#contents;
	}

	public positionAt(offset: number): vscode.Position {
		return new vscode.Position(0, offset);
	}
}

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

	suite('token caching', () => {
		const settingName = 'preview.typographer';
		const input = '"Hello..." -- it\'s 50 (c)';

		let originalValue: boolean | undefined;

		suiteSetup(() => {
			originalValue = vscode.workspace.getConfiguration('markdown').inspect<boolean>(settingName)?.globalValue;
		});

		suiteTeardown(async () => {
			await vscode.workspace.getConfiguration('markdown').update(settingName, originalValue, vscode.ConfigurationTarget.Global);
		});

		async function setTypographer(enabled: boolean) {
			await vscode.workspace.getConfiguration('markdown').update(settingName, enabled, vscode.ConfigurationTarget.Global);
		}

		test('Reuses cached tokens for the same document instance and version', async () => {
			let parseCount = 0;
			const engine = createNewMarkdownEngine(new Map([
				['parse-counter', Promise.resolve((md: MarkdownIt) => {
					md.core.ruler.push('parse-counter', () => {
						parseCount++;
					});
					return md;
				})],
			]));
			const document = new InMemoryDocument(testFileName, '# cached', 1);

			await engine.render(document);
			await engine.render(document);

			assert.strictEqual(parseCount, 1);
		});

		test('Invalidates cached tokens when a document version changes', async () => {
			const engine = createNewMarkdownEngine();
			const document = new MutableDocument(testFileName, '# first', 1);
			await engine.render(document);

			document.update('# second');

			assert.strictEqual(
				(await engine.render(document)).html,
				'<h1 data-line="0" class="code-line" dir="auto" id="second">second</h1>\n'
			);
		});

		test('Invalidates cached tokens when typographer changes', async () => {
			await setTypographer(false);

			const engine = createNewMarkdownEngine();
			const document = new InMemoryDocument(testFileName, input);
			await engine.render(document);

			await setTypographer(true);

			assert.strictEqual(
				(await engine.render(document)).html,
				'<p data-line="0" class="code-line" dir="auto">“Hello…” – it’s 50 ©</p>\n'
			);
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

		test('Hides frontmatter when style is "hide"', async () => {
			await setStyle('hide');
			const engine = createNewMarkdownEngine();
			assert.strictEqual(
				(await engine.render(input)).html,
				'<h1 data-line="4" class="code-line" dir="auto" id="world">World</h1>\n'
			);
		});

		test('Renders frontmatter as a code block when style is "codeBlock"', async () => {
			await setStyle('codeBlock');
			const engine = createNewMarkdownEngine();
			const html = (await engine.render(input)).html;
			assert.match(html, /<pre[^>]*class="[^"]*frontmatter[^"]*"[^>]*>[\s\S]*<\/pre>/);
			assert.ok(html.includes('title'), `Expected frontmatter content to be rendered. Got: ${html}`);
			assert.ok(html.includes('<h1 data-line="4"'), `Expected body to render after frontmatter. Got: ${html}`);
		});

		test('Renders frontmatter as a table when style is "table"', async () => {
			await setStyle('table');
			const engine = createNewMarkdownEngine();
			assert.strictEqual(
				(await engine.render(input)).html,
				'<table class="frontmatter" title="Frontmatter" data-vscode-context=\'{&quot;webviewSection&quot;:&quot;frontMatter&quot;}\'><tbody><tr><th>title</th><td>Hello</td></tr></tbody></table>\n'
				+ '<h1 data-line="4" class="code-line" dir="auto" id="world">World</h1>\n'
			);
		});

		test('Shows an error when frontmatter has invalid YAML', async () => {
			await setStyle('table');
			const engine = createNewMarkdownEngine();
			const html = (await engine.render('---\nfoo: [unclosed\n---\n\n# Body')).html;
			assert.match(html, /<div class="frontmatter-error"[\s\S]*<\/div>/);
			assert.ok(html.includes('<h1 data-line="4"'), `Expected body to render after error. Got: ${html}`);
		});

		test('Ignores frontmatter that is not at the start of the document', async () => {
			await setStyle('table');
			const engine = createNewMarkdownEngine();
			const html = (await engine.render('# World\n\n---\ntitle: Hello\n---')).html;
			assert.ok(!html.includes('<table class="frontmatter">'), `Expected no frontmatter table. Got: ${html}`);
		});

		test('Ignores frontmatter without a closing delimiter', async () => {
			await setStyle('table');
			const engine = createNewMarkdownEngine();
			const html = (await engine.render('---\ntitle: Hello\n\n# World')).html;
			assert.ok(!html.includes('<table class="frontmatter">'), `Expected no frontmatter table. Got: ${html}`);
		});
	});
});
