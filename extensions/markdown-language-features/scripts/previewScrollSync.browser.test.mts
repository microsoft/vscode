/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Runs the Markdown preview with the Mermaid extension's markdown-it plugin and preview script, the way a preview of a
// document with a diagram does. Run with `node --test scripts/previewScrollSync.browser.test.mts` from this
// extension's directory.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';
import esbuild from 'esbuild';
import MarkdownIt from 'markdown-it';
import { chromium } from 'playwright';
import { extendMarkdownItWithMermaid } from '../../mermaid-markdown-features/src/markdownMermaid/markdownIt.ts';

const extensionDir = path.join(import.meta.dirname, '..');
const mermaidExtensionDir = path.join(extensionDir, '..', 'mermaid-markdown-features');

const paragraph = 'An adjacency list pairs every node of a graph with the nodes that are next to it, which makes it a compact way to store a graph that has few edges.';
const markdown = [
	'# Graph formats',
	'',
	'## Adjacency lists',
	paragraph,
	'',
	'```json',
	'{',
	'    "a": ["b", "c"],',
	'    "b": ["a", "d"],',
	'    "c": ["a", "d"]',
	'}',
	'```',
	'',
	'That is this graph:',
	'',
	'```mermaid',
	'graph LR',
	'',
	'A((a)) <--> B',
	'A((a)) <--> C',
	'B((b)) --> D',
	'C((c)) --> D',
	'D((d)) --> A',
	'```',
	'',
	paragraph,
	'',
	'## Text format',
	paragraph,
	'',
	'> Weights and colors are not supported.',
	'',
	'```',
	'A -> B',
	'A -- B',
	'A -> [B, C, D]',
	'```',
	'',
	'The parser is described later.',
].join('\n');

function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function escapeScript(value: string): string {
	return value.replaceAll('</script', '<\\/script');
}

async function bundlePreviewScript(entry: string): Promise<string> {
	const result = await esbuild.build({
		entryPoints: [path.join(extensionDir, 'preview-src', entry)],
		bundle: true,
		format: 'iife',
		write: false,
		logLevel: 'silent',
	});
	return result.outputFiles[0].text;
}

it('does not scroll the editor or the preview when content with a Mermaid diagram updates', async () => {
	// The preview's markdown-it adds the source line of every block, see `pluginSourceMap` in `markdownEngine.ts`.
	const md = extendMarkdownItWithMermaid(new MarkdownIt({ html: true }), { languageIds: () => ['mermaid'] });
	md.core.ruler.push('source_map_data_attribute', state => {
		for (const token of state.tokens) {
			if (token.map && token.type !== 'inline') {
				token.attrSet('data-line', String(token.map[0]));
				token.attrJoin('class', 'code-line');
			}
		}
	});
	const render = (text: string) => `<div class="markdown-body" dir="auto">${md.render(text)}</div>`;

	// The Mermaid preview script ships as an ES module that is split into chunks, so it renders over several tasks.
	const mermaidScript = await esbuild.build({
		entryPoints: { index: path.join(mermaidExtensionDir, 'preview-src', 'markdown', 'index.ts') },
		bundle: true,
		format: 'esm',
		platform: 'browser',
		splitting: true,
		write: false,
		outdir: path.join(mermaidExtensionDir, 'markdown-preview-out'),
		logLevel: 'silent',
		loader: { '.ttf': 'dataurl', '.css': 'text' },
	});
	const scripts = new Map(mermaidScript.outputFiles.map(file => [`/mermaid/${path.basename(file.path)}`, file.text]));

	const source = 'file:///workspace/README.md';
	const settings = { source, line: 0, scrollPreviewWithEditor: true, scrollEditorWithPreview: true, disableSecurityWarnings: true, doubleClickToSwitchToEditor: false, webviewResourceRoot: 'https://example.invalid/' };
	const html = `<!DOCTYPE html>
		<html>
		<head>
			<meta id="vscode-markdown-preview-data"
				data-settings="${escapeAttribute(JSON.stringify(settings))}"
				data-strings="{}"
				data-state="{}"
				data-initial-md-content="${escapeAttribute(render(markdown))}">
			<style>${fs.readFileSync(path.join(extensionDir, 'media', 'markdown.css'), 'utf8')}</style>
			<script>
				window.revealedLines = [];
				window.contentUpdates = 0;
				window.addEventListener('vscode.markdown.updateContent', () => window.contentUpdates++);
				window.acquireVsCodeApi = () => ({ getState: () => undefined, setState: () => { }, postMessage: message => { if (message.type === 'revealLine') { window.revealedLines.push(message.line); } } });
			</script>
			<script>${escapeScript(await bundlePreviewScript('pre.ts'))}</script>
		</head>
		<body class="vscode-body scrollBeyondLastLine">
			<script>${escapeScript(await bundlePreviewScript('index.ts'))}</script>
			<script async type="module" src="/mermaid/index.js"></script>
		</body>
		</html>`;

	const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
		await page.route('https://preview.test/**', route => {
			const pathname = new URL(route.request().url()).pathname;
			const script = scripts.get(pathname);
			return script !== undefined ? route.fulfill({ contentType: 'text/javascript', body: script })
				: pathname === '/' ? route.fulfill({ contentType: 'text/html', body: html })
					: route.fulfill({ status: 404 });
		});
		await page.goto('https://preview.test/');
		await page.locator('.mermaid svg').waitFor();
		// Scroll reporting resumes 200ms after the content settles, and scroll events are throttled by 50ms.
		const settle = () => page.waitForTimeout(400);
		const takeRevealedLines = () => page.evaluate(() => window.revealedLines.splice(0).map(Math.round));
		let contentUpdates = 0;
		const updateContent = async (text: string, rendersDiagram = true) => {
			await page.evaluate(([source, content]) => window.postMessage({ type: 'updateContent', source, content }, '*'), [source, render(text)]);
			await page.waitForFunction(count => window.contentUpdates === count, ++contentUpdates);
			if (rendersDiagram) {
				await page.locator('.mermaid-wrapper svg').waitFor();
			}
			await settle();
		};
		await settle();

		const edits = {
			'below the diagram': [`${markdown} One`, `${markdown} One two`, `${markdown} One two three`],
			// The diagram gets taller, then is as tall as before again.
			'in the diagram': [markdown.replace('graph LR', 'graph TD'), markdown],
		};
		const typing = [];
		for (const { topLine, edit } of [
			// The top of the editor, and so of the preview, is inside the diagram.
			{ topLine: 20, edit: 'below the diagram' },
			{ topLine: 26, edit: 'below the diagram' },
			{ topLine: 26, edit: 'in the diagram' },
		] as const) {
			await page.evaluate(([source, line]) => window.postMessage({ type: 'updateView', source, line }, '*'), [source, topLine] as const);
			await settle();
			const scrollY = await page.evaluate(() => window.scrollY);
			await takeRevealedLines();
			for (const text of edits[edit]) {
				await updateContent(text);
			}
			typing.push({ topLine, edit, previewScrolled: await page.evaluate(() => window.scrollY) - scrollY, revealedLines: await takeRevealedLines() });
		}

		// Scrolling the preview up from line 26 still scrolls the editor.
		await page.mouse.move(300, 200);
		await page.mouse.wheel(0, -200);
		await page.waitForFunction(() => window.revealedLines.length > 0);
		await settle();
		const scrolledEditorUp = (await takeRevealedLines()).at(-1)! < 26;

		// A diagram block that no longer has a diagram does not keep the diagram's height.
		await updateContent(markdown.replace(/graph LR[^`]*/, ''), false);
		const emptyDiagramHeight = await page.locator('.mermaid').evaluate(element => element.getBoundingClientRect().height);

		assert.deepStrictEqual({ typing, scrolledEditorUp, emptyDiagramHeight }, {
			typing: [
				{ topLine: 20, edit: 'below the diagram', previewScrolled: 0, revealedLines: [] },
				{ topLine: 26, edit: 'below the diagram', previewScrolled: 0, revealedLines: [] },
				{ topLine: 26, edit: 'in the diagram', previewScrolled: 0, revealedLines: [] },
			],
			scrolledEditorUp: true,
			emptyDiagramHeight: 0,
		});
	} finally {
		await browser.close();
	}
});

declare global {
	interface Window {
		revealedLines: number[];
		contentUpdates: number;
		acquireVsCodeApi: () => unknown;
	}
}
