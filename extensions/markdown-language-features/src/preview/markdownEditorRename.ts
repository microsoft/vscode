/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { MarkdownEditorHost } from './markdownEditorProtocol';

export class MarkdownEditorRename {
	readonly #drain: () => Promise<void>;
	readonly #snapshot: () => RenameSnapshot;
	readonly #isActive: () => boolean;
	readonly #api: MarkdownRenameApi;
	#session: RenameSession | undefined;

	constructor(
		readonly document: vscode.TextDocument,
		drain: () => Promise<void>,
		snapshot: () => RenameSnapshot,
		isActive: () => boolean,
		api: MarkdownRenameApi = renameApi,
	) {
		this.#drain = drain;
		this.#snapshot = snapshot;
		this.#isActive = isActive;
		this.#api = api;
	}

	async prepare(request: Parameters<MarkdownEditorHost['prepareRename']>[0]): ReturnType<MarkdownEditorHost['prepareRename']> {
		const session: RenameSession = { requestId: request.requestId };
		this.#session = session;
		await this.#drain();
		this.#checkCurrent(session);
		const snapshot = this.#snapshot();
		if (request.editEpoch !== snapshot.editEpoch || request.offset > snapshot.text.length) {
			throw new Error(vscode.l10n.t('The document changed. Start rename again.'));
		}
		const mirror = TextDocument.create(this.document.uri.toString(), 'markdown', 0, snapshot.text);
		const position = mirror.positionAt(request.offset);
		const version = this.document.version;
		const prepared = await this.#api.prepare(this.document.uri, new vscode.Position(position.line, position.character));
		this.#checkCurrent(session);
		if (version !== this.document.version || snapshot.editEpoch !== this.#snapshot().editEpoch) {
			throw new Error(vscode.l10n.t('The document changed. Start rename again.'));
		}
		if (!prepared) {
			throw new Error(vscode.l10n.t('This symbol cannot be renamed.'));
		}
		session.prepared = { position: new vscode.Position(position.line, position.character), version, editEpoch: snapshot.editEpoch };
		return {
			start: mirror.offsetAt(prepared.range.start),
			endExclusive: mirror.offsetAt(prepared.range.end),
			placeholder: prepared.placeholder,
		};
	}

	async rename(request: Parameters<MarkdownEditorHost['rename']>[0]): Promise<void> {
		const session = this.#session;
		if (session?.requestId !== request.requestId || !session.prepared) {
			throw new Error(vscode.l10n.t('Start rename again before applying a new name.'));
		}
		if (!request.newName.trim() || /[\r\n]/.test(request.newName)) {
			throw new Error(vscode.l10n.t('Enter a non-empty, single-line name.'));
		}
		if (session.submitting) {
			throw new Error(vscode.l10n.t('A rename is already in progress.'));
		}
		session.submitting = true;
		try {
			await this.#apply(session, session.prepared, request.newName);
		} finally {
			session.submitting = false;
		}
	}

	async #apply(session: RenameSession, prepared: NonNullable<RenameSession['prepared']>, newName: string): Promise<void> {
		await this.#drain();
		this.#checkCurrent(session);
		const { version, editEpoch, position } = prepared;
		const checkVersion = (): void => {
			this.#checkCurrent(session);
			if (version !== this.document.version || editEpoch !== this.#snapshot().editEpoch) {
				throw new Error(vscode.l10n.t('The document changed. Start rename again.'));
			}
		};
		checkVersion();
		const versions = new Map(vscode.workspace.textDocuments.map(document => [document.uri.toString(), document.version]));
		const edit = await this.#api.rename(this.document.uri, position, newName);
		await this.#drain();
		checkVersion();
		if (!edit) {
			throw new Error(vscode.l10n.t('The rename provider returned no changes.'));
		}
		for (const [uri] of edit.entries()) {
			const key = uri.toString();
			const current = vscode.workspace.textDocuments.find(document => document.uri.toString() === key);
			if (current && versions.has(key) && current.version !== versions.get(key)) {
				throw new Error(vscode.l10n.t('A document changed while computing the rename. Start rename again.'));
			}
		}
		if (!await this.#api.apply(edit)) {
			throw new Error(vscode.l10n.t('The workspace rejected the rename.'));
		}
		if (this.#session === session) {
			this.#session = undefined;
		}
	}

	cancel(requestId?: number): void {
		if (requestId === undefined || this.#session?.requestId === requestId) {
			this.#session = undefined;
		}
	}

	#checkCurrent(session: RenameSession): void {
		if (this.#session !== session || !this.#isActive() || this.document.isClosed) {
			throw new vscode.CancellationError();
		}
	}
}

interface RenameSession {
	readonly requestId: number;
	prepared?: { readonly position: vscode.Position; readonly version: number; readonly editEpoch: number };
	submitting?: boolean;
}

interface RenameSnapshot {
	readonly text: string;
	readonly editEpoch: number;
}

export interface MarkdownRenameApi {
	prepare(uri: vscode.Uri, position: vscode.Position): Promise<{ range: vscode.Range; placeholder: string } | undefined>;
	rename(uri: vscode.Uri, position: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit | undefined>;
	apply(edit: vscode.WorkspaceEdit): Thenable<boolean>;
}

const renameApi: MarkdownRenameApi = {
	prepare: async (uri, position) => vscode.commands.executeCommand('vscode.prepareRename', uri, position),
	rename: async (uri, position, newName) => vscode.commands.executeCommand('vscode.executeDocumentRenameProvider', uri, position, newName),
	apply: edit => vscode.workspace.applyEdit(edit),
};
