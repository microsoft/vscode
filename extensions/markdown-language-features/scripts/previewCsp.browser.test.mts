/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import path from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

const extensionDir = fileURLToPath(new URL('..', import.meta.url));

async function bundle(entry: string): Promise<string> {
	const result = await esbuild.build({
		entryPoints: [path.join(extensionDir, 'preview-src', entry)],
		bundle: true,
		format: 'iife',
		write: false,
		logLevel: 'silent',
	});
	return result.outputFiles[0].text;
}

function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function escapeScript(value: string): string {
	return value.replaceAll('</script', '<\\/script');
}

it('does not run content scripts that carry the preview script nonce', async () => {
	const nonce = 'a1b2c3d4-0000-4000-8000-000000000000';
	const source = 'file:///workspace/README.md';
	const settings = { source, scrollEditorWithPreview: false, disableSecurityWarnings: true, doubleClickToSwitchToEditor: false, webviewResourceRoot: 'https://example.invalid/' };
	const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';`;
	const injected = (marker: string) => `<p>${marker}</p><script nonce="${nonce}">window.injected = (window.injected || []).concat(${JSON.stringify(marker)});</script>`;
	const html = `<!DOCTYPE html>
		<html>
		<head>
			<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
			<meta id="vscode-markdown-preview-data"
				data-settings="${escapeAttribute(JSON.stringify(settings))}"
				data-strings="{}"
				data-state="{}"
				data-initial-md-content="${escapeAttribute(`<div class="markdown-body" dir="auto">${injected('initial')}</div>`)}">
			<script nonce="${nonce}">
				window.acquireVsCodeApi = () => ({ getState: () => undefined, setState: () => { }, postMessage: () => { } });
			</script>
			<script nonce="${nonce}">${escapeScript(await bundle('pre.ts'))}</script>
		</head>
		<body>
			<script async nonce="${nonce}">${escapeScript(await bundle('index.ts'))}</script>
		</body>
		</html>`;

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.setContent(html);
		await page.waitForFunction(() => document.body.textContent?.includes('initial'));

		// Same document: content is reconciled into the existing page.
		await page.evaluate(([source, content]) => window.postMessage({ type: 'updateContent', source, content }, '*'), [source, `<div class="markdown-body" dir="auto">${injected('same document')}</div>`]);
		await page.waitForFunction(() => document.body.textContent?.includes('same document'));
		// Another document: the body is replaced.
		await page.evaluate(([content]) => window.postMessage({ type: 'updateContent', source: 'file:///workspace/other.md', content }, '*'), [`<div class="markdown-body" dir="auto">${injected('other document')}</div>`]);
		await page.waitForFunction(() => document.body.textContent?.includes('other document'));

		assert.deepStrictEqual(await page.evaluate(() => (window as unknown as { injected?: string[] }).injected ?? []), []);
	} finally {
		await browser.close();
	}
});
