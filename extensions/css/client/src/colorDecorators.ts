/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {window, workspace, DecorationOptions, Disposable, Range} from 'vscode';

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

export function activateColorDecorations(decoratorProvider: (uri:string) => Thenable<Range[]>, supportedLanguages: {[id:string]:boolean}) : Disposable {

	let disposables: Disposable[] = [];

	var colorsDecorationType = window.createTextEditorDecorationType(decorationType);

	var activeEditor = vscode.window.activeTextEditor;
	if (activeEditor) {
		triggerUpdateDecorations();
	}

	window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor && supportedLanguages[activeEditor.document.languageId]) {
			triggerUpdateDecorations();
		}
	}, null, disposables);

	workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document && supportedLanguages[activeEditor.document.languageId]) {
			triggerUpdateDecorations();
		}
	}, null, disposables);

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
		let document = activeEditor.document;
		if (!supportedLanguages[document.languageId]) {
			return;
		}
		let uri = activeEditor.document.uri.toString();
		decoratorProvider(uri).then(ranges => {

			let decorations = ranges.map(range => {
				let color = document.getText(range);
				return <DecorationOptions> {
					range: range,
					renderOptions: {
						before: {
							backgroundColor: color
						}
					}
				};
			});
			activeEditor.setDecorations(colorsDecorationType, decorations);

		});
	}
}
