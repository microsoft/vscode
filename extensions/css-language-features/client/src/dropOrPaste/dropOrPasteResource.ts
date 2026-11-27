/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getDocumentDir } from './shared';
import { createUriListText, shouldInsertCssUrl } from './resourceUrls';
import { UriList, uriListMimeType } from './uriList';

class DropOrPasteResourceProvider implements vscode.DocumentDropEditProvider, vscode.DocumentPasteEditProvider {

	readonly kind = vscode.DocumentDropOrPasteEditKind.Empty.append('css', 'link', 'url');

	async provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentDropEdit | undefined> {
		if (token.isCancellationRequested) {
			return;
		}
		const uriList = await UriList.fromDataTransfer(dataTransfer);
		if (!uriList.entries.length || token.isCancellationRequested) {
			return;
		}

		const edit = this.createUriListEdit(document, uriList);

		return {
			kind: this.kind,
			title: edit.label,
			insertText: edit.text,
			yieldTo: this.pasteAsCssUrlByDefault(document, [position]) ? [] : [vscode.DocumentDropOrPasteEditKind.Empty.append('uri')]
		};
	}

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		_context: vscode.DocumentPasteEditContext,
		token: vscode.CancellationToken
	): Promise<vscode.DocumentPasteEdit[] | undefined> {
		if (!ranges.length || token.isCancellationRequested) {
			return;
		}
		const uriList = await UriList.fromDataTransfer(dataTransfer);
		if (!uriList.entries.length || token.isCancellationRequested) {
			return;
		}

		const edit = this.createUriListEdit(document, uriList);

		return [{
			kind: this.kind,
			title: edit.label,
			insertText: edit.text,
			yieldTo: this.pasteAsCssUrlByDefault(document, ranges.map(range => range.start)) ? [] : [vscode.DocumentDropOrPasteEditKind.Empty.append('uri')]
		}];
	}

	private createUriListEdit(document: vscode.TextDocument, uriList: UriList): { readonly text: string; readonly label: string } {
		return {
			text: createUriListText(getDocumentDir(document.uri), uriList, document.languageId),
			label: uriList.entries.length > 1
				? vscode.l10n.t('Insert url() Functions')
				: vscode.l10n.t('Insert url() Function')
		};
	}

	private pasteAsCssUrlByDefault(document: vscode.TextDocument, positions: readonly vscode.Position[]): boolean {
		const text = document.getText();
		return shouldInsertCssUrl(text, positions.map(position => document.offsetAt(position)), document.languageId);
	}
}

export function registerDropOrPasteResourceSupport(selector: vscode.DocumentSelector): vscode.Disposable {
	const provider = new DropOrPasteResourceProvider();

	return vscode.Disposable.from(
		vscode.languages.registerDocumentDropEditProvider(selector, provider, {
			providedDropEditKinds: [provider.kind],
			dropMimeTypes: [
				uriListMimeType,
				'files'
			]
		}),
		vscode.languages.registerDocumentPasteEditProvider(selector, provider, {
			providedPasteEditKinds: [provider.kind],
			pasteMimeTypes: [
				uriListMimeType,
				'files'
			]
		})
	);
}
