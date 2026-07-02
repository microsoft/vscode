/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace languages {
		/**
		 * Syntax-highlight `source` as `languageId` using the installed TextMate
		 * grammars and the active color theme.
		 *
		 * The whole string is tokenized in one call ("full token sync"). Tokens are
		 * dense and offset-free: they cover `source` exactly, back to back, so the sum
		 * of all {@link SyntaxHighlightingToken.length} equals `source.length` (newline characters
		 * are included as their own runs). A token's position is implied by the lengths
		 * of the tokens before it.
		 *
		 * @param source The text to tokenize.
		 * @param languageId A language identifier, e.g. `typescript` or `markdown`.
		 *   Embedded languages (such as fenced code blocks) are resolved automatically.
		 * @returns The tokens together with the {@link SyntaxHighlightingResult.colorMap colorMap}
		 *   their {@link SyntaxHighlightingToken.foreground} values index into. Resolves even when no
		 *   grammar is registered for `languageId`, in which case a single unstyled token
		 *   spanning the whole input is returned.
		 */
		export function computeFullSyntaxHighlighting(source: string, languageId: string): Thenable<SyntaxHighlightingResult>;

		/**
		 * An event that fires when the active color theme changes. After it fires, the
		 * {@link SyntaxHighlightingResult.colorMap colorMap} of previously returned
		 * results is stale; call {@link computeFullSyntaxHighlighting} again to obtain up-to-date colors.
		 */
		export const onDidChangeSyntaxHighlighting: Event<void>;
	}

	/**
	 * The result of {@link languages.computeFullSyntaxHighlighting}.
	 */
	export interface SyntaxHighlightingResult {
		/**
		 * The tokens covering the input exactly, back to back. `sum(token.length)`
		 * equals the length of the highlighted `source`.
		 */
		readonly tokens: readonly SyntaxHighlightingToken[];

		/**
		 * Maps a {@link SyntaxHighlightingToken.foreground} index to a CSS color string (e.g.
		 * `#d7ba7d`). Index `0` is the absent/default color. The map reflects the
		 * active color theme at the time of the call.
		 */
		readonly colorMap: readonly string[];
	}

	/**
	 * A colored run of {@link SyntaxHighlightingToken.length length} characters.
	 */
	export interface SyntaxHighlightingToken {
		/**
		 * The number of characters this token spans.
		 */
		readonly length: number;

		/**
		 * An index into {@link SyntaxHighlightingResult.colorMap} selecting this run's
		 * foreground color.
		 */
		readonly foreground: number;

		/**
		 * The font style of this run, as a bitmask of {@link SyntaxHighlightingTokenFontStyle}.
		 */
		readonly fontStyle: SyntaxHighlightingTokenFontStyle;
	}

	/**
	 * Font styles applied to a {@link SyntaxHighlightingToken}. Values are powers of two and can
	 * be combined into a bitmask.
	 */
	export enum SyntaxHighlightingTokenFontStyle {
		None = 0,
		Italic = 1,
		Bold = 2,
		Underline = 4,
		Strikethrough = 8,
	}
}
