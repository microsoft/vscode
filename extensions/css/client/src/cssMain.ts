/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when vs code is activated
export function activate(context: vscode.ExtensionContext) {

	console.log('css is activated');

	let decorationType : vscode.DecorationRenderOptions = {
		before: {
//			content: "url(\"data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1.2em' height='0.9em' viewBox='0 0 16 16'%3E%3Crect x='1' y='1' stroke='white' style='stroke-width: 1;' width='14' height='14' fill='#FFB6C1' shape-rendering='crispEdges' /%3E%3C/svg%3E\")",
			content: '" "',
			borderStyle: 'solid',
			borderWidth: '0.1em',
			borderColor: '#000',
			margin: '0.1em 0.2em 0 0.2em',
			width: '0.8em',
			height: '0.8em'
		},
		dark: {
			before: {
				borderColor: '#eee'
			}
		}
	};

	var colorsDecorationType = vscode.window.createTextEditorDecorationType(decorationType);

	var activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		triggerUpdateDecorations();
	}

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	var timeout = null;
	function triggerUpdateDecorations() {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(updateDecorations, 500);
	}

	function updateDecorations() {
		if (!activeEditor) {
			return;
		}
		var regEx = /#[a-fA-F0-9]{6}/g;
		var text = activeEditor.document.getText();
		var colors : vscode.DecorationOptions[] = [];
		var match;
		while (match = regEx.exec(text)) {
			var startPos = activeEditor.document.positionAt(match.index);
			var endPos = activeEditor.document.positionAt(match.index + 1);
			var decoration : vscode.DecorationOptions = {
				range: new vscode.Range(startPos, endPos),
				hoverMessage: 'Color **' + match[0] + '**',
				renderOptions: {
					before: {
						backgroundColor: match[0]
					}
				}
			};
			colors.push(decoration);


		}
		activeEditor.setDecorations(colorsDecorationType, colors);
	}
}
