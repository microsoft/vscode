/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { expand } from '@emmetio/expand-abbreviation';
import { getSyntax, getProfile, extractAbbreviation } from './util';

const field = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;

export function wrapWithAbbreviation() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	let rangeToReplace: vscode.Range = editor.selection;
	if (rangeToReplace.isEmpty) {
		rangeToReplace = new vscode.Range(rangeToReplace.start.line, 0, rangeToReplace.start.line, editor.document.lineAt(rangeToReplace.start.line).text.length);
	}
	let textToReplace = editor.document.getText(rangeToReplace);
	let syntax = getSyntax(editor.document);
	let options = {
		field: field,
		syntax: syntax,
		profile: getProfile(getSyntax(editor.document)),
		text: textToReplace,
		addons: syntax === 'jsx' ? { 'jsx': syntax === 'jsx' } : null
	};

	vscode.window.showInputBox({ prompt: 'Enter Abbreviation' }).then(abbr => {
		if (!abbr || !abbr.trim()) { return; }
		let expandedText = expand(abbr, options);
		editor.insertSnippet(new vscode.SnippetString(expandedText), rangeToReplace);
	});
}

export function expandAbbreviation() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No editor is active');
		return;
	}
	let rangeToReplace: vscode.Range = editor.selection;
	let abbr = editor.document.getText(rangeToReplace);
	if (rangeToReplace.isEmpty) {
		[rangeToReplace, abbr] = extractAbbreviation(rangeToReplace.start);
	}
	let syntax = getSyntax(editor.document);
	let options = {
		field: field,
		syntax: syntax,
		profile: getProfile(getSyntax(editor.document)),
		addons: syntax === 'jsx' ? { 'jsx': true } : null
	};

	let expandedText = expand(abbr, options);
	editor.insertSnippet(new vscode.SnippetString(expandedText), rangeToReplace);
}