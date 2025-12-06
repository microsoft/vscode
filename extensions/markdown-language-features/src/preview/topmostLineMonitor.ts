/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import { ResourceMap } from '../util/resourceMap';

export interface LastScrollLocation {
	readonly line: number;
	readonly uri: vscode.Uri;
}

export class TopmostLineMonitor extends Disposable {

	private readonly _pendingUpdates = new ResourceMap<number>();
	private readonly _throttle = 50;
	private readonly _previousTextEditorInfo = new ResourceMap<LastScrollLocation>();
	private readonly _previousStaticEditorInfo = new ResourceMap<LastScrollLocation>();

	constructor() {
		super();

		if (vscode.window.activeTextEditor) {
			const line = getVisibleLine(vscode.window.activeTextEditor);
			this.setPreviousTextEditorLine({ uri: vscode.window.activeTextEditor.document.uri, line: line ?? 0 });
		}

		this._register(vscode.window.onDidChangeTextEditorVisibleRanges(event => {
			if (isMarkdownFile(event.textEditor.document)) {
				const line = getVisibleLine(event.textEditor);
				if (typeof line === 'number') {
					this.updateLine(event.textEditor.document.uri, line);
					this.setPreviousTextEditorLine({ uri: event.textEditor.document.uri, line: line });
				}
			}
		}));
	}

	private readonly _onChanged = this._register(new vscode.EventEmitter<{ readonly resource: vscode.Uri; readonly line: number }>());
	public readonly onDidChanged = this._onChanged.event;

	public setPreviousStaticEditorLine(scrollLocation: LastScrollLocation): void {
		this._previousStaticEditorInfo.set(scrollLocation.uri, scrollLocation);
	}

	public getPreviousStaticEditorLineByUri(resource: vscode.Uri): number | undefined {
		const scrollLoc = this._previousStaticEditorInfo.get(resource);
		this._previousStaticEditorInfo.delete(resource);
		return scrollLoc?.line;
	}


	public setPreviousTextEditorLine(scrollLocation: LastScrollLocation): void {
		this._previousTextEditorInfo.set(scrollLocation.uri, scrollLocation);
	}

	public getPreviousTextEditorLineByUri(resource: vscode.Uri): number | undefined {
		const scrollLoc = this._previousTextEditorInfo.get(resource);
		this._previousTextEditorInfo.delete(resource);
		return scrollLoc?.line;
	}

	public getPreviousStaticTextEditorLineByUri(resource: vscode.Uri): number | undefined {
		const state = this._previousStaticEditorInfo.get(resource);
		return state?.line;
	}

	public updateLine(
		resource: vscode.Uri,
		line: number
	) {
		if (!this._pendingUpdates.has(resource)) {
			// schedule update
			setTimeout(() => {
				if (this._pendingUpdates.has(resource)) {
					this._onChanged.fire({
						resource,
						line: this._pendingUpdates.get(resource) as number
					});
					this._pendingUpdates.delete(resource);
				}
			}, this._throttle);
		}

		this._pendingUpdates.set(resource, line);
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
