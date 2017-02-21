/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { toThenable } from 'vs/base/common/async';
import { DiffComputer } from 'vs/editor/common/diff/diffComputer';

function getTextDocumentLines(document: vscode.TextDocument): string[] {
	const result = [];
	for (let i = 0; i < document.lineCount; i++) {
		result.push(document.lineAt(i).text);
	}
	return result;
}

export function computeDiff(oneDocument: vscode.TextDocument, otherDocument: vscode.TextDocument): Thenable<vscode.LineChange[]> {
	const oneLines = getTextDocumentLines(oneDocument);
	const otherLines = getTextDocumentLines(otherDocument);
	const computer = new DiffComputer(oneLines, otherLines, {
		shouldPostProcessCharChanges: false,
		shouldIgnoreTrimWhitespace: false, // options?
		shouldConsiderTrimWhitespaceInEmptyCase: false
	});

	return toThenable(computer.computeDiff());
}