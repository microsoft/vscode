/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';


export const tsTextSpanToVsRange = (span: Proto.TextSpan) =>
	new vscode.Range(
		span.start.line - 1, span.start.offset - 1,
		span.end.line - 1, span.end.offset - 1);

export const tsLocationToVsPosition = (tslocation: Proto.Location) =>
	new vscode.Position(tslocation.line - 1, tslocation.offset - 1);

export const vsPositionToTsFileLocation = (file: string, position: vscode.Position): Proto.FileLocationRequestArgs => ({
	file,
	line: position.line + 1,
	offset: position.character + 1
});

export const vsRangeToTsFileRange = (file: string, range: vscode.Range): Proto.FileRangeRequestArgs => ({
	file,
	startLine: range.start.line + 1,
	startOffset: range.start.character + 1,
	endLine: range.end.line + 1,
	endOffset: range.end.character + 1
});