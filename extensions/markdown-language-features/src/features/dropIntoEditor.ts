/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as URI from 'vscode-uri';

export function registerDropIntoEditor() {
	return vscode.workspace.onWillDropOnTextEditor(e => {
		e.waitUntil((async () => {
			const urlList = await e.dataTransfer.get('text/uri-list')?.asString();
			if (!urlList) {
				return;
			}

			const uris: vscode.Uri[] = [];
			for (const resource of urlList.split('\n')) {
				try {
					uris.push(vscode.Uri.parse(resource));
				} catch {
					// noop
				}
			}

			if (!uris.length) {
				return;
			}

			const snippet = new vscode.SnippetString();
			uris.forEach((uri, i) => {
				const rel = path.relative(URI.Utils.dirname(e.editor.document.uri).fsPath, uri.fsPath);

				snippet.appendText('[');
				snippet.appendTabstop();
				snippet.appendText(`](${rel})`);

				if (i <= uris.length - 1 && uris.length > 1) {
					snippet.appendText(' ');
				}
			});

			return e.editor.insertSnippet(snippet, e.position);
		})());
	});
}
