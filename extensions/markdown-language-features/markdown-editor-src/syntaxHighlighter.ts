/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LengthEdit, OffsetRange, StringEdit } from '@vscode/markdown-editor';
import { ISettableObservable, ITransaction, observableValue } from '@vscode/markdown-editor/observables';

/**
 * A single coloured run as returned by the `documentSyntaxHighlighting`
 * proposed API. Tokens are dense and offset-free: `sum(length)` equals the
 * highlighted source length.
 */
interface IHighlightToken {
	readonly length: number;
	readonly foreground: number;
	readonly fontStyle: number;
}

interface IHighlightResult {
	readonly tokens: readonly IHighlightToken[];
	readonly colorMap: readonly string[];
}

/** A `Token` as consumed by `@vscode/markdown-editor`'s code block view. */
interface IRenderToken {
	readonly length: number;
	readonly className: string | undefined;
}

interface ISnapshot {
	getTokens(queryRange: OffsetRange): { readonly range: OffsetRange; readonly tokens: readonly IRenderToken[] };
}

/**
 * Builds the static CSS rules for the 16 possible font-style bit combinations.
 * The bit values mirror the `SyntaxHighlightingTokenFontStyle` enum from the
 * `documentSyntaxHighlighting` proposed API (Italic = 1, Bold = 2, Underline = 4,
 * Strikethrough = 8), defined in
 * `../../../src/vscode-dts/vscode.proposed.documentSyntaxHighlighting.d.ts`.
 * They cannot be imported here because this module is bundled into the webview.
 */
function fontStyleRules(): string {
	const rules: string[] = [];
	for (let fontStyle = 1; fontStyle <= 15; fontStyle++) {
		const declarations: string[] = [];
		if (fontStyle & 1) { declarations.push('font-style: italic;'); }
		if (fontStyle & 2) { declarations.push('font-weight: bold;'); }
		const decorations: string[] = [];
		if (fontStyle & 4) { decorations.push('underline'); }
		if (fontStyle & 8) { decorations.push('line-through'); }
		if (decorations.length) { declarations.push(`text-decoration: ${decorations.join(' ')};`); }
		rules.push(`.tok-mdhl-fs-${fontStyle} { ${declarations.join(' ')} }`);
	}
	return rules.join('\n');
}

function colorRules(colorMap: readonly string[]): string {
	return colorMap.map((color, index) => `.tok-mdhl-fg-${index} { color: ${color}; }`).join('\n');
}

function classNameFor(foreground: number, fontStyle: number): string | undefined {
	const parts: string[] = [];
	if (foreground > 0) { parts.push(`mdhl-fg-${foreground}`); }
	if (fontStyle > 0) { parts.push(`mdhl-fs-${fontStyle}`); }
	return parts.length ? parts.join('.') : undefined;
}

function makeSnapshot(tokens: readonly IRenderToken[]): ISnapshot {
	let total = 0;
	for (const token of tokens) { total += token.length; }
	const range = OffsetRange.ofLength(total);
	return { getTokens: () => ({ range, tokens }) };
}

function unstyledTokens(length: number): readonly IRenderToken[] {
	return length > 0 ? [{ length, className: undefined }] : [];
}

/**
 * Keeps the previous tokens but absorbs the length delta into the last token,
 * so the snapshot stays dense (`sum(length) === newLength`) during the brief
 * window before the re-highlight response arrives. Falls back to a single
 * unstyled run when the adjustment is not representable.
 */
function adjustTokens(tokens: readonly IRenderToken[], previousLength: number, newLength: number): readonly IRenderToken[] {
	const delta = newLength - previousLength;
	if (delta === 0) { return tokens; }
	if (tokens.length === 0) { return unstyledTokens(newLength); }
	const last = tokens[tokens.length - 1];
	const newLastLength = last.length + delta;
	if (newLastLength <= 0) { return unstyledTokens(newLength); }
	return [...tokens.slice(0, -1), { length: newLastLength, className: last.className }];
}

/**
 * A live highlighting session for one fenced code block. Renders an unstyled
 * (or optimistically shifted) snapshot synchronously, then swaps in the themed
 * tokens once the asynchronous `documentSyntaxHighlighting` response lands.
 */
class HighlighterDocument {
	#text: string;
	#tokens: readonly IRenderToken[];
	readonly snapshot: ISettableObservable<ISnapshot, LengthEdit>;
	readonly #owner: WebviewSyntaxHighlighter;
	readonly #languageId: string;

	constructor(
		owner: WebviewSyntaxHighlighter,
		languageId: string,
		initialText: string,
	) {
		this.#owner = owner;
		this.#languageId = languageId;
		this.#text = initialText;
		this.#tokens = unstyledTokens(initialText.length);
		this.snapshot = observableValue('mdSyntaxHighlight', makeSnapshot(this.#tokens));
		this.#request(initialText);
	}

	update(edit: StringEdit, tx: ITransaction): void {
		const newText = edit.apply(this.#text);
		const previousLength = this.#text.length;
		this.#tokens = adjustTokens(this.#tokens, previousLength, newText.length);
		this.#text = newText;
		this.snapshot.set(makeSnapshot(this.#tokens), tx, LengthEdit.replace(OffsetRange.ofLength(previousLength), newText.length));
		this.#request(newText);
	}

	/** Re-highlights the current text, e.g. after a theme change. */
	refresh(): void {
		this.#request(this.#text);
	}

	dispose(): void {
		this.#owner._remove(this);
	}

	async #request(text: string): Promise<void> {
		const result = await this.#owner.request(text, this.#languageId);
		if (text !== this.#text) {
			return;
		}
		this.#tokens = result.tokens.map(token => ({ length: token.length, className: classNameFor(token.foreground, token.fontStyle) }));
		this.snapshot.set(makeSnapshot(this.#tokens), undefined, LengthEdit.replace(OffsetRange.ofLength(text.length), text.length));
	}
}

/**
 * Bridges `@vscode/markdown-editor`'s `ISyntaxHighlighter` contract to the
 * extension host's `documentSyntaxHighlighting` proposed API over the webview
 * message channel. The webview cannot call the proposed API directly, so each
 * highlight request is proxied to the host and the themed result posted back.
 */
export class WebviewSyntaxHighlighter {
	#nextRequestId = 0;
	readonly #pending = new Map<number, (result: IHighlightResult) => void>();
	readonly #documents = new Set<HighlighterDocument>();
	readonly #styleElement: HTMLStyleElement;
	readonly #postMessage: (message: unknown) => void;

	constructor(postMessage: (message: unknown) => void) {
		this.#postMessage = postMessage;
		this.#styleElement = document.createElement('style');
		this.#styleElement.textContent = fontStyleRules();
		document.head.appendChild(this.#styleElement);
	}

	create(languageId: string, initialText: string): HighlighterDocument {
		const document = new HighlighterDocument(this, languageId, initialText);
		this.#documents.add(document);
		return document;
	}

	request(source: string, languageId: string): Promise<IHighlightResult> {
		const requestId = this.#nextRequestId++;
		return new Promise<IHighlightResult>(resolve => {
			this.#pending.set(requestId, resolve);
			this.#postMessage({ type: 'highlight', requestId, source, languageId });
		});
	}

	/**
	 * Handles highlighter-related messages from the extension host. Returns
	 * `true` if the message was consumed.
	 */
	handleMessage(message: { readonly type: string; readonly requestId?: number; readonly tokens?: readonly IHighlightToken[]; readonly colorMap?: readonly string[] }): boolean {
		switch (message.type) {
			case 'highlightResult': {
				const resolve = this.#pending.get(message.requestId!);
				if (resolve) {
					this.#pending.delete(message.requestId!);
					this.#updateColors(message.colorMap!);
					resolve({ tokens: message.tokens!, colorMap: message.colorMap! });
				}
				return true;
			}
			case 'highlightThemeChanged': {
				for (const document of this.#documents) {
					document.refresh();
				}
				return true;
			}
			default:
				return false;
		}
	}

	_remove(document: HighlighterDocument): void {
		this.#documents.delete(document);
	}

	#updateColors(colorMap: readonly string[]): void {
		this.#styleElement.textContent = `${fontStyleRules()}\n${colorRules(colorMap)}`;
	}
}
