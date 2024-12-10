/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export function del<T>(array: T[], e: T): void {
	const idx = array.indexOf(e);
	if (idx >= 0) {
		array.splice(idx, 1);
	}
}

export function tail<T>(array: T[]): T | undefined {
	return array[array.length - 1];
}

export function asResourceUrl(uri: vscode.Uri, range: vscode.Range): vscode.Uri {
	return uri.with({ fragment: `L${1 + range.start.line},${1 + range.start.character}-${1 + range.end.line},${1 + range.end.character}` });
}

export async function isValidRequestPosition(uri: vscode.Uri, position: vscode.Position) {
	const doc = await vscode.workspace.openTextDocument(uri);
	let range = doc.getWordRangeAtPosition(position);
	if (!range) {
		range = doc.getWordRangeAtPosition(position, /[^\s]+/);
	}
	return Boolean(range);
}

export function getPreviewChunks(doc: vscode.TextDocument, range: vscode.Range, beforeLen: number = 8, trim: boolean = true) {
	const previewStart = range.start.with({ character: Math.max(0, range.start.character - beforeLen) });
	const wordRange = doc.getWordRangeAtPosition(previewStart);
	let before = doc.getText(new vscode.Range(wordRange ? wordRange.start : previewStart, range.start));
	const inside = doc.getText(range);
	const previewEnd = range.end.translate(0, 331);
	let after = doc.getText(new vscode.Range(range.end, previewEnd));
	if (trim) {
		before = before.replace(/^\s*/g, '');
		after = after.replace(/\s*$/g, '');
	}
	return { before, inside, after };
}

export class ContextKey<V> {

	constructor(readonly name: string) { }

	async set(value: V) {
		await vscode.commands.executeCommand('setContext', this.name, value);
	}

	async reset() {
		await vscode.commands.executeCommand('setContext', this.name, undefined);
	}
}

export class WordAnchor {

	private readonly _version: number;
	private readonly _word: string | undefined;

	constructor(private readonly _doc: vscode.TextDocument, private readonly _position: vscode.Position) {
		this._version = _doc.version;
		this._word = this._getAnchorWord(_doc, _position);
	}

	private _getAnchorWord(doc: vscode.TextDocument, pos: vscode.Position): string | undefined {
		const range = doc.getWordRangeAtPosition(pos) || doc.getWordRangeAtPosition(pos, /[^\s]+/);
		return range && doc.getText(range);
	}

	guessedTrackedPosition(): vscode.Position | undefined {
		// funky entry
		if (!this._word) {
			return this._position;
		}

		// no changes
		if (this._version === this._doc.version) {
			return this._position;
		}

		// no changes here...
		const wordNow = this._getAnchorWord(this._doc, this._position);
		if (this._word === wordNow) {
			return this._position;
		}

		// changes: search _word downwards and upwards
		const startLine = this._position.line;
		let i = 0;
		let line: number;
		let checked: boolean;
		do {
			checked = false;
			// nth line down
			line = startLine + i;
			if (line < this._doc.lineCount) {
				checked = true;
				const ch = this._doc.lineAt(line).text.indexOf(this._word);
				if (ch >= 0) {
					return new vscode.Position(line, ch);
				}
			}
			i += 1;
			// nth line up
			line = startLine - i;
			if (line >= 0) {
				checked = true;
				const ch = this._doc.lineAt(line).text.indexOf(this._word);
				if (ch >= 0) {
					return new vscode.Position(line, ch);
				}
			}
		} while (i < 100 && checked);

		// fallback
		return this._position;
	}
}

// vscode.SymbolKind.File === 0, Module === 1, etc...
const _themeIconIds = [
	'symbol-file', 'symbol-module', 'symbol-namespace', 'symbol-package', 'symbol-class', 'symbol-method',
	'symbol-property', 'symbol-field', 'symbol-constructor', 'symbol-enum', 'symbol-interface',
	'symbol-function', 'symbol-variable', 'symbol-constant', 'symbol-string', 'symbol-number', 'symbol-boolean',
	'symbol-array', 'symbol-object', 'symbol-key', 'symbol-null', 'symbol-enum-member', 'symbol-struct',
	'symbol-event', 'symbol-operator', 'symbol-type-parameter'
];

export function getThemeIcon(kind: vscode.SymbolKind): vscode.ThemeIcon | undefined {
	const id = _themeIconIds[kind];
	return id ? new vscode.ThemeIcon(id) : undefined;
}
