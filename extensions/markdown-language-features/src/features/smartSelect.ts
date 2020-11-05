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
		const promises = await Promise.all(positions.map((position) => {
			return this.provideSelectionRange(document, position, _token);
		}));
		return promises.filter(item => item !== undefined) as vscode.SelectionRange[];
	}

	private async provideSelectionRange(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): Promise<vscode.SelectionRange | undefined> {
		const headerRange = await this.getHeaderSelectionRange(document, position);
		const blockRange = await this.getBlockSelectionRange(document, position, headerRange);
		return blockRange || headerRange;
	}

	private async getBlockSelectionRange(document: vscode.TextDocument, position: vscode.Position, headerRange?: vscode.SelectionRange): Promise<vscode.SelectionRange | undefined> {

		const tokens = await this.engine.parse(document);

		const blockTokens = getTokensForPosition(tokens, position);

		if (blockTokens.length === 0) {
			return undefined;
		}

		let currentRange: vscode.SelectionRange | undefined = headerRange ? headerRange : createBlockRange(blockTokens.shift()!, document, position.line);

		for (let i = 0; i < blockTokens.length; i++) {
			currentRange = createBlockRange(blockTokens[i], document, position.line, currentRange);
		}
		return currentRange;
	}

	private async getHeaderSelectionRange(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.SelectionRange | undefined> {

		const tocProvider = new TableOfContentsProvider(this.engine, document);
		const toc = await tocProvider.getToc();

		const headerInfo = getHeadersForPosition(toc, position);

		const headers = headerInfo.headers;

		let currentRange: vscode.SelectionRange | undefined;

		for (let i = 0; i < headers.length; i++) {
			currentRange = createHeaderRange(headers[i], i === headers.length - 1, headerInfo.headerOnThisLine, currentRange, getFirstChildHeader(document, headers[i], toc));
		}
		return currentRange;
	}
}

function getHeadersForPosition(toc: TocEntry[], position: vscode.Position): { headers: TocEntry[], headerOnThisLine: boolean } {
	const enclosingHeaders = toc.filter(header => header.location.range.start.line <= position.line && header.location.range.end.line >= position.line);
	const sortedHeaders = enclosingHeaders.sort((header1, header2) => (header1.line - position.line) - (header2.line - position.line));
	const onThisLine = toc.find(header => header.line === position.line) !== undefined;
	return {
		headers: sortedHeaders,
		headerOnThisLine: onThisLine
	};
}

function createHeaderRange(header: TocEntry, isClosestHeaderToPosition: boolean, onHeaderLine: boolean, parent?: vscode.SelectionRange, childStart?: vscode.Position): vscode.SelectionRange | undefined {
	const contentRange = new vscode.Range(header.location.range.start.translate(1), header.location.range.end);
	const headerPlusContentRange = header.location.range;
	const partialContentRange = childStart && isClosestHeaderToPosition ? contentRange.with(undefined, childStart) : undefined;
	if (onHeaderLine && isClosestHeaderToPosition && childStart) {
		return new vscode.SelectionRange(header.location.range.with(undefined, childStart), new vscode.SelectionRange(header.location.range, parent));
	} else if (onHeaderLine && isClosestHeaderToPosition) {
		return new vscode.SelectionRange(header.location.range, parent);
	} else if (parent && parent.range.contains(headerPlusContentRange)) {
		if (partialContentRange) {
			return new vscode.SelectionRange(partialContentRange, new vscode.SelectionRange(contentRange, (new vscode.SelectionRange(headerPlusContentRange, parent))));
		} else {
			return new vscode.SelectionRange(contentRange, new vscode.SelectionRange(headerPlusContentRange, parent));
		}
	} else if (partialContentRange) {
		return new vscode.SelectionRange(partialContentRange, new vscode.SelectionRange(contentRange, (new vscode.SelectionRange(headerPlusContentRange))));
	} else {
		return new vscode.SelectionRange(contentRange, new vscode.SelectionRange(headerPlusContentRange));
	}
}
function getTokensForPosition(tokens: Token[], position: vscode.Position): Token[] {
	const enclosingTokens = tokens.filter(token => token.map && (token.map[0] <= position.line && token.map[1] > position.line) && isBlockElement(token));
	if (enclosingTokens.length === 0) {
		return [];
	}
	const sortedTokens = enclosingTokens.sort((token1, token2) => (token2.map[1] - token2.map[0]) - (token1.map[1] - token1.map[0]));
	return sortedTokens;
}

function createBlockRange(block: Token, document: vscode.TextDocument, cursorLine: number, parent?: vscode.SelectionRange): vscode.SelectionRange | undefined {
	if (block.type === 'fence') {
		return createFencedRange(block, cursorLine, document, parent);
	} else {
		let startLine = document.lineAt(block.map[0]).isEmptyOrWhitespace ? block.map[0] + 1 : block.map[0];
		let endLine = startLine === block.map[1] ? block.map[1] : block.map[1] - 1;
		if (block.type === 'paragraph_open' && block.map[1] - block.map[0] === 2) {
			startLine = endLine = cursorLine;
		} else if (isList(block) && document.lineAt(endLine).isEmptyOrWhitespace) {
			endLine = endLine - 1;
		}
		const startPos = new vscode.Position(startLine, 0);
		const endPos = new vscode.Position(endLine, document.lineAt(endLine).text?.length ?? 0);
		const range = new vscode.Range(startPos, endPos);
		if (parent && parent.range.contains(range) && !parent.range.isEqual(range)) {
			return new vscode.SelectionRange(range, parent);
		} else if (parent?.range.isEqual(range)) {
			return parent;
		} else if (parent) {
			// parent doesn't contain range
			if (rangeLinesEqual(range, parent.range)) {
				return range.end.character > parent.range.end.character ? new vscode.SelectionRange(range) : parent;
			} else if (parent.range.end.line + 1 === range.end.line) {
				const adjustedRange = new vscode.Range(range.start, range.end.translate(-1, parent.range.end.character));
				if (adjustedRange.isEqual(parent.range)) {
					return parent;
				} else {
					return new vscode.SelectionRange(adjustedRange, parent);
				}
			} else if (parent.range.end.line === range.end.line) {
				const adjustedRange = new vscode.Range(parent.range.start, range.end.translate(undefined, range.end.character));
				if (adjustedRange.isEqual(parent.range)) {
					return parent;
				} else {
					return new vscode.SelectionRange(adjustedRange, parent.parent);
				}
			} else {
				return parent;
			}
		} else {
			return new vscode.SelectionRange(range);
		}
	}
}

function createFencedRange(token: Token, cursorLine: number, document: vscode.TextDocument, parent?: vscode.SelectionRange): vscode.SelectionRange {
	const startLine = token.map[0];
	const endLine = token.map[1] - 1;
	const onFenceLine = cursorLine === startLine || cursorLine === endLine;
	const fenceRange = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, document.lineAt(endLine).text.length));
	const contentRange = endLine - startLine > 2 && !onFenceLine ? new vscode.Range(new vscode.Position(startLine + 1, 0), new vscode.Position(endLine - 1, document.lineAt(endLine - 1).text.length)) : undefined;
	if (parent && contentRange) {
		if (parent.range.contains(fenceRange) && !parent.range.isEqual(fenceRange)) {
			return new vscode.SelectionRange(contentRange, new vscode.SelectionRange(fenceRange, parent));
		} else if (parent.range.isEqual(fenceRange)) {
			return new vscode.SelectionRange(contentRange, parent);
		} else if (rangeLinesEqual(fenceRange, parent.range)) {
			const revisedRange = fenceRange.end.character > parent.range.end.character ? fenceRange : parent.range;
			return new vscode.SelectionRange(contentRange, new vscode.SelectionRange(revisedRange, getRealParent(parent, revisedRange)));
		} else if (parent.range.end.line === fenceRange.end.line) {
			parent.range.end.translate(undefined, fenceRange.end.character);
			return new vscode.SelectionRange(contentRange, new vscode.SelectionRange(fenceRange, parent));
		}
	} else if (contentRange) {
		return new vscode.SelectionRange(contentRange, new vscode.SelectionRange(fenceRange));
	} else if (parent) {
		if (parent.range.contains(fenceRange) && !parent.range.isEqual(fenceRange)) {
			return new vscode.SelectionRange(fenceRange, parent);
		} else if (parent.range.isEqual(fenceRange)) {
			return parent;
		} else if (rangeLinesEqual(fenceRange, parent.range)) {
			const revisedRange = fenceRange.end.character > parent.range.end.character ? fenceRange : parent.range;
			return new vscode.SelectionRange(revisedRange, parent.parent);
		} else if (parent.range.end.line === fenceRange.end.line) {
			parent.range.end.translate(undefined, fenceRange.end.character);
			return new vscode.SelectionRange(fenceRange, parent);
		}
	}
	return new vscode.SelectionRange(fenceRange, parent);
}

function isList(token: Token): boolean {
	return token.type ? ['ordered_list_open', 'list_item_open', 'bullet_list_open'].includes(token.type) : false;
}

function isBlockElement(token: Token): boolean {
	return !['list_item_close', 'paragraph_close', 'bullet_list_close', 'inline', 'heading_close', 'heading_open'].includes(token.type);
}

function getRealParent(parent: vscode.SelectionRange, range: vscode.Range) {
	let currentParent: vscode.SelectionRange | undefined = parent;
	while (currentParent && !currentParent.range.contains(range)) {
		currentParent = currentParent.parent;
	}
	return currentParent;
}

function getFirstChildHeader(document: vscode.TextDocument, header?: TocEntry, toc?: TocEntry[]): vscode.Position | undefined {
	let childRange: vscode.Position | undefined;
	if (header && toc) {
		let children = toc.filter(t => header.location.range.contains(t.location.range) && t.location.range.start.line > header.location.range.start.line).sort((t1, t2) => t1.line - t2.line);
		if (children.length > 0) {
			childRange = children[0].location.range.start;
			const lineText = document.lineAt(childRange.line - 1).text;
			return childRange ? childRange.translate(-1, lineText.length) : undefined;
		}
	}
	return undefined;
}

function rangeLinesEqual(range: vscode.Range, parent: vscode.Range) {
	return range.start.line === parent.start.line && range.end.line === parent.end.line;
}
