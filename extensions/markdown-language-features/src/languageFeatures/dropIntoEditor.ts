/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as URI from 'vscode-uri';

const imageFileExtensions = new Set<string>([
	'.bmp',
	'.gif',
	'.ico',
	'.jpe',
	'.jpeg',
	'.jpg',
	'.png',
	'.psd',
	'.svg',
	'.tga',
	'.tif',
	'.tiff',
	'.webp',
]);

export function registerDropIntoEditor(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentOnDropProvider(selector, new class implements vscode.DocumentOnDropProvider {
		async provideDocumentOnDropEdits(document: vscode.TextDocument, position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.SnippetTextEdit | undefined> {
			const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.drop.enabled', true);
			if (!enabled) {
				return;
			}

			const replacementRange = new vscode.Range(position, position);
			return this.tryInsertUriList(document, replacementRange, dataTransfer, token);
		}

		private async tryInsertUriList(document: vscode.TextDocument, replacementRange: vscode.Range, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.SnippetTextEdit | undefined> {
			const urlList = await dataTransfer.get('text/uri-list')?.asString();
			if (!urlList || token.isCancellationRequested) {
				return undefined;
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
				const mdPath = document.uri.scheme === uri.scheme
					? encodeURI(path.relative(URI.Utils.dirname(document.uri).fsPath, uri.fsPath).replace(/\\/g, '/'))
					: uri.toString(false);

				const ext = URI.Utils.extname(uri).toLowerCase();
				snippet.appendText(imageFileExtensions.has(ext) ? '![' : '[');
				snippet.appendTabstop();
				snippet.appendText(`](${mdPath})`);

				if (i <= uris.length - 1 && uris.length > 1) {
					snippet.appendText(' ');
				}
			});

			return new vscode.SnippetTextEdit(replacementRange, snippet);
		}
	});
}
