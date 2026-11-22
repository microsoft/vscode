/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TokenInput } from './editorViewTypes.js';

/** Text paint applied over a token's own; absent fields keep the token's value. */
export interface ITextStylePatch {
	/** Packed `0xRRGGBBAA`. */
	readonly foreground?: number;
	/** Multiplies the (possibly replaced) foreground alpha. */
	readonly opacity?: number;
	readonly bold?: true;
	readonly italic?: true;
}

/** A patch over 0-based UTF-16 columns `[start, end)`. */
export interface ITextStyleRun {
	readonly start: number;
	readonly end: number;
	readonly style: ITextStylePatch;
}

/**
 * Split `tokens` at run edges and apply each run's patch to the pieces it
 * covers, as the DOM splits token spans for inline decorations. `runs` must be
 * sorted and non-overlapping.
 */
export function applyTextStyleRuns(tokens: readonly TokenInput[], runs: readonly ITextStyleRun[]): TokenInput[] {
	if (runs.length === 0) {
		return tokens.slice();
	}
	const result: TokenInput[] = [];
	let run = 0;
	for (const token of tokens) {
		let column = token.startColumn;
		while (column < token.endColumn) {
			while (run < runs.length && runs[run].end <= column) {
				run++;
			}
			const next = runs[run];
			const covered = next !== undefined && next.start <= column;
			const pieceEnd = Math.min(token.endColumn, covered ? next.end : next?.start ?? Infinity);
			const piece = { ...token, startColumn: column, endColumn: pieceEnd };
			result.push(covered ? patchToken(piece, next.style) : piece);
			column = pieceEnd;
		}
	}
	return result;
}

function patchToken(token: TokenInput, style: ITextStylePatch): TokenInput {
	let foreground = style.foreground ?? token.foreground;
	if (style.opacity !== undefined) {
		const alpha = Math.round((foreground & 0xff) * style.opacity);
		foreground = ((foreground & ~0xff) | Math.max(0, Math.min(255, alpha))) >>> 0;
	}
	return {
		...token,
		foreground,
		// The minimap paints the token's own color, like the DOM minimap.
		...(foreground !== token.foreground ? { baseForeground: token.baseForeground ?? token.foreground } : {}),
		...(style.bold ? { bold: true } : {}),
		...(style.italic ? { italic: true } : {}),
	};
}
