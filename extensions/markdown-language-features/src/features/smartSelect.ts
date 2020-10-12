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
				let revisedParent = new vscode.SelectionRange(childParent.range, parent);
				let res = new vscode.SelectionRange(child.range, revisedParent);
				return [res];
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
			let parentRange = new vscode.SelectionRange(new vscode.Range(new vscode.Position(parentToken.map[0], 0), new vscode.Position(parentToken.map[1], 0)));
			let ranges = sortedTokens.map(token => {
				let startPos = new vscode.Position(token.map[0], 0);
				let endPos = new vscode.Position(token.map[1], 0);
				if (parentRange.range.contains(new vscode.Range(startPos, endPos))) {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos), parentRange);
				} else {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos));
				}
			});
			return ranges ? [ranges[0]] : [parentRange];
		}
		return [];
	}

	private async getHeaderSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]): Promise<vscode.SelectionRange[]> {
		let position = positions[0];
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();

		let nearbyHeaders = toc.filter(header => header.location.range.start.line <= position.line && header.location.range.end.line >= position.line);
		let sortedHeaders = nearbyHeaders.sort((header1, header2) => (header1.line - position.line) - (header2.line - position.line));

		let parentHeader = sortedHeaders.shift();
		let parentRange : vscode.SelectionRange;
		let currentRange : vscode.SelectionRange;

		if (parentHeader) {
			let startPos = parentHeader.location.range.start;
			let startContent = startPos.translate(2);
			let endPos = parentHeader.location.range.end;
			let headerPlusContent = new vscode.SelectionRange(new vscode.Range(startPos, endPos));
			if (headerPlusContent.range.contains(new vscode.Range(startContent, endPos))) {
				parentRange = new vscode.SelectionRange(new vscode.Range(startPos, endPos), headerPlusContent);
			}
		}

		sortedHeaders.forEach(header => {
			if (parentHeader) {
				let startPos = header.location.range.start;
				let endPos = header.location.range.end;
					if (parentRange.range.contains(new vscode.Range(startPos, endPos))) {
						currentRange = new vscode.SelectionRange(new vscode.Range(startPos, endPos), parentRange);
					} else {
						currentRange = new vscode.SelectionRange(new vscode.Range(startPos, endPos));
					}
				}
				parentHeader = header;
				parentRange = new vscode.SelectionRange(new vscode.Range(parentHeader.location.range.start, parentHeader.location.range.end), parentRange);
			}
			);
			return [currentRange];
	}
}
