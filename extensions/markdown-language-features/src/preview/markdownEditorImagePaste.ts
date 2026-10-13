/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CopyFilesSettings, ResourcePasteOrDropProvider } from '../languageFeatures/copyFiles/dropOrPasteResource';
import type { MarkdownEditorHost } from './markdownEditorProtocol';

export class MarkdownEditorImagePaste implements vscode.Disposable {
	#pending: vscode.CancellationTokenSource | undefined;
	readonly #drain: () => Promise<void>;
	readonly #snapshot: () => { readonly text: string; readonly editEpoch: number };
	readonly #isEditable: () => boolean;
	readonly #apply: typeof vscode.workspace.applyEdit;

	constructor(
		readonly document: vscode.TextDocument,
		drain: () => Promise<void>,
		snapshot: () => { readonly text: string; readonly editEpoch: number },
		isEditable: () => boolean,
		apply: typeof vscode.workspace.applyEdit = edit => vscode.workspace.applyEdit(edit),
	) {
		this.#drain = drain;
		this.#snapshot = snapshot;
		this.#isEditable = isEditable;
		this.#apply = apply;
	}

	async paste(request: Parameters<MarkdownEditorHost['pasteImages']>[0]): ReturnType<MarkdownEditorHost['pasteImages']> {
		this.dispose();
		const pending = this.#pending = new vscode.CancellationTokenSource();
		try {
			await this.#drain();
			const snapshot = this.#snapshot();
			const version = this.document.version;
			const checkCurrent = (): void => {
				if (pending.token.isCancellationRequested) { throw new vscode.CancellationError(); }
				if (!this.#isEditable() || this.document.isClosed || version !== this.document.version || request.editEpoch !== this.#snapshot().editEpoch) {
					throw new Error(vscode.l10n.t('The editor changed. Paste the image again.'));
				}
			};
			checkCurrent();
			if (!Number.isSafeInteger(request.start) || !Number.isSafeInteger(request.endExclusive) || request.start < 0
				|| request.start > request.endExclusive || request.endExclusive > snapshot.text.length || !request.images.length) {
				throw new Error(vscode.l10n.t('Invalid image paste range or empty clipboard image list.'));
			}
			if (this.document.isUntitled) {
				throw new Error(vscode.l10n.t('Save the Markdown document before pasting an image.'));
			}
			const config = vscode.workspace.getConfiguration('markdown', this.document);
			if (vscode.workspace.getConfiguration('editor', this.document).get<boolean>('pasteAs.enabled') === false) {
				throw new Error(vscode.l10n.t('Image paste is disabled by editor.pasteAs.enabled.'));
			}
			const enabled = config.get<boolean | string>('editor.paste.enabled', true);
			if (enabled === false || enabled === 'never') {
				throw new Error(vscode.l10n.t('Markdown image paste is disabled by markdown.editor.paste.enabled.'));
			}
			const transfer = new vscode.DataTransfer();
			request.images.forEach((image, index) => {
				if (!/^image\/[\w.+-]+$/.test(image.mime) || !image.name || /[\\/:]/.test(image.name) || image.name === '.' || image.name === '..'
					|| !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.base64) || !image.base64) {
					throw new Error(vscode.l10n.t('Invalid clipboard image.'));
				}
				const contents = Uint8Array.from(atob(image.base64), char => char.charCodeAt(0));
				const item = new vscode.DataTransferItem('');
				item.asFile = () => ({ name: image.name, uri: undefined, data: async () => contents });
				transfer.set(`${image.mime};index=${index}`, item);
			});
			const edit = await ResourcePasteOrDropProvider.createEditForMediaFiles(this.document, transfer,
				config.get<CopyFilesSettings>('editor.paste.copyIntoWorkspace', CopyFilesSettings.MediaFiles), pending.token, true);
			await this.#drain();
			checkCurrent();
			if (!edit?.additionalEdits) {
				throw new Error(vscode.l10n.t('Image paste requires markdown.editor.paste.copyIntoWorkspace to be mediaFiles.'));
			}
			const mirror = TextDocument.create(this.document.uri.toString(), 'markdown', 0, snapshot.text);
			const start = mirror.positionAt(request.start);
			const end = mirror.positionAt(request.endExclusive);
			const range = new vscode.Range(start.line, start.character, end.line, end.character);
			const oldLength = this.document.getText().length;
			const oldEnd = this.document.offsetAt(range.end);
			// Workspace edits resolve snippet defaults without starting a snippet session in a custom editor.
			edit.additionalEdits.set(this.document.uri, [vscode.SnippetTextEdit.replace(range, edit.snippet)]);
			if (!await this.#apply(edit.additionalEdits)) {
				throw new Error(vscode.l10n.t('The workspace rejected the image paste.'));
			}
			const current = this.#snapshot();
			const newMirror = TextDocument.create(this.document.uri.toString(), 'markdown', 0, current.text);
			const offset = this.document.version === version + 1 && this.#isEditable() && !pending.token.isCancellationRequested
				? newMirror.offsetAt(this.document.positionAt(oldEnd + this.document.getText().length - oldLength)) : undefined;
			return { offset, editEpoch: current.editEpoch };
		} finally {
			if (this.#pending === pending) { this.#pending = undefined; }
			pending.dispose();
		}
	}

	dispose(): void {
		this.#pending?.cancel();
		this.#pending?.dispose();
		this.#pending = undefined;
	}
}
