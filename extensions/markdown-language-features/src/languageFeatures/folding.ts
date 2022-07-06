/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Token = require('markdown-it/lib/token');
import * as vscode from 'vscode';
import { IMdParser } from '../markdownEngine';
import { MdTableOfContentsProvider } from '../tableOfContents';
import { getLine, ITextDocument } from '../types/textDocument';
import { isEmptyOrWhitespace } from '../util/string';

const rangeLimit = 5000;

interface MarkdownItTokenWithMap extends Token {
	map: [number, number];
}

export class MdFoldingProvider implements vscode.FoldingRangeProvider {

	constructor(
		private readonly parser: IMdParser,
		private readonly tocProvide: MdTableOfContentsProvider,
	) { }

	public async provideFoldingRanges(
		document: ITextDocument,
		_: vscode.FoldingContext,
		_token: vscode.CancellationToken
	): Promise<vscode.FoldingRange[]> {
		const foldables = await Promise.all([
			this.getRegions(document),
			this.getHeaderFoldingRanges(document),
			this.getBlockFoldingRanges(document)
		]);
		return foldables.flat().slice(0, rangeLimit);
	}

	private async getRegions(document: ITextDocument): Promise<vscode.FoldingRange[]> {
		const tokens = await this.parser.tokenize(document);
		const regionMarkers = tokens.filter(isRegionMarker)
			.map(token => ({ line: token.map[0], isStart: isStartRegion(token.content) }));

		const nestingStack: { line: number; isStart: boolean }[] = [];
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

	private async getHeaderFoldingRanges(document: ITextDocument): Promise<vscode.FoldingRange[]> {
		const toc = await this.tocProvide.getForDocument(document);
		return toc.entries.map(entry => {
			let endLine = entry.sectionLocation.range.end.line;
			if (isEmptyOrWhitespace(getLine(document, endLine)) && endLine >= entry.line + 1) {
				endLine = endLine - 1;
			}
			return new vscode.FoldingRange(entry.line, endLine);
		});
	}

	private async getBlockFoldingRanges(document: ITextDocument): Promise<vscode.FoldingRange[]> {
		const tokens = await this.parser.tokenize(document);
		const multiLineListItems = tokens.filter(isFoldableToken);
		return multiLineListItems.map(listItem => {
			const start = listItem.map[0];
			let end = listItem.map[1] - 1;
			if (isEmptyOrWhitespace(getLine(document, end)) && end >= start + 1) {
				end = end - 1;
			}
			return new vscode.FoldingRange(start, end, this.getFoldingRangeKind(listItem));
		});
	}

	private getFoldingRangeKind(listItem: Token): vscode.FoldingRangeKind | undefined {
		return listItem.type === 'html_block' && listItem.content.startsWith('<!--')
			? vscode.FoldingRangeKind.Comment
			: undefined;
	}
}

const isStartRegion = (t: string) => /^\s*<!--\s*#?region\b.*-->/.test(t);
const isEndRegion = (t: string) => /^\s*<!--\s*#?endregion\b.*-->/.test(t);

const isRegionMarker = (token: Token): token is MarkdownItTokenWithMap =>
	!!token.map && token.type === 'html_block' && (isStartRegion(token.content) || isEndRegion(token.content));

const isFoldableToken = (token: Token): token is MarkdownItTokenWithMap => {
	if (!token.map) {
		return false;
	}

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

export function registerFoldingSupport(
	selector: vscode.DocumentSelector,
	parser: IMdParser,
	tocProvider: MdTableOfContentsProvider,
): vscode.Disposable {
	return vscode.languages.registerFoldingRangeProvider(selector, new MdFoldingProvider(parser, tocProvider));
}
