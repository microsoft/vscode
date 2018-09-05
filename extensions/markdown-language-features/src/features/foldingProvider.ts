/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Token } from 'markdown-it';
import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';

const rangeLimit = 5000;

export default class MarkdownFoldingProvider implements vscode.FoldingRangeProvider {

	constructor(
		private readonly engine: MarkdownEngine
	) { }

	private async getRegions(document: vscode.TextDocument): Promise<vscode.FoldingRange[]> {

		const isStartRegion = (t: string) => /^\s*<!--\s*#?region\b.*-->/.test(t);
		const isEndRegion = (t: string) => /^\s*<!--\s*#?endregion\b.*-->/.test(t);

		const isRegionMarker = (token: Token) => token.type === 'html_block' &&
			(isStartRegion(token.content) || isEndRegion(token.content));


		const tokens = await this.engine.parse(document.uri, document.getText());
		const regionMarkers = tokens.filter(isRegionMarker)
			.map(token => ({ line: token.map[0], isStart: isStartRegion(token.content) }));

		const nestingStack: { line: number, isStart: boolean }[] = [];
		return regionMarkers
			.map(marker => {
				if (marker.isStart) {
					nestingStack.push(marker);
				} else if (nestingStack.length && nestingStack[nestingStack.length - 1].isStart) {
					return new vscode.FoldingRange(nestingStack.pop()!.line, marker.line, vscode.FoldingRangeKind.Region);
				} else {
					// noop: invalid nesting (i.e. [end, start] or [start, end, end])
				}
				return null;
			})
			.filter((region: vscode.FoldingRange | null): region is vscode.FoldingRange => !!region);
	}

	public async provideFoldingRanges(
		document: vscode.TextDocument,
		_: vscode.FoldingContext,
		_token: vscode.CancellationToken
	): Promise<vscode.FoldingRange[]> {
		const [regions, sections, lists] = await Promise.all([this.getRegions(document), this.getHeaderFoldingRanges(document), this.getListFoldingRanges(document)]);
		return [...regions, ...sections, ...lists].slice(0, rangeLimit);
	}

	private async getHeaderFoldingRanges(document: vscode.TextDocument) {
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();
		return toc.map(entry => {
			let endLine = entry.location.range.end.line;
			if (document.lineAt(endLine).isEmptyOrWhitespace && endLine >= entry.line + 1) {
				endLine = endLine - 1;
			}
			return new vscode.FoldingRange(entry.line, endLine);
		});
	}

	private async getListFoldingRanges(document: vscode.TextDocument): Promise<vscode.FoldingRange[]> {

		const isMultiLineListOpen = (token: Token) =>
			token.type === 'list_item_open' && token.map[1] > token.map[0];

		const tokens = await this.engine.parse(document.uri, document.getText());
		const multiLineListItems = tokens.filter(isMultiLineListOpen);
		return multiLineListItems.map(listItem => {
			const start = listItem.map[0];
			const end = listItem.map[1] - 1;
			return new vscode.FoldingRange(start, end);
		});
	}
}
