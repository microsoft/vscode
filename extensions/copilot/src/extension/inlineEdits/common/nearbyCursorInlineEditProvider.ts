/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StatelessNextEditDocument } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ChoiceLogProbs } from '../../../platform/networking/common/openai';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { Range } from '../../../util/vs/editor/common/core/range';
import { OffsetRange, OffsetRangeSet } from '../../../util/vs/editor/common/core/ranges/offsetRange';

/**
 * Read the selection from the document, otherwise deduce it from the last edit.
 */
export function getOrDeduceSelectionFromLastEdit(activeDoc: StatelessNextEditDocument): Range | null {
	const origin = new OffsetRange(0, 0);
	if (activeDoc.lastSelectionInAfterEdit && !activeDoc.lastSelectionInAfterEdit.equals(origin)) {
		return activeDoc.documentAfterEdits.getTransformer().getRange(activeDoc.lastSelectionInAfterEdit);
	}

	const selectionRange = deduceSelectionFromLastEdit(activeDoc);
	return selectionRange;
}

function deduceSelectionFromLastEdit(activeDoc: StatelessNextEditDocument): Range | null {
	const mostRecentEdit = activeDoc.recentEdits.edits.at(-1);
	if (mostRecentEdit === undefined) {
		return null;
	}

	const mostRecentSingleEdit = mostRecentEdit.replacements.at(-1);
	if (mostRecentSingleEdit === undefined) {
		return null;
	}

	const offsetRange = mostRecentSingleEdit.replaceRange;
	const newText = mostRecentSingleEdit.newText;
	const change = newText.length - offsetRange.length;
	const newOffset = offsetRange.endExclusive + change;

	const selectionRange = activeDoc.documentAfterEdits.getTransformer().getRange(new OffsetRange(newOffset, newOffset));

	return selectionRange;
}

type Tokens = Token<number>[];

export class Token<T> {
	public readonly range: OffsetRange;

	get id(): string {
		return this.text + '_' + this.range.toString();
	}

	constructor(public readonly text: string, public readonly value: T, offset: number) {
		this.range = new OffsetRange(offset, offset + text.length);
	}

	public equals(other: Token<T>): boolean {
		return this.range.equals(other.range) && this.text === other.text;
	}

	public deltaOffset(offset: number): Token<T> {
		return new Token(this.text, this.value, this.range.start + offset);
	}
}

export function clipTokensToRange(tokens: Tokens, range: OffsetRange): Tokens {
	return tokens.filter(token => range.intersects(token.range));
}

export function clipTokensToRangeAndAdjustOffsets(tokens: Tokens, range: OffsetRange): Tokens {
	return clipTokensToRange(tokens, range).map(token => token.deltaOffset(-range.start));
}

export function removeTokensInRangeAndAdjustOffsets(tokens: Tokens, range: OffsetRange): Tokens {
	const adjustedTokens: Tokens = [];
	for (let token of tokens) {
		// remove tokens inside the range
		if (range.containsRange(token.range)) {
			continue;
		}
		// adjust the token offset
		if (token.range.start > range.start) {
			token = token.deltaOffset(-range.length);
		}

		adjustedTokens.push(token);
	}

	return adjustedTokens;
}

export function getTokensFromLogProbs(logProbs: ChoiceLogProbs, offset: number): Tokens {
	let acc = offset;
	return logProbs.content.map(tokenContent => {
		const token = new Token(tokenContent.token, tokenContent.logprob, acc);
		acc += token.range.length;
		return token;
	});
}

export class LineWithTokens {

	static stringEquals(a: LineWithTokens, b: LineWithTokens): boolean {
		return a._text === b._text;
	}

	static fromText(text: string, tokens: Tokens | undefined): LineWithTokens[] {
		tokens = tokens ?? [];

		const lines: LineWithTokens[] = [];
		while (true) {
			const eolIdxWith = text.indexOf('\r\n');
			const eolIdxWithout = text.indexOf('\n');
			const eolIdx = (eolIdxWith === -1 ? eolIdxWithout : (eolIdxWithout === -1 ? eolIdxWith : Math.min(eolIdxWith, eolIdxWithout)));
			const eol = (eolIdxWith !== -1 ? '\r\n' : (eolIdxWithout === -1 ? undefined : '\n'));

			if (eol === undefined) {
				lines.push(new LineWithTokens(text, tokens, '\n'));
				break;
			}

			const lineLength = eolIdx + eol.length;
			const line = text.substring(0, eolIdx);
			const lineTokensWithBoundary = tokens.filter(t => t.range.start < lineLength && t.range.endExclusive > 0);
			lines.push(new LineWithTokens(line, lineTokensWithBoundary, eol));

			text = text.substring(lineLength);
			tokens = tokens.map(t => t.deltaOffset(-lineLength)).filter(t => t.range.endExclusive > 0);
		}

		return lines;
	}

	get text(): string { return this._text; }
	get tokens(): Tokens { return this._tokens; }
	get length(): number { return this._text.length; }
	get lengthWithEOL(): number { return this._text.length + this._eol.length; }
	get eol(): '\n' | '\r\n' { return this._eol; }

	constructor(
		private readonly _text: string,
		private readonly _tokens: Tokens,
		private readonly _eol: '\n' | '\r\n'
	) { }

	trim() {
		return this.trimStart().trimEnd();
	}

	trimStart() {
		const lineStartTrimmed = this._text.trimStart();
		const trimmedLength = this._text.length - lineStartTrimmed.length;
		const tokensUpdated = this._tokens.map(t => t.deltaOffset(-trimmedLength)).filter(t => t.range.endExclusive > 0);
		return new LineWithTokens(lineStartTrimmed, tokensUpdated, this._eol);
	}

	trimEnd() {
		const lineEndTrimmed = this._text.trimEnd();
		const tokensUpdated = this._tokens.filter(t => t.range.start < lineEndTrimmed.length);
		return new LineWithTokens(lineEndTrimmed, tokensUpdated, this._eol);
	}

	substring(start: number, end: number): LineWithTokens {
		const lineSubstring = this._text.substring(start, end);
		const tokensUpdated = this._tokens.map(t => t.deltaOffset(-start)).filter(t => t.range.endExclusive > 0 && t.range.start < lineSubstring.length);
		return new LineWithTokens(lineSubstring, tokensUpdated, this._eol);
	}

	stringEquals(other: LineWithTokens): boolean {
		return LineWithTokens.stringEquals(this, other);
	}

	equals(other: LineWithTokens): boolean {
		return this._text === other.text
			&& this._tokens.length === other.tokens.length
			&& this._tokens.every((t, i) => t.equals(other.tokens[i]));
	}

	dropTokens(tokens: Tokens): LineWithTokens {
		return new LineWithTokens(this._text, this._tokens.filter(t => !tokens.some(token => t.equals(token))), this._eol);
	}

	findTokens(fn: (token: Token<number>) => boolean): Token<number>[] {
		return this._tokens.filter(fn);
	}
}

export function getTokensFromLinesWithTokens(lines: LineWithTokens[]): Tokens {
	let offset = 0;

	const tokens: Tokens = [];
	for (const line of lines) {
		const textLine = line.text + line.eol;
		tokens.push(...line.tokens.map(t => t.deltaOffset(offset)));
		offset += textLine.length;
	}

	const tokensDeduplicated: Tokens = [];
	const tokensSeen = new Set<string>();
	for (const token of tokens) {
		if (!tokensSeen.has(token.id)) {
			tokensSeen.add(token.id);
			tokensDeduplicated.push(token);
		}
	}

	return tokensDeduplicated;
}

export function mergeOffsetRangesAtDistance(ranges: OffsetRange[], distance: number): OffsetRange[] {
	if (distance < 0) {
		throw new BugIndicatingError('Distance must be positive');
	}

	const rangesGrown = ranges.map(r => new OffsetRange(r.start - distance, r.endExclusive + distance));

	const set = new OffsetRangeSet();
	for (const range of rangesGrown) {
		set.addRange(range);
	}

	return set.ranges.map(r => new OffsetRange(r.start + distance, r.endExclusive - distance));
}
