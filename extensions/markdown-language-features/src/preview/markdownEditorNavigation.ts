/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { MarkdownEditorHost, MarkdownEditorRenderer, MarkdownEditorVersion, MarkdownNavigationState } from './markdownEditorProtocol';
import type { MarkdownEditorText } from './markdownEditorText';

export class MarkdownEditorNavigation implements vscode.CustomTextEditorNavigation {
	readonly #onDidChangeSelection = new vscode.EventEmitter<vscode.Selection | undefined>();
	readonly #lifetime = new vscode.CancellationTokenSource();
	readonly onDidChangeSelection = this.#onDidChangeSelection.event;
	readonly #document: vscode.TextDocument;
	readonly #text: MarkdownEditorText;
	readonly #renderer: () => Pick<MarkdownEditorRenderer, 'captureNavigationState' | 'revealRange' | 'restoreNavigationState'>;
	readonly #waitUntilReady: (token: vscode.CancellationToken) => Promise<void>;
	#selection: vscode.Selection | undefined;
	#disposed = false;
	#generation = 0;
	#selectionRequest = 0;

	constructor(
		document: vscode.TextDocument,
		text: MarkdownEditorText,
		renderer: () => Pick<MarkdownEditorRenderer, 'captureNavigationState' | 'revealRange' | 'restoreNavigationState'>,
		waitUntilReady: (token: vscode.CancellationToken) => Promise<void>,
	) {
		this.#document = document;
		this.#text = text;
		this.#renderer = renderer;
		this.#waitUntilReady = waitUntilReady;
	}

	get selection(): vscode.Selection | undefined { return this.#selection; }

	async acceptSelection(message: Parameters<MarkdownEditorHost['selectionChanged']>[0]): Promise<void> {
		const request = ++this.#selectionRequest;
		const { selection } = message;
		const anchor = selection && this.#text.trackFromEditor(message.version, selection.anchor);
		const active = selection && this.#text.trackFromEditor(message.version, selection.active);
		try {
			if (selection && (!anchor || !active)) {
				// The editor reports the selection again after the change that made this one stale.
				return;
			}
			await this.#text.drain();
			if (this.#disposed || request !== this.#selectionRequest) {
				return;
			}
			this.#selection = anchor && active ? new vscode.Selection(
				this.#document.positionAt(anchor.offset), this.#document.positionAt(active.offset),
			) : undefined;
			this.#onDidChangeSelection.fire(this.#selection);
		} finally {
			anchor?.dispose();
			active?.dispose();
		}
	}

	async revealRange(range: vscode.Range, options: vscode.CustomTextEditorRevealOptions, token: vscode.CancellationToken): Promise<void> {
		await this.#waitUntilReady(token);
		this.#checkCurrent(token);
		await this.#text.drain();
		this.#checkCurrent(token);
		const version = this.#document.version;
		const generation = this.#generation;
		const renderer = this.#renderer();
		const state = await renderer.captureNavigationState({});
		this.#checkCurrent(token);
		if (version !== this.#document.version || generation !== this.#generation || !sameVersion(state.version, this.#text.version)) {
			throw new vscode.CancellationError();
		}
		if (!this.#document.validateRange(range).isEqual(range)
			|| options.selection && !this.#document.validateRange(options.selection).isEqual(options.selection)) {
			throw new Error('Invalid Markdown editor navigation range');
		}
		await renderer.revealRange({
			start: this.#document.offsetAt(range.start),
			endExclusive: this.#document.offsetAt(range.end),
			version: state.version,
			revision: state.revision,
			selection: options.selection ? {
				anchor: this.#document.offsetAt(options.selection.anchor),
				active: this.#document.offsetAt(options.selection.active),
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

function sameVersion(a: MarkdownEditorVersion, b: MarkdownEditorVersion | undefined): boolean {
	return a.serverRevision === b?.serverRevision && a.clientRevision === b.clientRevision;
}
