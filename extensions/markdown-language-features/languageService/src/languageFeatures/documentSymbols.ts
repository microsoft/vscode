/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver-types';
import { ILogger } from '../logging';
import { MdTableOfContentsProvider, TocEntry } from '../tableOfContents';
import { toLspLocation } from '../types/location';
import { ITextDocument } from '../types/textDocument';

interface MarkdownSymbol {
	readonly level: number;
	readonly parent: MarkdownSymbol | undefined;
	readonly children: lsp.DocumentSymbol[];
}

export class MdDocumentSymbolProvider {

	constructor(
		private readonly tocProvider: MdTableOfContentsProvider,
		private readonly logger: ILogger,
	) { }

	public async provideDocumentSymbolInformation(document: ITextDocument): Promise<lsp.SymbolInformation[]> {
		this.logger.verbose('DocumentSymbolProvider', `provideDocumentSymbolInformation - ${document.uri}`);
		const toc = await this.tocProvider.getForDocument(document);
		return toc.entries.map(entry => this.toSymbolInformation(entry));
	}

	public async provideDocumentSymbols(document: ITextDocument): Promise<lsp.DocumentSymbol[]> {
		const toc = await this.tocProvider.getForDocument(document);
		const root: MarkdownSymbol = {
			level: -Infinity,
			children: [],
			parent: undefined
		};
		this.buildTree(root, toc.entries);
		return root.children;
	}

	private buildTree(parent: MarkdownSymbol, entries: readonly TocEntry[]) {
		if (!entries.length) {
			return;
		}

		const entry = entries[0];
		const symbol = this.toDocumentSymbol(entry);
		symbol.children = [];

		while (entry.level <= parent.level) {
			parent = parent.parent!;
		}
		parent.children.push(symbol);
		this.buildTree({ level: entry.level, children: symbol.children, parent }, entries.slice(1));
	}

	private toSymbolInformation(entry: TocEntry): lsp.SymbolInformation {
		return {
			name: this.getSymbolName(entry),
			kind: lsp.SymbolKind.String,
			location: toLspLocation(entry.sectionLocation)
		};
	}

	private toDocumentSymbol(entry: TocEntry): lsp.DocumentSymbol {
		return {
			name: this.getSymbolName(entry),
			kind: lsp.SymbolKind.String,
			range: entry.sectionLocation.range,
			selectionRange: entry.sectionLocation.range
		};
	}

	private getSymbolName(entry: TocEntry): string {
		return '#'.repeat(entry.level) + ' ' + entry.text;
	}
}
