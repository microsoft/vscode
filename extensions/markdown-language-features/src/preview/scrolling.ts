/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

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

export class StartingScrollFragment {
	public readonly type = 'fragment';

	constructor(
		public readonly fragment: string,
	) { }
}

export class StartingScrollLine {
	public readonly type = 'line';

	constructor(
		public readonly line: number,
	) { }
}

export type StartingScrollLocation = StartingScrollLine | StartingScrollFragment;
