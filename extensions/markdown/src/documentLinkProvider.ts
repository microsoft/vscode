/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

import { MarkdownEngine } from './markdownEngine';
import { TableOfContentProvider } from './tableOfContentsProvider';

export default class MarkdownDocumentLinkProvider implements vscode.DocumentLinkProvider {

	private _linkPattern = /(\[[^\]]*\]\(\s*?)(\S+?)(\s+[^\)]*)?\)/g;

	constructor(private engine: MarkdownEngine) { }

	public provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentLink[] {
		const results: vscode.DocumentLink[] = [];
		const base = path.dirname(document.uri.fsPath);
		const text = document.getText();

		const toc = new TableOfContentProvider(this.engine, document);

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
					this.normalizeLink(link, base, toc)));
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
				const line = toc.lookup(uri.fragment);
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
