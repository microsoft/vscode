/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as cp from 'child_process';

import { Disposable } from '../utils/dispose';
import { CommandManager } from '../commands/commandManager';

const localize = nls.loadMessageBundle();

export async function nodeWasResolvable(): Promise<boolean> {
	let execStr: string;
	switch (process.platform) {
		case 'win32':
			execStr = 'where node';
			break;
		case 'aix':
		case 'cygwin':
		case 'darwin':
		case 'freebsd':
		case 'haiku':
		case 'linux':
		case 'netbsd':
		case 'openbsd':
		case 'sunos':
			execStr = 'which node';
			break;
		default:
			return false;
	}

	return new Promise(resolve => {
		cp.exec(execStr, { windowsHide: true }, err => {
			resolve(!err);
		});
	});
}

export class JsWalkthroughState extends Disposable {
	exampleJsDocument: vscode.TextDocument | undefined = undefined;

	override dispose() {
		this.exampleJsDocument = undefined;
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

export class NodeInstallationFoundCommand {
	public static readonly id = 'javascript-walkthrough.commands.nodeInstallationFound';
	public readonly id = NodeInstallationFoundCommand.id;
	public execute() { }
}

async function createNewJSFile(walkthroughState: JsWalkthroughState) {
	const newFile = await vscode.workspace.openTextDocument({
		language: 'javascript',
		content: `// Write a message to the console.\nconsole.log('hello world!');\n`,
	});
	walkthroughState.exampleJsDocument = newFile;
	return vscode.window.showTextDocument(newFile, vscode.ViewColumn.Beside);
}

async function debugJsFile(walkthroughState: JsWalkthroughState) {
	const hasNode = await nodeWasResolvable();
	if (!hasNode) {
		const reloadResponse = localize('reloadWindowForNode', 'Reload VS Code');
		const debugAnywayResponse = localize('nodeNotFoundDebugAnyway', 'Try Debugging Anyway');
		const dismissResponse = localize('nodeNotFoundDismissDialog', 'Dismiss');
		const response = await vscode.window.showErrorMessage(
			// The message
			localize('noNodeInstallFound', 'We couldn\'t find Node.js on this computer. If you just installed it, you might need to reload VS Code.'),
			// The options
			reloadResponse,
			debugAnywayResponse,
			dismissResponse,
		);

		if (response === undefined || response === dismissResponse) {
			return;
		}
		if (response === reloadResponse) {
			vscode.commands.executeCommand('workbench.action.reloadWindow');
			return;
		}
	}
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

export function registerJsNodeWalkthrough(
	commandManager: CommandManager,
	jsWalkthroughState: JsWalkthroughState,
) {
	commandManager.register(new CreateNewJSFileCommand(jsWalkthroughState));
	commandManager.register(new DebugJsFileCommand(jsWalkthroughState));
}
