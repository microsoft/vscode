/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MdLanguageClient } from '../client/client';
import { Mime } from '../util/mimes';

class UpdatePastedLinksEditProvider implements vscode.DocumentPasteEditProvider {

	public static readonly kind = vscode.DocumentDropOrPasteEditKind.Empty.append('text', 'markdown', 'updateLinks');

	public static readonly metadataMime = 'vnd.vscode.markdown.updateLinksMetadata';

	constructor(
		private readonly _client: MdLanguageClient,
	) { }

	async prepareDocumentPaste(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		if (!this._isEnabled(document)) {
			return;
		}

		const metadata = await this._client.prepareUpdatePastedLinks(document.uri, ranges, token);
		if (token.isCancellationRequested) {
			return;
		}
		dataTransfer.set(UpdatePastedLinksEditProvider.metadataMime, new vscode.DataTransferItem(metadata));
	}

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		_context: vscode.DocumentPasteEditContext,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit[] | undefined> {
		if (!this._isEnabled(document)) {
			return;
		}

		const metadata = dataTransfer.get(UpdatePastedLinksEditProvider.metadataMime)?.value;
		if (!metadata) {
			return;
		}

		const textItem = dataTransfer.get(Mime.textPlain);
		const text = await textItem?.asString();
		if (!text || token.isCancellationRequested) {
			return;
		}

		// TODO: Handle cases such as:
		// - copy empty line
		// - Copy with multiple cursors and paste into multiple locations
		// - ...
		const edits = await this._client.getUpdatePastedLinksEdit(document.uri, ranges.map(x => new vscode.TextEdit(x, text)), metadata, token);
		if (!edits || !edits.length || token.isCancellationRequested) {
			return;
		}

		const pasteEdit = new vscode.DocumentPasteEdit('', vscode.l10n.t("Paste and update pasted links"), UpdatePastedLinksEditProvider.kind);
		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(document.uri, edits.map(x => new vscode.TextEdit(new vscode.Range(x.range.start.line, x.range.start.character, x.range.end.line, x.range.end.character,), x.newText)));
		pasteEdit.additionalEdit = workspaceEdit;
		return [pasteEdit];
	}

	private _isEnabled(document: vscode.TextDocument): boolean {
		return vscode.workspace.getConfiguration('markdown', document.uri).get<boolean>('experimental.updateLinksOnPaste', false);
	}
}

export function registerUpdatePastedLinks(selector: vscode.DocumentSelector, client: MdLanguageClient) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new UpdatePastedLinksEditProvider(client), {
		copyMimeTypes: [UpdatePastedLinksEditProvider.metadataMime],
		providedPasteEditKinds: [UpdatePastedLinksEditProvider.kind],
		pasteMimeTypes: [UpdatePastedLinksEditProvider.metadataMime],
	});
}
