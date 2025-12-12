/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Provides folding ranges for Typst documents.
 * Supports folding for:
 * - Headings (= Heading 1, == Heading 2, etc.)
 * - Code blocks ({ ... })
 * - Function definitions (#let func(...) = { ... })
 */
export class TypstFoldingProvider implements vscode.FoldingRangeProvider {

	provideFoldingRanges(
		document: vscode.TextDocument,
		_context: vscode.FoldingContext,
		_token: vscode.CancellationToken
	): vscode.FoldingRange[] {
		const ranges: vscode.FoldingRange[] = [];

		// Get folding ranges for headings
		ranges.push(...this.getHeadingFoldingRanges(document));

		// Get folding ranges for code blocks and function bodies
		ranges.push(...this.getBlockFoldingRanges(document));

		return ranges;
	}

	/**
	 * Get folding ranges for headings.
	 * Folds from a heading until the next heading of equal or higher level.
	 */
	private getHeadingFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
		const ranges: vscode.FoldingRange[] = [];
		const lines = document.getText().split(/\r?\n/g);
		const headingStack: { level: number; line: number }[] = [];
		let lastNonemptyLineIndex = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Detect headings (= Heading 1, == Heading 2, etc.)
			const headingMatch = line.match(/^(=+)\s+(.+)$/);
			if (headingMatch) {
				const level = headingMatch[1].length;

				// Close all headings at this level and below
				while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
					const prevHeading = headingStack.pop()!;
					// Only create fold if there's at least one line to fold
					if (lastNonemptyLineIndex > prevHeading.line) {
						ranges.push(new vscode.FoldingRange(
							prevHeading.line,
							lastNonemptyLineIndex,
							vscode.FoldingRangeKind.Region
						));
					}
				}

				// Push the new heading
				headingStack.push({ level, line: i });
			}

			// Track last non-empty line for accurate folding end
			if (!line.match(/^\s*$/)) {
				lastNonemptyLineIndex = i;
			}
		}

		// Close all remaining headings at end of document
		for (const heading of headingStack) {
			if (lastNonemptyLineIndex > heading.line) {
				ranges.push(new vscode.FoldingRange(
					heading.line,
					lastNonemptyLineIndex,
					vscode.FoldingRangeKind.Region
				));
			}
		}

		return ranges;
	}

	/**
	 * Get folding ranges for code blocks ({ ... }).
	 * Uses a stack-based approach to match opening and closing braces.
	 * Only folds blocks that span multiple lines.
	 */
	private getBlockFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
		const ranges: vscode.FoldingRange[] = [];
		const text = document.getText();
		const opStack: Array<{ index: number; line: number }> = [];

		// Regex to match opening and closing braces
		// Note: We don't match string literals or comments, but this is a simple implementation
		const blockRegex = /{|}/g;

		while (true) {
			const match = blockRegex.exec(text);
			if (match === null) {
				break;
			}

			const matchText = match[0];
			const matchIndex = match.index;
			const matchLine = document.positionAt(matchIndex).line;

			// Check if this is an opening brace
			if (matchText === '{') {
				opStack.push({
					index: matchIndex,
					line: matchLine
				});
			}
			// Check if this is a closing brace
			else if (matchText === '}') {
				if (opStack.length > 0) {
					const opening = opStack.pop()!;
					const startLine = opening.line;
					const endLine = matchLine;

					// Only create fold if there's at least one line to fold
					if (endLine > startLine) {
						ranges.push(new vscode.FoldingRange(startLine, endLine));
					}
				}
			}
		}

		return ranges;
	}
}

