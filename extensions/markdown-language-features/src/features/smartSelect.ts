/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Token } from 'markdown-it';
import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';
import { flatten } from '../util/arrays';


const isStartRegion = (t: string) => /^\s*<!--\s*#?region\b.*-->/.test(t);
const isEndRegion = (t: string) => /^\s*<!--\s*#?endregion\b.*-->/.test(t);

const isRegionMarker = (token: Token) =>
	token.type === 'html_block' && (isStartRegion(token.content) || isEndRegion(token.content));

export default class MarkdownSmartSelect implements vscode.SelectionRangeProvider {

	constructor(
		private readonly engine: MarkdownEngine
	) { }
	public async provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[], token: vscode.CancellationToken): Promise<vscode.SelectionRange[]> {
		console.log(positions);
		let headerRegions = await Promise.all([
			await this.getHeaderSelectionRanges(document)
		]);
		return flatten(headerRegions);
	}

	private async getBlockSelectionRanges(document: vscode.TextDocument): Promise<vscode.SelectionRange[]> {

		const isBlockToken = (token: Token): boolean => {
			switch (token.type) {
				case 'fence':
				case 'list_item_open':
					return token.map[1] > token.map[0];

				case 'html_block':
					if (isRegionMarker(token)) {
						return false;
					}
					return token.map[1] > token.map[0] + 1;

				default:
					return false;
			}
		};

		const tokens = await this.engine.parse(document);
		const multiLineListItems = tokens.filter(isBlockToken);
		return multiLineListItems.map(listItem => {
			const start = listItem.map[0];
			let end = listItem.map[1] - 1;
			if (document.lineAt(end).isEmptyOrWhitespace && end >= start + 1) {
				end = end - 1;
			}
			let beg = new vscode.Position(0, start);
			let endi = new vscode.Position(0, end);
			return new vscode.SelectionRange(new vscode.Range(beg, endi));
		});
	}
	private async getHeaderSelectionRanges(document: vscode.TextDocument) {
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();
		return toc.map(entry => {
			let start = entry.location.range.start;
			let end = entry.location.range.end;
			return new vscode.SelectionRange(new vscode.Range(new vscode.Position(start.line, start.character), new vscode.Position(end.line, end.character)));
		});
	}
}
