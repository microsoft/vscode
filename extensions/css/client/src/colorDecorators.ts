/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as parse from 'parse-color';
import { window, workspace, DecorationOptions, DecorationRenderOptions, Disposable, Range, TextDocument, DocumentColorProvider, Color, ColorFormat, ColorInfo } from 'vscode';

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
					let decorations = ranges.slice(0, MAX_DECORATORS).map(range => {
						let color = document.getText(range);
						if (color[0] === '#' && (color.length === 5 || color.length === 9)) {
							let c = Color.fromHex(color);
							if (c) {
								color = `rgba(${c.red}, ${c.green}, ${c.blue}, ${c.alpha})`;
							}
						}
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

const CSSColorFormats = {
	Hex: '#{red:X}{green:X}{blue:X}',
	RGB: {
		opaque: 'rgb({red}, {green}, {blue})',
		transparent: 'rgba({red}, {green}, {blue}, {alpha:2f[0-1]})'
	},
	HSL: {
		opaque: 'hsl({hue:d[0-360]}, {saturation:d[0-100]}%, {luminosity:d[0-100]}%)',
		transparent: 'hsla({hue:d[0-360]}, {saturation:d[0-100]}%, {luminosity:d[0-100]}%, {alpha:2f[0-1]})'
	}
};

function detectFormat(value: string): ColorFormat {
	if (/^rgb/i.test(value)) {
		return CSSColorFormats.RGB;
	} else if (/^hsl/i.test(value)) {
		return CSSColorFormats.HSL;
	} else {
		return CSSColorFormats.Hex;
	}
}

export class ColorProvider implements DocumentColorProvider {

	constructor(private decoratorProvider: (uri: string) => Thenable<Range[]>) { }

	async provideDocumentColors(document: TextDocument): Promise<ColorInfo[]> {
		const ranges = await this.decoratorProvider(document.uri.toString());
		const result = [];
		for (let range of ranges) {
			let color;
			const value = document.getText(range);
			if (value[0] === '#') {
				color = Color.fromHex(value);
			} else {
				const parsedColor = parse(value);
				if (parsedColor && parsedColor.rgba) {
					const [red, green, blue, alpha] = parsedColor.rgba;
					color = new Color(red, green, blue, alpha);
				}
			}
			if (color) {
				const format = detectFormat(value);
				result.push(new ColorInfo(range, color, format, [CSSColorFormats.Hex, CSSColorFormats.RGB, CSSColorFormats.HSL]));
			}
		}
		return result;
	}
}