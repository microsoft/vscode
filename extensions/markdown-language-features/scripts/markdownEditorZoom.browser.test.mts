/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import path from 'node:path';
import { it, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

const content = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}. ${'Some wrapping text. '.repeat(5)}`).join('\n\n');

async function openEditor(t: TestContext) {
	const initialState = {
		content, readonly: false, lineBreak: '\n', renderWhitespace: false, highlightActiveBlock: true, zoomPercent: 100,
		richLinksEnabled: false, linkPresentationRules: [], taskProgressLabels: { title: 'Tasks', summary: '{0}/{1}', language: 'en' },
	};
	const secret = 'zoom-test';
	const bundle = await esbuild.build({
		stdin: {
			resolveDir: fileURLToPath(new URL('..', import.meta.url)),
			contents: `
				import { HubRpcConnection } from '@vscode/hubrpc';
				import { WebEditorHost } from '@vscode/web-editors';
				import { MarkdownEditorRpcTransport } from './src/preview/markdownEditorRpc';
				import { markdownEditorHost, markdownEditorRenderer } from './src/preview/markdownEditorProtocol';
				let receive;
				const wire = value => JSON.parse(JSON.stringify(value));
				const connection = HubRpcConnection.fromTransport(new MarkdownEditorRpcTransport('${secret}',
					message => window.postMessage(wire(message), '*'), listener => { receive = listener; return { dispose() {} }; }));
				const host = new WebEditorHost({ connection, initialText: ${JSON.stringify(content)} });
				host.onDidChangeText(() => { document.body.dataset.edited = 'true'; });
				const renderer = connection.get(markdownEditorRenderer);
				const start = host.getText().indexOf('Paragraph 30');
				const range = { start, endExclusive: start + 9 };
				connection.register(markdownEditorHost, {
					async ready() {
						renderer.comments({ version: host.version, comments: [{ ...range, id: 'one', body: 'A note' }], acceptsComments: false });
						await renderer.diagnosticsChanged({});
						document.body.dataset.ready = 'true';
					},
					selectionChanged() {}, editorFocusChanged() {}, cancelCompletions() {}, setReadonly() {},
					getDiagnostics() { return { version: host.version, items: [{ ...range, severity: 'warning', message: 'A diagnostic' }] }; },
					completions() { return { items: Array.from({length: 20}, (_, i) => ({ id: String(i), label: 'Item ' + i })), incomplete: false }; },
				});
				window.command = command => renderer.command({ command: 'markdown.editor.' + command });
				window.setZoom = zoomPercent => renderer.configurationChanged({ highlightActiveBlock: true, renderWhitespace: false, lineBreak: '\\n', zoomPercent });
				window.acquireVsCodeApi = () => ({
					postMessage: m => queueMicrotask(() => receive(wire(m))),
					getState: () => JSON.parse(sessionStorage.getItem('pane') ?? '{}'),
					setState: state => sessionStorage.setItem('pane', JSON.stringify(state)),
				});
				import('./markdown-editor-src/editor');
			`,
		},
		bundle: true, outfile: 'editor.js', write: false, format: 'iife', external: ['node:fs/promises'],
		loader: { '.html': 'text', '.woff': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
	});
	const browser = await chromium.launch();
	t.after(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); } });
	const waitForEditor = async () => {
		try {
			await page.locator('body[data-ready]').waitFor({ timeout: 5000 });
		} catch (error) {
			throw new Error(`Editor did not become ready: ${errors.join('\n')}`, { cause: error });
		}
	};
	await page.route('https://zoom.test/**', route => {
		const pathname = new URL(route.request().url()).pathname;
		const asset = pathname === '/' ? undefined : bundle.outputFiles.find(file => path.basename(file.path) === pathname.slice(1));
		if (asset) {
			return route.fulfill({ contentType: pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: asset.text });
		}
		return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
			<meta name="vscode-markdown-editor-message-secret" content="${secret}">
			<meta id="vscode-markdown-editor-initial-state" content="${encodeURIComponent(JSON.stringify(initialState))}">
			<link rel="stylesheet" href="/editor.css"><div id="editor"></div><script src="/editor.js"></script>` });
	});
	await page.goto('https://zoom.test/');
	await waitForEditor();
	const command = (name: string) => page.evaluate(`window.command(${JSON.stringify(name)})`);
	const setZoom = (percent: number) => page.evaluate(`window.setZoom(${JSON.stringify(percent)})`);
	const paragraph = page.locator('.md-paragraph').nth(30);
	const afterLayout = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
	return { page, command, setZoom, paragraph, waitForEditor, afterLayout, errors };
}

it('scales content between 25% and 400%, anchors reflow, and keeps readonly toggle unzoomed', async t => {
	const { page, setZoom, paragraph, afterLayout, errors } = await openEditor(t);
	const scale = () => page.locator('.md-editor-content').evaluate(e => Math.round(e.currentCSSZoom * 100));
	const toggleScale = () => page.locator('button.md-readonly-toggle').evaluate(e => Math.round(e.currentCSSZoom * 100));
	await paragraph.evaluate(e => e.scrollIntoView({ block: 'center' }));
	await setZoom(150);
	assert.deepEqual([await scale(), await toggleScale()], [150, 100]);
	await afterLayout();
	const bounds = await paragraph.boundingBox();
	assert.ok(bounds && bounds.y <= 240 && bounds.y + bounds.height >= 240, `same paragraph at viewport center after reflow: ${JSON.stringify(bounds)}`);

	await setZoom(10);
	assert.equal(await scale(), 25);
	await setZoom(500);
	assert.equal(await scale(), 400);
	await setZoom(100);
	assert.deepEqual([await scale(), await toggleScale(), await page.locator('body[data-edited]').count(), errors], [100, 100, 0, []]);
});

it('keeps diagnostic hovers, comments and suggestions anchored to zoomed text', async t => {
	const { page, command, setZoom, paragraph, afterLayout, errors } = await openEditor(t);
	await setZoom(150);
	const toggle = page.locator('button.md-readonly-toggle');
	await toggle.click();
	assert.equal(await page.locator('.md-editor.md-readonly .md-editor-content').evaluate(e => e.currentCSSZoom), 1.5);
	await toggle.click();
	await afterLayout();
	await paragraph.scrollIntoViewIfNeeded();
	await afterLayout();
	const mark = page.locator('.md-diagnostic-warning');
	const text = await paragraph.boundingBox();
	const underline = await mark.boundingBox();
	const comment = await page.locator('.md-comment-widget').boundingBox();
	assert.ok(text && underline && comment && Math.abs(comment.y - text.y) < 10, 'comment follows its source line');
	const glyphs = await paragraph.evaluate(p => {
		const range = document.createRange();
		range.selectNodeContents(p.firstChild!);
		return range.getClientRects()[0].toJSON();
	});
	const pointer = { x: underline.x + underline.width / 2, y: glyphs.top + 2 };
	await page.mouse.move(pointer.x, pointer.y);
	const hover = page.getByRole('tooltip');
	await hover.waitFor();
	const bubble = await hover.boundingBox();
	assert.ok(bubble && Math.abs(bubble.x - underline.x) < 1 && Math.abs(bubble.y + bubble.height - text.y) < 10, 'hover sits just above the diagnostic');
	await page.mouse.click(underline.x + 1, text.y + 10);
	await command('triggerSuggest');
	const widget = await page.locator('.md-suggest-widget').boundingBox();
	assert.ok(widget && widget.y >= 0 && widget.y + widget.height <= 481, 'suggestions fit inside the viewport');
	assert.deepEqual(errors, []);
});
