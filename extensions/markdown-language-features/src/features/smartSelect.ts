/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';
import { flatten } from '../util/arrays';

export default class MarkdownSmartSelect implements vscode.SelectionRangeProvider {

	constructor(
		private readonly engine: MarkdownEngine
	) { }
	public async provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[], _token: vscode.CancellationToken): Promise<vscode.SelectionRange[]> {
		let ranges = await Promise.all([
			await this.getHeaderSelectionRanges(document, positions),
			await this.getBlockSelectionRanges(document, positions)
		]);
		let result = flatten(ranges);
		// header will always be parent of block elements
		// have to set the child's grandparent
		if (result.length === 2) {
			let parent = result[0];
			let child = result[1];
			let childParent = child.parent;

			if (childParent) {
				if (parent.range.contains(childParent.range)) {
					let revisedParent = new vscode.SelectionRange(childParent.range, parent);
					if (revisedParent.range.contains(child.range)) {
						let res = new vscode.SelectionRange(child.range, revisedParent);
						return [res];
					}
				}
				else {
					// they're one line off
					let overlap = childParent.range.union(parent.range);
					if (overlap) {
						parent.range = overlap;
					}
					if (parent.range.contains(childParent.range)) {
						childParent.parent = parent;
						let res = new vscode.SelectionRange(child.range, childParent);
						return [res];
					}
				}
			} else {
				if (parent.range.contains(child.range)) {
					return [new vscode.SelectionRange(child.range, parent)];
				}
			}
			return [child];
		} else {
			return result;
		}
	}

	private async getBlockSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]): Promise<vscode.SelectionRange[]> {

		let position = positions[0];

		const tokens = await this.engine.parse(document);

		let nearbyTokens = tokens.filter(token => token.map && (token.map[0] <= position.line && token.map[1] >= position.line));

		// sort from smallest to largest line range
		let sortedTokens = nearbyTokens.sort((tokenOne, tokenTwo) => (tokenTwo.map[1] - tokenTwo.map[0] - tokenOne.map[1] - tokenOne.map[0]));

		let parentToken = sortedTokens.pop();

		if (parentToken) {
			if (parentToken.type === 'fence') {
				let parentRange = new vscode.SelectionRange(new vscode.Range(new vscode.Position(parentToken.map[0]-1, 0), new vscode.Position(parentToken.map[1], 0)));
				let childRange = new vscode.Range(new vscode.Position(parentToken.map[0] + 1, 0), new vscode.Position(parentToken.map[1] - 1, 0));
				if (parentRange.range.contains(childRange)) {
					let child = new vscode.SelectionRange(childRange, parentRange);
					return [child];
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

				return ranges.length > 0 ? [ranges[0]] : [parentRange];
			}
		}
		return [];
	}

	private async getHeaderSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]): Promise<vscode.SelectionRange[]> {
		let position = positions[0];
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();

		let headerOnThisLine = toc.filter(header => header.line === position.line).length > 0;

		let nearbyHeaders = toc.filter(header => header.location.range.start.line <= position.line && header.location.range.end.line >= position.line);
		let sortedHeaders = nearbyHeaders.sort((header1, header2) => (header1.line - position.line) - (header2.line - position.line));

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
		sortedHeaders.forEach(header => {
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
		);
		if (!currentRange && parentRange) {
			return [parentRange];
		}
		return [currentRange];
	}
}

let getEndCharacter = (document: vscode.TextDocument, startLine: number, endLine: number): number => {
	let endChar = Math.max(document.lineAt(startLine).text.length, document.lineAt(endLine).text.length)
	return startLine !== endLine ? 0 : endChar;
};
