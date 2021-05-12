/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { isMarkdownFile } from './file';

export interface LastScrollLocation {
	readonly line: number;
	readonly uri: vscode.Uri | undefined;
}

export class TopmostLineMonitor extends Disposable {

	private readonly pendingUpdates = new Map<string, number>();
	private readonly throttle = 50;
	public previousMDTextEditor: vscode.TextEditor | undefined;
	public previousStaticEditorInfo: LastScrollLocation = { line: 0, uri: undefined };

	constructor() {
		super();
		this.previousMDTextEditor = vscode.window.activeTextEditor;
		this._register(vscode.window.onDidChangeTextEditorVisibleRanges(event => {
			if (isMarkdownFile(event.textEditor.document)) {
				const line = getVisibleLine(event.textEditor);
				if (typeof line === 'number') {
					this.updateLine(event.textEditor.document.uri, line);
				}
			}
		}));

		this._register(vscode.window.onDidChangeActiveTextEditor(textEditor => {

			// When at a markdown file, apply existing scroll settings from static preview if applicable.
			// Also save reference to text editor for line number reference later
			if (textEditor && isMarkdownFile(textEditor.document!)) {

				if (this.previousStaticEditorInfo.uri?.toString() === textEditor.document.uri.toString()) {
					const line = this.previousStaticEditorInfo.line ? this.previousStaticEditorInfo.line : 0;
					scrollEditorToLine(line, textEditor);
				}

				this.previousMDTextEditor = textEditor;
			}
		}));
	}

	private readonly _onChanged = this._register(new vscode.EventEmitter<{ readonly resource: vscode.Uri, readonly line: number }>());
	public readonly onDidChanged = this._onChanged.event;

	private updateLine(
		resource: vscode.Uri,
		line: number
	) {
		const key = resource.toString();
		if (!this.pendingUpdates.has(key)) {
			// schedule update
			setTimeout(() => {
				if (this.pendingUpdates.has(key)) {
					this._onChanged.fire({
						resource,
						line: this.pendingUpdates.get(key) as number
					});
					this.pendingUpdates.delete(key);
				}
			}, this.throttle);
		}

		this.pendingUpdates.set(key, line);
	}
}

/**
 * Get the top-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
export function getVisibleLine(
	editor: vscode.TextEditor
): number | undefined {
	if (!editor.visibleRanges.length) {
		return undefined;
	}

	const firstVisiblePosition = editor.visibleRanges[0].start;
	const lineNumber = firstVisiblePosition.line;
	const line = editor.document.lineAt(lineNumber);
	const progress = firstVisiblePosition.character / (line.text.length + 2);
	return lineNumber + progress;
}
/**
 * Change the top-most visible line of `editor` to be at `line`
 */
export function scrollEditorToLine(
	line: number,
	editor: vscode.TextEditor
) {
	const sourceLine = Math.floor(line);
	const fraction = line - sourceLine;
	const text = editor.document.lineAt(sourceLine).text;
	const start = Math.floor(fraction * text.length);
	editor.revealRange(
		new vscode.Range(sourceLine, start, sourceLine + 1, 0),
		vscode.TextEditorRevealType.AtTop);
}
