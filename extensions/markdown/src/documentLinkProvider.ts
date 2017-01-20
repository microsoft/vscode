/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

export default class MarkdownDocumentLinkProvider implements vscode.DocumentLinkProvider {

	private _cachedResult: { version: number; links: vscode.DocumentLink[] };
	private _linkPattern = /(\[[^\]]*\]\(\s*?)(\S+?)(\s+[^\)]*)?\)/g;

	public provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentLink[] {
		const {version} = document;
		if (!this._cachedResult || this._cachedResult.version !== version) {
			const links = this._computeDocumentLinks(document);
			this._cachedResult = { version, links };
		}
		return this._cachedResult.links;
	}

	private _computeDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
		const results: vscode.DocumentLink[] = [];
		const base = path.dirname(document.uri.fsPath);
		const text = document.getText();

		this._linkPattern.lastIndex = 0;
		let match: RegExpMatchArray | null;
		while ((match = this._linkPattern.exec(text))) {
			const pre = match[1];
			const link = match[2];
			const offset = match.index + pre.length;
			const linkStart = document.positionAt(offset);
			const linkEnd = document.positionAt(offset + link.length);
			try {
				let uri = vscode.Uri.parse(link);
				if (!uri.scheme) {
					// assume it must be a file
					const file = path.join(base, link);
					uri = vscode.Uri.file(file);
				}
				results.push(new vscode.DocumentLink(
					new vscode.Range(linkStart, linkEnd),
					uri));
			} catch (e) {
				// noop
			}
		}

		return results;
	}
};
