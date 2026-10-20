/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import { buildMermaidHtml } from './buildMermaidHtml.mts';

it('renders Mermaid with host presentation controls, live source updates, visible errors, and retained iframe identity', async () => {
	const extensionDir = fileURLToPath(new URL('..', import.meta.url));
	const html = await buildMermaidHtml(path.join(extensionDir, 'markdown-editor-src', 'mermaid'));
	const source = '```mermaid\ngraph LR\n A[First] --> B[Second]\n```\n';
	const bundle = await esbuild.build({
		stdin: {
			resolveDir: extensionDir,
			loader: 'ts',
			contents: `
				import { EditorModel, EditorView, StringValue } from '@vscode/markdown-editor';
				import { VirtualizedIframeEmbeddedEditorFactory } from '@vscode/markdown-editor/web-editors';
				import { mermaidProvider } from './markdown-editor-src/mermaid/mermaidProvider';
				const model = new EditorModel();
				model.sourceText.set(new StringValue(${JSON.stringify(source)}), undefined);
				model.presentation.set('reading', undefined);
				let view;
				const factory = new VirtualizedIframeEmbeddedEditorFactory({
					providers: [mermaidProvider],
					scriptNonce: 'mermaid-test',
					onDidChange: () => view?.refreshEmbeddedCodeEditors(),
				});
				view = new EditorView(model, { presentation: 'reading', embeddedCodeEditorFactory: factory });
				view.element.style.maxWidth = '500px';
				document.getElementById('editor').append(view.element);
				window.mermaidTest = {
					setSource: text => model.replaceSourceText(new StringValue(text)),
					getSource: () => model.sourceText.get().value,
				};
			`,
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		external: ['node:fs/promises'],
		plugins: [{
			name: 'mermaid-html',
			setup(build) {
				build.onLoad({ filter: /mermaid\.html$/ }, () => ({ contents: html, loader: 'text' }));
			},
		}],
	});
	const css = await readFile(fileURLToPath(import.meta.resolve('@vscode/markdown-editor/editor.css')), 'utf8');
	const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.route('https://mermaid.test/**', route => route.fulfill(
			route.request().url().endsWith('/test.js')
				? { contentType: 'text/javascript', body: bundle.outputFiles[0].text }
				: {
					contentType: 'text/html',
					body: `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-mermaid-test'; style-src 'unsafe-inline'; frame-src 'self';"><style>${css}</style></head><body><div id="editor"></div><script nonce="mermaid-test" src="/test.js"></script></body></html>`,
				},
		));
		await page.goto('https://mermaid.test/');
		const frame = page.frameLocator('iframe');
		await frame.locator('svg').waitFor();
		assert.match(await frame.locator('svg').textContent() ?? '', /First/);
		await page.locator('iframe').evaluate(element => { element.dataset.identity = 'retained'; });
		const initial = await page.locator('iframe').boundingBox();
		await page.locator('iframe').hover();
		await page.getByRole('button', { name: 'Full width', exact: true }).click();
		await page.waitForFunction(width => document.querySelector('iframe')!.getBoundingClientRect().width > width, initial!.width);
		await page.getByRole('button', { name: 'Full view', exact: true }).click();
		await page.waitForFunction(() => document.querySelector('iframe')!.getBoundingClientRect().height > 600);
		await frame.locator('main').click();
		await page.keyboard.press('Escape');
		await page.waitForFunction(() => document.querySelector('iframe')!.getBoundingClientRect().height < 600);
		assert.equal(await page.locator('iframe').getAttribute('data-identity'), 'retained');
		assert.equal(await page.evaluate(() => window.mermaidTest.getSource()), source);
		const resize = page.getByRole('separator');
		await resize.focus();
		const beforeResize = await page.locator('iframe').boundingBox();
		await page.keyboard.press('ArrowDown');
		await page.waitForFunction(height => document.querySelector('iframe')!.getBoundingClientRect().height > height, beforeResize!.height);
		await page.evaluate(text => window.mermaidTest.setSource(text), source.replace('First', 'Updated'));
		await frame.locator('svg').filter({ hasText: 'Updated' }).waitFor();
		await page.evaluate(() => window.mermaidTest.setSource('```mermaid\nnot a diagram\n```\n'));
		await frame.getByRole('alert').waitFor();
		assert.match(await frame.getByRole('alert').textContent() ?? '', /Failed to render Mermaid diagram/);
		await page.evaluate(text => window.mermaidTest.setSource(text), source);
		await frame.locator('svg').waitFor();
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
	}
});

declare global {
	interface Window {
		mermaidTest: { setSource(text: string): void; getSource(): string };
	}
}
