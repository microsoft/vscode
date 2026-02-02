/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Mime, mediaMimes } from '../../util/mimes';
import { Schemes } from '../../util/schemes';
import { PasteUrlAsFormattedLink, createEditAddingLinksForUriList, createEditForMediaFiles, getPasteUrlAsFormattedLinkSetting } from './shared';

class PasteResourceEditProvider implements vscode.DocumentPasteEditProvider {

	public static readonly id = 'insertLink';

	public static readonly pasteMimeTypes = [
		Mime.textUriList,
		...mediaMimes,
	];

	private readonly _yieldTo = [
		{ mimeType: 'text/plain' },
		{ extensionId: 'vscode.ipynb', providerId: 'insertAttachment' },
	];

	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.filePaste.enabled', true);
		if (!enabled) {
			return;
		}

		const createEdit = await this._getMediaFilesEdit(document, dataTransfer, token);
		if (createEdit) {
			return createEdit;
		}

		if (token.isCancellationRequested) {
			return;
		}

		return this._getUriListEdit(document, ranges, dataTransfer, token);
	}

	private async _getUriListEdit(document: vscode.TextDocument, ranges: readonly vscode.Range[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
		const uriList = await dataTransfer.get(Mime.textUriList)?.asString();
		if (!uriList || token.isCancellationRequested) {
			return;
		}

		const pasteUrlSetting = getPasteUrlAsFormattedLinkSetting(document);
		const pasteEdit = await createEditAddingLinksForUriList(document, ranges, uriList, false, pasteUrlSetting === PasteUrlAsFormattedLink.Smart, token);
		if (!pasteEdit) {
			return;
		}

		const uriEdit = new vscode.DocumentPasteEdit('', pasteEdit.label);
		uriEdit.additionalEdit = pasteEdit.additionalEdits;
		uriEdit.yieldTo = this._yieldTo;
		return uriEdit;
	}

	private async _getMediaFilesEdit(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentPasteEdit | undefined> {
		if (document.uri.scheme === Schemes.untitled) {
			return;
		}

		const copyFilesIntoWorkspace = vscode.workspace.getConfiguration('markdown', document).get<'mediaFiles' | 'never'>('editor.filePaste.copyIntoWorkspace', 'mediaFiles');
		if (copyFilesIntoWorkspace === 'never') {
			return;
		}

		const edit = await createEditForMediaFiles(document, dataTransfer, token);
		if (!edit) {
			return;
		}

		const pasteEdit = new vscode.DocumentPasteEdit(edit.snippet, edit.label);
		pasteEdit.additionalEdit = edit.additionalEdits;
		pasteEdit.yieldTo = this._yieldTo;
		return pasteEdit;
	}
}

export function registerPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteResourceEditProvider(), PasteResourceEditProvider);
}
