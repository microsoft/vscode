/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

export default class MarkdownDocumentLinkProvider implements vscode.DocumentLinkProvider {

	private _linkPattern = /(\[[^\]]*\]\(\s*?)(\S+?)(\s+[^\)]*)?\)/g;

	constructor() { }

	public provideDocumentLinks(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.DocumentLink[] {
		const results: vscode.DocumentLink[] = [];
		const base = path.dirname(document.uri.fsPath);
		const text = document.getText();

		this._linkPattern.lastIndex = 0;
		let match: RegExpMatchArray | null;
		while ((match = this._linkPattern.exec(text))) {
			const pre = match[1];
			const link = match[2];
			const offset = (match.index || 0) + pre.length;
			const linkStart = document.positionAt(offset);
			const linkEnd = document.positionAt(offset + link.length);
			try {
				results.push(new vscode.DocumentLink(
					new vscode.Range(linkStart, linkEnd),
					this.normalizeLink(document, link, base)));
			} catch (e) {
				// noop
			}
		}

		return results;
	}

	private normalizeLink(document: vscode.TextDocument, link: string, base: string): vscode.Uri {
		const uri = vscode.Uri.parse(link);
		if (uri.scheme) {
			return uri;
		}

		// assume it must be a file
		let resourcePath;
		if (!uri.path) {
			resourcePath = document.uri.path;
		} else if (uri.path[0] === '/') {
			resourcePath = path.join(vscode.workspace.rootPath || '', uri.path);
		} else {
			resourcePath = path.join(base, uri.path);
		}

		return vscode.Uri.parse(`command:_markdown.openDocumentLink?${encodeURIComponent(JSON.stringify({ fragment: uri.fragment, path: resourcePath }))}`);
	}
}
