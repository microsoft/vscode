/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import { MarkdownEngine, IToken } from './markdownEngine';

export interface TocEntry {
	slug: string;
	text: string;
	line: number;
	location: vscode.Location;
}

export class TableOfContentsProvider {
	private toc: TocEntry[];

	public constructor(
		private engine: MarkdownEngine,
		private document: vscode.TextDocument) { }

	public getToc(): TocEntry[] {
		if (!this.toc) {
			try {
				this.toc = this.buildToc(this.document);
			} catch (e) {
				this.toc = [];
			}
		}
		return this.toc;
	}

	public lookup(fragment: string): number {
		const slug = TableOfContentsProvider.slugify(fragment);
		for (const entry of this.getToc()) {
			if (entry.slug === slug) {
				return entry.line;
			}
		}
		return NaN;
	}

	private buildToc(document: vscode.TextDocument): any {
		const toc: TocEntry[] = [];
		const tokens: IToken[] = this.engine.parse(document.uri, document.getText());

		for (const heading of tokens.filter(token => token.type === 'heading_open')) {
			const lineNumber = heading.map[0];
			const line = document.lineAt(lineNumber);
			const href = TableOfContentsProvider.slugify(line.text);
			if (href) {
				toc.push({
					slug: href,
					text: TableOfContentsProvider.getHeaderText(line.text),
					line: lineNumber,
					location: new vscode.Location(document.uri, line.range)
				});
			}
		}
		return toc;
	}

	private static getHeaderText(header: string): string {
		return header.replace(/^\s*(#)+\s*(.*?)\s*\1*$/, '$2').trim();
	}

	public static slugify(header: string): string {
		return encodeURI(header.trim()
			.toLowerCase()
			.replace(/[\]\[\!\"\#\$\%\&\'\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~]/g, '')
			.replace(/\s+/g, '-')
			.replace(/^\-+/, '')
			.replace(/\-+$/, ''));
	}
}

