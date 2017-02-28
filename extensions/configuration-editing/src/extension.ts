/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { getLocation, visit } from 'jsonc-parser';
import * as path from 'path';
import { SettingsDocument } from './settingsDocumentHelper';

const decoration = vscode.window.createTextEditorDecorationType({
	color: '#b1b1b1'
});

let pendingLaunchJsonDecoration: NodeJS.Timer;

export function activate(context): void {

	//keybindings.json command-suggestions
	context.subscriptions.push(registerKeybindingsCompletions());

	//settings.json suggestions
	context.subscriptions.push(registerSettingsCompletions());

	// launch.json decorations
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => updateLaunchJsonDecorations(editor), null, context.subscriptions));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
			if (pendingLaunchJsonDecoration) {
				clearTimeout(pendingLaunchJsonDecoration);
			}
			pendingLaunchJsonDecoration = setTimeout(() => updateLaunchJsonDecorations(vscode.window.activeTextEditor), 1000);
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
				return commands.then(ids => ids.map(id => newSimpleCompletionItem(JSON.stringify(id), range)));
			}
		}
	});
}

function registerSettingsCompletions(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ language: 'json', pattern: '**/settings.json' }, {
		provideCompletionItems(document, position, token) {
			return new SettingsDocument(document).provideCompletionItems(position, token);
		}
	});
}

function newSimpleCompletionItem(text: string, range: vscode.Range, description?: string): vscode.CompletionItem {
	const item = new vscode.CompletionItem(text);
	item.kind = vscode.CompletionItemKind.Value;
	item.detail = description;
	item.insertText = text;
	item.range = range;

	return item;
}

function updateLaunchJsonDecorations(editor: vscode.TextEditor | undefined): void {
	if (!editor || path.basename(editor.document.fileName) !== 'launch.json') {
		return;
	}

	const ranges: vscode.Range[] = [];
	let addPropertyAndValue = false;
	let depthInArray = 0;
	visit(editor.document.getText(), {
		onObjectProperty: (property, offset, length) => {
			// Decorate attributes which are unlikely to be edited by the user.
			// Only decorate "configurations" if it is not inside an array (compounds have a configurations property which should not be decorated).
			addPropertyAndValue = property === 'version' || property === 'type' || property === 'request' || property === 'compounds' || (property === 'configurations' && depthInArray === 0);
			if (addPropertyAndValue) {
				ranges.push(new vscode.Range(editor.document.positionAt(offset), editor.document.positionAt(offset + length)));
			}
		},
		onLiteralValue: (value, offset, length) => {
			if (addPropertyAndValue) {
				ranges.push(new vscode.Range(editor.document.positionAt(offset), editor.document.positionAt(offset + length)));
			}
		},
		onArrayBegin: (offset: number, length: number) => {
			depthInArray++;
		},
		onArrayEnd: (offset: number, length: number) => {
			depthInArray--;
		}
	});

	editor.setDecorations(decoration, ranges);
}