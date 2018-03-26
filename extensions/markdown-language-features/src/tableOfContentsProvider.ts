/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import { MarkdownEngine } from './markdownEngine';

export class Slug {
	private static specialChars: any = { 'à': 'a', 'ä': 'a', 'ã': 'a', 'á': 'a', 'â': 'a', 'æ': 'a', 'å': 'a', 'ë': 'e', 'è': 'e', 'é': 'e', 'ê': 'e', 'î': 'i', 'ï': 'i', 'ì': 'i', 'í': 'i', 'ò': 'o', 'ó': 'o', 'ö': 'o', 'ô': 'o', 'ø': 'o', 'ù': 'o', 'ú': 'u', 'ü': 'u', 'û': 'u', 'ñ': 'n', 'ç': 'c', 'ß': 's', 'ÿ': 'y', 'œ': 'o', 'ŕ': 'r', 'ś': 's', 'ń': 'n', 'ṕ': 'p', 'ẃ': 'w', 'ǵ': 'g', 'ǹ': 'n', 'ḿ': 'm', 'ǘ': 'u', 'ẍ': 'x', 'ź': 'z', 'ḧ': 'h', '·': '-', '/': '-', '_': '-', ',': '-', ':': '-', ';': '-' };

	public static fromHeading(heading: string): Slug {
		const slugifiedHeading = encodeURI(heading.trim()
			.toLowerCase()
			.replace(/./g, c => Slug.specialChars[c] || c)
			.replace(/[\]\[\!\'\#\$\%\&\'\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\_\{\|\}\~\`]/g, '')
			.replace(/\s+/g, '-') // Replace whitespace with -
			.replace(/[^\w\-]+/g, '') // Remove remaining non-word chars
			.replace(/^\-+/, '') // Remove leading -
			.replace(/\-+$/, '') // Remove trailing -
		);

		return new Slug(slugifiedHeading);
	}

	private constructor(
		public readonly value: string
	) { }

	public equals(other: Slug): boolean {
		return this.value === other.value;
	}
}

export interface TocEntry {
	readonly slug: Slug;
	readonly text: string;
	readonly level: number;
	readonly line: number;
	readonly location: vscode.Location;
}

export class TableOfContentsProvider {
	private toc?: TocEntry[];

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

	public async lookup(fragment: string): Promise<TocEntry | undefined> {
		const toc = await this.getToc();
		const slug = Slug.fromHeading(fragment);
		return toc.find(entry => entry.slug.equals(slug));
	}

	private async buildToc(document: vscode.TextDocument): Promise<TocEntry[]> {
		const toc: TocEntry[] = [];
		const tokens = await this.engine.parse(document.uri, document.getText());

		for (const heading of tokens.filter(token => token.type === 'heading_open')) {
			const lineNumber = heading.map[0];
			const line = document.lineAt(lineNumber);
			toc.push({
				slug: Slug.fromHeading(line.text),
				text: TableOfContentsProvider.getHeaderText(line.text),
				level: TableOfContentsProvider.getHeaderLevel(heading.markup),
				line: lineNumber,
				location: new vscode.Location(document.uri, line.range)
			});
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
		return header.replace(/^\s*#+\s*(.*?)\s*#*$/, (_, word) => word.trim());
	}
}
