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
import type { FromWebviewMessage } from '../types/previewMessaging.d.ts';

declare global {
	interface Window {
		previewMessages: FromWebviewMessage.Type[];
	}
}

it('captures encoded command clicks without changing ordinary link routing, including after refresh', async () => {
	const extensionDir = fileURLToPath(new URL('..', import.meta.url));
	const bundle = async (entry: string) => (await esbuild.build({
		entryPoints: [path.join(extensionDir, 'preview-src', entry)],
		bundle: true,
		format: 'iife',
		write: false,
		logLevel: 'silent',
	})).outputFiles[0].text.replaceAll('</script', '<\\/script');
	const [pre, main] = await Promise.all([bundle('pre.ts'), bundle('index.ts')]);
	const source = 'file:///workspace/commands.md';
	const href = 'command:test.run?%5B%22a+b%22%2C%22%2520%22%5D';
	const content = `<div class="markdown-body">
		<a id="command" href="${href}" data-href="${href}"><strong id="nested">Run</strong></a>
		<a id="uppercase" href="COMMAND:test.run">Run</a>
		<a id="invalid" href="command:test.run?">Invalid</a>
		<a id="file" href="other.md" data-href="other.md">File</a>
		<a id="anchor" href="#section">Anchor</a>
		<a id="external" href="https://example.com">External</a>
		<a id="mail" href="mailto:someone@example.com">Mail</a>
	</div>`;
	const settings = { source, scrollEditorWithPreview: false, disableSecurityWarnings: true, doubleClickToSwitchToEditor: false, webviewResourceRoot: 'https://example.invalid/' };
	const attribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

	// Load the real preview entry points with its normal strict CSP. Only the
	// editor API is replaced, so clicks exercise production DOM/event handling.
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.setContent(`<!DOCTYPE html><html><head>
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-test'; style-src 'unsafe-inline';">
			<meta id="vscode-markdown-preview-data" data-settings="${attribute(JSON.stringify(settings))}"
				data-strings="{}" data-state="{}" data-initial-md-content="${attribute(content)}">
			<script nonce="test">window.previewMessages = []; window.acquireVsCodeApi = () => ({ getState: () => undefined, setState: () => {}, postMessage: message => window.previewMessages.push(message) });</script>
			<script nonce="test">${pre}</script>
			</head><body><script nonce="test">${main}</script></body></html>`);
		await page.waitForSelector('#nested');

		const click = async (id: string) => page.evaluate(id => {
			let prevented = false;
			// Observe cancellation after the preview's capture listener, then cancel
			// default navigation ourselves so ordinary links cannot leave the fixture.
			document.addEventListener('click', event => {
				prevented = event.defaultPrevented;
				event.preventDefault();
			}, { capture: true, once: true });
			document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			return prevented;
		}, id);

		const prevented = [];
		for (const id of ['nested', 'uppercase', 'invalid', 'file', 'anchor', 'external', 'mail']) {
			prevented.push(await click(id));
		}
		// Refresh reuses the webview and its listener; the new link must still use
		// the same command channel with its new, unmodified encoded arguments.
		await page.evaluate(({ source }) => window.postMessage({ type: 'updateContent', source, content: '<div class="markdown-body"><a id="refreshed" href="command:test.next?%5B42%5D">Next</a></div>' }, '*'), { source });
		await page.waitForSelector('#refreshed');
		prevented.push(await click('refreshed'));
		const messages = await page.evaluate(() => window.previewMessages.filter(message => message.type === 'openCommandLink' || message.type === 'openLink'));
		assert.deepEqual({ prevented, messages }, {
			prevented: [true, true, true, true, false, false, false, true],
			messages: [
				{ type: 'openCommandLink', source, href },
				{ type: 'openCommandLink', source, href: 'COMMAND:test.run' },
				{ type: 'openCommandLink', source, href: 'command:test.run?' },
				{ type: 'openLink', source, href: 'other.md' },
				{ type: 'openCommandLink', source, href: 'command:test.next?%5B42%5D' },
			],
		});
	} finally {
		await browser.close();
	}
});
