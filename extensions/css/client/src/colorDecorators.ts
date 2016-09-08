/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {window, workspace, DecorationOptions, DecorationRenderOptions, Disposable, Range, TextDocument, TextEditor} from 'vscode';

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

	let pendingUpdateRequests : { [key:string]: NodeJS.Timer; } = {};

	// we care about all visible editors
	window.visibleTextEditors.forEach(editor => {
		if (editor.document) {
			triggerUpdateDecorations(editor.document);
		}
	});
	// to get visible one has to become active
	window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			triggerUpdateDecorations(editor.document);
		}
	}, null, disposables);

	workspace.onDidChangeTextDocument(event => triggerUpdateDecorations(event.document), null, disposables);
	workspace.onDidOpenTextDocument(triggerUpdateDecorations, null, disposables);
	workspace.onDidCloseTextDocument(triggerUpdateDecorations, null, disposables);

	function triggerUpdateDecorations(document: TextDocument) {
		let triggerUpdate = supportedLanguages[document.languageId];
		let uri = document.uri.toString();
		let timeout = pendingUpdateRequests[uri];
		if (typeof timeout !== 'undefined') {
			clearTimeout(timeout);
			triggerUpdate = true; // force update, even if languageId is not supported (anymore)
		}
		if (triggerUpdate) {
			pendingUpdateRequests[uri] = setTimeout(() => {
				updateDecorations(uri);
				delete pendingUpdateRequests[uri];
			}, 500);
		}
	}

	function updateDecorations(uri: string) {
		window.visibleTextEditors.forEach(editor => {
			let document = editor.document;
			if (document && document.uri.toString() === uri) {
				updateDecorationForEditor(editor);
			}
		});
	}

	function updateDecorationForEditor(editor: TextEditor) {
		let document = editor.document;
		if (supportedLanguages[document.languageId]) {
			decoratorProvider(document.uri.toString()).then(ranges => {
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
				editor.setDecorations(colorsDecorationType, decorations);
			});
		} else {
			editor.setDecorations(colorsDecorationType, []);
		}
	}

	return Disposable.from(...disposables);
}
