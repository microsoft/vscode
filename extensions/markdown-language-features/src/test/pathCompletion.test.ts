/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdLinkComputer } from '../languageFeatures/documentLinkProvider';
import { MdPathCompletionProvider } from '../languageFeatures/pathCompletions';
import { noopToken } from '../util/cancellation';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { createNewMarkdownEngine } from './engine';
import { CURSOR, getCursorPositions, joinLines, workspacePath } from './util';


function getCompletionsAtCursor(resource: vscode.Uri, fileContents: string) {
	const doc = new InMemoryDocument(resource, fileContents);
	const engine = createNewMarkdownEngine();
	const linkComputer = new MdLinkComputer(engine);
	const provider = new MdPathCompletionProvider(engine, linkComputer);
	const cursorPositions = getCursorPositions(fileContents, doc);
	return provider.provideCompletionItems(doc, cursorPositions[0], noopToken, {
		triggerCharacter: undefined,
		triggerKind: vscode.CompletionTriggerKind.Invoke,
	});
}

suite('Markdown path completion provider', () => {

	setup(async () => {
		// These tests assume that the markdown completion provider is already registered
		await vscode.extensions.getExtension('vscode.markdown-language-features')!.activate();
	});

	test('Should not return anything when triggered in empty doc', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), `${CURSOR}`);
		assert.strictEqual(completions.length, 0);
	});

	test('Should return anchor completions', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](#${CURSOR}`,
			``,
			`# A b C`,
			`# x y Z`,
		));

		assert.strictEqual(completions.length, 2);
		assert.ok(completions.some(x => x.label === '#a-b-c'), 'Has a-b-c anchor completion');
		assert.ok(completions.some(x => x.label === '#x-y-z'), 'Has x-y-z anchor completion');
	});

	test('Should not return suggestions for http links', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](http:${CURSOR}`,
			``,
			`# http`,
			`# http:`,
			`# https:`,
		));

		assert.strictEqual(completions.length, 0);
	});

	test('Should return relative path suggestions', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](${CURSOR}`,
			``,
			`# A b C`,
		));

		assert.ok(completions.some(x => x.label === 'a.md'), 'Has a.md file completion');
		assert.ok(completions.some(x => x.label === 'b.md'), 'Has b.md file completion');
		assert.ok(completions.some(x => x.label === 'sub/'), 'Has sub folder completion');
	});

	test('Should return relative path suggestions using ./', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](./${CURSOR}`,
			``,
			`# A b C`,
		));

		assert.ok(completions.some(x => x.label === 'a.md'), 'Has a.md file completion');
		assert.ok(completions.some(x => x.label === 'b.md'), 'Has b.md file completion');
		assert.ok(completions.some(x => x.label === 'sub/'), 'Has sub folder completion');
	});

	test('Should return absolute path suggestions using /', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('sub', 'new.md'), joinLines(
			`[](/${CURSOR}`,
			``,
			`# A b C`,
		));

		assert.ok(completions.some(x => x.label === 'a.md'), 'Has a.md file completion');
		assert.ok(completions.some(x => x.label === 'b.md'), 'Has b.md file completion');
		assert.ok(completions.some(x => x.label === 'sub/'), 'Has sub folder completion');
		assert.ok(!completions.some(x => x.label === 'c.md'), 'Should not have c.md from sub folder');
	});

	test('Should return anchor suggestions in other file', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('sub', 'new.md'), joinLines(
			`[](/b.md#${CURSOR}`,
		));

		assert.ok(completions.some(x => x.label === '#b'), 'Has #b header completion');
		assert.ok(completions.some(x => x.label === '#header1'), 'Has #header1 header completion');
	});

	test('Should reference links for current file', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('sub', 'new.md'), joinLines(
			`[][${CURSOR}`,
			``,
			`[ref-1]: bla`,
			`[ref-2]: bla`,
		));

		assert.strictEqual(completions.length, 2);
		assert.ok(completions.some(x => x.label === 'ref-1'), 'Has ref-1 reference completion');
		assert.ok(completions.some(x => x.label === 'ref-2'), 'Has ref-2 reference completion');
	});

	test('Should complete headers in link definitions', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('sub', 'new.md'), joinLines(
			`# a B c`,
			`# x y    Z`,
			`[ref-1]: ${CURSOR}`,
		));

		assert.ok(completions.some(x => x.label === '#a-b-c'), 'Has #a-b-c header completion');
		assert.ok(completions.some(x => x.label === '#x-y-z'), 'Has #x-y-z header completion');
	});

	test('Should complete relative paths in link definitions', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`# a B c`,
			`[ref-1]: ${CURSOR}`,
		));

		assert.ok(completions.some(x => x.label === 'a.md'), 'Has a.md file completion');
		assert.ok(completions.some(x => x.label === 'b.md'), 'Has b.md file completion');
		assert.ok(completions.some(x => x.label === 'sub/'), 'Has sub folder completion');
	});

	test('Should escape spaces in path names', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](./sub/${CURSOR})`
		));

		assert.ok(completions.some(x => x.insertText === 'file%20with%20space.md'), 'Has encoded path completion');
	});

	test('Should complete paths for path with encoded spaces', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](./sub%20with%20space/${CURSOR})`
		));

		assert.ok(completions.some(x => x.insertText === 'file.md'), 'Has file from space');
	});

	test('Should complete definition path for path with encoded spaces', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[def]: ./sub%20with%20space/${CURSOR}`
		));

		assert.ok(completions.some(x => x.insertText === 'file.md'), 'Has file from space');
	});
});
