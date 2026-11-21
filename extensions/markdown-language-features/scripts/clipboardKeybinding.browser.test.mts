/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

test('desktop Markdown editor lets the host resolve the paste-as-text shortcut', async () => {
	const bundle = await esbuild.build({
		stdin: {
			resolveDir: import.meta.dirname,
			contents: `
				import { ImagePasteController } from '../markdown-editor-src/imagePasteController.ts';
				window.runPasteShortcut = async (desktop, shiftKey, useDefaultBinding) => {
					const selection = {};
					const model = {
						sourceText: { get: () => 'markdown' },
						selection: { get: () => selection },
						readonlyMode: { get: () => false },
					};
					const controller = new ImagePasteController(model, {
						mountOverlay: () => ({ dispose() {} }),
					}, {}, () => 0, desktop, { readText: async () => 'clipboard text' });
					const element = document.createElement('div');
					element.tabIndex = 0;
					document.body.append(element);
					element.focus();
					const result = { forwarded: false, inserted: [] };
					const connection = controller.connect({
						element,
						insertText: (text, plainText) => result.inserted.push({ text, plainText }),
					});
					const handleKeybinding = event => {
						event.preventDefault();
						result.forwarded = true;
					};
					window.addEventListener('keydown', handleKeybinding);
					try {
						element.dispatchEvent(new KeyboardEvent('keydown', {
							key: shiftKey ? 'V' : 'v', ctrlKey: true, shiftKey, bubbles: true, cancelable: true,
						}));
						if (result.forwarded && useDefaultBinding) {
							await controller.pasteAsText();
						}
						await new Promise(resolve => setTimeout(resolve, 0));
						return result;
					} finally {
						window.removeEventListener('keydown', handleKeybinding);
						connection.dispose();
						controller.dispose();
						element.remove();
					}
				};`,
		},
		bundle: true,
		external: ['node:*'],
		format: 'iife',
		write: false,
	});
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		const run = (desktop: boolean, shiftKey: boolean, useDefaultBinding = false) => page.evaluate(args => {
			const { runPasteShortcut } = window as unknown as {
				runPasteShortcut(desktop: boolean, shiftKey: boolean, useDefaultBinding: boolean): Promise<unknown>;
			};
			return runPasteShortcut(...args);
		}, [desktop, shiftKey, useDefaultBinding] as const);

		assert.deepStrictEqual(await run(true, true), { forwarded: true, inserted: [] });
		assert.deepStrictEqual(await run(true, true, true), {
			forwarded: true, inserted: [{ text: 'clipboard text', plainText: true }],
		});
		assert.deepStrictEqual(await run(true, false), {
			forwarded: false, inserted: [{ text: 'clipboard text', plainText: false }],
		});
		assert.deepStrictEqual(await run(false, true), {
			forwarded: false, inserted: [{ text: 'clipboard text', plainText: true }],
		});
	} finally {
		await browser.close();
	}
});
