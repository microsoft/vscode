/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { disposeAll } from '../utils/dispose';
import { createTestEditor, joinLines, wait } from './testUtils';
import { acceptFirstSuggestion, typeCommitCharacter } from './suggestTestHelpers';

const testDocumentUri = vscode.Uri.parse('untitled:test.ts');

type VsCodeConfiguration = { [key: string]: any };

async function updateConfig(newConfig: VsCodeConfiguration): Promise<VsCodeConfiguration> {
	const oldConfig: VsCodeConfiguration = {};
	const config = vscode.workspace.getConfiguration(undefined, testDocumentUri);
	for (const configKey of Object.keys(newConfig)) {
		oldConfig[configKey] = config.get(configKey);
		await new Promise((resolve, reject) =>
			config.update(configKey, newConfig[configKey], vscode.ConfigurationTarget.Global)
				.then(() => resolve(), reject));
	}
	return oldConfig;
}

namespace Config {
	export const suggestSelection = 'editor.suggestSelection';
	export const completeFunctionCalls = 'typescript.suggest.completeFunctionCalls';
	export const autoClosingBrackets = 'editor.autoClosingBrackets';
	export const insertMode = 'editor.suggest.insertMode';
}

const insertModes = Object.freeze(['insert', 'replace']);

suite('TypeScript Completions', () => {
	const configDefaults: VsCodeConfiguration = Object.freeze({
		[Config.suggestSelection]: 'first',
		[Config.completeFunctionCalls]: false,
		[Config.autoClosingBrackets]: 'always',
		[Config.insertMode]: 'insert',
	});

	const _disposables: vscode.Disposable[] = [];
	let oldConfig: { [key: string]: any } = {};

	setup(async () => {
		await wait(100);

		// Save off config and apply defaults
		oldConfig = await updateConfig(configDefaults);
	});

	teardown(async () => {
		disposeAll(_disposables);

		// Restore config
		await updateConfig(oldConfig);

		return vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Basic var completion', async () => {
		await enumerateConfig(Config.insertMode, insertModes, async config => {
			await createTestEditor(testDocumentUri,
				`const abcdef = 123;`,
				`ab$0;`
			);

			const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
			assert.strictEqual(
				document.getText(),
				joinLines(
					`const abcdef = 123;`,
					`abcdef;`
				),
				`config: ${config}`
			);
		});
	});

	test('Should treat period as commit character for var completions', async () => {
		await enumerateConfig(Config.insertMode, insertModes, async config => {
			await createTestEditor(testDocumentUri,
				`const abcdef = 123;`,
				`ab$0;`
			);

			const document = await typeCommitCharacter(testDocumentUri, '.', _disposables);
			assert.strictEqual(
				document.getText(),
				joinLines(
					`const abcdef = 123;`,
					`abcdef.;`
				),
				`config: ${config}`);
		});
	});

	test('Should treat paren as commit character for function completions', async () => {
		await enumerateConfig(Config.insertMode, insertModes, async config => {
			await createTestEditor(testDocumentUri,
				`function abcdef() {};`,
				`ab$0;`
			);

			const document = await typeCommitCharacter(testDocumentUri, '(', _disposables);
			assert.strictEqual(
				document.getText(),
				joinLines(
					`function abcdef() {};`,
					`abcdef();`
				), `config: ${config}`);
		});
	});

	test('Should insert backets when completing dot properties with spaces in name', async () => {
		await enumerateConfig(Config.insertMode, insertModes, async config => {
			await createTestEditor(testDocumentUri,
				'const x = { "hello world": 1 };',
				'x.$0'
			);

			const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
			assert.strictEqual(
				document.getText(),
				joinLines(
					'const x = { "hello world": 1 };',
					'x["hello world"]'
				), `config: ${config}`);
		});
	});

	test('Should allow commit characters for backet completions', async () => {
		for (const { char, insert } of [
			{ char: '.', insert: '.' },
			{ char: '(', insert: '()' },
		]) {
			await createTestEditor(testDocumentUri,
				'const x = { "hello world2": 1 };',
				'x.$0'
			);

			const document = await typeCommitCharacter(testDocumentUri, char, _disposables);
			assert.strictEqual(
				document.getText(),
				joinLines(
					'const x = { "hello world2": 1 };',
					`x["hello world2"]${insert}`
				));

			disposeAll(_disposables);
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		}
	});

	test('Should not prioritize bracket accessor completions. #63100', async () => {
		await enumerateConfig(Config.insertMode, insertModes, async config => {
			// 'a' should be first entry in completion list
			await createTestEditor(testDocumentUri,
				'const x = { "z-z": 1, a: 1 };',
				'x.$0'
			);

			const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
			assert.strictEqual(
				document.getText(),
				joinLines(
					'const x = { "z-z": 1, a: 1 };',
					'x.a'
				),
				`config: ${config}`);
		});
	});

	test('Accepting a string completion should replace the entire string. #53962', async () => {
		await createTestEditor(testDocumentUri,
			'interface TFunction {',
			`  (_: 'abc.abc2', __ ?: {}): string;`,
			`  (_: 'abc.abc', __?: {}): string;`,
			`}`,
			'const f: TFunction = (() => { }) as any;',
			`f('abc.abc$0')`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				'interface TFunction {',
				`  (_: 'abc.abc2', __ ?: {}): string;`,
				`  (_: 'abc.abc', __?: {}): string;`,
				`}`,
				'const f: TFunction = (() => { }) as any;',
				`f('abc.abc')`
			));
	});

	test('completeFunctionCalls should complete function parameters when at end of word', async () => {
		await updateConfig({ [Config.completeFunctionCalls]: true });

		// Complete with-in word
		await createTestEditor(testDocumentUri,
			`function abcdef(x, y, z) { }`,
			`abcdef$0`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				`function abcdef(x, y, z) { }`,
				`abcdef(x, y, z)`
			));
	});

	test.skip('completeFunctionCalls should complete function parameters when within word', async () => {
		await updateConfig({ [Config.completeFunctionCalls]: true });

		await createTestEditor(testDocumentUri,
			`function abcdef(x, y, z) { }`,
			`abcd$0ef`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				`function abcdef(x, y, z) { }`,
				`abcdef(x, y, z)`
			));
	});

	test('completeFunctionCalls should not complete function parameters at end of word if we are already in something that looks like a function call, #18131', async () => {
		await updateConfig({ [Config.completeFunctionCalls]: true });

		await createTestEditor(testDocumentUri,
			`function abcdef(x, y, z) { }`,
			`abcdef$0(1, 2, 3)`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				`function abcdef(x, y, z) { }`,
				`abcdef(1, 2, 3)`
			));
	});

	test.skip('completeFunctionCalls should not complete function parameters within word if we are already in something that looks like a function call, #18131', async () => {
		await updateConfig({ [Config.completeFunctionCalls]: true });

		await createTestEditor(testDocumentUri,
			`function abcdef(x, y, z) { }`,
			`abcd$0ef(1, 2, 3)`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				`function abcdef(x, y, z) { }`,
				`abcdef(1, 2, 3)`
			));
	});

	test('should not de-prioritize this.member suggestion, #74164', async () => {
		await enumerateConfig(Config.insertMode, insertModes, async config => {
			await createTestEditor(testDocumentUri,
				`class A {`,
				`  private detail = '';`,
				`  foo() {`,
				`    det$0`,
				`  }`,
				`}`,
			);

			const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
			assert.strictEqual(
				document.getText(),
				joinLines(
					`class A {`,
					`  private detail = '';`,
					`  foo() {`,
					`    this.detail`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Accepting a completion in word using insert mode should insert', async () => {
		await updateConfig({ [Config.insertMode]: 'insert' });

		await createTestEditor(testDocumentUri,
			`const abc = 123;`,
			`ab$0c`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				`const abc = 123;`,
				`abcc`
			));
	});

	test('Accepting a completion in word using replace mode should replace', async () => {
		await updateConfig({ [Config.insertMode]: 'replace' });

		await createTestEditor(testDocumentUri,
			`const abc = 123;`,
			`ab$0c`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				`const abc = 123;`,
				`abc`
			));
	});

	test('Accepting string completion inside string using insert mode should insert', async () => {
		await updateConfig({ [Config.insertMode]: 'insert' });

		await createTestEditor(testDocumentUri,
			`const abc = { 'xy z': 123 }`,
			`abc["x$0y w"]`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				`const abc = { 'xy z': 123 }`,
				`abc["xy zy w"]`
			));
	});

	// Waiting on https://github.com/microsoft/TypeScript/issues/35602
	test.skip('Accepting string completion inside string using insert mode should insert', async () => {
		await updateConfig({ [Config.insertMode]: 'replace' });

		await createTestEditor(testDocumentUri,
			`const abc = { 'xy z': 123 }`,
			`abc["x$0y w"]`
		);

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables);
		assert.strictEqual(
			document.getText(),
			joinLines(
				`const abc = { 'xy z': 123 }`,
				`abc["xy w"]`
			));
	});
});

async function enumerateConfig(configKey: string, values: readonly string[], f: (message: string) => Promise<void>): Promise<void> {
	for (const value of values) {
		const newConfig = { [configKey]: value };
		await updateConfig(newConfig);
		await f(JSON.stringify(newConfig));
	}
}
