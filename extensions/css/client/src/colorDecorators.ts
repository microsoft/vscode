/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {window, workspace, DecorationOptions, DecorationRenderOptions, Disposable, Range} from 'vscode';

let decorationType: DecorationRenderOptions = {
	before: {
		contentText: ' ',
		border: 'solid 0.1em #000',
		margin: '0.1em 0.2em 0 0.2em',
		width: '0.8em',
		height: '0.8em'
	},
	dark: {
		before: {
			border: 'solid 0.1em #eee'
		}
	}
};

export function activateColorDecorations(decoratorProvider: (uri: string) => Thenable<Range[]>, supportedLanguages: { [id: string]: boolean }): Disposable {

	let disposables: Disposable[] = [];

	let colorsDecorationType = window.createTextEditorDecorationType(decorationType);
	disposables.push(colorsDecorationType);

	let activeEditor = window.activeTextEditor;
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

	let timeout = null;
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
				return <DecorationOptions>{
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
	return Disposable.from(...disposables);
}
