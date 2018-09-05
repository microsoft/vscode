/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownEngine } from './markdownEngine';
import { Token } from 'markdown-it';
import { Slug, githubSlugifier } from './slugify';

export interface TocEntry {
	readonly slug: Slug;
	readonly text: string;
	readonly level: number;
	readonly line: number;
	readonly location: vscode.Location;
}

export interface SkinnyTextDocument {
	readonly uri: vscode.Uri;
	readonly lineCount: number;
	getText(): string;
	lineAt(line: number): vscode.TextLine;
}

export class TableOfContentsProvider {
	private toc?: TocEntry[];

	public constructor(
		private engine: MarkdownEngine,
		private document: SkinnyTextDocument
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
		const slug = githubSlugifier.fromHeading(fragment);
		return toc.find(entry => entry.slug.equals(slug));
	}

	private async buildToc(document: SkinnyTextDocument): Promise<TocEntry[]> {
		const tokens = await this.engine.parse(document.uri, document.getText());
		return [
			...this.buildHeadingToc(document, tokens),
			...this.buildBulletToc(document, tokens),
		];
	}

	private buildHeadingToc(document: SkinnyTextDocument, tokens: Token[]) {
		const toc: TocEntry[] = [];

		for (const heading of tokens.filter(token => token.type === 'heading_open')) {
			const lineNumber = heading.map[0];
			const line = document.lineAt(lineNumber);
			toc.push({
				slug: githubSlugifier.fromHeading(line.text),
				text: TableOfContentsProvider.getText(line.text),
				level: TableOfContentsProvider.getHeaderLevel(heading.markup),
				line: lineNumber,
				location: new vscode.Location(document.uri, line.range)
			});
		}

		// Get full range of section
		return toc.map((entry, startIndex): TocEntry => {
			let end: number | undefined = undefined;
			for (let i = startIndex + 1; i < toc.length; ++i) {
				if (toc[i].level <= entry.level) {
					end = toc[i].line - 1;
					break;
				}
			}
			const endLine = typeof end === 'number' ? end : document.lineCount - 1;
			return {
				...entry,
				location: new vscode.Location(document.uri,
					new vscode.Range(
						entry.location.range.start,
						new vscode.Position(endLine, document.lineAt(endLine).range.end.character)))
			};
		});
	}

	private buildBulletToc(document: SkinnyTextDocument, tokens: Token[]) {
		const toc: TocEntry[] = [];
		const trimedToc: TocEntry[] = [];

		let bulletLevel = 1;
		tokens.forEach(token => {
			if (token.type === 'list_item_open') {
				const lineNumber = token.map[0];
				const line = document.lineAt(lineNumber);
				toc.push({
					slug: githubSlugifier.fromHeading(line.text),
					text: TableOfContentsProvider.getText(line.text),
					level: bulletLevel++,
					line: lineNumber,
					location: new vscode.Location(document.uri, line.range)
				});
			} else if (token.type === 'list_item_close') {
				bulletLevel--;
			}
		});

		toc.forEach((entry, startIndex) => {
			let end: number | undefined = undefined;
			for (let i = startIndex + 1; i < toc.length; ++i) {
				if (toc[i].level <= entry.level) {
					end = toc[i].line - 1;
					break;
				}
			}
			if (typeof end === 'undefined' && startIndex !== toc.length) {
				end = toc[toc.length - 1].line;
			}
			if (typeof end === 'number') {
				trimedToc.push({
					...entry,
					location: new vscode.Location(document.uri,
						new vscode.Range(
							entry.location.range.start,
							new vscode.Position(end, document.lineAt(end).range.end.character)))
				});
			}
		});
		return trimedToc;
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

	private static getText(header: string): string {
		return header.replace(/^\s*#+\s*(.*?)\s*#*$/, (_, word) => word.trim());
	}
}
