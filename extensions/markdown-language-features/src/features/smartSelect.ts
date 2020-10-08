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
		if (flatten(ranges).length === 2) {
			let parent = result[0];
			let child = result[1];
			return [new vscode.SelectionRange(child.range, parent)];
		}
		return result;
	}

	private async getBlockSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]): Promise<vscode.SelectionRange[]> {
		let position = positions[0];
		const tokens = await this.engine.parse(document);
		// sort by start position and end position
		// find smallest range that contains this
		// then walk left until you're not contained
		let nearbyTokens = tokens.filter(token => token.type !== 'heading_open' && token.map && (token.map[0] <= position.line && token.map[1] >= position.line));
		// let sortedTokens = nearbyTokens.sort(token => token.map[1] - token.map[0]);
		let sortedTokens = nearbyTokens.sort((tokenOne, tokenTwo) => (tokenOne.map[1] - tokenOne.map[0] - tokenTwo.map[1] - tokenTwo.map[0]));

		let parentToken = sortedTokens[sortedTokens.length-1];
		if (parentToken) {
			let parentRange = new vscode.SelectionRange(new vscode.Range(new vscode.Position(parentToken.map[0], 0), new vscode.Position(parentToken.map[1], 0)));
			let ranges = nearbyTokens.map(token => {
				let start = token.map[0];
				let end = token.type === 'bullet_list_open' ? token.map[1] - 1 : token.map[1];
				let startPos = new vscode.Position(start, 0);
				let endPos = new vscode.Position(end, 0);
				if (parentRange.range.contains(new vscode.Range(startPos, endPos))) {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos), parentRange);
				} else {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos));
				}
			});
			ranges.push(parentRange);
			// return smallest possible range
			return [ranges[0]];
		}
		return [];
	}

	private async getHeaderSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[]): Promise<vscode.SelectionRange[]> {
		let position = positions[0];
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();
		let nearbyEntries = toc.filter(entry => entry.line === position.line);
		let firstEntry = nearbyEntries.pop();
		if (firstEntry) {
			let endLine = firstEntry.location.range.end.line;
			if (document.lineAt(endLine).isEmptyOrWhitespace && endLine >= firstEntry.line + 1) {
				endLine = endLine - 1;
			}
			let startPos = firstEntry.location.range.start;
			let endPos = new vscode.Position(endLine, firstEntry.location.range.end.character);
			let parentRange = new vscode.SelectionRange(new vscode.Range(startPos, endPos));
			let ranges = nearbyEntries.map(entry => {
				let endLine = entry.location.range.end.line;
				if (document.lineAt(endLine).isEmptyOrWhitespace && endLine >= entry.line + 1) {
					endLine = endLine - 1;
				}
				let startPos = entry.location.range.start;
				let endPos = new vscode.Position(endLine, entry.location.range.end.character);
				if (parentRange.range.contains(new vscode.Range(startPos, endPos))) {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos), parentRange);
				} else {
					return new vscode.SelectionRange(new vscode.Range(startPos, endPos));
				}
			});
			ranges.push(parentRange);
			return ranges;
		}
		return [];
	}
}
