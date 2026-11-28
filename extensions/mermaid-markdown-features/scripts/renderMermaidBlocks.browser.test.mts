/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Runs the renderer for Mermaid blocks that the Markdown preview, notebooks and the Markdown editor share.
// Run with `node --test scripts/renderMermaidBlocks.browser.test.mts` from this extension's directory.

import assert from 'node:assert/strict';
import path from 'node:path';
import { it } from 'node:test';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

const extensionDir = path.join(import.meta.dirname, '..');

interface WrittenBlock {
	readonly content: string;
	readonly isError: boolean;
}

it('shows the failure of a diagram that fails with something other than an Error, unless the render was aborted', async () => {
	const script = await esbuild.build({
		stdin: {
			contents: `
				import mermaid from 'mermaid';
				import { renderMermaidBlocksInElement } from './preview-src/shared';

				// A diagram type whose parser fails with a plain object instead of an Error.
				const brokenDiagram = {
					id: 'broken',
					detector: text => text.trim().startsWith('broken'),
					loader: async () => ({
						id: 'broken',
						diagram: { db: {}, renderer: { draw: () => { } }, styles: () => '', parser: { parse: () => { throw { str: 'Broken diagram' }; } } },
					}),
				};

				window.renderBrokenDiagram = async aborted => {
					mermaid.initialize({ startOnLoad: false });
					await mermaid.registerExternalDiagrams([brokenDiagram]);
					const root = document.createElement('div');
					root.innerHTML = '<div class="mermaid">broken</div>';
					const abort = new AbortController();
					if (aborted) {
						abort.abort();
					}
					const written = [];
					await renderMermaidBlocksInElement(root, (_container, content, _contentHash, isError) => written.push({ content, isError }), abort.signal).catch(() => { });
					return written;
				};
			`,
			resolveDir: extensionDir,
			loader: 'ts',
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		logLevel: 'silent',
	});

	const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent('<!DOCTYPE html><html><body></body></html>');
		await page.addScriptTag({ content: script.outputFiles[0].text });

		assert.deepStrictEqual({
			failed: await page.evaluate(() => window.renderBrokenDiagram(false)),
			aborted: await page.evaluate(() => window.renderBrokenDiagram(true)),
		}, {
			failed: [{ content: '<pre class="mermaid-error">Broken diagram</pre>', isError: true }],
			aborted: [],
		});
	} finally {
		await browser.close();
	}
});

declare global {
	interface Window {
		renderBrokenDiagram(aborted: boolean): Promise<WrittenBlock[]>;
	}
}
