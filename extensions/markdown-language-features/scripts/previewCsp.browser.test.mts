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

it('does not expose the CSP nonce to preview content or let content scripts reuse it', async () => {
	const nonce = 'a1b2c3d4-0000-4000-8000-000000000000';
	const source = 'file:///workspace/README.md';
	const probeRules = [...'0123456789abcdef'].map(c => [
		`html:has(meta[content*="'nonce-${c}"]) #leak-meta::after { content: "${c}"; }`,
		`html:has(script[nonce^="${c}"]) #leak-script::after { content: "${c}"; }`,
	].join('\n')).join('\n');
	const initialContent = `<div class="markdown-body" dir="auto"><p>Hello</p><style>${probeRules}</style><p id="leak-meta"></p><p id="leak-script"></p></div>`;
	const settings = { source, scrollEditorWithPreview: false, disableSecurityWarnings: true, doubleClickToSwitchToEditor: false, webviewResourceRoot: 'https://example.invalid/' };
	const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';`;
	const html = `<!DOCTYPE html>
		<html>
		<head>
			<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
			<meta id="vscode-markdown-preview-data"
				data-settings="${escapeAttribute(JSON.stringify(settings))}"
				data-strings="{}"
				data-state="{}"
				data-initial-md-content="${escapeAttribute(initialContent)}">
			<script nonce="${nonce}">
				window.acquireVsCodeApi = () => ({ getState: () => undefined, setState: () => { }, postMessage: () => { } });
				window.cspViolations = [];
				document.addEventListener('securitypolicyviolation', e => window.cspViolations.push(e.effectiveDirective));
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
		await page.waitForFunction(() => document.querySelector('.markdown-body p')?.textContent === 'Hello');

		const injected = (marker: string) => `<p>${marker}</p><script nonce="${nonce}">window.injected = (window.injected || []).concat(${JSON.stringify(marker)});</script>`;
		// Same document: content is reconciled into the existing page.
		await page.evaluate(([source, content]) => window.postMessage({ type: 'updateContent', source, content }, '*'), [source, `<div class="markdown-body" dir="auto"><p>Hello</p>${injected('same document')}</div>`]);
		await page.waitForFunction(() => document.body.textContent?.includes('same document'));
		// Another document: the body is replaced.
		await page.evaluate(([content]) => window.postMessage({ type: 'updateContent', source: 'file:///workspace/other.md', content }, '*'), [`<div class="markdown-body" dir="auto">${injected('other document')}</div>`]);
		await page.waitForFunction(() => document.body.textContent?.includes('other document'));

		assert.deepStrictEqual(await page.evaluate(() => ({
			cspMetaElements: document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length,
			scriptNonceAttributes: document.querySelectorAll('script[nonce]').length,
			injected: (window as unknown as { injected?: string[] }).injected ?? [],
			cspEnforced: (window as unknown as { cspViolations: string[] }).cspViolations.includes('script-src-elem'),
			renderedParagraphs: [...document.querySelectorAll('.markdown-body p')].map(p => p.textContent),
		})), {
			cspMetaElements: 0,
			scriptNonceAttributes: 0,
			injected: [],
			cspEnforced: true,
			renderedParagraphs: ['other document'],
		});

		// Read the CSS probe in the first document, before it was replaced.
		await page.setContent(html);
		await page.waitForFunction(() => document.querySelector('.markdown-body p')?.textContent === 'Hello');
		assert.deepStrictEqual(await page.evaluate(() => ({
			meta: getComputedStyle(document.getElementById('leak-meta')!, '::after').content,
			script: getComputedStyle(document.getElementById('leak-script')!, '::after').content,
		})), { meta: 'none', script: 'none' });
	} finally {
		await browser.close();
	}
});
