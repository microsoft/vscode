/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IMdParser } from '../../markdownEngine';
import { coalesce } from '../../util/arrays';
import { getParentDocumentUri } from '../../util/document';
import { Mime, mediaMimes } from '../../util/mimes';
import { Schemes } from '../../util/schemes';
import { NewFilePathGenerator } from './newFilePathGenerator';
import { DropOrPasteEdit, createInsertUriListEdit, createUriListSnippet, getSnippetLabel } from './shared';
import { InsertMarkdownLink, shouldInsertMarkdownLinkByDefault } from './smartDropOrPaste';
import { UriList } from '../../util/uriList';

enum CopyFilesSettings {
	Never = 'never',
	MediaFiles = 'mediaFiles',
}

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

	public static readonly kind = vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'link');

	public static readonly mimeTypes = [
		Mime.textUriList,
		'files',
		...mediaMimes,
	];

	private readonly _yieldTo = [
		vscode.DocumentDropOrPasteEditKind.Empty.append('text'),
		vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'image', 'attachment'),
	];

	constructor(
		private readonly _parser: IMdParser,
	) { }

	public async provideDocumentDropEdits(
		document: vscode.TextDocument,
		position: vscode.Position,
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentDropEdit | undefined> {
		const edit = await this._createEdit(document, [new vscode.Range(position, position)], dataTransfer, {
			insert: this._getEnabled(document, 'editor.drop.enabled'),
			copyIntoWorkspace: vscode.workspace.getConfiguration('markdown', document).get<CopyFilesSettings>('editor.drop.copyIntoWorkspace', CopyFilesSettings.MediaFiles)
		}, undefined, token);

		if (!edit || token.isCancellationRequested) {
			return;
		}

		const dropEdit = new vscode.DocumentDropEdit(edit.snippet);
		dropEdit.title = edit.label;
		dropEdit.kind = ResourcePasteOrDropProvider.kind;
		dropEdit.additionalEdit = edit.additionalEdits;
		dropEdit.yieldTo = [...this._yieldTo, ...edit.yieldTo];
		return dropEdit;
	}

	public async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		context: vscode.DocumentPasteEditContext,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit[] | undefined> {
		const edit = await this._createEdit(document, ranges, dataTransfer, {
			insert: this._getEnabled(document, 'editor.paste.enabled'),
			copyIntoWorkspace: vscode.workspace.getConfiguration('markdown', document).get<CopyFilesSettings>('editor.paste.copyIntoWorkspace', CopyFilesSettings.MediaFiles)
		}, context, token);

		if (!edit || token.isCancellationRequested) {
			return;
		}

		const pasteEdit = new vscode.DocumentPasteEdit(edit.snippet, edit.label, ResourcePasteOrDropProvider.kind);
		pasteEdit.additionalEdit = edit.additionalEdits;
		pasteEdit.yieldTo = [...this._yieldTo, ...edit.yieldTo];
		return [pasteEdit];
	}

	private _getEnabled(document: vscode.TextDocument, settingName: string): InsertMarkdownLink {
		const setting = vscode.workspace.getConfiguration('markdown', document).get<boolean | InsertMarkdownLink>(settingName, true);
		// Convert old boolean values to new enum setting
		if (setting === false) {
			return InsertMarkdownLink.Never;
		} else if (setting === true) {
			return InsertMarkdownLink.Smart;
		} else {
			return setting;
		}
	}

	private async _createEdit(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		settings: {
			insert: InsertMarkdownLink;
			copyIntoWorkspace: CopyFilesSettings;
		},
		context: vscode.DocumentPasteEditContext | undefined,
		token: vscode.CancellationToken,
	): Promise<DropOrPasteEdit | undefined> {
		if (settings.insert === InsertMarkdownLink.Never) {
			return;
		}

		let edit = await this._createEditForMediaFiles(document, dataTransfer, settings.copyIntoWorkspace, token);
		if (token.isCancellationRequested) {
			return;
		}

		if (!edit) {
			edit = await this._createEditFromUriListData(document, ranges, dataTransfer, context, token);
		}

		if (!edit || token.isCancellationRequested) {
			return;
		}

		if (!(await shouldInsertMarkdownLinkByDefault(this._parser, document, settings.insert, ranges, token))) {
			edit.yieldTo.push(vscode.DocumentDropOrPasteEditKind.Empty.append('uri'));
		}

		return edit;
	}

	private async _createEditFromUriListData(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		context: vscode.DocumentPasteEditContext | undefined,
		token: vscode.CancellationToken,
	): Promise<DropOrPasteEdit | undefined> {
		const uriListData = await dataTransfer.get(Mime.textUriList)?.asString();
		if (!uriListData || token.isCancellationRequested) {
			return;
		}

		const uriList = UriList.from(uriListData);
		if (!uriList.entries.length) {
			return;
		}

		// In some browsers, copying from the address bar sets both text/uri-list and text/plain.
		// Disable ourselves if there's also a text entry with the same http(s) uri as our list,
		// unless we are explicitly requested.
		if (
			uriList.entries.length === 1
			&& (uriList.entries[0].uri.scheme === Schemes.http || uriList.entries[0].uri.scheme === Schemes.https)
			&& !context?.only?.contains(ResourcePasteOrDropProvider.kind)
		) {
			const text = await dataTransfer.get(Mime.textPlain)?.asString();
			if (token.isCancellationRequested) {
				return;
			}

			if (text && textMatchesUriList(text, uriList)) {
				return;
			}
		}

		const edit = createInsertUriListEdit(document, ranges, uriList);
		if (!edit) {
			return;
		}

		const additionalEdits = new vscode.WorkspaceEdit();
		additionalEdits.set(document.uri, edit.edits);

		return {
			label: edit.label,
			snippet: new vscode.SnippetString(''),
			additionalEdits,
			yieldTo: []
		};
	}

	/**
	 * Create a new edit for media files in a data transfer.
	 *
	 * This tries copying files outside of the workspace into the workspace.
	 */
	private async _createEditForMediaFiles(
		document: vscode.TextDocument,
		dataTransfer: vscode.DataTransfer,
		copyIntoWorkspace: CopyFilesSettings,
		token: vscode.CancellationToken,
	): Promise<DropOrPasteEdit | undefined> {
		if (copyIntoWorkspace !== CopyFilesSettings.MediaFiles || getParentDocumentUri(document.uri).scheme === Schemes.untitled) {
			return;
		}

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

		const snippet = createUriListSnippet(document.uri, fileEntries);
		if (!snippet) {
			return;
		}

		const additionalEdits = new vscode.WorkspaceEdit();
		for (const entry of fileEntries) {
			if (entry.newFile) {
				additionalEdits.createFile(entry.uri, {
					contents: entry.newFile.contents,
					overwrite: entry.newFile.overwrite,
				});
			}
		}

		return {
			snippet: snippet.snippet,
			label: getSnippetLabel(snippet),
			additionalEdits,
			yieldTo: [],
		};
	}
}

function textMatchesUriList(text: string, uriList: UriList): boolean {
	if (text === uriList.entries[0].str) {
		return true;
	}

	try {
		const uri = vscode.Uri.parse(text);
		return uriList.entries.some(entry => entry.uri.toString() === uri.toString());
	} catch {
		return false;
	}
}

export function registerResourceDropOrPasteSupport(selector: vscode.DocumentSelector, parser: IMdParser): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.languages.registerDocumentPasteEditProvider(selector, new ResourcePasteOrDropProvider(parser), {
			providedPasteEditKinds: [ResourcePasteOrDropProvider.kind],
			pasteMimeTypes: ResourcePasteOrDropProvider.mimeTypes,
		}),
		vscode.languages.registerDocumentDropEditProvider(selector, new ResourcePasteOrDropProvider(parser), {
			providedDropEditKinds: [ResourcePasteOrDropProvider.kind],
			dropMimeTypes: ResourcePasteOrDropProvider.mimeTypes,
		}),
	);
}
