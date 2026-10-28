/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { HubRpcConnection } from '@vscode/hubrpc';
import { TextOperation, WebEditorHost, diffText, type ContentEdit, type ContentVersion } from '@vscode/web-editors';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * What the Markdown editor's features need of {@link MarkdownEditorDocumentSync}:
 * the editor text, and offsets the editor sends mapped into it.
 */
export interface MarkdownEditorText {
	/** The editor text, with `\n` line breaks. */
	readonly text: string;
	/** Changes with every change to {@link text}. */
	readonly revision: number;
	/** The version to send with offsets into {@link text}, while an editor is connected. */
	readonly version: ContentVersion | undefined;
	/** Resolves once every editor change is in the document, so that {@link text} and the document match. */
	drain(): Promise<void>;
	/**
	 * Tracks an offset the editor sent along with `version` through later
	 * changes of {@link text}; `undefined` if it cannot be mapped. Call it when
	 * the editor's message arrives.
	 */
	trackFromEditor(version: ContentVersion, offset: number): TrackedOffset | undefined;
}

/**
 * Keeps the Markdown editor's text and a {@link vscode.TextDocument} in sync
 * while both change.
 *
 * The editor text is the document text with every line break as `\n`, plus
 * the editor's changes that are not in the document yet. Editor changes are
 * written to the document one batch at a time. A document change that is not
 * such a write, for example an undo, a format on save or another extension's
 * edit, is transformed against the unwritten editor changes and sent to the
 * editor as an edit, so neither side's changes are lost. A write the document
 * rejects because it changed in the meantime is transformed the same way and
 * written again.
 *
 * The editor connects through a {@link WebEditorHost}, which merges the
 * editor's unsent edits with the changes sent to it (operational
 * transformation). Each webview reload connects a new host.
 */
export class MarkdownEditorDocumentSync implements MarkdownEditorText, vscode.Disposable {
	readonly #document: SyncedDocument;
	readonly #log: (message: string, error?: unknown) => void;
	/** The document text as last seen, with `\n` line breaks. */
	#documentText: string;
	/** The editor text: {@link #documentText} with {@link #writing} and {@link #unwritten} applied. */
	#text: string;
	/** Increments with every change to {@link #text}. */
	#revision = 0;
	/** Editor changes being written to the document. */
	#writing: { readonly operation: TextOperation; readonly expected: string } | undefined;
	/** Editor changes after {@link #writing} that are not written yet. */
	#unwritten = TextOperation.identity;
	#host: WebEditorHost | undefined;
	readonly #tracked = new Set<TrackedOffsetImpl>();
	readonly #onDidDrain = new vscode.EventEmitter<void>();
	readonly #onDidChangeText = new vscode.EventEmitter<void>();
	/** Fires after every change to the editor text. */
	readonly onDidChangeText = this.#onDidChangeText.event;
	readonly #subscription: vscode.Disposable;
	#disposed = false;

	constructor(document: SyncedDocument, log: (message: string, error?: unknown) => void) {
		this.#document = document;
		this.#log = log;
		this.#documentText = normalizeLineBreaks(document.getText());
		this.#text = this.#documentText;
		this.#subscription = document.onDidChangeContent(() => this.#acceptDocumentChange());
	}

	/** The editor text, with `\n` line breaks. */
	get text(): string {
		return this.#text;
	}

	/** Changes with every change to {@link text}. */
	get revision(): number {
		return this.#revision;
	}

	/** The version to send with offsets into {@link text}, while an editor is connected. */
	get version(): ContentVersion | undefined {
		return this.#host?.version;
	}

	/**
	 * Connects a (re)loaded editor. It receives the current text; the previous
	 * editor's host is disposed along with its connection.
	 */
	connect(connection: HubRpcConnection): void {
		this.#host?.dispose();
		const host = this.#host = new WebEditorHost({
			connection,
			initialText: this.#text,
			onError: (message, detail) => this.#log(message, detail),
		});
		host.onDidChangeText(({ text, edits }) => {
			if (this.#host === host) {
				this.#acceptEditorChange(text, edits);
			}
		});
	}

	/**
	 * Maps an offset the editor sent along with `version` into {@link text}.
	 * Call it when the editor's message arrives.
	 */
	fromEditor(version: ContentVersion, offset: number): number | undefined {
		return this.#host?.mapOffset(version, [], offset);
	}

	trackFromEditor(version: ContentVersion, offset: number): TrackedOffset | undefined {
		const mapped = offset < 0 ? undefined : this.fromEditor(version, offset);
		return mapped === undefined || mapped > this.#text.length ? undefined : this.track(mapped);
	}

	/**
	 * Follows `offset` in {@link text} through later changes, until disposed.
	 * Text inserted exactly at the offset ends up before it.
	 */
	track(offset: number): TrackedOffset {
		const tracked = new TrackedOffsetImpl(offset, this.#tracked);
		this.#tracked.add(tracked);
		return tracked;
	}

	/** Resolves once every editor change is in the document, so that {@link text} and the document match. */
	async drain(): Promise<void> {
		while (!this.#disposed && (this.#writing || !this.#unwritten.isIdentity)) {
			await new Promise<void>(resolve => {
				const listener = this.#onDidDrain.event(() => {
					listener.dispose();
					resolve();
				});
			});
		}
		if (this.#disposed) {
			throw new vscode.CancellationError();
		}
	}

	dispose(): void {
		this.#disposed = true;
		this.#subscription.dispose();
		this.#host?.dispose();
		this.#host = undefined;
		this.#tracked.clear();
		this.#onDidDrain.fire();
		this.#onDidDrain.dispose();
		this.#onDidChangeText.dispose();
	}

	#acceptEditorChange(text: string, edits: readonly ContentEdit[]): void {
		let operation = edits.length === 1 && edits[0].kind === 'stringEdits' && edits[0].path.length === 0
			? TextOperation.fromTextEdits(edits[0].stringEdits)
			: diffText(this.#text, text);
		if (text.includes('\r')) {
			// Keep `\n` line breaks, also for pasted text; the editor receives the normalized text back.
			const normalized = normalizeLineBreaks(text);
			operation = diffText(this.#text, normalized);
			this.#host?.setText(normalized);
		}
		this.#applyToText(operation);
		this.#unwritten = this.#unwritten.compose(operation);
		void this.#write();
	}

	#acceptDocumentChange(): void {
		const documentText = normalizeLineBreaks(this.#document.getText());
		if (documentText === this.#documentText) {
			return;
		}
		if (documentText === this.#writing?.expected) {
			this.#documentText = documentText;
			this.#writing = undefined;
			void this.#write();
			return;
		}
		// Someone else changed the document. Merge it with the editor changes that are not in the document.
		const external = diffText(this.#documentText, documentText);
		const unwritten = this.#writing ? this.#writing.operation.compose(this.#unwritten) : this.#unwritten;
		const [externalPrime, unwrittenPrime] = TextOperation.transform(external, unwritten);
		this.#documentText = documentText;
		this.#writing = undefined;
		this.#unwritten = unwrittenPrime;
		this.#applyToText(externalPrime);
		if (!externalPrime.isIdentity) {
			this.#host?.applyEdits([{ kind: 'stringEdits', path: [], stringEdits: externalPrime.toTextEdits() }]);
		}
		void this.#write();
	}

	#applyToText(operation: TextOperation): void {
		if (operation.isIdentity) {
			return;
		}
		this.#text = operation.apply(this.#text);
		this.#revision++;
		for (const tracked of this.#tracked) {
			tracked.offset = operation.mapOffset(tracked.offset, 'after');
		}
		this.#onDidChangeText.fire();
	}

	async #write(): Promise<void> {
		if (this.#disposed || this.#writing) {
			return;
		}
		if (this.#unwritten.isIdentity) {
			this.#onDidDrain.fire();
			return;
		}
		if (normalizeLineBreaks(this.#document.getText()) !== this.#documentText) {
			// A document change is on its way; it writes again.
			return;
		}
		const operation = this.#unwritten;
		const writing = this.#writing = { operation, expected: operation.apply(this.#documentText) };
		this.#unwritten = TextOperation.identity;
		let applied = false;
		try {
			applied = await this.#document.applyEdits(this.#document.version, toDocumentEdits(this.#documentText, operation, this.#document.eol));
		} catch (error) {
			this.#log('Failed to write Markdown editor changes', error);
		}
		if (this.#writing !== writing) {
			// The document change event already settled this write.
			return;
		}
		this.#writing = undefined;
		const documentText = normalizeLineBreaks(this.#document.getText());
		if (applied && documentText === writing.expected) {
			this.#documentText = writing.expected;
		} else if (documentText === this.#documentText) {
			// Rejected although the document did not change, e.g. because it is read-only: the editor changes cannot be kept.
			this.#log('The document rejected the Markdown editor changes');
			this.#unwritten = TextOperation.identity;
			this.#applyToText(diffText(this.#text, this.#documentText));
			this.#host?.setText(this.#documentText);
		} else {
			this.#unwritten = operation.compose(this.#unwritten);
		}
		void this.#write();
	}
}

/** The document operations {@link MarkdownEditorDocumentSync} needs; see {@link syncedTextDocument}. */
export interface SyncedDocument {
	readonly version: number;
	readonly eol: '\n' | '\r\n';
	getText(): string;
	/** Applies non-overlapping edits unless the document changed since `version`; resolves whether it did. */
	applyEdits(version: number, edits: readonly DocumentEdit[]): Promise<boolean>;
	/** Fires when the text changed (not for dirty state changes). */
	onDidChangeContent(listener: () => void): vscode.Disposable;
}

export interface DocumentEdit {
	readonly start: Position;
	readonly end: Position;
	readonly text: string;
}

interface Position {
	readonly line: number;
	readonly character: number;
}

export interface TrackedOffset extends vscode.Disposable {
	readonly offset: number;
}

class TrackedOffsetImpl implements TrackedOffset {
	constructor(public offset: number, private readonly _owner: Set<TrackedOffsetImpl>) { }

	dispose(): void {
		this._owner.delete(this);
	}
}

export function syncedTextDocument(document: vscode.TextDocument): SyncedDocument {
	return {
		get version() { return document.version; },
		get eol() { return document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'; },
		getText: () => document.getText(),
		applyEdits: async (version, edits) => {
			if (document.version !== version) {
				return false;
			}
			const edit = new vscode.WorkspaceEdit();
			for (const { start, end, text } of edits) {
				edit.replace(document.uri, new vscode.Range(start.line, start.character, end.line, end.character), text);
			}
			// The edit carries the current document version and is rejected if the document changes before it applies.
			return vscode.workspace.applyEdit(edit);
		},
		onDidChangeContent: listener => vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document === document && event.contentChanges.length > 0) {
				listener();
			}
		}),
	};
}

export function normalizeLineBreaks(text: string): string {
	return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}

function toDocumentEdits(text: string, operation: TextOperation, eol: string): DocumentEdit[] {
	const lines = TextDocument.create('', 'markdown', 0, text);
	const edits: DocumentEdit[] = [];
	let offset = 0;
	let pending: { start: number; length: number; text: string } | undefined;
	const flush = () => {
		if (pending) {
			edits.push({
				start: lines.positionAt(pending.start),
				end: lines.positionAt(pending.start + pending.length),
				text: eol === '\n' ? pending.text : pending.text.replace(/\n/g, eol),
			});
			pending = undefined;
		}
	};
	for (const component of operation.components) {
		if (component.kind === 'retain') {
			flush();
			offset += component.length;
		} else {
			pending ??= { start: offset, length: 0, text: '' };
			if (component.kind === 'insert') {
				pending.text += component.text;
			} else {
				pending.length += component.length;
				offset += component.length;
			}
		}
	}
	flush();
	return edits;
}
