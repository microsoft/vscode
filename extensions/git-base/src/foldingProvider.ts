/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class GitCommitFoldingProvider implements vscode.FoldingRangeProvider {

	provideFoldingRanges(
		document: vscode.TextDocument,
		_context: vscode.FoldingContext,
		_token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.FoldingRange[]> {
		const ranges: vscode.FoldingRange[] = [];

		let commentBlockStart: number | undefined;
		let currentDiffStart: number | undefined;

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			const lineText = line.text;

			// Check for comment lines (lines starting with #)
			if (lineText.startsWith('#')) {
				// Close any active diff block when we encounter a comment
				if (currentDiffStart !== undefined) {
					// Only create fold if there are at least 2 lines
					if (i - currentDiffStart > 1) {
						ranges.push(new vscode.FoldingRange(currentDiffStart, i - 1));
					}
					currentDiffStart = undefined;
				}

				if (commentBlockStart === undefined) {
					commentBlockStart = i;
				}
			} else {
				// End of comment block
				if (commentBlockStart !== undefined) {
					// Only create fold if there are at least 2 lines
					if (i - commentBlockStart > 1) {
						ranges.push(new vscode.FoldingRange(
							commentBlockStart,
							i - 1,
							vscode.FoldingRangeKind.Comment
						));
					}
					commentBlockStart = undefined;
				}
			}

			// Check for diff sections (lines starting with "diff --git")
			if (lineText.startsWith('diff --git ')) {
				// If there's a previous diff block, close it
				if (currentDiffStart !== undefined) {
					// Only create fold if there are at least 2 lines
					if (i - currentDiffStart > 1) {
						ranges.push(new vscode.FoldingRange(currentDiffStart, i - 1));
					}
				}
				// Start new diff block
				currentDiffStart = i;
			}
		}

		// Handle end-of-document cases

		// If comment block extends to end of document
		if (commentBlockStart !== undefined) {
			if (document.lineCount - commentBlockStart > 1) {
				ranges.push(new vscode.FoldingRange(
					commentBlockStart,
					document.lineCount - 1,
					vscode.FoldingRangeKind.Comment
				));
			}
		}

		// If diff block extends to end of document
		if (currentDiffStart !== undefined) {
			if (document.lineCount - currentDiffStart > 1) {
				ranges.push(new vscode.FoldingRange(
					currentDiffStart,
					document.lineCount - 1
				));
			}
		}

		return ranges;
	}
}
