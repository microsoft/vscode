/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Hosts the Mermaid code block editor the way the Markdown editor does: a web editor protocol host, theme
// CSS injected into the page's head, and a frame sized to the reported height.
// Run with `node --test scripts/markdownEditor.browser.test.mts` from this extension's directory.

import assert from 'node:assert/strict';
import path from 'node:path';
import { it } from 'node:test';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import { renderMermaidEditorHtml } from '../src/markdownEditor/editorHtml.ts';

const extensionDir = path.join(import.meta.dirname, '..');

const themes = {
	light: '--vscode-editor-background: #ffffff; --vscode-editorWidget-background: #f8f8f8; --vscode-editor-foreground: #3b3b3b; --vscode-errorForeground: #f85149; color-scheme: light;',
	dark: '--vscode-editor-background: #1f1f1f; --vscode-editorWidget-background: #202020; --vscode-editor-foreground: #cccccc; --vscode-errorForeground: #f85149; color-scheme: dark;',
};

it('renders diagrams at their natural size in the VS Code theme, and follows edits, theme changes, and errors', async () => {
	const build = (contents: string) => esbuild.build({
		stdin: { contents, resolveDir: extensionDir, loader: 'ts' },
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		loader: { '.ttf': 'dataurl', '.css': 'text' },
	});
	const [guest, host] = await Promise.all([
		build(`import './preview-src/markdownEditor/index';`),
		build(`
			import { HubRpcConnection, WindowMessageTransport } from '@vscode/hubrpc/web';
			import { WebEditorHost } from '@vscode/web-editors';
			const frame = document.querySelector('iframe');
			const host = new WebEditorHost({
				connection: HubRpcConnection.fromTransport(new WindowMessageTransport(window, frame.contentWindow, true)),
				initialText: 'flowchart LR\\n A[First] --> B[Second]',
			});
			const reportedHeights = [];
			host.onDidReportSize(({ height }) => { reportedHeights.push(height); frame.style.height = height + 'px'; });
			window.mermaidTest = { setText: text => host.setText(text), reportedHeights };
		`),
	]);
	const editorHtml = renderMermaidEditorHtml('').replace('<head>', `<head><style data-theme>html:root { ${themes.light} }</style>`);

	const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.route('https://mermaid.test/**', route => {
			const url = route.request().url();
			const body = url.endsWith('/editor/index.html') ? editorHtml
				: url.endsWith('/editor/index.js') ? guest.outputFiles[0].text
					: url.endsWith('/host.js') ? host.outputFiles[0].text
						: `<html><body style="margin: 0"><iframe src="/editor/index.html" style="width: 800px; height: 150px; border: none; display: block"></iframe><script type="module" src="/host.js"></script></body></html>`;
			return route.fulfill({ contentType: url.endsWith('.js') ? 'text/javascript' : 'text/html', body });
		});
		await page.goto('https://mermaid.test/');
		const frame = page.frames().find(f => f.url().endsWith('/editor/index.html'))!;
		const nodeFill = () => frame.locator('.node rect').first().evaluate(rect => getComputedStyle(rect).fill);
		await frame.locator('svg').filter({ hasText: 'First' }).waitFor();

		// Natural size: a small diagram stays narrower than the frame, and the frame follows its height without scrolling.
		await page.waitForFunction(() => window.mermaidTest.reportedHeights.length > 0);
		const layout = await frame.evaluate(() => ({
			svgWidth: document.querySelector('svg')!.getBoundingClientRect().width,
			frameWidth: document.documentElement.clientWidth,
			frameHeight: document.documentElement.clientHeight,
			svgHeight: document.querySelector('svg')!.getBoundingClientRect().height,
			scrolls: document.body.scrollHeight > document.body.clientHeight,
		}));
		assert.ok(layout.svgWidth < layout.frameWidth, JSON.stringify(layout));
		assert.ok(Math.abs(layout.frameHeight - layout.svgHeight) < 1, JSON.stringify(layout));
		assert.equal(layout.scrolls, false);

		// The VS Code theme mapping: nodes use the widget background, and a theme change renders again.
		assert.equal(await nodeFill(), 'rgb(248, 248, 248)');
		await frame.evaluate(css => { document.querySelector('style[data-theme]')!.textContent = `html:root { ${css} }`; }, themes.dark);
		await frame.waitForFunction(() => getComputedStyle(document.querySelector('.node rect')!).fill === 'rgb(32, 32, 32)');
		assert.equal(await frame.evaluate(() => document.body.classList.contains('vscode-dark')), true);

		await page.evaluate(() => window.mermaidTest.setText('flowchart LR\n A[Updated] --> B[Second]'));
		await frame.locator('svg').filter({ hasText: 'Updated' }).waitFor();
		await page.evaluate(() => window.mermaidTest.setText('not a diagram'));
		await frame.getByRole('alert').waitFor();
		assert.match(await frame.getByRole('alert').textContent() ?? '', /\S/);
		await page.evaluate(() => window.mermaidTest.setText('flowchart LR\n A[Recovered] --> B[Second]'));
		await frame.locator('svg').filter({ hasText: 'Recovered' }).waitFor();
		assert.deepEqual(errors, []);
	} finally {
		await browser.close();
	}
});

declare global {
	interface Window {
		mermaidTest: { setText(text: string): void; reportedHeights: number[] };
	}
}
