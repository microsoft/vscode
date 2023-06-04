/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { createEditForMediaFiles as createEditForMediaFiles, mediaMimes, tryGetUriListSnippet } from './shared';
import { Schemes } from '../../util/schemes';


class MarkdownImageDropProvider implements vscode.DocumentDropEditProvider {
	private readonly _id = 'insertLink';

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
		const snippet = await tryGetUriListSnippet(document, dataTransfer, token);
		if (!snippet) {
			return undefined;
		}

		const edit = new vscode.DocumentDropEdit(snippet.snippet);
		edit.id = this._id;
		edit.label = snippet.label;
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

		const filesEdit = await createEditForMediaFiles(document, dataTransfer, token);
		if (!filesEdit) {
			return;
		}

		const edit = new vscode.DocumentDropEdit(filesEdit.snippet);
		edit.id = this._id;
		edit.label = filesEdit.label;
		edit.additionalEdit = filesEdit.additionalEdits;
		return edit;
	}
}

export function registerDropIntoEditorSupport(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentDropEditProvider(selector, new MarkdownImageDropProvider(), {
		dropMimeTypes: [
			'text/uri-list',
			...mediaMimes,
		]
	});
}
