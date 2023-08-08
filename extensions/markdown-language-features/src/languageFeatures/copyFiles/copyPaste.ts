/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Schemes } from '../../util/schemes';
import { createEditForMediaFiles, createEditAddingLinksForUriList, mediaMimes, getPasteUrlAsFormattedLinkSetting, PasteUrlAsFormattedLink } from './shared';

class PasteEditProvider implements vscode.DocumentPasteEditProvider {

	private readonly _id = 'insertLink';

	private readonly _yieldTo = [
		{ mimeType: 'text/plain' },
		{ extensionId: 'vscode.ipynb', editId: 'insertAttachment' },
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

		const uriEdit = new vscode.DocumentPasteEdit('', this._id, '');
		const urlList = await dataTransfer.get('text/uri-list')?.asString();
		if (!urlList) {
			return;
		}

		const pasteUrlSetting = getPasteUrlAsFormattedLinkSetting(document);
		const pasteEdit = await createEditAddingLinksForUriList(document, ranges, urlList, false, pasteUrlSetting === PasteUrlAsFormattedLink.Smart, token);
		if (!pasteEdit) {
			return;
		}

		uriEdit.label = pasteEdit.label;
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

		const pasteEdit = new vscode.DocumentPasteEdit(edit.snippet, this._id, edit.label);
		pasteEdit.additionalEdit = edit.additionalEdits;
		pasteEdit.yieldTo = this._yieldTo;
		return pasteEdit;
	}
}

export function registerPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteEditProvider(), {
		pasteMimeTypes: [
			'text/uri-list',
			...mediaMimes,
		]
	});
}
