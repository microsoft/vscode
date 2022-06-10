/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { readFile } from 'fs/promises';
import * as path from 'path';
import { Disposable } from '../utils/dispose';

export class JsWalkthroughState extends Disposable {
	exampleHtmlDocument: vscode.TextDocument | undefined = undefined;
	exampleJsDocument: vscode.TextDocument | undefined = undefined;

	override dispose() {
		this.exampleHtmlDocument = undefined;
		this.exampleJsDocument = undefined;
	}
}

export class CreateHtmlFileWithScriptTagCommand {
	public static readonly id = 'javascript-walkthrough.commands.createHtmlFileWithScriptTag';
	public readonly id = CreateHtmlFileWithScriptTagCommand.id;

	constructor(private walkthroughState: JsWalkthroughState) { }

	public execute() {
		createHtmlFileWithScriptTag(this.walkthroughState);
	}
}

export class DebugHtmlFileCommand {
	public static readonly id = 'javascript-walkthrough.commands.debugHtmlFile';
	public readonly id = DebugHtmlFileCommand.id;

	constructor(private walkthroughState: JsWalkthroughState) { }

	public execute() {
		debugHtmlFile(this.walkthroughState);
	}
}

export class CreateNewJSFileCommand {
	public static readonly id = 'javascript-walkthrough.commands.createJsFile';
	public readonly id = CreateNewJSFileCommand.id;

	constructor(private walkthroughState: JsWalkthroughState) { }

	public execute() {
		createNewJSFile(this.walkthroughState);
	}
}

export class DebugJsFileCommand {
	public static readonly id = 'javascript-walkthrough.commands.debugJsFile';
	public readonly id = DebugJsFileCommand.id;

	constructor(private walkthroughState: JsWalkthroughState) { }

	public execute() {
		debugJsFile(this.walkthroughState);
	}
}

async function createHtmlFileWithScriptTag(walkthroughState: JsWalkthroughState) {
	const htmlPath = path.resolve(__dirname, '../../resources/walkthroughs/htmlFileWithScriptTag.html');
	const content = await readFile(htmlPath, 'utf8');
	const newFile = await vscode.workspace.openTextDocument({
		language: 'html',
		content,
	});
	walkthroughState.exampleHtmlDocument = newFile;
	//vscode.window.showInformationMessage(process.env.USERNAME!);
	const scriptStart = newFile.positionAt(newFile.getText().match(/^<script>$/m)!.index!);
	const editor = await vscode.window.showTextDocument(newFile, {
		viewColumn: vscode.ViewColumn.Beside,
		selection: new vscode.Range(scriptStart, scriptStart),
	});
	return editor;
}

async function createNewJSFile(walkthroughState: JsWalkthroughState) {
	const newFile = await vscode.workspace.openTextDocument({
		language: 'javascript',
		content: `// Write a message to the console.\nconsole.log('hello world!');`,
	});
	walkthroughState.exampleJsDocument = newFile;
	return vscode.window.showTextDocument(newFile, vscode.ViewColumn.Beside);
}

async function debugHtmlFile(walkthroughState: JsWalkthroughState) {
	tryDebugRelevantDocument(walkthroughState.exampleHtmlDocument, 'html', ['.html'], () => createHtmlFileWithScriptTag(walkthroughState));
}

async function debugJsFile(walkthroughState: JsWalkthroughState) {
	tryDebugRelevantDocument(walkthroughState.exampleJsDocument, 'javascript', ['.mjs', '.js'], () => createNewJSFile(walkthroughState));
}

type DocSearchResult =
	| { kind: 'visible'; editor: vscode.TextEditor }
	| { kind: 'hidden'; uri: vscode.Uri }
	| { kind: 'not-found' };

async function tryDebugRelevantDocument(lastDocument: vscode.TextDocument | undefined, languageId: string, languageExtensions: [string, ...string[]], createFileAndFocus: () => Promise<vscode.TextEditor>): Promise<void> {
	let searchResult!: DocSearchResult;
	for (const languageExtension of languageExtensions) {
		searchResult = tryFindRelevantDocument(lastDocument, languageId, languageExtension);
		if (searchResult.kind !== 'not-found') {
			break;
		}
	}

	let editor: vscode.TextEditor;
	// If not, make one.
	switch (searchResult.kind) {
		case 'visible':
			// Focus if necessary.
			editor = searchResult.editor;
			if (vscode.window.activeTextEditor !== editor) {
				await vscode.window.showTextDocument(editor.document, {
					viewColumn: vscode.ViewColumn.Beside,
				});
			}
			break;
		case 'hidden':
			editor = await vscode.window.showTextDocument(searchResult.uri, {
				viewColumn: vscode.ViewColumn.Beside,
			});
			break;
		case 'not-found':
			editor = await createFileAndFocus();
			break;
	}

	await Promise.all([
		vscode.commands.executeCommand('workbench.action.debug.start'),
		vscode.commands.executeCommand('workbench.debug.action.focusRepl'),
	]);

}

/** Tries to find a relevant {@link vscode.TextEditor} or a {@link vscode.Uri} for an open document */
function tryFindRelevantDocument(lastDocument: vscode.TextDocument | undefined, languageId: string, languageExtension: string): DocSearchResult {
	let editor: vscode.TextEditor | undefined;

	// Try to find the document created from the last step.
	if (lastDocument) {
		editor = vscode.window.visibleTextEditors.find(editor => editor.document === lastDocument);
	}

	// If we couldn't find that, find a visible document with the desired language.
	editor ??= vscode.window.visibleTextEditors.find(editor => editor.document.languageId === languageId);
	if (editor) {
		return {
			kind: 'visible',
			editor,
		};
	}

	// If we still couldn't find that, find a possibly not-visible document.
	for (const tabGroup of vscode.window.tabGroups.all) {
		for (const tab of tabGroup.tabs) {
			if (tab.input instanceof vscode.TabInputText && tab.input.uri.path.endsWith(languageExtension)) {
				return {
					kind: 'hidden',
					uri: tab.input.uri,
				};
			}
		}
	}

	return { kind: 'not-found' };
}
