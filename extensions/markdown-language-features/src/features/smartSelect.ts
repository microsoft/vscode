/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Token } from 'markdown-it';
import * as vscode from 'vscode';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContentsProvider, TocEntry } from '../tableOfContentsProvider';

export default class MarkdownSmartSelect implements vscode.SelectionRangeProvider {

	constructor(
		private readonly engine: MarkdownEngine
	) { }

	public async provideSelectionRanges(document: vscode.TextDocument, positions: vscode.Position[], _token: vscode.CancellationToken): Promise<vscode.SelectionRange[] | undefined> {
		let promises = await Promise.all(positions.map((position) => {
			return this.provideSelectionRange(document, position, _token);
		}));
		return promises.filter(item => item !== undefined) as vscode.SelectionRange[];
	}

	private async provideSelectionRange(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.SelectionRange | undefined> {
		const headerRange = await this.getHeaderSelectionRange(document, position);
		const blockRange = await this.getBlockSelectionRange(document, position, headerRange);
		return blockRange ? blockRange : headerRange ? headerRange : undefined;
	}

	private async getBlockSelectionRange(document: vscode.TextDocument, position: vscode.Position, headerRange?: vscode.SelectionRange): Promise<vscode.SelectionRange | undefined> {

		const tokens = await this.engine.parse(document);

		let blockTokens = getTokensForPosition(tokens, position);

		if (blockTokens.length === 0) {
			return undefined;
		}

		let parentRange = headerRange ? headerRange : createBlockRange(blockTokens.shift(), document);
		let currentRange: vscode.SelectionRange | undefined;

		for (const token of blockTokens) {
			currentRange = createBlockRange(token, document, parentRange);
			if (currentRange && currentRange.parent && parentRange) {
				parentRange = currentRange;
			} else if (currentRange) {
				return currentRange;
			} else {
				return parentRange;
			}
		}
		if (currentRange) {
			return currentRange;
		} else {
			return parentRange;
		}
	}

	private async getHeaderSelectionRange(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.SelectionRange | undefined> {
		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();

		let headerInfo = getHeadersForPosition(toc, position);

		let headers = headerInfo.headers;

		if (headers.length === 0) {
			return undefined;
		}

		let parentRange = createHeaderRange(headers.shift());
		let currentRange: vscode.SelectionRange | undefined;

		let index = 0;
		for (const header of headers) {
			if (parentRange) {
				if (parentRange.range.contains(header.location.range)) {
					if (headerInfo.headerOnThisLine && index === headers.length - 1) {
						currentRange = new vscode.SelectionRange(header.location.range, parentRange);
					} else {
						currentRange = createHeaderRange(header, parentRange);
					}
				}
			}
			if (currentRange && currentRange.parent) {
				parentRange = currentRange;
			}
			index++;
		}
		if (currentRange) {
			return currentRange;
		} else {
			return parentRange;
		}
	}
}

function getTokensForPosition(tokens: Token[], position: vscode.Position): Token[] {
	let enclosingTokens = tokens.filter(token => token.map && (token.map[0] <= position.line && token.map[1] > position.line) && isBlockElement(token));

	if (enclosingTokens.length === 0) {
		return [];
	}

	let sortedTokens = enclosingTokens.sort((token1, token2) => (token2.map[1] - token2.map[0]) - (token1.map[1] - token1.map[0]));
	return sortedTokens;
}

function getHeadersForPosition(toc: TocEntry[], position: vscode.Position): { headers: TocEntry[], headerOnThisLine: boolean } {
	let enclosingHeaders = toc.filter(header => header.location.range.start.line <= position.line && header.location.range.end.line >= position.line);
	let sortedHeaders = enclosingHeaders.sort((header1, header2) => (header1.line - position.line) - (header2.line - position.line));
	let onThisLine = toc.find(header => header.line === position.line) !== undefined;
	return {
		headers: sortedHeaders,
		headerOnThisLine: onThisLine
	};
}

function isBlockElement(token: Token): boolean {
	return !['list_item_close', 'paragraph_close', 'bullet_list_close', 'inline', 'heading_close', 'heading_open'].includes(token.type);
}

function createHeaderRange(header: TocEntry | undefined, parent?: vscode.SelectionRange): vscode.SelectionRange | undefined {
	if (header) {
		let contentRange = new vscode.Range(header.location.range.start.translate(1), header.location.range.end);
		let headerPlusContentRange = header.location.range;
		if (parent && parent.range.contains(headerPlusContentRange)) {
			return new vscode.SelectionRange(contentRange, new vscode.SelectionRange(headerPlusContentRange, parent));
		} else {
			return new vscode.SelectionRange(contentRange, new vscode.SelectionRange(headerPlusContentRange));
		}
	} else {
		return undefined;
	}
}

function createBlockRange(block: Token | undefined, document: vscode.TextDocument, parent?: vscode.SelectionRange): vscode.SelectionRange | undefined {
	if (block) {
		if (block.type === 'fence') {
			return createFencedRange(block, document, parent);
		} else {
			let startLine = document.lineAt(block.map[0]).isEmptyOrWhitespace ? block.map[0] + 1 : block.map[0];
			let adjustedEndLine = document.lineAt(block.map[1]).isEmptyOrWhitespace ? block.map[1] - 1 : block.map[1];
			let endLine = startLine !== adjustedEndLine && isList(block.type) ? adjustedEndLine - 1 : adjustedEndLine;
			let startPos = new vscode.Position(startLine, 0);
			let endPos = new vscode.Position(endLine, getEndCharacter(document, startLine, endLine));
			let range = new vscode.Range(startPos, endPos);
			if (parent && parent.range.contains(range) && !parent.range.isEqual(range)) {
				return new vscode.SelectionRange(range, parent);
			} else if (parent) {
				return parent;
			} else {
				return new vscode.SelectionRange(range);
			}
		}
	} else {
		return undefined;
	}
}

function createFencedRange(token: Token, document: vscode.TextDocument, parent?: vscode.SelectionRange): vscode.SelectionRange {
	let blockRange = new vscode.SelectionRange(new vscode.Range(new vscode.Position(token.map[0], 0), new vscode.Position(token.map[1], getEndCharacter(document, token.map[0], token.map[1]))));
	let childRange = new vscode.Range(new vscode.Position(token.map[0] + 1, 0), new vscode.Position(token.map[1] - 1, getEndCharacter(document, token.map[0] + 1, token.map[1] - 1)));
	if (parent && parent.range.contains(blockRange.range) && !parent.range.isEqual(blockRange.range)) {
		return new vscode.SelectionRange(childRange, new vscode.SelectionRange(blockRange.range, parent));
	} else if (parent?.range.isEqual(blockRange.range)) {
		return new vscode.SelectionRange(childRange, parent);
	} else {
		return new vscode.SelectionRange(childRange, blockRange);
	}
}

function isList(type: string): boolean {
	return type ? ['ordered_list_open', 'list_item_open', 'bullet_list_open'].includes(type) : false;
}

function getEndCharacter(document: vscode.TextDocument, startLine: number, endLine: number): number {
	let startLength = document.lineAt(startLine).text ? document.lineAt(startLine).text.length : 0;
	let endLength = document.lineAt(startLine).text ? document.lineAt(startLine).text.length : 0;
	let endChar = Math.max(startLength, endLength);
	return startLine !== endLine ? 0 : endChar;
}
