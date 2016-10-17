/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { getLocation, visit } from 'jsonc-parser';
import * as path from 'path';

const decoration = vscode.window.createTextEditorDecorationType({
	color: '#b1b1b1'
});

export function activate(context) {

	//keybindings.json command-suggestions
	context.subscriptions.push(registerKeybindingsCompletions());

	// launch.json decorations
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => updateLaunchJsonDecorations(editor), null, context.subscriptions));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
			updateLaunchJsonDecorations(vscode.window.activeTextEditor);
		}
	}, null, context.subscriptions));
	updateLaunchJsonDecorations(vscode.window.activeTextEditor);
}

function registerKeybindingsCompletions(): vscode.Disposable {
	const commands = vscode.commands.getCommands(true);

	return vscode.languages.registerCompletionItemProvider({ pattern: '**/keybindings.json' }, {

		provideCompletionItems(document, position, token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (location.path[1] === 'command') {

				const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
				return commands.then(ids => ids.map(id => newCompletionItem(id, range)));
			}
		}
	});
}

function updateLaunchJsonDecorations(editor: vscode.TextEditor) {
	if (!editor || path.basename(editor.document.fileName) !== 'launch.json') {
		return;
	}

	const ranges = [];
	let addPropertyAndValue = false;
	visit(editor.document.getText(), {
		onObjectProperty: (property, offset, length) => {
			addPropertyAndValue = property === 'version' || property === 'type' || property === 'request' || property === 'configurations';
			if (addPropertyAndValue) {
				ranges.push(new vscode.Range(editor.document.positionAt(offset), editor.document.positionAt(offset + length)));
			}
		},
		onLiteralValue: (value, offset, length) => {
			if (addPropertyAndValue) {
				ranges.push(new vscode.Range(editor.document.positionAt(offset), editor.document.positionAt(offset + length)));
			}
		}
	});

	editor.setDecorations(decoration, ranges);
}

function newCompletionItem(text: string, range: vscode.Range, documentation?: string) {
	const item = new vscode.CompletionItem(JSON.stringify(text));
	item.kind = vscode.CompletionItemKind.Value;
	item.documentation = documentation;
	item.textEdit = {
		range,
		newText: item.label
	};
	return item;
}
