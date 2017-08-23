/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import { MarkdownEngine } from './markdownEngine';

export interface TocEntry {
	slug: string;
	text: string;
	level: number;
	line: number;
	location: vscode.Location;
}

export class TableOfContentsProvider {
	private toc: TocEntry[];

	public constructor(
		private engine: MarkdownEngine,
		private document: vscode.TextDocument
	) { }

	public async getToc(): Promise<TocEntry[]> {
		if (!this.toc) {
			try {
				this.toc = await this.buildToc(this.document);
			} catch (e) {
				this.toc = [];
			}
		}
		return this.toc;
	}

	public async lookup(fragment: string): Promise<number> {
		const slug = TableOfContentsProvider.slugify(fragment);
		for (const entry of await this.getToc()) {
			if (entry.slug === slug) {
				return entry.line;
			}
		}
		return NaN;
	}

	private async buildToc(document: vscode.TextDocument): Promise<TocEntry[]> {
		const toc: TocEntry[] = [];
		const tokens = await this.engine.parse(document.uri, document.getText());

		for (const heading of tokens.filter(token => token.type === 'heading_open')) {
			const lineNumber = heading.map[0];
			const line = document.lineAt(lineNumber);
			const href = TableOfContentsProvider.slugify(line.text);
			const level = TableOfContentsProvider.getHeaderLevel(heading.markup);
			if (href) {
				toc.push({
					slug: href,
					text: TableOfContentsProvider.getHeaderText(line.text),
					level: level,
					line: lineNumber,
					location: new vscode.Location(document.uri, line.range)
				});
			}
		}
		return toc;
	}

	private static getHeaderLevel(markup: string): number {
		if (markup === '=') {
			return 1;
		} else if (markup === '-') {
			return 2;
		} else { // '#', '##', ...
			return markup.length;
		}
	}

	private static getHeaderText(header: string): string {
		return header.replace(/^\s*#+\s*(.*?)\s*\1*$/, (_, word) => `${word.trim()}`);
	}

	public static slugify(header: string): string {
		return encodeURI(header.trim()
			.toLowerCase()
			.replace(/[\]\[\!\"\#\$\%\&\'\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~\`]/g, '')
			.replace(/\s+/g, '-')
			.replace(/^\-+/, '')
			.replace(/\-+$/, ''));
	}
}

