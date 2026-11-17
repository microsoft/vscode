/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { chromium } from 'playwright';
import { markdownEditorOverridePlugin, resolveMarkdownEditorPackage } from './markdownEditorPackage.mts';

it('orders native text and composition behind delayed, remapped and removed keybindings', async () => {
	const editorPackage = await resolveMarkdownEditorPackage();
	const bundle = await esbuild.build({
		stdin: {
			resolveDir: fileURLToPath(new URL('..', import.meta.url)),
			loader: 'ts',
			contents: `
				import { EditorModel, EditorView, EditorController, StringValue, Selection, commands, vscodeHostKeyboardProfile, vscodeLocalKeyboardProfile } from '@vscode/markdown-editor';
				import { OrderedInput } from './markdown-editor-src/orderedInput';
				let dispose = () => {};
				window.inputTest = {
					mount(source, selection, backspace = 'markdown.editor.deleteLeft', cancelled = false) {
						dispose();
						const model = new EditorModel();
						model.sourceText.set(new StringValue(source), undefined);
						const errors = [];
						let dispatched = 0;
						let release;
						const gate = new Promise(resolve => { release = resolve; });
						const input = new OrderedInput(source, error => errors.push(String(error)));
						const view = new EditorView(model, { textInput: input, showReadonlyToggle: false });
						const controller = new EditorController(model, view, {
							keyboardProfile: vscodeLocalKeyboardProfile,
							forwardedKeyboardProfile: vscodeHostKeyboardProfile,
							scheduleInput: operation => input.enqueue(operation),
						});
						document.body.appendChild(view.element);
						model.selection.set(new Selection(...selection), undefined);
						const listener = event => {
							if (event.target !== view.element || event.isComposing || event.cancelBubble) { return; }
							event.stopPropagation();
							input.dispatchKey(async () => {
								dispatched++;
								await gate;
								if (cancelled) { return { handled: false, cancelled: true }; }
								return {
									handled: event.key === 'Backspace' && !!backspace,
									command: event.key === 'Backspace' && backspace ? { id: backspace } : undefined,
								};
							}, command => controller.executeCommand(commands.find(c => c.id === command.id)));
						};
						view.element.addEventListener('keydown', listener);
						const keyup = () => input.endKey();
						view.element.addEventListener('keyup', keyup);
						view.focus();
						window.inputTest.drain = () => input.drain();
						window.inputTest.release = () => release();
						window.inputTest.result = () => ({ text: model.sourceText.get().value, errors });
						window.inputTest.selection = () => model.selection.get()?.active;
						window.inputTest.dispatched = () => dispatched;
						dispose = () => {
							input.dispose();
							view.element.removeEventListener('keydown', listener);
							view.element.removeEventListener('keyup', keyup);
							controller.dispose();
							view.element.remove();
							view.dispose();
						};
					},
					dispose: () => dispose(),
				};
			`,
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		external: ['node:fs/promises'],
		plugins: editorPackage.directory ? [markdownEditorOverridePlugin(editorPackage.directory)] : [],
	});
	const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
	try {
		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.setContent('<!DOCTYPE html><html><body></body></html>');
		await page.addStyleTag({ path: fileURLToPath(import.meta.resolve('@vscode/markdown-editor/editor.css')) });
		await page.addScriptTag({ content: bundle.outputFiles[0].text });

		for (const test of [
			{ source: 'one', selection: [3, 3], count: 2, text: 'en', expected: 'oen', command: 'markdown.editor.deleteLeft' },
			{ source: 'one two', selection: [7, 7], count: 1, text: 'new', expected: 'one new', command: 'markdown.editor.deleteWordLeft' },
			{ source: 'one', selection: [3, 3], count: 1, text: 'x', expected: 'onex', command: null },
			{ source: 'one', selection: [1, 3], count: 1, text: 'en', expected: 'oen', command: 'markdown.editor.deleteLeft' },
		]) {
			await page.evaluate(`window.inputTest.mount(${JSON.stringify(test.source)}, ${JSON.stringify(test.selection)}, ${JSON.stringify(test.command)})`);
			for (let i = 0; i < test.count; i++) {
				await page.keyboard.press('Backspace');
			}
			await page.keyboard.type(test.text);
			await page.evaluate('window.inputTest.release()');
			await page.evaluate('window.inputTest.drain()');
			assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: test.expected, errors: [] });
		}

		await page.evaluate('window.inputTest.mount("one", [3, 3])');
		await page.keyboard.type('abc');
		assert.strictEqual(await page.evaluate('window.inputTest.dispatched()'), 3, 'Later keybindings must resolve without waiting for earlier replies');
		await page.evaluate('window.inputTest.release()');
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: 'oneabc', errors: [] });

		for (const [keys, text, expected, selection] of [
			[['Backspace', 'Tab'], 'x', 'on  x', 5],
			[['Backspace', 'Escape'], '', 'on', undefined],
		] as const) {
			await page.evaluate('window.inputTest.mount("one", [3, 3])');
			for (const key of keys) { await page.keyboard.press(key); }
			await page.keyboard.type(text);
			await page.evaluate('window.inputTest.release()');
			await page.evaluate('window.inputTest.drain()');
			assert.deepStrictEqual(await page.evaluate('[window.inputTest.result(), window.inputTest.selection()]'), [
				{ text: expected, errors: [] }, selection,
			]);
		}

		await page.evaluate('window.inputTest.mount("one", [3, 3])');
		await page.keyboard.type('x');
		await page.keyboard.press('Escape');
		await page.evaluate('window.inputTest.release()');
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('[window.inputTest.result(), window.inputTest.selection()]'), [
			{ text: 'onex', errors: [] }, undefined,
		]);

		await page.evaluate('window.inputTest.mount("one", [3, 3])');
		await page.keyboard.type('x');
		const paragraph = page.locator('.md-editor p').first();
		await paragraph.click({ position: { x: 1, y: 5 } });
		await page.evaluate('window.inputTest.release()');
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('[window.inputTest.result(), window.inputTest.selection()]'), [
			{ text: 'onex', errors: [] }, 0,
		]);

		await page.evaluate('window.inputTest.mount("one", [3, 3], null, true)');
		await page.keyboard.type('x');
		await page.evaluate('window.inputTest.release()');
		await page.evaluate('window.inputTest.drain()');
		await page.keyboard.type('y');
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: 'onexy', errors: [] });

		await page.evaluate('window.inputTest.mount("one", [3, 3])');
		await page.keyboard.press('Backspace');
		await page.keyboard.insertText('\u{1f600}');
		await page.evaluate('window.inputTest.release()');
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: 'on\u{1f600}', errors: [] });

		await page.evaluate('window.inputTest.mount("one", [3, 3])');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		const cdp = await page.context().newCDPSession(page);
		try {
			await cdp.send('Input.imeSetComposition', { text: '\u306b', selectionStart: 1, selectionEnd: 1 });
			await cdp.send('Input.imeSetComposition', { text: '\u65e5\u672c', selectionStart: 2, selectionEnd: 2 });
			await cdp.send('Input.insertText', { text: '\u65e5\u672c' });
		} finally {
			await cdp.detach();
		}
		await page.evaluate('window.inputTest.release()');
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: 'o\u65e5\u672c', errors: [] });

		await page.evaluate('window.inputTest.mount("one", [3, 3])');
		const composition = await page.context().newCDPSession(page);
		try {
			await composition.send('Input.imeSetComposition', { text: '\u306b\u307b\u3093', selectionStart: 1, selectionEnd: 1 });
			await page.evaluate('window.inputTest.drain()');
			await composition.send('Input.imeSetComposition', { text: '\u65e5\u672c', selectionStart: 2, selectionEnd: 2 });
			await page.evaluate('window.inputTest.drain()');
			await composition.send('Input.insertText', { text: '\u65e5\u672c' });
		} finally {
			await composition.detach();
		}
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: 'one\u65e5\u672c', errors: [] });

		await page.evaluate('window.inputTest.mount("one", [3, 3])');
		const rangedComposition = await page.context().newCDPSession(page);
		try {
			await rangedComposition.send('Input.imeSetComposition', { text: '\u65e5\u672c', selectionStart: 0, selectionEnd: 1 });
			await page.evaluate('window.inputTest.drain()');
			await rangedComposition.send('Input.imeSetComposition', { text: '\u65e5\u672c\u8a9e', selectionStart: 3, selectionEnd: 3 });
			await page.evaluate('window.inputTest.drain()');
			assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: 'one\u65e5\u672c\u8a9e', errors: [] });
			await rangedComposition.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
		} finally {
			await rangedComposition.detach();
		}
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: 'one', errors: [] });

		await page.evaluate('window.inputTest.mount("one", [3, 3])');
		await page.keyboard.press('Backspace');
		await page.evaluate('window.inputTest.dispose()');
		await page.evaluate('window.inputTest.release()');
		await page.evaluate('window.inputTest.drain()');
		assert.deepStrictEqual(await page.evaluate('window.inputTest.result()'), { text: 'one', errors: [] });
		assert.deepStrictEqual(errors, []);
	} finally {
		await browser.close();
	}
});
