/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Mime, mediaMimes } from '../../util/mimes';
import { Schemes } from '../../util/schemes';
import { createEditForMediaFiles, tryGetUriListSnippet } from './shared';

class ResourceDropProvider implements vscode.DocumentDropEditProvider {

	public static readonly id = 'insertLink';

	public static readonly dropMimeTypes = [
		Mime.textUriList,
		...mediaMimes,
	];

	private readonly _yieldTo = [
		{ mimeType: 'text/plain' },
		{ extensionId: 'vscode.ipynb', providerId: 'insertAttachment' },
	];

	async provideDocumentDropEdits(document: vscode.TextDocument, _position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
		const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.drop.enabled', true);
		if (!enabled) {
			return;
		}

		const filesEdit = await this._getMediaFilesEdit(document, dataTransfer, token);
		if (filesEdit) {
			return filesEdit;
		}

		if (token.isCancellationRequested) {
			return;
		}

		return this._getUriListEdit(document, dataTransfer, token);
	}

	private async _getUriListEdit(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
		const urlList = await dataTransfer.get(Mime.textUriList)?.asString();
		if (!urlList || token.isCancellationRequested) {
			return undefined;
		}

		const snippet = await tryGetUriListSnippet(document, urlList, token);
		if (!snippet) {
			return undefined;
		}

		const edit = new vscode.DocumentDropEdit(snippet.snippet);
		edit.label = snippet.label;
		edit.yieldTo = this._yieldTo;
		return edit;
	}

	private async _getMediaFilesEdit(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
		if (document.uri.scheme === Schemes.untitled) {
			return;
		}

		const copyIntoWorkspace = vscode.workspace.getConfiguration('markdown', document).get<'mediaFiles' | 'never'>('editor.drop.copyIntoWorkspace', 'mediaFiles');
		if (copyIntoWorkspace !== 'mediaFiles') {
			return;
		}

		const edit = await createEditForMediaFiles(document, dataTransfer, token);
		if (!edit) {
			return;
		}

		const dropEdit = new vscode.DocumentDropEdit(edit.snippet);
		dropEdit.label = edit.label;
		dropEdit.additionalEdit = edit.additionalEdits;
		dropEdit.yieldTo = this._yieldTo;
		return dropEdit;
	}
}

export function registerDropIntoEditorSupport(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentDropEditProvider(selector, new ResourceDropProvider(), ResourceDropProvider);
}
