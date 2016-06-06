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
			contentText: '"',
			border: 'solid 0.1em #000',
			margin: '0.2em 0.2em 0 0.2em',
			width: '0.8em',
			height: '0.8em'
		},
		dark: {
			before: {
				border: 'solid 0.1em #eee'
			}
		}
	};

	let decorationType2 : vscode.DecorationRenderOptions = {
		after: {
			contentIconPath: "data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%20enable-background%3D%22new%200%200%2016%2016%22%20height%3D%2216%22%20width%3D%2216%22%3E%3Cpath%20fill%3D%22%23F6F6F6%22%20d%3D%22M7.5%202L2%2012l2%202h9l2-2L9.5%202z%22/%3E%3Cpath%20d%3D%22M9%203H8l-4.5%209%201%201h8l1-1L9%203zm0%209H8v-1h1v1zm0-2H8V6h1v4z%22%20fill%3D%22%23fc0%22/%3E%3Cpath%20d%3D%22M9%2010H8V6h1v4zm0%201H8v1h1v-1z%22/%3E%3C/svg%3E\")"

		}
	};


//			content: "url(\"data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1.2em' height='0.9em' viewBox='0 0 16 16'%3E%3Crect x='1' y='1' stroke='white' style='stroke-width: 1;' width='14' height='14' fill='#FFB6C1' shape-rendering='crispEdges' /%3E%3C/svg%3E\")",

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
			var endPos = activeEditor.document.positionAt(match.index + match[0].length);
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
