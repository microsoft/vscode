/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import 'mocha';


const testFolder = fs.mkdtemp(path.join(os.tmpdir(), 'conf-editing-'));

suite('Completions in settings.json', () => {
	const testFile = 'settings.json';

	test('window.title', async () => {
		{ // inserting after text
			const content = [
				'{',
				'  "window.title": "custom|"',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "window.title": "custom${activeEditorShort}"',
				'}',
			].join('\n');
			const expected = { label: '${activeEditorShort}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{	// inserting before a variable
			const content = [
				'{',
				'  "window.title": "|${activeEditorShort}"',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "window.title": "${folderPath}${activeEditorShort}"',
				'}',
			].join('\n');
			const expected = { label: '${folderPath}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{	// inserting after a variable
			const content = [
				'{',
				'  "window.title": "${activeEditorShort}|"',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "window.title": "${activeEditorShort}${folderPath}"',
				'}',
			].join('\n');
			const expected = { label: '${folderPath}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{ // replacing an variable
			const content = [
				'{',
				'  "window.title": "${a|ctiveEditorShort}"',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "window.title": "${activeEditorMedium}"',
				'}',
			].join('\n');
			const expected = { label: '${activeEditorMedium}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{ // replacing a partial variable
			const content = [
				'{',
				'  "window.title": "${a|"',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "window.title": "${dirty}"',
				'}',
			].join('\n');
			const expected = { label: '${dirty}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{ // inserting a literal
			const content = [
				'{',
				'  "window.title": |',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "window.title": "${activeEditorMedium}"',
				'}',
			].join('\n');
			const expected = { label: '"${activeEditorMedium}"', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{ // no proposals after literal
			const content = [
				'{',
				'  "window.title": "${activeEditorShort}"   |',
				'}',
			].join('\n');
			const expected = { label: '${activeEditorMedium}', notAvailable: true };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});

	test('files.associations', async () => {
		{
			const content = [
				'{',
				'  "files.associations": {',
				'    |',
				'  }',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "files.associations": {',
				'    "*.${1:extension}": "${2:language}"',
				'  }',
				'}',
			].join('\n');
			const expected = { label: 'Files with Extension', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "files.associations": {',
				'    |',
				'  }',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "files.associations": {',
				'    "/${1:path to file}/*.${2:extension}": "${3:language}"',
				'  }',
				'}',
			].join('\n');
			const expected = { label: 'Files with Path', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "files.associations": {',
				'    "*.extension": "|bat"',
				'  }',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "files.associations": {',
				'    "*.extension": "json"',
				'  }',
				'}',
			].join('\n');
			const expected = { label: '"json"', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "files.associations": {',
				'    "*.extension": "bat"|',
				'  }',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "files.associations": {',
				'    "*.extension": "json"',
				'  }',
				'}',
			].join('\n');
			const expected = { label: '"json"', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "files.associations": {',
				'    "*.extension": "bat"  |',
				'  }',
				'}',
			].join('\n');
			const expected = { label: '"json"', notAvailable: true };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
	test('files.exclude', async () => {
		{
			const content = [
				'{',
				'  "files.exclude": {',
				'    |',
				'  }',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "files.exclude": {',
				'    "**/*.${1:extension}": true',
				'  }',
				'}',
			].join('\n');
			const expected = { label: 'Files by Extension', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "files.exclude": {',
				'    "**/*.extension": |true',
				'  }',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "files.exclude": {',
				'    "**/*.extension": { "when": "$(basename).${1:extension}" }',
				'  }',
				'}',
			].join('\n');
			const expected = { label: 'Files with Siblings by Name', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
	test('files.defaultLanguage', async () => {
		{
			const content = [
				'{',
				'  "files.defaultLanguage": "json|"',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "files.defaultLanguage": "jsonc"',
				'}',
			].join('\n');
			const expected = { label: '"jsonc"', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "files.defaultLanguage": |',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "files.defaultLanguage": "jsonc"',
				'}',
			].join('\n');
			const expected = { label: '"jsonc"', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
	test('remote.extensionKind', async () => {
		{
			const content = [
				'{',
				'\t"remote.extensionKind": {',
				'\t\t|',
				'\t}',
				'}',
			].join('\n');
			const expected = { label: 'vscode.npm' };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
	test('remote.portsAttributes', async () => {
		{
			const content = [
				'{',
				'  "remote.portsAttributes": {',
				'    |',
				'  }',
				'}',
			].join('\n');
			const expected = { label: '"3000"' };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
});

suite('Completions in extensions.json', () => {
	const testFile = 'extensions.json';
	test('change recommendation', async () => {
		{
			const content = [
				'{',
				'  "recommendations": [',
				'    "|a.b"',
				'  ]',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "recommendations": [',
				'    "ms-vscode.js-debug"',
				'  ]',
				'}',
			].join('\n');
			const expected = { label: 'ms-vscode.js-debug', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
	test('add recommendation', async () => {
		{
			const content = [
				'{',
				'  "recommendations": [',
				'    |',
				'  ]',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "recommendations": [',
				'    "ms-vscode.js-debug"',
				'  ]',
				'}',
			].join('\n');
			const expected = { label: 'ms-vscode.js-debug', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
});

suite('Completions in launch.json', () => {
	const testFile = 'launch.json';
	test('variable completions', async () => {
		{
			const content = [
				'{',
				'  "version": "0.2.0",',
				'  "configurations": [',
				'    {',
				'      "name": "Run Extension",',
				'      "type": "extensionHost",',
				'      "preLaunchTask": "${|defaultBuildTask}"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "version": "0.2.0",',
				'  "configurations": [',
				'    {',
				'      "name": "Run Extension",',
				'      "type": "extensionHost",',
				'      "preLaunchTask": "${cwd}"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const expected = { label: '${cwd}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "version": "0.2.0",',
				'  "configurations": [',
				'    {',
				'      "name": "Run Extension",',
				'      "type": "extensionHost",',
				'      "preLaunchTask": "|${defaultBuildTask}"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "version": "0.2.0",',
				'  "configurations": [',
				'    {',
				'      "name": "Run Extension",',
				'      "type": "extensionHost",',
				'      "preLaunchTask": "${cwd}${defaultBuildTask}"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const expected = { label: '${cwd}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "version": "0.2.0",',
				'  "configurations": [',
				'    {',
				'      "name": "Do It",',
				'      "program": "${workspace|"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "version": "0.2.0",',
				'  "configurations": [',
				'    {',
				'      "name": "Do It",',
				'      "program": "${cwd}"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const expected = { label: '${cwd}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
});

suite('Completions in tasks.json', () => {
	const testFile = 'tasks.json';
	test('variable completions', async () => {
		{
			const content = [
				'{',
				'  "version": "0.2.0",',
				'  "tasks": [',
				'    {',
				'      "type": "shell",',
				'      "command": "${|defaultBuildTask}"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "version": "0.2.0",',
				'  "tasks": [',
				'    {',
				'      "type": "shell",',
				'      "command": "${cwd}"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const expected = { label: '${cwd}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
		{
			const content = [
				'{',
				'  "version": "0.2.0",',
				'  "tasks": [',
				'    {',
				'      "type": "shell",',
				'      "command": "${defaultBuildTask}|"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const resultText = [
				'{',
				'  "version": "0.2.0",',
				'  "tasks": [',
				'    {',
				'      "type": "shell",',
				'      "command": "${defaultBuildTask}${cwd}"',
				'    }',
				'  ]',
				'}',
			].join('\n');
			const expected = { label: '${cwd}', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
});

suite('Completions in keybindings.json', () => {
	const testFile = 'keybindings.json';
	test('context key insertion', async () => {
		{
			const content = [
				'[',
				'  {',
				'    "key": "ctrl+k ctrl+,",',
				'    "command": "editor.jumpToNextFold",',
				'    "when": "|"',
				'  }',
				']',
			].join('\n');
			const resultText = [
				'[',
				'  {',
				'    "key": "ctrl+k ctrl+,",',
				'    "command": "editor.jumpToNextFold",',
				'    "when": "resourcePath"',
				'  }',
				']',
			].join('\n');
			const expected = { label: 'resourcePath', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});

	test('context key replace', async () => {
		{
			const content = [
				'[',
				'  {',
				'    "key": "ctrl+k ctrl+,",',
				'    "command": "editor.jumpToNextFold",',
				'    "when": "resou|rcePath"',
				'  }',
				']',
			].join('\n');
			const resultText = [
				'[',
				'  {',
				'    "key": "ctrl+k ctrl+,",',
				'    "command": "editor.jumpToNextFold",',
				'    "when": "resource"',
				'  }',
				']',
			].join('\n');
			const expected = { label: 'resource', resultText };
			await testCompletion(testFile, 'jsonc', content, expected);
		}
	});
});

interface ItemDescription {
	label: string;
	resultText?: string;
	notAvailable?: boolean;
}

async function testCompletion(testFileName: string, languageId: string, content: string, expected: ItemDescription) {

	const offset = content.indexOf('|');
	content = content.substring(0, offset) + content.substring(offset + 1);

	const docUri = vscode.Uri.file(path.join(await testFolder, testFileName));
	await fs.writeFile(docUri.fsPath, content);

	const editor = await setTestContent(docUri, languageId, content);
	const position = editor.document.positionAt(offset);

	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualCompletions = (await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', docUri, position)) as vscode.CompletionList;

	const matches = actualCompletions.items.filter(completion => {
		return completion.label === expected.label;
	});
	if (expected.notAvailable) {
		assert.strictEqual(matches.length, 0, `${expected.label} should not existing is results`);
	} else {
		assert.strictEqual(matches.length, 1, `${expected.label} should only existing once: Actual: ${actualCompletions.items.map(c => c.label).join(', ')}`);

		if (expected.resultText) {
			const match = matches[0];
			if (match.range && match.insertText) {
				const range = match.range instanceof vscode.Range ? match.range : match.range.replacing;
				const text = typeof match.insertText === 'string' ? match.insertText : match.insertText.value;

				await editor.edit(eb => eb.replace(range, text));
				assert.strictEqual(editor.document.getText(), expected.resultText);
			} else {
				assert.fail(`Range or insertText missing`);
			}
		}
	}
}

async function setTestContent(docUri: vscode.Uri, languageId: string, content: string): Promise<vscode.TextEditor> {
	const ext = vscode.extensions.getExtension('vscode.configuration-editing')!;
	await ext.activate();

	const doc = await vscode.workspace.openTextDocument(docUri);
	await vscode.languages.setTextDocumentLanguage(doc, languageId);
	const editor = await vscode.window.showTextDocument(doc);

	const fullRange = new vscode.Range(new vscode.Position(0, 0), doc.positionAt(doc.getText().length));
	await editor.edit(eb => eb.replace(fullRange, content));
	return editor;

}
