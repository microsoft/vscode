/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Return {name, args} from a signature string `name` + `args`
 */
export function splitSignatureString(signature: string): { name: string; args: string } {
	const i = signature.search(/[[{]/);
	if (i > -1) {
		return {
			name: signature.substring(0, i),
			args: signature.substring(i)
		};
	} else {
		return {
			name: signature,
			args: ''
		};
	}
}

export class CmdEnvSuggestion extends vscode.CompletionItem {
	packageName: string;
	keys: string[];
	keyPos: number;
	signature: { name: string; args: string };
	ifCond?: string;
	unusual?: boolean;

	constructor(
		label: string,
		packageName: string,
		keys: string[],
		keyPos: number,
		signature: { name: string; args: string },
		kind: vscode.CompletionItemKind,
		ifCond?: string,
		unusual?: boolean
	) {
		super(label, kind);
		this.label = label;
		this.packageName = packageName;
		this.keys = keys;
		this.keyPos = keyPos;
		this.signature = signature;
		this.ifCond = ifCond;
		this.unusual = unusual;
	}

	/**
	 * Return the signature, ie the name + {} for mandatory arguments + [] for optional arguments.
	 * The leading backward slash is not part of the signature
	 */
	signatureAsString(): string {
		return this.signature.name + this.signature.args;
	}

	/**
	 * Return the name without the arguments
	 * The leading backward slash is not part of the signature
	 */
	name(): string {
		return this.signature.name;
	}

	hasOptionalArgs(): boolean {
		return this.signature.args.includes('[');
	}
}

export function filterNonLetterSuggestions(
	suggestions: vscode.CompletionItem[],
	typedText: string,
	pos: vscode.Position
): vscode.CompletionItem[] {
	if (typedText.match(/[^a-zA-Z]/)) {
		const exactSuggestion = suggestions.filter(entry => entry.label.toString().startsWith(typedText));
		if (exactSuggestion.length > 0) {
			return exactSuggestion.map(item => {
				item.range = new vscode.Range(pos.translate(0, -typedText.length), pos);
				return item;
			});
		}
	}
	return suggestions;
}

export function computeFilteringRange(
	document: vscode.TextDocument,
	position: vscode.Position,
	triggerChar: string
): vscode.Range {
	const line = document.lineAt(position.line);
	const lineText = line.text;
	const startPos = position.character - 1;
	let start = startPos;

	// Find the start of the word
	while (start >= 0 && lineText[start] !== triggerChar && lineText[start] !== ' ' && lineText[start] !== '\t') {
		start--;
	}

	if (start < 0 || lineText[start] !== triggerChar) {
		start = startPos;
	} else {
		start++; // Include the trigger character
	}

	return new vscode.Range(position.line, start, position.line, position.character);
}

export function filterArgumentHint(
	suggestions: vscode.CompletionItem[],
	typedText: string
): vscode.CompletionItem[] {
	if (!typedText) {
		return suggestions;
	}

	const filtered = suggestions.filter(item => {
		const label = item.label.toString();
		const name = label.replace(/[\\[\]{}]/g, '');
		return name.toLowerCase().startsWith(typedText.toLowerCase());
	});

	return filtered.length > 0 ? filtered : suggestions;
}

