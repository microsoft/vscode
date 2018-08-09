/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';
import { Token } from 'markdown-it';

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
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		let [regions, toc] = await Promise.all([this.getRegions(document), tocProvider.getToc()]);

		if (toc.length > rangeLimit - regions.length) {
			toc = toc.slice(0, rangeLimit - regions.length);
		}

		const foldingRanges = toc.map((entry, startIndex) => {
			const start = entry.line;
			let end: number | undefined = undefined;
			for (let i = startIndex + 1; i < toc.length; ++i) {
				if (toc[i].level <= entry.level) {
					end = toc[i].line - 1;
					if (document.lineAt(end).isEmptyOrWhitespace && end >= start + 1) {
						end = end - 1;
					}
					break;
				}
			}
			return new vscode.FoldingRange(
				start,
				typeof end === 'number' ? end : document.lineCount - 1);
		});

		return [...regions, ...foldingRanges];
	}
}