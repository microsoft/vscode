/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { MdLinkProvider } from '../languageFeatures/documentLinks';
import { MdVsCodePathCompletionProvider } from '../languageFeatures/pathCompletions';
import { noopToken } from '../util/cancellation';
import { InMemoryDocument } from '../util/inMemoryDocument';
import { IMdWorkspace } from '../workspace';
import { createNewMarkdownEngine } from './engine';
import { InMemoryMdWorkspace } from './inMemoryWorkspace';
import { nulLogger } from './nulLogging';
import { CURSOR, getCursorPositions, joinLines, workspacePath } from './util';


async function getCompletionsAtCursor(resource: vscode.Uri, fileContents: string, workspace?: IMdWorkspace) {
	const doc = new InMemoryDocument(resource, fileContents);

	const engine = createNewMarkdownEngine();
	const ws = workspace ?? new InMemoryMdWorkspace([doc]);
	const linkProvider = new MdLinkProvider(engine, ws, nulLogger);
	const provider = new MdVsCodePathCompletionProvider(ws, engine, linkProvider);
	const cursorPositions = getCursorPositions(fileContents, doc);
	const completions = await provider.provideCompletionItems(doc, cursorPositions[0], noopToken, {
		triggerCharacter: undefined,
		triggerKind: vscode.CompletionTriggerKind.Invoke,
	});

	return completions.sort((a, b) => (a.label as string).localeCompare(b.label as string));
}

function assertCompletionsEqual(actual: readonly vscode.CompletionItem[], expected: readonly { label: string; insertText?: string }[]) {
	assert.strictEqual(actual.length, expected.length, 'Completion counts should be equal');

	for (let i = 0; i < actual.length; ++i) {
		assert.strictEqual(actual[i].label, expected[i].label, `Completion labels ${i} should be equal`);
		if (typeof expected[i].insertText !== 'undefined') {
			assert.strictEqual(actual[i].insertText, expected[i].insertText, `Completion insert texts ${i} should be equal`);
		}
	}
}

suite('Markdown: Path completions', () => {

	test('Should not return anything when triggered in empty doc', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), `${CURSOR}`);
		assertCompletionsEqual(completions, []);
	});

	test('Should return anchor completions', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](#${CURSOR}`,
			``,
			`# A b C`,
			`# x y Z`,
		));

		assertCompletionsEqual(completions, [
			{ label: '#a-b-c' },
			{ label: '#x-y-z' },
		]);
	});

	test('Should not return suggestions for http links', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](http:${CURSOR}`,
			``,
			`# http`,
			`# http:`,
			`# https:`,
		));

		assertCompletionsEqual(completions, []);
	});

	test('Should return relative path suggestions', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('a.md'), ''),
			new InMemoryDocument(workspacePath('b.md'), ''),
			new InMemoryDocument(workspacePath('sub/foo.md'), ''),
		]);
		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](${CURSOR}`,
			``,
			`# A b C`,
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: '#a-b-c' },
			{ label: 'a.md' },
			{ label: 'b.md' },
			{ label: 'sub/' },
		]);
	});

	test('Should return relative path suggestions using ./', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('a.md'), ''),
			new InMemoryDocument(workspacePath('b.md'), ''),
			new InMemoryDocument(workspacePath('sub/foo.md'), ''),
		]);

		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](./${CURSOR}`,
			``,
			`# A b C`,
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: 'a.md' },
			{ label: 'b.md' },
			{ label: 'sub/' },
		]);
	});

	test('Should return absolute path suggestions using /', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('a.md'), ''),
			new InMemoryDocument(workspacePath('b.md'), ''),
			new InMemoryDocument(workspacePath('sub/c.md'), ''),
		]);

		const completions = await getCompletionsAtCursor(workspacePath('sub', 'new.md'), joinLines(
			`[](/${CURSOR}`,
			``,
			`# A b C`,
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: 'a.md' },
			{ label: 'b.md' },
			{ label: 'sub/' },
		]);
	});

	test('Should return anchor suggestions in other file', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('b.md'), joinLines(
				`# b`,
				``,
				`[./a](./a)`,
				``,
				`# header1`,
			)),
		]);
		const completions = await getCompletionsAtCursor(workspacePath('sub', 'new.md'), joinLines(
			`[](/b.md#${CURSOR}`,
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: '#b' },
			{ label: '#header1' },
		]);
	});

	test('Should reference links for current file', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('sub', 'new.md'), joinLines(
			`[][${CURSOR}`,
			``,
			`[ref-1]: bla`,
			`[ref-2]: bla`,
		));

		assertCompletionsEqual(completions, [
			{ label: 'ref-1' },
			{ label: 'ref-2' },
		]);
	});

	test('Should complete headers in link definitions', async () => {
		const completions = await getCompletionsAtCursor(workspacePath('sub', 'new.md'), joinLines(
			`# a B c`,
			`# x y    Z`,
			`[ref-1]: ${CURSOR}`,
		));

		assertCompletionsEqual(completions, [
			{ label: '#a-b-c' },
			{ label: '#x-y-z' },
			{ label: 'new.md' },
		]);
	});

	test('Should complete relative paths in link definitions', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('a.md'), ''),
			new InMemoryDocument(workspacePath('b.md'), ''),
			new InMemoryDocument(workspacePath('sub/c.md'), ''),
		]);

		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`# a B c`,
			`[ref-1]: ${CURSOR}`,
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: '#a-b-c' },
			{ label: 'a.md' },
			{ label: 'b.md' },
			{ label: 'sub/' },
		]);
	});

	test('Should escape spaces in path names', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('a.md'), ''),
			new InMemoryDocument(workspacePath('b.md'), ''),
			new InMemoryDocument(workspacePath('sub/file with space.md'), ''),
		]);

		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](./sub/${CURSOR})`
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: 'file with space.md', insertText: 'file%20with%20space.md' },
		]);
	});

	test('Should support completions on angle bracket path with spaces', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('sub with space/a.md'), ''),
			new InMemoryDocument(workspacePath('b.md'), ''),
		]);

		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](</sub with space/${CURSOR}`
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: 'a.md', insertText: 'a.md' },
		]);
	});

	test('Should not escape spaces in path names that use angle brackets', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('sub/file with space.md'), ''),
		]);

		{
			const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
				`[](<./sub/${CURSOR}`
			), workspace);

			assertCompletionsEqual(completions, [
				{ label: 'file with space.md', insertText: 'file with space.md' },
			]);
		}
		{
			const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
				`[](<./sub/${CURSOR}>`
			), workspace);

			assertCompletionsEqual(completions, [
				{ label: 'file with space.md', insertText: 'file with space.md' },
			]);
		}
	});

	test('Should complete paths for path with encoded spaces', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('a.md'), ''),
			new InMemoryDocument(workspacePath('b.md'), ''),
			new InMemoryDocument(workspacePath('sub with space/file.md'), ''),
		]);

		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[](./sub%20with%20space/${CURSOR})`
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: 'file.md', insertText: 'file.md' },
		]);
	});

	test('Should complete definition path for path with encoded spaces', async () => {
		const workspace = new InMemoryMdWorkspace([
			new InMemoryDocument(workspacePath('a.md'), ''),
			new InMemoryDocument(workspacePath('b.md'), ''),
			new InMemoryDocument(workspacePath('sub with space/file.md'), ''),
		]);

		const completions = await getCompletionsAtCursor(workspacePath('new.md'), joinLines(
			`[def]: ./sub%20with%20space/${CURSOR}`
		), workspace);

		assertCompletionsEqual(completions, [
			{ label: 'file.md', insertText: 'file.md' },
		]);
	});
});
