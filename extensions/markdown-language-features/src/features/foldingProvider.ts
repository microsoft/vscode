/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider } from '../tableOfContentsProvider';

export default class MarkdownFoldingProvider implements vscode.FoldingProvider {

	constructor(
		private readonly engine: MarkdownEngine
	) { }

	public async provideFoldingRanges(
		document: vscode.TextDocument,
		context: vscode.FoldingContext,
		_token: vscode.CancellationToken
	): Promise<vscode.FoldingRangeList> {
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		let toc = await tocProvider.getToc();
		if (context.maxRanges && toc.length > context.maxRanges) {
			toc = toc.slice(0, context.maxRanges);
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


		return new vscode.FoldingRangeList(foldingRanges);
	}
}