/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, Position, CancellationToken } from 'vscode-languageserver';
import { createScanner, SyntaxKind, ScanError } from 'jsonc-parser';
import { FoldingRangeType, FoldingRange, FoldingRangeList } from './protocol/foldingProvider.proposed';

export function getFoldingRegions(document: TextDocument, maxRanges: number | undefined, cancellationToken: CancellationToken | null) {
	let ranges: FoldingRange[] = [];
	let nestingLevels: number[] = [];
	let stack: FoldingRange[] = [];
	let prevStart = -1;
	let scanner = createScanner(document.getText(), false);
	let token = scanner.scan();

	function addRange(range: FoldingRange) {
		ranges.push(range);
		nestingLevels.push(stack.length);
	}

	while (token !== SyntaxKind.EOF) {
		if (cancellationToken && cancellationToken.isCancellationRequested) {
			return null;
		}
		switch (token) {
			case SyntaxKind.OpenBraceToken:
			case SyntaxKind.OpenBracketToken: {
				let startLine = document.positionAt(scanner.getTokenOffset()).line;
				let range = { startLine, endLine: startLine, type: token === SyntaxKind.OpenBraceToken ? 'object' : 'array' };
				stack.push(range);
				break;
			}
			case SyntaxKind.CloseBraceToken:
			case SyntaxKind.CloseBracketToken: {
				let type = token === SyntaxKind.CloseBraceToken ? 'object' : 'array';
				if (stack.length > 0 && stack[stack.length - 1].type === type) {
					let range = stack.pop();
					let line = document.positionAt(scanner.getTokenOffset()).line;
					if (range && line > range.startLine + 1 && prevStart !== range.startLine) {
						range.endLine = line - 1;
						addRange(range);
						prevStart = range.startLine;
					}
				}
				break;
			}

			case SyntaxKind.BlockCommentTrivia: {
				let startLine = document.positionAt(scanner.getTokenOffset()).line;
				let endLine = document.positionAt(scanner.getTokenOffset() + scanner.getTokenLength()).line;
				if (scanner.getTokenError() === ScanError.UnexpectedEndOfComment && startLine + 1 < document.lineCount) {
					scanner.setPosition(document.offsetAt(Position.create(startLine + 1, 0)));
				} else {
					if (startLine < endLine) {
						addRange({ startLine, endLine, type: FoldingRangeType.Comment });
						prevStart = startLine;
					}
				}
				break;
			}

			case SyntaxKind.LineCommentTrivia: {
				let text = document.getText().substr(scanner.getTokenOffset(), scanner.getTokenLength());
				let m = text.match(/^\/\/\s*#(region\b)|(endregion\b)/);
				if (m) {
					let line = document.positionAt(scanner.getTokenOffset()).line;
					if (m[1]) { // start pattern match
						let range = { startLine: line, endLine: line, type: FoldingRangeType.Region };
						stack.push(range);
					} else {
						let i = stack.length - 1;
						while (i >= 0 && stack[i].type !== FoldingRangeType.Region) {
							i--;
						}
						if (i >= 0) {
							let range = stack[i];
							stack.length = i;
							if (line > range.startLine && prevStart !== range.startLine) {
								range.endLine = line;
								addRange(range);
								prevStart = range.startLine;
							}
						}
					}
				}
				break;
			}

		}
		token = scanner.scan();
	}
	if (maxRanges && ranges.length > maxRanges) {
		let counts: number[] = [];
		for (let level of nestingLevels) {
			if (level < 30) {
				counts[level] = (counts[level] || 0) + 1;
			}
		}
		let entries = 0;
		let maxLevel = 0;
		for (let i = 0; i < counts.length; i++) {
			let n = counts[i];
			if (n) {
				if (n + entries > maxRanges) {
					maxLevel = i;
					break;
				}
				entries += n;
			}
		}
		ranges = ranges.filter((r, index) => nestingLevels[index] < maxLevel);
	}
	return <FoldingRangeList>{ ranges };
}