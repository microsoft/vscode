/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

import { MarkdownEngine, IToken } from './markdownEngine';

class TableOfContentProvider {

	private headings: any;

	constructor(
		private engine: MarkdownEngine,
		private document: vscode.TextDocument) { }


	getLine(fragment: string): number {
		if (!this.headings) {
			try {
				const tokens = this.engine.parse(this.document.getText());
				this.headings = TableOfContentProvider.extractHeaders(tokens, this.document);
			} catch (e) {
				this.headings = {};
			}
		}
		const href = TableOfContentProvider.normalizeHeader(fragment);
		return +this.headings[href];
	}

	private static extractHeaders(tokens: IToken[], document: vscode.TextDocument): any {
		const headers: any = {};
		for (const heading of tokens.filter(token => token.type === 'heading_open')) {
			const lineNumber = heading.map[0];
			const line = document.lineAt(lineNumber);
			const href = this.normalizeHeader(line.text);
			if (href) {
				headers[href] = headers[href] || line.range.start.line;
			}
		}
		return headers;
	}

	private static normalizeHeader(header: string): string {
		return encodeURI(header.replace(/^\s*(#)+\s*(.*?)\s*\1*$/, '$2')
			.toLowerCase()
			.trim()
			.replace(/\s/g, '-'));
	}
}

export default class MarkdownDocumentLinkProvider implements vscode.DocumentLinkProvider {

	private _linkPattern = /(\[[^\]]*\]\(\s*?)(\S+?)(\s+[^\)]*)?\)/g;

	constructor(private engine: MarkdownEngine) { }

	public provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentLink[] {
		const results: vscode.DocumentLink[] = [];
		const base = path.dirname(document.uri.fsPath);
		const text = document.getText();

		const tocProvider = new TableOfContentProvider(this.engine, document);

		this._linkPattern.lastIndex = 0;
		let match: RegExpMatchArray | null;
		while ((match = this._linkPattern.exec(text))) {
			const pre = match[1];
			const link = match[2];
			const offset = match.index + pre.length;
			const linkStart = document.positionAt(offset);
			const linkEnd = document.positionAt(offset + link.length);
			try {
				results.push(new vscode.DocumentLink(
					new vscode.Range(linkStart, linkEnd),
					this.normalizeLink(link, base, tocProvider)));
			} catch (e) {
				// noop
			}
		}

		return results;
	}
	private normalizeLink(link: string, base: string, toc: TableOfContentProvider): vscode.Uri {
		let uri = vscode.Uri.parse(link);
		if (!uri.scheme) {
			if (uri.fragment && !uri.path) {
				// local link
				const line = toc.getLine(uri.fragment);
				if (!isNaN(line)) {
					return vscode.Uri.parse(`command:revealLine?${encodeURIComponent(JSON.stringify({ lineNumber: line, at: 'top' }))}`);
				}
			}

			// assume it must be a file
			let file;
			if (uri.path[0] === '/') {
				file = path.join(vscode.workspace.rootPath, uri.path);
			} else {
				file = path.join(base, uri.path);
			}
			uri = vscode.Uri.file(file);
		}
		return uri;
	}
}
