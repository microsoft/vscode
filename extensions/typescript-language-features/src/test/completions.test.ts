/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { disposeAll } from '../utils/dispose';

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
}

suite('TypeScript Completions', () => {
	const configDefaults: VsCodeConfiguration = Object.freeze({
		[Config.suggestSelection]: 'first',
		[Config.completeFunctionCalls]: false,
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
			));
	});

	test('Should treat period as commit character for var completions', async () => {
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
			));
	});

	test('Should treat paren as commit character for function completions', async () => {
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
			));
	});

	test('Should insert backets when completing dot properties with spaces in name', async () => {
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
			));
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
			));
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

		const document = await acceptFirstSuggestion(testDocumentUri, _disposables, { useLineRange: true });
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

	test.skip('Accepting a member completion should result in valid code. #58597', async () => {
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

	test('completeFunctionCalls should complete function parameters when at end of word', async () => {
		await updateConfig({
			[Config.completeFunctionCalls]: true,
		});

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
		await updateConfig({
			[Config.completeFunctionCalls]: true,
		});

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
		await updateConfig({
			[Config.completeFunctionCalls]: true,
		});

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
		await updateConfig({
			[Config.completeFunctionCalls]: true,
		});

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

	test('should not de-prioritized this.member suggestion, #74164', async () => {
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
			));
	});
});

const joinLines = (...args: string[]) => args.join('\n');

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function acceptFirstSuggestion(uri: vscode.Uri, _disposables: vscode.Disposable[], options?: { useLineRange?: boolean }) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	const didSuggest = onDidSuggest(_disposables, options);
	await vscode.commands.executeCommand('editor.action.triggerSuggest');
	await didSuggest;
	// TODO: depends on reverting fix for https://github.com/Microsoft/vscode/issues/64257
	// Make sure we have time to resolve the suggestion because `acceptSelectedSuggestion` doesn't
	await wait(40);
	await vscode.commands.executeCommand('acceptSelectedSuggestion');
	return await didChangeDocument;
}

async function typeCommitCharacter(uri: vscode.Uri, character: string, _disposables: vscode.Disposable[]) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	const didSuggest = onDidSuggest(_disposables);
	await vscode.commands.executeCommand('editor.action.triggerSuggest');
	await didSuggest;
	await vscode.commands.executeCommand('type', { text: character });
	return await didChangeDocument;
}

function onChangedDocument(documentUri: vscode.Uri, disposables: vscode.Disposable[]) {
	return new Promise<vscode.TextDocument>(resolve => vscode.workspace.onDidChangeTextDocument(e => {
		if (e.document.uri.toString() === documentUri.toString()) {
			resolve(e.document);
		}
	}, undefined, disposables));
}

async function createTestEditor(uri: vscode.Uri, ...lines: string[]) {
	const document = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(document);
	const activeEditor = vscode.window.activeTextEditor;
	if (!activeEditor) {
		throw new Error('no active editor');
	}

	await activeEditor.insertSnippet(new vscode.SnippetString(joinLines(...lines)), new vscode.Range(0, 0, 1000, 0));
}

function onDidSuggest(disposables: vscode.Disposable[], options?: { useLineRange?: boolean }) {
	return new Promise(resolve =>
		disposables.push(vscode.languages.registerCompletionItemProvider('typescript', new class implements vscode.CompletionItemProvider {
			provideCompletionItems(doc: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
				// Return a fake item that will come first
				const range = options && options.useLineRange
					? new vscode.Range(new vscode.Position(position.line, 0), position)
					: doc.getWordRangeAtPosition(position);
				return [{
					label: '🦄',
					insertText: doc.getText(range),
					filterText: doc.getText(range),
					preselect: true,
					sortText: '\0',
					range: range
				}];
			}
			async resolveCompletionItem(item: vscode.CompletionItem) {
				await vscode.commands.executeCommand('selectNextSuggestion');
				resolve();
				return item;
			}
		})));
}