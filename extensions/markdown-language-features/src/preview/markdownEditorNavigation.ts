/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { MarkdownEditorHost, MarkdownEditorRenderer, MarkdownNavigationState } from './markdownEditorProtocol';

export class MarkdownEditorNavigation implements vscode.CustomTextEditorNavigation {
	readonly #onDidChangeSelection = new vscode.EventEmitter<vscode.Selection | undefined>();
	readonly #lifetime = new vscode.CancellationTokenSource();
	readonly onDidChangeSelection = this.#onDidChangeSelection.event;
	readonly #document: vscode.TextDocument;
	readonly #drain: () => Promise<void>;
	readonly #snapshot: () => { text: string; editEpoch: number };
	readonly #renderer: () => Pick<MarkdownEditorRenderer, 'captureNavigationState' | 'revealRange' | 'restoreNavigationState'>;
	readonly #waitUntilReady: (token: vscode.CancellationToken) => Promise<void>;
	#selection: vscode.Selection | undefined;
	#disposed = false;
	#generation = 0;
	#selectionRequest = 0;

	constructor(
		document: vscode.TextDocument,
		drain: () => Promise<void>,
		snapshot: () => { text: string; editEpoch: number },
		renderer: () => Pick<MarkdownEditorRenderer, 'captureNavigationState' | 'revealRange' | 'restoreNavigationState'>,
		waitUntilReady: (token: vscode.CancellationToken) => Promise<void>,
	) {
		this.#document = document;
		this.#drain = drain;
		this.#snapshot = snapshot;
		this.#renderer = renderer;
		this.#waitUntilReady = waitUntilReady;
	}

	get selection(): vscode.Selection | undefined { return this.#selection; }

	async acceptSelection(message: Parameters<MarkdownEditorHost['selectionChanged']>[0]): Promise<void> {
		const request = ++this.#selectionRequest;
		await this.#drain();
		if (this.#disposed || request !== this.#selectionRequest || message.editEpoch !== this.#snapshot().editEpoch) {
			return;
		}
		const mirror = this.#mirror();
		const { selection } = message;
		if (selection && Math.max(selection.anchor, selection.active) > mirror.getText().length) {
			throw new Error('Invalid Markdown editor navigation selection');
		}
		this.#selection = selection ? new vscode.Selection(
			this.#position(mirror.positionAt(selection.anchor)), this.#position(mirror.positionAt(selection.active)),
		) : undefined;
		this.#onDidChangeSelection.fire(this.#selection);
	}

	async revealRange(range: vscode.Range, options: vscode.CustomTextEditorRevealOptions, token: vscode.CancellationToken): Promise<void> {
		await this.#waitUntilReady(token);
		this.#checkCurrent(token);
		await this.#drain();
		this.#checkCurrent(token);
		const version = this.#document.version;
		const generation = this.#generation;
		const renderer = this.#renderer();
		const state = await renderer.captureNavigationState({});
		this.#checkCurrent(token);
		if (version !== this.#document.version || generation !== this.#generation || state.editEpoch !== this.#snapshot().editEpoch) {
			throw new vscode.CancellationError();
		}
		if (!this.#document.validateRange(range).isEqual(range)
			|| options.selection && !this.#document.validateRange(options.selection).isEqual(options.selection)) {
			throw new Error('Invalid Markdown editor navigation range');
		}
		const mirror = this.#mirror();
		await renderer.revealRange({
			start: mirror.offsetAt(range.start),
			endExclusive: mirror.offsetAt(range.end),
			editEpoch: state.editEpoch,
			revision: state.revision,
			selection: options.selection ? {
				anchor: mirror.offsetAt(options.selection.anchor),
				active: mirror.offsetAt(options.selection.active),
			} : undefined,
			preserveFocus: options.preserveFocus ?? false,
		});
	}

	async captureViewState(): Promise<unknown> {
		const generation = this.#generation;
		const version = this.#document.version;
		await this.#waitUntilReady(this.#lifetime.token);
		this.#checkCurrent(this.#lifetime.token);
		return new MarkdownEditorViewState(generation, version, await this.#renderer().captureNavigationState({}));
	}

	async restoreViewState(value: unknown, token: vscode.CancellationToken): Promise<void> {
		const saved = await value;
		this.#checkCurrent(token);
		if (!(saved instanceof MarkdownEditorViewState)) {
			throw new Error('Invalid Markdown editor view state');
		}
		if (saved.generation !== this.#generation || saved.version !== this.#document.version) {
			throw new vscode.CancellationError();
		}
		await this.#renderer().restoreNavigationState(saved.state);
	}

	reset(): void {
		this.#generation++;
		this.#selectionRequest++;
		this.#selection = undefined;
		this.#onDidChangeSelection.fire(undefined);
	}

	dispose(): void {
		if (this.#disposed) { return; }
		this.#disposed = true;
		this.#lifetime.cancel();
		this.#lifetime.dispose();
		this.reset();
		this.#onDidChangeSelection.dispose();
	}

	#mirror(): TextDocument {
		return TextDocument.create(this.#document.uri.toString(), 'markdown', 0, this.#snapshot().text);
	}

	#position(position: { line: number; character: number }): vscode.Position {
		return new vscode.Position(position.line, position.character);
	}

	#checkCurrent(token: vscode.CancellationToken): void {
		if (this.#disposed || token.isCancellationRequested || this.#document.isClosed) {
			throw new vscode.CancellationError();
		}
	}
}

class MarkdownEditorViewState {
	constructor(
		readonly generation: number,
		readonly version: number,
		readonly state: MarkdownNavigationState,
	) { }
}
