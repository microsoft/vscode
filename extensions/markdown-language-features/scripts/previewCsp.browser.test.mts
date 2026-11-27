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

const nonce = 'a1b2c3d4-0000-4000-8000-000000000000';
const source = 'file:///workspace/README.md';

/** A preview page like the one `MdDocumentRenderer` renders, showing `initialContent`. */
async function previewHtml(initialContent: string): Promise<string> {
	const settings = { source, scrollEditorWithPreview: false, disableSecurityWarnings: true, doubleClickToSwitchToEditor: false, webviewResourceRoot: 'https://example.invalid/' };
	const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';`;
	return `<!DOCTYPE html>
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
			</script>
			<script nonce="${nonce}">${escapeScript(await bundle('pre.ts'))}</script>
		</head>
		<body>
			<script async nonce="${nonce}">${escapeScript(await bundle('index.ts'))}</script>
		</body>
		</html>`;
}

it('does not run content scripts that carry the preview script nonce', async () => {
	const injected = (marker: string) => `<p>${marker}</p><script nonce="${nonce}">window.injected = (window.injected || []).concat(${JSON.stringify(marker)});</script>`;
	const html = await previewHtml(`<div class="markdown-body">${injected('initial')}</div>`);

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.setContent(html);
		await page.waitForFunction(() => document.body.textContent?.includes('initial'));

		// Same document: content is reconciled into the existing page.
		await page.evaluate(([source, content]) => window.postMessage({ type: 'updateContent', source, content }, '*'), [source, `<div class="markdown-body">${injected('same document')}</div>`]);
		await page.waitForFunction(() => document.body.textContent?.includes('same document'));
		// Another document: the body is replaced.
		await page.evaluate(([content]) => window.postMessage({ type: 'updateContent', source: 'file:///workspace/other.md', content }, '*'), [`<div class="markdown-body">${injected('other document')}</div>`]);
		await page.waitForFunction(() => document.body.textContent?.includes('other document'));

		assert.deepStrictEqual(await page.evaluate(() => (window as unknown as { injected?: string[] }).injected ?? []), []);
	} finally {
		await browser.close();
	}
});

it('takes the direction of the preview root from its content', async () => {
	const rightToLeft = (marker: string) => `<div class="markdown-body"><p>שלום ${marker}</p></div>`;

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.setContent(await previewHtml(rightToLeft('initial')));
		await page.waitForFunction(() => document.body.textContent?.includes('initial'));
		const rootDirection = () => page.evaluate(() => document.querySelector('.markdown-body')!.matches(':dir(rtl)') ? 'rtl' : 'ltr');
		const directions = [await rootDirection()];

		// Same document: content is reconciled into the existing page.
		await page.evaluate(([source, content]) => window.postMessage({ type: 'updateContent', source, content }, '*'), [source, rightToLeft('same document')]);
		await page.waitForFunction(() => document.body.textContent?.includes('same document'));
		directions.push(await rootDirection());
		// Another document: the body is replaced.
		await page.evaluate(([content]) => window.postMessage({ type: 'updateContent', source: 'file:///workspace/other.md', content }, '*'), [rightToLeft('other document')]);
		await page.waitForFunction(() => document.body.textContent?.includes('other document'));
		directions.push(await rootDirection());

		assert.deepStrictEqual(directions, ['rtl', 'rtl', 'rtl']);
	} finally {
		await browser.close();
	}
});

it('keeps code block copy buttons across in-place updates', async () => {
	const codeBlocks = (...texts: string[]) => `<div class="markdown-body">${texts.map(text => `<pre><code class="code-line" dir="auto">${text}</code></pre>`).join('')}</div>`;

	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		const update = (content: string) => page.evaluate(([source, content]) => window.postMessage({ type: 'updateContent', source, content }, '*'), [source, content]);
		const buttons = () => page.evaluate(() => {
			const first = document.querySelector('pre .code-block-copy-button');
			return {
				buttonsPerBlock: [...document.querySelectorAll('pre')].map(pre => pre.querySelectorAll('.code-block-copy-button').length),
				firstButtonKept: !!first && first === (window as unknown as { firstButton?: Element }).firstButton,
			};
		});

		await page.setContent(await previewHtml(codeBlocks('one')));
		await page.waitForFunction(() => !!document.querySelector('pre .code-block-copy-button'));
		await page.evaluate(() => { (window as unknown as { firstButton?: Element }).firstButton = document.querySelector('pre .code-block-copy-button')!; });

		// Change the first code block and add another one
		await update(codeBlocks('one changed', 'two'));
		await page.waitForFunction(() => document.body.textContent?.includes('two'));
		const afterAdd = await buttons();

		// Remove the second code block
		await update(codeBlocks('one changed'));
		await page.waitForFunction(() => !document.body.textContent?.includes('two'));
		const afterRemove = await buttons();

		assert.deepStrictEqual({ afterAdd, afterRemove }, {
			afterAdd: { buttonsPerBlock: [1, 1], firstButtonKept: true },
			afterRemove: { buttonsPerBlock: [1], firstButtonKept: true },
		});
	} finally {
		await browser.close();
	}
});
