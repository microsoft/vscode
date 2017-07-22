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

export function activateColorDecorations(decoratorProvider: (uri: string) => Thenable<Range[]>, supportedLanguages: { [id: string]: boolean }, isDecoratorEnabled: (languageId: string) => boolean): Disposable {

	let disposables: Disposable[] = [];

	let colorsDecorationType = window.createTextEditorDecorationType(decorationType);
	disposables.push(colorsDecorationType);

	let decoratorEnablement = {};
	for (let languageId in supportedLanguages) {
		decoratorEnablement[languageId] = isDecoratorEnabled(languageId);
	}

	let pendingUpdateRequests: { [key: string]: NodeJS.Timer; } = {};

	window.onDidChangeVisibleTextEditors(editors => {
		for (let editor of editors) {
			triggerUpdateDecorations(editor.document);
		}
	}, null, disposables);

	workspace.onDidChangeTextDocument(event => triggerUpdateDecorations(event.document), null, disposables);

	// track open and close for document languageId changes
	workspace.onDidCloseTextDocument(event => triggerUpdateDecorations(event, true));
	workspace.onDidOpenTextDocument(event => triggerUpdateDecorations(event));

	workspace.onDidChangeConfiguration(_ => {
		let hasChanges = false;
		for (let languageId in supportedLanguages) {
			let prev = decoratorEnablement[languageId];
			let curr = isDecoratorEnabled(languageId);
			if (prev !== curr) {
				decoratorEnablement[languageId] = curr;
				hasChanges = true;
			}
		}
		if (hasChanges) {
			updateAllVisibleEditors(true);
		}
	}, null, disposables);

	updateAllVisibleEditors(false);

	function updateAllVisibleEditors(settingsChanges: boolean) {
		window.visibleTextEditors.forEach(editor => {
			if (editor.document) {
				triggerUpdateDecorations(editor.document, settingsChanges);
			}
		});
	}

	function triggerUpdateDecorations(document: TextDocument, settingsChanges = false) {
		let triggerUpdate = supportedLanguages[document.languageId] && (decoratorEnablement[document.languageId] || settingsChanges);
		if (triggerUpdate) {
			let documentUriStr = document.uri.toString();
			let timeout = pendingUpdateRequests[documentUriStr];
			if (typeof timeout !== 'undefined') {
				clearTimeout(timeout);
			}
			pendingUpdateRequests[documentUriStr] = setTimeout(() => {
				// check if the document is in use by an active editor
				for (let editor of window.visibleTextEditors) {
					if (editor.document && documentUriStr === editor.document.uri.toString()) {
						if (decoratorEnablement[editor.document.languageId]) {
							updateDecorationForEditor(documentUriStr, editor.document.version);
							break;
						} else {
							editor.setDecorations(colorsDecorationType, []);
						}
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
					let decorations = [];
					for (let i = 0; i < ranges.length && decorations.length < MAX_DECORATORS; i++) {
						let range = ranges[i];
						let text = document.getText(range);
						let value = <string>JSON.parse(text);
						let color = hex2CSSColor(value);
						if (color) {
							decorations.push(<DecorationOptions>{
								range: range,
								renderOptions: {
									before: {
										backgroundColor: color
									}
								}
							});
						}
					}
					editor.setDecorations(colorsDecorationType, decorations);
				}
			}
		});
	}

	return Disposable.from(...disposables);
}

const colorPattern = /^#[0-9A-Fa-f]{3,8}$/;

function hex2CSSColor(hex: string): string {
	if (!hex || !colorPattern.test(hex)) {
		return null;
	}

	if (hex.length === 4 || hex.length === 7) {
		// #RGB or #RRGGBB format
		return hex;
	}
	if (hex.length === 5) {
		// #RGBA format
		let val = parseInt(hex.substr(1), 16);
		let r = (val >> 12) & 0xF;
		let g = (val >> 8) & 0xF;
		let b = (val >> 4) & 0xF;
		let a = val & 0xF;
		return `rgba(${r + r * 16}, ${g + g * 16}, ${b + b + 16}, ${+(a / 16).toFixed(2)})`;
	}
	if (hex.length === 9) {
		// #RRGGBBAA format
		let val = parseInt(hex.substr(1), 16);
		let r = (val >> 24) & 0xFF;
		let g = (val >> 16) & 0xFF;
		let b = (val >> 8) & 0xFF;
		let a = val & 0xFF;
		return `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(2)})`;
	}
	return null;
}

