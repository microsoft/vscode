/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { joinLines } from './util';

const testFileA = workspaceFile('a.md');

function workspaceFile(...segments: string[]) {
	return vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, ...segments);
}

async function getLinksForFile(file: vscode.Uri): Promise<vscode.DocumentLink[]> {
	console.log('getting links', file.toString(), Date.now());
	const r = (await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', file))!;
	console.log('got links', file.toString(), Date.now());
	return r;
}

suite('Markdown Document links', () => {

	setup(async () => {
		// the tests make the assumption that link providers are already registered
		await vscode.extensions.getExtension('vscode.markdown-language-features')!.activate();
	});

	teardown(async () => {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Should navigate to markdown file', async () => {
		await withFileContents(testFileA, '[b](b.md)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('b.md'));
	});

	test('Should navigate to markdown file with leading ./', async () => {
		await withFileContents(testFileA, '[b](./b.md)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('b.md'));
	});

	test('Should navigate to markdown file with leading /', async () => {
		await withFileContents(testFileA, '[b](./b.md)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('b.md'));
	});

	test('Should navigate to markdown file without file extension', async () => {
		await withFileContents(testFileA, '[b](b)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('b.md'));
	});

	test('Should navigate to markdown file in directory', async () => {
		await withFileContents(testFileA, '[b](sub/c)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
	});

	test('Should navigate to fragment by title in file', async () => {
		await withFileContents(testFileA, '[b](sub/c#second)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
		assert.strictEqual(vscode.window.activeTextEditor!.selection.start.line, 1);
	});

	test('Should navigate to fragment by line', async () => {
		await withFileContents(testFileA, '[b](sub/c#L2)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('sub', 'c.md'));
		assert.strictEqual(vscode.window.activeTextEditor!.selection.start.line, 1);
	});

	test('Should navigate to line number within non-md file', async () => {
		await withFileContents(testFileA, '[b](sub/foo.txt#L3)');

		const [link] = await getLinksForFile(testFileA);
		await executeLink(link);

		assertActiveDocumentUri(workspaceFile('sub', 'foo.txt'));
		assert.strictEqual(vscode.window.activeTextEditor!.selection.start.line, 2);
	});

	test('Should navigate to fragment within current file', async () => {
		await withFileContents(testFileA, joinLines(
			'[](a#header)',
			'[](#header)',
			'# Header'));

		const links = await getLinksForFile(testFileA);
		{
			await executeLink(links[0]);
			assertActiveDocumentUri(workspaceFile('a.md'));
			assert.strictEqual(vscode.window.activeTextEditor!.selection.start.line, 2);
		}
		{
			await executeLink(links[1]);
			assertActiveDocumentUri(workspaceFile('a.md'));
			assert.strictEqual(vscode.window.activeTextEditor!.selection.start.line, 2);
		}
	});

	test('Should navigate to fragment within current untitled file', async () => {
		const testFile = workspaceFile('x.md').with({ scheme: 'untitled' });
		await withFileContents(testFile, joinLines(
			'[](#second)',
			'# Second'));

		const [link] = await getLinksForFile(testFile);
		await executeLink(link);

		assertActiveDocumentUri(testFile);
		assert.strictEqual(vscode.window.activeTextEditor!.selection.start.line, 1);
	});
});


function assertActiveDocumentUri(expectedUri: vscode.Uri) {
	assert.strictEqual(
		vscode.window.activeTextEditor!.document.uri.fsPath,
		expectedUri.fsPath
	);
}

async function withFileContents(file: vscode.Uri, contents: string): Promise<void> {
	console.log('openTextDocument', file.toString(), Date.now());
	const document = await vscode.workspace.openTextDocument(file);
	console.log('showTextDocument', file.toString(), Date.now());
	const editor = await vscode.window.showTextDocument(document);
	console.log('editTextDocument', file.toString(), Date.now());
	await editor.edit(edit => {
		edit.replace(new vscode.Range(0, 0, 1000, 0), contents);
	});
	console.log('opened done', vscode.window.activeTextEditor?.document.toString(), Date.now());
}

async function executeLink(link: vscode.DocumentLink) {
	console.log('executeingLink', link.target?.toString(), Date.now());

	const args = JSON.parse(decodeURIComponent(link.target!.query));
	await vscode.commands.executeCommand(link.target!.path, args);
	console.log('executedLink', vscode.window.activeTextEditor?.document.toString(), Date.now());
}
