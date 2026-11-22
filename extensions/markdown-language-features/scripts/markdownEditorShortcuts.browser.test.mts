/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { chromium } from 'playwright';

it('handles clipboard shortcuts across keyboard layouts in the Markdown editor', async () => {
	const bundle = await esbuild.build({
		stdin: {
			resolveDir: fileURLToPath(new URL('..', import.meta.url)),
			contents: `
				import { AsyncClipboardStrategy } from '@vscode/markdown-editor';
				const element = document.querySelector('main');
				const output = document.querySelector('output');
				const strategy = new AsyncClipboardStrategy({
					readText: async () => 'clipboard',
					writeText: async text => { output.textContent += text; },
				});
				strategy.connect({
					element,
					copy: () => 'copied',
					cut: () => 'cut',
					insertText: text => { output.textContent += text; },
				});
			`,
		},
		bundle: true,
		external: ['node:*'],
		write: false,
	});
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.setContent('<main tabindex="0"><input></main><output></output>');
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		for (const [key, code, keyCode, expected] of [
			['м', '', 86, 'clipboard'], // Windows can omit the physical code.
			['ω', 'KeyV', 0, 'clipboard'], // Greek layout
			['с', 'KeyC', 67, 'copied'],
			['χ', 'KeyX', 88, 'cut'],
			['v', 'KeyB', 86, 'clipboard'], // Preserve remapped Latin layouts.
			['b', 'KeyV', 66, ''],
		] as const) {
			const actual = await page.locator('main').evaluate(async (element, eventInit) => {
				const output = document.querySelector('output')!;
				output.textContent = '';
				const event = new KeyboardEvent('keydown', { ...eventInit, ctrlKey: true, bubbles: true, cancelable: true });
				element.dispatchEvent(event);
				await Promise.resolve();
				return { text: output.textContent, handled: event.defaultPrevented };
			}, { key, code, keyCode });
			assert.deepStrictEqual(actual, { text: expected, handled: !!expected }, key);
		}
		for (const modifiers of [{ isComposing: true }, { altKey: true }, { modifierAltGraph: true }]) {
			const handled = await page.locator('main').evaluate((element, modifiers) => {
				const event = new KeyboardEvent('keydown', { key: 'м', code: 'KeyV', ctrlKey: true, cancelable: true, ...modifiers });
				element.dispatchEvent(event);
				return event.defaultPrevented;
			}, modifiers);
			assert.strictEqual(handled, false);
		}
		const input = page.locator('input');
		await input.focus();
		await input.dispatchEvent('keydown', { key: 'м', keyCode: 86, ctrlKey: true });
		assert.strictEqual(await input.inputValue(), 'clipboard');
	} finally {
		await browser.close();
	}
});

it('routes local and host Markdown shortcuts with a non-Latin input layout', async () => {
	const bundle = await esbuild.build({
		stdin: {
			resolveDir: fileURLToPath(new URL('..', import.meta.url)),
			contents: `
				import { EditorModel, EditorView, EditorController, vscodeHostKeyboardProfile, vscodeLocalKeyboardProfile } from '@vscode/markdown-editor';
				const model = new EditorModel();
				const view = new EditorView(model);
				document.body.append(view.element);
				view.element.id = 'editor';
				new EditorController(model, view, {
					keyboardPlatform: 'windows',
					keyboardProfile: vscodeLocalKeyboardProfile,
					forwardedKeyboardProfile: vscodeHostKeyboardProfile,
				});
			`,
		},
		bundle: true,
		external: ['node:*'],
		write: false,
	});
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.addScriptTag({ content: bundle.outputFiles[0].text });
		const editor = page.locator('#editor');
		for (const [letter, russian, greek, shiftKey, routedToHost] of [
			['A', 'ф', 'α', false, true], // Select all
			['Z', 'я', 'ζ', false, true], // Undo
			['Z', 'я', 'ζ', true, true],  // Redo
			['Y', 'н', 'υ', false, true], // Redo
			['K', 'л', 'κ', true, true],  // Delete line
			['M', 'ь', 'μ', false, false], // Toggle Tab focus
		] as const) {
			for (const key of [letter.toLowerCase(), russian, greek]) {
				const result = await editor.evaluate((element, init) => {
					let bubbled = false;
					const listener = () => { bubbled = true; };
					document.addEventListener('keydown', listener);
					try {
						const event = new KeyboardEvent('keydown', { ...init, ctrlKey: true, cancelable: true, bubbles: true });
						element.dispatchEvent(event);
						return { handled: event.defaultPrevented, bubbled };
					} finally {
						document.removeEventListener('keydown', listener);
					}
				}, { key, keyCode: letter.charCodeAt(0), shiftKey });
				assert.deepStrictEqual(result, { handled: true, bubbled: routedToHost }, key);
			}
		}
		for (const key of ['f', 'а', 'φ']) {
			await editor.dispatchEvent('keydown', { key, keyCode: 70, ctrlKey: true });
			const find = page.getByRole('textbox', { name: 'Find', exact: true });
			assert.ok(await find.isVisible(), key);
			await find.press('Escape');
		}
	} finally {
		await browser.close();
	}
});
