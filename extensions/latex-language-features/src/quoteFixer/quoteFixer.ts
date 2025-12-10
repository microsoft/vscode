/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Regular expression that captures straight double-quoted substrings for replacement
 */
const QUOTE_PATTERN = /"([^"]*)"/g;

/**
 * Match info for verbatim environments
 */
interface MatchInfo {
	kind: 'begin' | 'verb';
	index: number;
	length: number;
}

/**
 * Match info for end of verbatim
 */
interface EndMatchInfo {
	index: number;
	length: number;
}

/**
 * Transforms straight double quotes into LaTeX-style quotes while respecting verbatim-like regions
 */
export class QuoteFixer {
	/**
	 * Matches the opening of verbatim-like environments
	 */
	private static beginPattern = /\\begin\{(verbatim\*?|Verbatim\*?|lstlisting\*?|minted\*?)\}/g;

	/**
	 * Matches the closing of verbatim-like environments
	 */
	private static endPattern = /\\end\{(verbatim\*?|Verbatim\*?|lstlisting\*?|minted\*?)\}/g;

	/**
	 * Matches \verb commands
	 */
	private static verbPattern = /\\[vV]erb/g;

	/**
	 * Replaces straight quotes in the provided text while preserving verbatim sections
	 */
	apply(text: string, initialInVerbatim = false): { text: string; inVerbatim: boolean } {
		const lines = this.splitIntoLines(text);
		let inVerbatim = initialInVerbatim;

		const processed = lines.map(line => {
			const result = this.processLine(line, inVerbatim, true);
			inVerbatim = result.inVerbatim;
			return result.text;
		});

		return {
			text: processed.join(this.detectLineEnding(text)),
			inVerbatim
		};
	}

	/**
	 * Determines the verbatim state after scanning the given text without mutating it
	 */
	stateAfter(text: string, initialInVerbatim = false): boolean {
		const lines = this.splitIntoLines(text);
		let inVerbatim = initialInVerbatim;

		for (const line of lines) {
			inVerbatim = this.processLine(line, inVerbatim, false).inVerbatim;
		}

		return inVerbatim;
	}

	/**
	 * Processes a single line, optionally mutating it by replacing quotes
	 */
	private processLine(line: string, inVerbatim: boolean, mutate: boolean): { text: string; inVerbatim: boolean } {
		// Skip comment lines
		if (line.trimStart().startsWith('%')) {
			return { text: line, inVerbatim };
		}

		let result = '';
		let idx = 0;
		let currentState = inVerbatim;

		while (idx < line.length) {
			if (currentState) {
				// Inside verbatim, look for end
				const endMatch = QuoteFixer.findNextEnd(line, idx);
				if (!endMatch) {
					result += line.slice(idx);
					return { text: result, inVerbatim: true };
				}
				result += line.slice(idx, endMatch.index + endMatch.length);
				idx = endMatch.index + endMatch.length;
				currentState = false;
				continue;
			}

			// Outside verbatim, look for begin or verb
			const beginMatch = QuoteFixer.findNextBegin(line, idx);
			const verbMatch = QuoteFixer.findNextVerb(line, idx);
			const nextMatch = QuoteFixer.pickNext(beginMatch, verbMatch);

			const segmentEnd = nextMatch ? nextMatch.index : line.length;
			const segment = line.slice(idx, segmentEnd);

			// Apply quote replacement to segment outside verbatim
			result += mutate ? segment.replace(QUOTE_PATTERN, '``$1\'\'') : segment;
			idx = segmentEnd;

			if (!nextMatch) {
				break;
			}

			result += line.slice(idx, idx + nextMatch.length);
			idx += nextMatch.length;

			if (nextMatch.kind === 'begin') {
				currentState = true;
			}
		}

		if (idx < line.length) {
			const tail = line.slice(idx);
			result += mutate ? tail.replace(QUOTE_PATTERN, '``$1\'\'') : tail;
		}

		return { text: result, inVerbatim: currentState };
	}

	/**
	 * Splits text into lines, preserving empty string case
	 */
	private splitIntoLines(text: string): string[] {
		if (text === '') {
			return [''];
		}
		return text.split(/\r?\n/);
	}

	/**
	 * Detects the dominant line ending style
	 */
	private detectLineEnding(text: string): string {
		return text.includes('\r\n') ? '\r\n' : '\n';
	}

	/**
	 * Pick the earliest match between begin and verb
	 */
	private static pickNext(beginMatch: MatchInfo | undefined, verbMatch: MatchInfo | undefined): MatchInfo | undefined {
		if (!beginMatch) {
			return verbMatch;
		}
		if (!verbMatch) {
			return beginMatch;
		}
		return beginMatch.index <= verbMatch.index ? beginMatch : verbMatch;
	}

	/**
	 * Find next begin{verbatim} match
	 */
	private static findNextBegin(text: string, start: number): MatchInfo | undefined {
		const regex = new RegExp(QuoteFixer.beginPattern.source, QuoteFixer.beginPattern.flags);
		regex.lastIndex = start;
		const match = regex.exec(text);

		if (!match) {
			return undefined;
		}

		return {
			kind: 'begin',
			index: match.index,
			length: match[0].length
		};
	}

	/**
	 * Find next \verb command and compute its full span including delimiter
	 */
	private static findNextVerb(text: string, start: number): MatchInfo | undefined {
		const regex = new RegExp(QuoteFixer.verbPattern.source, QuoteFixer.verbPattern.flags);
		regex.lastIndex = start;
		const match = regex.exec(text);

		if (!match) {
			return undefined;
		}

		const delimiterIndex = match.index + match[0].length;
		if (delimiterIndex >= text.length) {
			return {
				kind: 'verb',
				index: match.index,
				length: text.length - match.index
			};
		}

		const delimiter = text.charAt(delimiterIndex);
		let end = delimiterIndex + 1;

		// Find closing delimiter
		while (end < text.length && text.charAt(end) !== delimiter) {
			end++;
		}
		if (end < text.length) {
			end++; // Include closing delimiter
		}

		return {
			kind: 'verb',
			index: match.index,
			length: end - match.index
		};
	}

	/**
	 * Find next end{verbatim} match
	 */
	private static findNextEnd(text: string, start: number): EndMatchInfo | undefined {
		const regex = new RegExp(QuoteFixer.endPattern.source, QuoteFixer.endPattern.flags);
		regex.lastIndex = start;
		const match = regex.exec(text);

		if (!match) {
			return undefined;
		}

		return {
			index: match.index,
			length: match[0].length
		};
	}
}

/**
 * Command to fix quotes in the current document or selection
 */
export async function fixQuotesInDocument(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor || (editor.document.languageId !== 'latex' && editor.document.languageId !== 'tex')) {
		vscode.window.showInformationMessage('Quote fixer only works with LaTeX files.');
		return;
	}

	const document = editor.document;
	const quoteFixer = new QuoteFixer();

	let range: vscode.Range;
	let initialInVerbatim = false;

	if (editor.selection.isEmpty) {
		// Fix entire document
		range = document.validateRange(new vscode.Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE));
	} else {
		// Fix selection only
		range = editor.selection;
		// Determine verbatim state at selection start
		const textBefore = document.getText(new vscode.Range(new vscode.Position(0, 0), range.start));
		initialInVerbatim = quoteFixer.stateAfter(textBefore);
	}

	const originalText = document.getText(range);
	const fixed = quoteFixer.apply(originalText, initialInVerbatim);

	if (fixed.text === originalText) {
		vscode.window.showInformationMessage('No quotes to fix.');
		return;
	}

	const edit = new vscode.WorkspaceEdit();
	edit.replace(document.uri, range, fixed.text);

	const success = await vscode.workspace.applyEdit(edit);
	if (success) {
		const quoteCount = (originalText.match(/"/g) || []).length / 2;
		vscode.window.showInformationMessage(`Fixed approximately ${Math.floor(quoteCount)} quote pair(s).`);
	}
}

/**
 * Register quote fixer command
 */
export function registerQuoteFixer(): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('latex.fixQuotes', fixQuotesInDocument)
	);

	return disposables;
}

