/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Based on @sergeche's work in his emmet plugin */

import * as vscode from 'vscode';
import evaluate from '@emmetio/math-expression';
import { DocumentStreamReader } from './bufferStream';

export function evaluateMathExpression() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	const stream = new DocumentStreamReader(editor.document);
	editor.edit(editBuilder => {
		editor.selections.forEach(selection => {
			const pos = selection.isReversed ? selection.anchor : selection.active;
			stream.pos = pos;

			try {
				const result = String(evaluate(stream, true));
				editBuilder.replace(new vscode.Range(stream.pos, pos), result);
			} catch (err) {
				vscode.window.showErrorMessage('Could not evaluate expression');
				// Ignore error since most likely it’s because of non-math expression
				console.warn('Math evaluation error', err);
			}
		});
	});

}
