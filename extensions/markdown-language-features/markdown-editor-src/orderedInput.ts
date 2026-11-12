/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue } from '@vscode/observables';
import type { EditorViewOptions } from '@vscode/markdown-editor';

declare const EditContext: new (options: EditContextInit) => EditContext;

export interface KeybindingDispatchResult {
	readonly handled: boolean;
	readonly cancelled?: boolean;
	readonly command?: { readonly id: string; readonly args: unknown };
}

/**
 * Keeps the browser's speculative input buffer separate from the model while a
 * keybinding is being resolved. Text replacements follow the logical selection.
 */
export class OrderedInput extends EventTarget implements NonNullable<EditorViewOptions['textInput']> {
	readonly context = this;
	readonly nativeContext;
	readonly #native: EditContext;
	readonly #reportError: (error: unknown) => void;
	#text: string;
	#selectionStart = 0;
	#selectionEnd = 0;
	#nativeSelectionStart = 0;
	#nativeSelectionEnd = 0;
	#pending = 0;
	#tail: Promise<void> = Promise.resolve();
	#lastKey: Promise<KeybindingDispatchResult> | undefined;
	#composing = false;
	#compositionSelection: { start: number; end: number } | undefined;
	#disposed = false;
	#failed = false;

	constructor(text: string, reportError: (error: unknown) => void) {
		super();
		this.#reportError = reportError;
		this.#text = text;
		this.#native = new EditContext({ text, selectionStart: 0, selectionEnd: 0 });
		this.nativeContext = observableValue<EditContext | null>(this, this.#native);
		this.#native.addEventListener('textupdate', this.#onTextUpdate);
		this.#native.addEventListener('compositionstart', this.#onCompositionStart);
		this.#native.addEventListener('compositionend', this.#onCompositionEnd);
	}

	get text(): string { return this.#text; }
	get isFailed(): boolean { return this.#failed; }

	updateText(start: number, end: number, text: string): void {
		this.#text = this.#text.slice(0, start) + text + this.#text.slice(end);
		this.#syncNative();
	}

	updateSelection(start: number, end: number): void {
		this.#selectionStart = start;
		this.#selectionEnd = end;
		this.#syncNative();
	}

	dispatchKey(
		dispatch: () => Promise<KeybindingDispatchResult>,
		execute: (command: NonNullable<KeybindingDispatchResult['command']>) => void | Promise<void>,
	): void {
		if (this.#disposed || this.#failed) {
			return;
		}
		this.#nativeSelectionStart = this.#native.selectionStart;
		this.#nativeSelectionEnd = this.#native.selectionEnd;
		const result = dispatch();
		// Observe failures immediately even when earlier input is still awaiting execution.
		const settled = result.then(value => ({ kind: 'result' as const, value }), error => ({ kind: 'error' as const, error }));
		this.#lastKey = result;
		this.enqueue(async () => {
			const outcome = await settled;
			if (outcome.kind === 'error') {
				throw outcome.error;
			}
			const resolved = outcome.value;
			if (!this.#disposed && !this.#failed && resolved.command) {
				await execute(resolved.command);
			}
		});
	}

	enqueue(input: () => void | Promise<void>): void {
		this.#pending++;
		this.#tail = this.#tail.then(async () => {
			if (!this.#disposed && !this.#failed) {
				await input();
			}
		}).catch(error => {
			this.#failed = true;
			this.#reportError(error);
		}).finally(() => {
			this.#pending--;
			this.#syncNative();
		});
	}

	drain(): Promise<void> { return this.#tail; }

	endKey(): void {
		this.#lastKey = undefined;
	}

	readonly #onTextUpdate = (event: TextUpdateEvent): void => {
		const startDelta = event.updateRangeStart - this.#nativeSelectionStart;
		const endDelta = event.updateRangeEnd - this.#nativeSelectionEnd;
		this.#nativeSelectionStart = event.selectionStart;
		this.#nativeSelectionEnd = event.selectionEnd;
		const key = this.#lastKey;
		this.#lastKey = undefined;
		const text = event.text;
		const selectionStartDelta = event.selectionStart - event.updateRangeStart;
		const selectionEndDelta = event.selectionEnd - event.updateRangeStart;
		const composing = this.#composing;
		this.enqueue(async () => {
			if (key && (await key)?.handled) {
				return;
			}
			const start = (this.#compositionSelection?.start ?? this.#selectionStart) + startDelta;
			const end = (this.#compositionSelection?.end ?? this.#selectionEnd) + endDelta;
			if (start < 0 || end < start || end > this.#text.length) {
				throw new Error('Markdown input no longer matches the document selection');
			}
			this.dispatchEvent(new TextUpdateEvent('textupdate', {
				text, updateRangeStart: start, updateRangeEnd: end,
				selectionStart: start + selectionStartDelta, selectionEnd: start + selectionEndDelta,
				compositionStart: -1, compositionEnd: -1,
			}));
			if (composing) {
				this.#compositionSelection = { start: start + selectionStartDelta, end: start + selectionEndDelta };
			}
		});
	};

	readonly #onCompositionStart = (): void => {
		this.#composing = true;
		this.#lastKey = undefined;
		this.enqueue(() => { this.#compositionSelection = undefined; });
	};

	readonly #onCompositionEnd = (): void => {
		this.#composing = false;
		this.enqueue(() => { this.#compositionSelection = undefined; });
	};

	#syncNative(): void {
		if (this.#pending || this.#disposed || this.#composing) {
			return;
		}
		this.#native.updateText(0, this.#native.text.length, this.#text);
		this.#native.updateSelection(this.#selectionStart, this.#selectionEnd);
		this.#nativeSelectionStart = this.#selectionStart;
		this.#nativeSelectionEnd = this.#selectionEnd;
	}

	dispose(): void {
		this.#disposed = true;
		this.#native.removeEventListener('textupdate', this.#onTextUpdate);
		this.#native.removeEventListener('compositionstart', this.#onCompositionStart);
		this.#native.removeEventListener('compositionend', this.#onCompositionEnd);
		this.nativeContext.set(null, undefined);
	}
}
