/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Provides document highlight functionality for Typst documents.
 *
 * When the cursor is on a symbol, this provider highlights all occurrences
 * of that symbol in the document:
 * - Labels: Highlights both definitions (<label>) and references (@label)
 * - Variables/functions: Highlights all usages of #let defined identifiers
 */
export class TypstDocumentHighlightProvider implements vscode.DocumentHighlightProvider {

	provideDocumentHighlights(
		document: vscode.TextDocument,
		position: vscode.Position,
		_token: vscode.CancellationToken
	): vscode.DocumentHighlight[] | undefined {
		const line = document.lineAt(position.line);
		const lineText = line.text;

		// Check if cursor is on a label reference (@label)
		const labelRefMatch = this.findLabelReferenceAtPosition(lineText, position.character);
		if (labelRefMatch) {
			return this.highlightLabel(document, labelRefMatch.name);
		}

		// Check if cursor is on a label definition (<label>)
		const labelDefMatch = this.findLabelDefinitionAtPosition(lineText, position.character);
		if (labelDefMatch) {
			return this.highlightLabel(document, labelDefMatch.name);
		}

		// Check if cursor is on a variable or function name
		const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z][\w-]*/);
		if (wordRange) {
			const word = document.getText(wordRange);
			// Only highlight if this is a defined variable/function
			if (this.isDefinedSymbol(document, word)) {
				return this.highlightSymbol(document, word);
			}
		}

		return undefined;
	}

	/**
	 * Find label reference pattern at position: @label
	 */
	private findLabelReferenceAtPosition(lineText: string, character: number): { name: string; index: number } | null {
		const labelRefPattern = /@([a-zA-Z][\w:-]*)/g;
		let match: RegExpMatchArray | null;
		while ((match = labelRefPattern.exec(lineText)) !== null) {
			const start = match.index!;
			const end = start + match[0].length;
			if (character >= start && character <= end) {
				return { name: match[1], index: start };
			}
		}
		return null;
	}

	/**
	 * Find label definition pattern at position: <label>
	 */
	private findLabelDefinitionAtPosition(lineText: string, character: number): { name: string; index: number } | null {
		const labelDefPattern = /<([a-zA-Z][\w:-]*)>/g;
		let match: RegExpMatchArray | null;
		while ((match = labelDefPattern.exec(lineText)) !== null) {
			const start = match.index!;
			const end = start + match[0].length;
			if (character >= start && character <= end) {
				return { name: match[1], index: start };
			}
		}
		return null;
	}

	/**
	 * Highlight all occurrences of a label (both definitions and references)
	 */
	private highlightLabel(document: vscode.TextDocument, labelName: string): vscode.DocumentHighlight[] {
		const highlights: vscode.DocumentHighlight[] = [];
		const text = document.getText();
		const escapedName = this.escapeRegex(labelName);

		// Find all label definitions: <label>
		const defPattern = new RegExp(`<${escapedName}>`, 'g');
		let match: RegExpMatchArray | null;
		while ((match = defPattern.exec(text)) !== null) {
			const startPos = document.positionAt(match.index!);
			const endPos = document.positionAt(match.index! + match[0].length);
			highlights.push(new vscode.DocumentHighlight(
				new vscode.Range(startPos, endPos),
				vscode.DocumentHighlightKind.Write // Definition is a "write"
			));
		}

		// Find all label references: @label
		const refPattern = new RegExp(`@${escapedName}\\b`, 'g');
		while ((match = refPattern.exec(text)) !== null) {
			const startPos = document.positionAt(match.index!);
			const endPos = document.positionAt(match.index! + match[0].length);
			highlights.push(new vscode.DocumentHighlight(
				new vscode.Range(startPos, endPos),
				vscode.DocumentHighlightKind.Read // Reference is a "read"
			));
		}

		return highlights;
	}

	/**
	 * Check if a symbol is defined via #let
	 */
	private isDefinedSymbol(document: vscode.TextDocument, name: string): boolean {
		const text = document.getText();
		const escapedName = this.escapeRegex(name);
		// Check for #let name = or #let name(...)
		const defPattern = new RegExp(`#let\\s+${escapedName}\\s*[=(]`);
		return defPattern.test(text);
	}

	/**
	 * Highlight all occurrences of a variable/function symbol
	 */
	private highlightSymbol(document: vscode.TextDocument, symbolName: string): vscode.DocumentHighlight[] {
		const highlights: vscode.DocumentHighlight[] = [];
		const text = document.getText();
		const escapedName = this.escapeRegex(symbolName);

		// Find definition: #let name = or #let name(...)
		const defPattern = new RegExp(`#let\\s+(${escapedName})\\s*[=(]`, 'g');
		let match: RegExpMatchArray | null;
		while ((match = defPattern.exec(text)) !== null) {
			// Get the position of just the name, not the whole #let statement
			const nameStart = match.index! + match[0].indexOf(match[1]);
			const startPos = document.positionAt(nameStart);
			const endPos = document.positionAt(nameStart + match[1].length);
			highlights.push(new vscode.DocumentHighlight(
				new vscode.Range(startPos, endPos),
				vscode.DocumentHighlightKind.Write
			));
		}

		// Find all usages of the symbol (word boundary match)
		// This includes: #name, name(...), name[...], just name as an identifier
		const usagePattern = new RegExp(`\\b(${escapedName})\\b`, 'g');
		while ((match = usagePattern.exec(text)) !== null) {
			// Skip if this is part of the definition we already found
			const beforeMatch = text.substring(Math.max(0, match.index! - 10), match.index!);
			if (beforeMatch.match(/#let\s*$/)) {
				continue;
			}

			const startPos = document.positionAt(match.index!);
			const endPos = document.positionAt(match.index! + match[0].length);
			highlights.push(new vscode.DocumentHighlight(
				new vscode.Range(startPos, endPos),
				vscode.DocumentHighlightKind.Read
			));
		}

		return highlights;
	}

	/**
	 * Escape special regex characters
	 */
	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}

