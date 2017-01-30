/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { window, workspace, DecorationOptions, DecorationRenderOptions, Disposable, Range, TextDocument } from 'vscode';

const MAX_DECORATORS = 500;

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

	let pendingUpdateRequests: { [key: string]: NodeJS.Timer; } = {};

	window.onDidChangeVisibleTextEditors(editors => {
		for (let editor of editors) {
			triggerUpdateDecorations(editor.document);
		}
	}, null, disposables);

	workspace.onDidChangeTextDocument(event => triggerUpdateDecorations(event.document), null, disposables);

	// we care about all visible editors
	window.visibleTextEditors.forEach(editor => {
		if (editor.document) {
			triggerUpdateDecorations(editor.document);
		}
	});

	function triggerUpdateDecorations(document: TextDocument) {
		let triggerUpdate = supportedLanguages[document.languageId];
		let documentUri = document.uri;
		let documentUriStr = documentUri.toString();
		let timeout = pendingUpdateRequests[documentUriStr];
		if (typeof timeout !== 'undefined') {
			clearTimeout(timeout);
			triggerUpdate = true; // force update, even if languageId is not supported (anymore)
		}
		if (triggerUpdate) {
			pendingUpdateRequests[documentUriStr] = setTimeout(() => {
				// check if the document is in use by an active editor
				for (let editor of window.visibleTextEditors) {
					if (editor.document && documentUriStr === editor.document.uri.toString()) {
						updateDecorationForEditor(documentUriStr, editor.document.version);
						break;
					}
				}
				delete pendingUpdateRequests[documentUriStr];
			}, 500);
		}
	}

	function updateDecorationForEditor(contentUri: string, documentVersion: number) {
		decoratorProvider(contentUri).then(ranges => {
			for (let editor of window.visibleTextEditors) {
				let document = editor.document;

				if (document && document.version === documentVersion && contentUri === document.uri.toString()) {
					let decorations = ranges.slice(0, MAX_DECORATORS).map(range => {
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
				}
			}
		});
	}

	return Disposable.from(...disposables);
}
