/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Minimal version of {@link vscode.TextDocument}.
 */
export interface ITextDocument {
	readonly uri: vscode.Uri;
	readonly version: number;
	readonly lineCount: number;

	getText(range?: vscode.Range): string;
	positionAt(offset: number): vscode.Position;
}

export function getLine(doc: ITextDocument, line: number): string {
	return doc.getText(new vscode.Range(line, 0, line, Number.MAX_VALUE)).replace(/\r?\n$/, '');
}
