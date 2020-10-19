/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider, TocEntry } from '../tableOfContentsProvider';

export default class MarkdownSmartSelect implements vscode.SelectionRangeProvider {

	constructor(
		private readonly engine: MarkdownEngine
	) { }

	public provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[], _token: vscode.CancellationToken): Promise<vscode.SelectionRange[]> {
		return Promise.all(positions.map((position) => {
			return this.provideSelectionRange(document, position, _token);
		}));
	}

	private async provideSelectionRange(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.SelectionRange> {
		const headerRange = await this.getHeaderSelectionRanges(document, position);
		const blockRange = await this.getBlockSelectionRanges(document, position);

		return this.consolidateRanges(headerRange, blockRange);
	}

	private consolidateRanges(headerRange: vscode.SelectionRange | undefined, blockRange: vscode.SelectionRange | undefined): vscode.SelectionRange {
		if (headerRange && blockRange) {
			const blockParent = blockRange.parent;

			if (blockParent) {
				if (headerRange.range.contains(blockParent.range)) {
					const revisedParent = new vscode.SelectionRange(blockParent.range, headerRange);
					if (revisedParent.range.contains(blockRange.range)) {
						return new vscode.SelectionRange(blockRange.range, revisedParent);
					}
				} else {
					if (headerRange.range.contains(blockRange.range)) {
						return new vscode.SelectionRange(blockRange.range, headerRange);
					}
				}
			} else {
				if (headerRange.range.contains(blockRange.range)) {
					return new vscode.SelectionRange(blockRange.range, headerRange);
				}
			}
			return blockRange;
		} else if (headerRange) {
			return headerRange;
		} else if (blockRange) {
			return blockRange;
		}
	}

	private async getBlockSelectionRanges(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.SelectionRange | undefined> {

		const tokens = await this.engine.parse(document);

		let nearbyTokens = tokens.filter(token => token.map && (token.map[0] <= position.line && token.map[1] >= position.line));

		// sort from smallest to largest line range
		let sortedTokens = nearbyTokens.sort((tokenOne, tokenTwo) => (tokenTwo.map[1] - tokenTwo.map[0] - tokenOne.map[1] - tokenOne.map[0]));

		if (sortedTokens.length === 0) {
			return undefined;
		}

		let parentToken = sortedTokens.pop();

		if (parentToken) {
			if (parentToken.type === 'fence') {
				let parentRange = new vscode.SelectionRange(new vscode.Range(new vscode.Position(parentToken.map[0] > 0 ? parentToken.map[0] - 1 : 0, 0), new vscode.Position(parentToken.map[1], 0)));
				let childRange = new vscode.Range(new vscode.Position(parentToken.map[0] + 1, 0), new vscode.Position(parentToken.map[1] - 1, 0));
				if (parentRange.range.contains(childRange)) {
					return new vscode.SelectionRange(childRange, parentRange);
				}
			} else {
				let parentRange = new vscode.SelectionRange(new vscode.Range(new vscode.Position(parentToken.map[0], 0), new vscode.Position(parentToken.map[1], 0)));
				let ranges = sortedTokens.map(token => {
					let startLine = document.lineAt(token.map[0]).isEmptyOrWhitespace ? token.map[0] + 1 : token.map[0];
					let endLine = document.lineAt(token.map[1]).isEmptyOrWhitespace ? token.map[1] - 1 : token.map[1];
					let startPos = new vscode.Position(startLine, 0);
					let endPos = new vscode.Position(endLine, getEndCharacter(document, startLine, endLine));
					if (parentRange.range.contains(new vscode.Range(startPos, endPos))) {
						return new vscode.SelectionRange(new vscode.Range(startPos, endPos), parentRange);
					} else {
						return new vscode.SelectionRange(new vscode.Range(startPos, endPos));
					}
				});
				return ranges.length > 0 ? ranges[0] : parentRange;
			}
		}
	}

	private async getHeaderSelectionRanges(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.SelectionRange | undefined> {
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();

		let headerOnThisLine = toc.filter(header => header.line === position.line).length > 0;

		let nearbyHeaders = toc.filter(header => header.location.range.start.line <= position.line && header.location.range.end.line >= position.line);
		let sortedHeaders = nearbyHeaders.sort((header1, header2) => (header1.line - position.line) - (header2.line - position.line));

		if (sortedHeaders.length === 0) {
			return undefined;
		}

		let parentHeader = sortedHeaders.shift();
		let parentRange: vscode.SelectionRange;
		let currentRange: vscode.SelectionRange;

		if (parentHeader) {
			let contentRange = new vscode.Range(parentHeader.location.range.start.translate(1), parentHeader.location.range.end);
			let headerPlusContent = new vscode.SelectionRange(parentHeader.location.range);
			if (headerPlusContent.range.contains(contentRange)) {
				parentRange = new vscode.SelectionRange(contentRange, headerPlusContent);
			}
		}

		let index = 0;
		for (const header of sortedHeaders) {
			if (parentHeader) {
				let contentRange = new vscode.Range(header.location.range.start.translate(1), header.location.range.end);
				if (parentRange.range.contains(header.location.range)) {
					if (index === sortedHeaders.length - 1 && headerOnThisLine) {
						currentRange = new vscode.SelectionRange(header.location.range, parentRange);
					} else {
						let headerPlusContent = new vscode.SelectionRange(header.location.range, parentRange);
						currentRange = new vscode.SelectionRange(contentRange, headerPlusContent);
					}
				}
			}
			parentHeader = header;
			let parentWithHeader = new vscode.SelectionRange(parentHeader.location.range, parentRange);
			parentRange = new vscode.SelectionRange(new vscode.Range(parentHeader.location.range.start.translate(1), parentHeader.location.range.end), parentWithHeader);
			index++;
		}
		if (!currentRange && parentRange) {
			return parentRange;
		}
		return currentRange;
	}
}

let getEndCharacter = (document: vscode.TextDocument, startLine: number, endLine: number): number => {
	let startLength = document.lineAt(startLine).text ? document.lineAt(startLine).text.length : 0;
	let endLength = document.lineAt(startLine).text ? document.lineAt(startLine).text.length : 0;
	let endChar = Math.max(startLength, endLength);
	return startLine !== endLine ? 0 : endChar;
};
