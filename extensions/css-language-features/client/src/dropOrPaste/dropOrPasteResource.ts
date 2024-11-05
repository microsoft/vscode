/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { getDocumentDir, Mimes, Schemes } from './shared';
import { UriList } from './uriList';

class DropOrPasteResourceProvider implements vscode.DocumentDropEditProvider, vscode.DocumentPasteEditProvider {
	readonly kind = vscode.DocumentDropOrPasteEditKind.Empty.append('css', 'url');

	async provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentDropEdit | undefined> {
		const uriList = await this.getUriList(dataTransfer);
		if (!uriList.entries.length || token.isCancellationRequested) {
			return;
		}

		const snippet = await this.createUriListSnippet(document.uri, uriList);
		if (!snippet || token.isCancellationRequested) {
			return;
		}

		return {
			kind: this.kind,
			title: snippet.label,
			insertText: snippet.snippet.value,
			yieldTo: this.pasteAsCssUrlByDefault(document, position) ? [] : [vscode.DocumentDropOrPasteEditKind.Empty.append('uri')]
		};
	}

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		_context: vscode.DocumentPasteEditContext,
		token: vscode.CancellationToken
	): Promise<vscode.DocumentPasteEdit[] | undefined> {
		const uriList = await this.getUriList(dataTransfer);
		if (!uriList.entries.length || token.isCancellationRequested) {
			return;
		}

		const snippet = await this.createUriListSnippet(document.uri, uriList);
		if (!snippet || token.isCancellationRequested) {
			return;
		}

		return [{
			kind: this.kind,
			title: snippet.label,
			insertText: snippet.snippet.value,
			yieldTo: this.pasteAsCssUrlByDefault(document, ranges[0].start) ? [] : [vscode.DocumentDropOrPasteEditKind.Empty.append('uri')]
		}];
	}

	private async getUriList(dataTransfer: vscode.DataTransfer): Promise<UriList> {
		const urlList = await dataTransfer.get(Mimes.uriList)?.asString();
		if (urlList) {
			return UriList.from(urlList);
		}

		// Find file entries
		const uris: vscode.Uri[] = [];
		for (const [_, entry] of dataTransfer) {
			const file = entry.asFile();
			if (file?.uri) {
				uris.push(file.uri);
			}
		}

		return new UriList(uris.map(uri => ({ uri, str: uri.toString(true) })));
	}

	private async createUriListSnippet(docUri: vscode.Uri, uriList: UriList): Promise<{ readonly snippet: vscode.SnippetString; readonly label: string } | undefined> {
		if (!uriList.entries.length) {
			return;
		}

		const snippet = new vscode.SnippetString();
		for (let i = 0; i < uriList.entries.length; i++) {
			const uri = uriList.entries[i];
			const relativePath = getRelativePath(getDocumentDir(docUri), uri.uri);
			const urlText = relativePath ?? uri.str;

			snippet.appendText(`url(${urlText})`);
			if (i !== uriList.entries.length - 1) {
				snippet.appendText(' ');
			}
		}

		return {
			snippet,
			label: uriList.entries.length > 1
				? vscode.l10n.t('Insert url() Functions')
				: vscode.l10n.t('Insert url() Function')
		};
	}

	private pasteAsCssUrlByDefault(document: vscode.TextDocument, position: vscode.Position): boolean {
		const regex = /url\(.+?\)/gi;
		for (const match of Array.from(document.lineAt(position.line).text.matchAll(regex))) {
			if (position.character > match.index && position.character < match.index + match[0].length) {
				return false;
			}
		}
		return true;
	}
}

function getRelativePath(fromFile: vscode.Uri | undefined, toFile: vscode.Uri): string | undefined {
	if (fromFile && fromFile.scheme === toFile.scheme && fromFile.authority === toFile.authority) {
		if (toFile.scheme === Schemes.file) {
			// On windows, we must use the native `path.relative` to generate the relative path
			// so that drive-letters are resolved cast insensitively. However we then want to
			// convert back to a posix path to insert in to the document
			const relativePath = path.relative(fromFile.fsPath, toFile.fsPath);
			return path.posix.normalize(relativePath.split(path.sep).join(path.posix.sep));
		}

		return path.posix.relative(fromFile.path, toFile.path);
	}

	return undefined;
}

export function registerDropOrPasteResourceSupport(selector: vscode.DocumentSelector): vscode.Disposable {
	const provider = new DropOrPasteResourceProvider();

	return vscode.Disposable.from(
		vscode.languages.registerDocumentDropEditProvider(selector, provider, {
			providedDropEditKinds: [provider.kind],
			dropMimeTypes: [
				Mimes.uriList,
				'files'
			]
		}),
		vscode.languages.registerDocumentPasteEditProvider(selector, provider, {
			providedPasteEditKinds: [provider.kind],
			pasteMimeTypes: [
				Mimes.uriList,
				'files'
			]
		})
	);
}
