/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { isMarkdownFile } from './file';

export interface LastScrollLocation {
	readonly line: number;
	readonly uri: vscode.Uri;
}

export class TopmostLineMonitor extends Disposable {

	private readonly pendingUpdates = new Map<string, number>();
	private readonly throttle = 50;
	private previousEditorInfo = new Map<string, LastScrollLocation>();
	public isPrevEditorCustom = false;

	constructor() {
		super();

		if (vscode.window.activeTextEditor) {
			const line = getVisibleLine(vscode.window.activeTextEditor);
			this.setPreviousEditorLine({ uri: vscode.window.activeTextEditor.document.uri, line: line ?? 0 });
		}

		this._register(vscode.window.onDidChangeTextEditorVisibleRanges(event => {
			if (isMarkdownFile(event.textEditor.document)) {
				const line = getVisibleLine(event.textEditor);
				if (typeof line === 'number') {
					this.updateLine(event.textEditor.document.uri, line);
					this.setPreviousEditorLine({ uri: event.textEditor.document.uri, line: line });
				}
			}
		}));
	}

	private readonly _onChanged = this._register(new vscode.EventEmitter<{ readonly resource: vscode.Uri, readonly line: number }>());
	public readonly onDidChanged = this._onChanged.event;

	public setPreviousEditorLine(scrollLocation: LastScrollLocation): void {
		this.previousEditorInfo.set(scrollLocation.uri.toString(), scrollLocation);
	}

	public getPreviousEditorLineByUri(resource: vscode.Uri): number | undefined {
		const scrollLoc = this.previousEditorInfo.get(resource.toString());
		return scrollLoc?.line;
	}

	public updateLine(
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
