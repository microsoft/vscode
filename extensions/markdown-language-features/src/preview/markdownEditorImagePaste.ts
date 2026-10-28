/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CopyFilesSettings, ResourcePasteOrDropProvider } from '../languageFeatures/copyFiles/dropOrPasteResource';
import type { MarkdownEditorHost, MarkdownEditorRenderer } from './markdownEditorProtocol';
import type { MarkdownEditorText } from './markdownEditorDocumentSync';
import { readClipboardMediaContents } from './markdownEditorMediaTransfer';

export class MarkdownEditorImagePaste implements vscode.Disposable {
	#pending: vscode.CancellationTokenSource | undefined;
	readonly #text: MarkdownEditorText;
	readonly #isEditable: () => boolean;
	readonly #readClipboardMedia: MarkdownEditorRenderer['readClipboardMedia'];
	readonly #apply: typeof vscode.workspace.applyEdit;

	constructor(
		readonly document: vscode.TextDocument,
		text: MarkdownEditorText,
		isEditable: () => boolean,
		readClipboardMedia: MarkdownEditorRenderer['readClipboardMedia'],
		apply: typeof vscode.workspace.applyEdit = edit => vscode.workspace.applyEdit(edit),
	) {
		this.#text = text;
		this.#isEditable = isEditable;
		this.#readClipboardMedia = readClipboardMedia;
		this.#apply = apply;
	}

	async paste(request: Parameters<MarkdownEditorHost['pasteImages']>[0]): ReturnType<MarkdownEditorHost['pasteImages']> {
		this.dispose();
		const pending = this.#pending = new vscode.CancellationTokenSource();
		const start = request.start <= request.endExclusive ? this.#text.trackFromEditor(request.version, request.start) : undefined;
		const end = start && this.#text.trackFromEditor(request.version, request.endExclusive);
		try {
			if (!start || !end || !request.images.length) {
				throw new Error(vscode.l10n.t('The editor changed. Paste the media again.'));
			}
			await this.#text.drain();
			const revision = this.#text.revision;
			const version = this.document.version;
			const checkCurrent = (): void => {
				if (pending.token.isCancellationRequested) { throw new vscode.CancellationError(); }
				if (!this.#isEditable() || this.document.isClosed || version !== this.document.version || revision !== this.#text.revision) {
					throw new Error(vscode.l10n.t('The editor changed. Paste the media again.'));
				}
			};
			checkCurrent();
			if (this.document.isUntitled) {
				throw new Error(vscode.l10n.t('Save the Markdown document before pasting media.'));
			}
			const config = vscode.workspace.getConfiguration('markdown', this.document);
			if (vscode.workspace.getConfiguration('editor', this.document).get<boolean>('pasteAs.enabled') === false) {
				throw new Error(vscode.l10n.t('Media paste is disabled by editor.pasteAs.enabled.'));
			}
			const enabled = config.get<boolean | string>('editor.paste.enabled', true);
			if (enabled === false || enabled === 'never') {
				throw new Error(vscode.l10n.t('Markdown media paste is disabled by markdown.editor.paste.enabled.'));
			}
			const transfer = new vscode.DataTransfer();
			const ids = new Set<string>();
			request.images.forEach((image, index) => {
				if (!/^(image|video|audio)\/[\w.+-]+$/.test(image.mime) || !image.name || /[\\/:]/.test(image.name) || image.name === '.' || image.name === '..'
					|| !image.id || ids.has(image.id) || !Number.isSafeInteger(image.size) || image.size <= 0) {
					throw new Error(vscode.l10n.t('Invalid clipboard media.'));
				}
				ids.add(image.id);
				const item = new vscode.DataTransferItem('');
				item.asFile = () => ({
					name: image.name, uri: undefined,
					data: () => readClipboardMediaContents(image, chunk => this.#readClipboardMedia(chunk), checkCurrent),
				});
				transfer.set(`${image.mime};index=${index}`, item);
			});
			const edit = await ResourcePasteOrDropProvider.createEditForMediaFiles(this.document, transfer,
				config.get<CopyFilesSettings>('editor.paste.copyIntoWorkspace', CopyFilesSettings.MediaFiles), pending.token, true);
			await this.#text.drain();
			checkCurrent();
			if (!edit?.additionalEdits) {
				throw new Error(vscode.l10n.t('Media paste requires markdown.editor.paste.copyIntoWorkspace to be mediaFiles.'));
			}
			const mirror = TextDocument.create(this.document.uri.toString(), 'markdown', 0, this.#text.text);
			const startPosition = mirror.positionAt(start.offset);
			const endPosition = mirror.positionAt(end.offset);
			const range = new vscode.Range(startPosition.line, startPosition.character, endPosition.line, endPosition.character);
			const oldLength = this.document.getText().length;
			const oldEnd = this.document.offsetAt(range.end);
			// Workspace edits resolve snippet defaults without starting a snippet session in a custom editor.
			edit.additionalEdits.set(this.document.uri, [vscode.SnippetTextEdit.replace(range, edit.snippet)]);
			if (!await this.#apply(edit.additionalEdits)) {
				throw new Error(vscode.l10n.t('The workspace rejected the media paste.'));
			}
			const newMirror = TextDocument.create(this.document.uri.toString(), 'markdown', 0, this.#text.text);
			const offset = this.document.version === version + 1 && this.#isEditable() && !pending.token.isCancellationRequested
				? newMirror.offsetAt(this.document.positionAt(oldEnd + this.document.getText().length - oldLength)) : undefined;
			return { offset, version: this.#text.version };
		} finally {
			start?.dispose();
			end?.dispose();
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
