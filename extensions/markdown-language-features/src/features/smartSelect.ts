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
				childParent.parent = parent;
				return [new vscode.SelectionRange(child.range, childParent)];
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

		// sort from smallest to largest range
		let sortedTokens = nearbyTokens.sort((tokenOne, tokenTwo) => (tokenTwo.map[1] - tokenTwo.map[0] - tokenOne.map[1] - tokenOne.map[0]));

		let parentToken = sortedTokens.pop();

		if (parentToken) {
			let parentRange = new vscode.SelectionRange(new vscode.Range(new vscode.Position(parentToken.map[0], 0), new vscode.Position(document.lineAt(parentToken.map[1]).isEmptyOrWhitespace ? parentToken.map[1] - 1 : parentToken.map[1], 0)));
			let ranges = sortedTokens.map(token => {
				let startPos = new vscode.Position(token.map[0], 0);
				let endPos = new vscode.Position(document.lineAt(token.map[1]).isEmptyOrWhitespace ? token.map[1] - 1 : token.map[1], 0);
				if (parentRange.range.contains(new vscode.Range(startPos, endPos))) {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos), parentRange);
				} else {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos));
				}
			});
			return [ranges[0]];
		}
		return [];
	}

	private async getHeaderSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]): Promise<vscode.SelectionRange[]> {
		let position = positions[0];
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();

		// get all enclosing headers
		let nearbyHeaders = toc.filter(header => header.line <= position.line);
		let sortedHeaders = nearbyHeaders.sort((header2, header1) => (header1.line - position.line) - (header2.line - position.line));

		let parentHeader = sortedHeaders.pop();

		if (parentHeader) {
			let endLine = parentHeader.location.range.end.line;
			let startPos = parentHeader.location.range.start;
			let endPos = new vscode.Position(endLine, parentHeader.location.range.end.character);
			let parentRange = new vscode.SelectionRange(new vscode.Range(startPos, endPos));
			let ranges = sortedHeaders.map(entry => {
				let endLine = entry.location.range.end.line;
				let startPos = entry.location.range.start;
				let endPos = new vscode.Position(endLine, entry.location.range.end.character);
				if (parentRange.range.contains(new vscode.Range(startPos, endPos))) {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos), parentRange);
				} else {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos));
				}
			});
			let result = ranges[0];
			// sort ranges by their proximity to result
			for (let i = 1; i < 3; i++) {
				let sisterRange = result.range.union(ranges[i].range);
				result.parent = new vscode.SelectionRange(sisterRange, result.parent);
			}
			return [result];
		}
		return [];
	}
}
