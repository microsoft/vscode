/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { coalesce } from '../../util/arrays';
import { getParentDocumentUri } from '../../util/document';
import { Mime, mediaMimes } from '../../util/mimes';
import { Schemes } from '../../util/schemes';
import { NewFilePathGenerator } from './newFilePathGenerator';
import { createInsertUriListEdit, createUriListSnippet, getSnippetLabel } from './shared';

/**
 * Provides support for pasting or dropping resources into markdown documents.
 *
 * This includes:
 *
 * - `text/uri-list` data in the data transfer.
 * - File object in the data transfer.
 * - Media data in the data transfer, such as `image/png`.
 */
class ResourcePasteOrDropProvider implements vscode.DocumentPasteEditProvider, vscode.DocumentDropEditProvider {

	public static readonly id = 'insertResource';

	public static readonly mimeTypes = [
		Mime.textUriList,
		'files',
		...mediaMimes,
	];

	private readonly _yieldTo = [
		{ mimeType: 'text/plain' },
		{ extensionId: 'vscode.ipynb', providerId: 'insertAttachment' },
	];

	public async provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentDropEdit | undefined> {
		const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.drop.enabled', true);
		if (!enabled) {
			return;
		}

		const filesEdit = await this._getMediaFilesDropEdit(document, dataTransfer, token);
		if (filesEdit) {
			return filesEdit;
		}

		if (token.isCancellationRequested) {
			return;
		}

		return this._createEditFromUriListData(document, [new vscode.Range(position, position)], dataTransfer, token);
	}

	public async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.filePaste.enabled', true);
		if (!enabled) {
			return;
		}

		const createEdit = await this._getMediaFilesPasteEdit(document, dataTransfer, token);
		if (createEdit) {
			return createEdit;
		}

		if (token.isCancellationRequested) {
			return;
		}

		return this._createEditFromUriListData(document, ranges, dataTransfer, token);
	}

	private async _createEditFromUriListData(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const uriList = await dataTransfer.get(Mime.textUriList)?.asString();
		if (!uriList || token.isCancellationRequested) {
			return;
		}

		const pasteEdit = createInsertUriListEdit(document, ranges, uriList);
		if (!pasteEdit) {
			return;
		}

		const uriEdit = new vscode.DocumentPasteEdit('', pasteEdit.label);
		const edit = new vscode.WorkspaceEdit();
		edit.set(document.uri, pasteEdit.edits);
		uriEdit.additionalEdit = edit;
		uriEdit.yieldTo = this._yieldTo;
		return uriEdit;
	}

	private async _getMediaFilesPasteEdit(
		document: vscode.TextDocument,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		if (getParentDocumentUri(document.uri).scheme === Schemes.untitled) {
			return;
		}

		const copyFilesIntoWorkspace = vscode.workspace.getConfiguration('markdown', document).get<'mediaFiles' | 'never'>('editor.filePaste.copyIntoWorkspace', 'mediaFiles');
		if (copyFilesIntoWorkspace !== 'mediaFiles') {
			return;
		}

		const edit = await this._createEditForMediaFiles(document, dataTransfer, token);
		if (!edit) {
			return;
		}

		const pasteEdit = new vscode.DocumentPasteEdit(edit.snippet, edit.label);
		pasteEdit.additionalEdit = edit.additionalEdits;
		pasteEdit.yieldTo = this._yieldTo;
		return pasteEdit;
	}

	private async _getMediaFilesDropEdit(
		document: vscode.TextDocument,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentDropEdit | undefined> {
		if (getParentDocumentUri(document.uri).scheme === Schemes.untitled) {
			return;
		}

		const copyIntoWorkspace = vscode.workspace.getConfiguration('markdown', document).get<'mediaFiles' | 'never'>('editor.drop.copyIntoWorkspace', 'mediaFiles');
		if (copyIntoWorkspace !== 'mediaFiles') {
			return;
		}

		const edit = await this._createEditForMediaFiles(document, dataTransfer, token);
		if (!edit) {
			return;
		}

		const dropEdit = new vscode.DocumentDropEdit(edit.snippet);
		dropEdit.label = edit.label;
		dropEdit.additionalEdit = edit.additionalEdits;
		dropEdit.yieldTo = this._yieldTo;
		return dropEdit;
	}

	/**
	 * Create a new edit for media files in a data transfer.
	 *
	 * This tries copying files outside of the workspace into the workspace.
	 */
	private async _createEditForMediaFiles(
		document: vscode.TextDocument,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<{ snippet: vscode.SnippetString; label: string; additionalEdits: vscode.WorkspaceEdit } | undefined> {
		interface FileEntry {
			readonly uri: vscode.Uri;
			readonly newFile?: { readonly contents: vscode.DataTransferFile; readonly overwrite: boolean };
		}

		const pathGenerator = new NewFilePathGenerator();
		const fileEntries = coalesce(await Promise.all(Array.from(dataTransfer, async ([mime, item]): Promise<FileEntry | undefined> => {
			if (!mediaMimes.has(mime)) {
				return;
			}

			const file = item?.asFile();
			if (!file) {
				return;
			}

			if (file.uri) {
				// If the file is already in a workspace, we don't want to create a copy of it
				const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
				if (workspaceFolder) {
					return { uri: file.uri };
				}
			}

			const newFile = await pathGenerator.getNewFilePath(document, file, token);
			if (!newFile) {
				return;
			}
			return { uri: newFile.uri, newFile: { contents: file, overwrite: newFile.overwrite } };
		})));
		if (!fileEntries.length) {
			return;
		}

		const workspaceEdit = new vscode.WorkspaceEdit();
		for (const entry of fileEntries) {
			if (entry.newFile) {
				workspaceEdit.createFile(entry.uri, {
					contents: entry.newFile.contents,
					overwrite: entry.newFile.overwrite,
				});
			}
		}

		const snippet = createUriListSnippet(document.uri, fileEntries);
		if (!snippet) {
			return;
		}

		return {
			snippet: snippet.snippet,
			label: getSnippetLabel(snippet),
			additionalEdits: workspaceEdit,
		};
	}
}

export function registerResourceDropOrPasteSupport(selector: vscode.DocumentSelector): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.languages.registerDocumentPasteEditProvider(selector, new ResourcePasteOrDropProvider(), {
			id: ResourcePasteOrDropProvider.id,
			pasteMimeTypes: ResourcePasteOrDropProvider.mimeTypes,
		}),
		vscode.languages.registerDocumentDropEditProvider(selector, new ResourcePasteOrDropProvider(), {
			id: ResourcePasteOrDropProvider.id,
			dropMimeTypes: ResourcePasteOrDropProvider.mimeTypes,
		}),
	);
}
