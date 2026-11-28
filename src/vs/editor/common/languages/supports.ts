/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IViewLineTokens, LineTokens } from '../tokens/lineTokens.js';
import { StandardTokenType } from '../encodedTokenAttributes.js';
import { ILanguageIdCodec } from '../languages.js';
import { getWordAtText, IWordAtPosition } from '../core/wordHelper.js';
import type { ILanguageConfigurationService } from './languageConfigurationRegistry.js';

export interface ILineWordScope {
	readonly offset: number;
	readonly text: string;
	readonly wordDefinition: RegExp;
}

/** At a language boundary prefer the word on the right, then try the language on the left. */
export function getWordAtColumn(column: number, originalColumn: number, getScope: (offset: number) => ILineWordScope): IWordAtPosition | null {
	const lookup = (scope: ILineWordScope) => {
		const word = getWordAtText(column, scope.wordDefinition, scope.text, scope.offset);
		return word && word.startColumn <= originalColumn && originalColumn <= word.endColumn ? word : null;
	};
	const right = getScope(column - 1);
	return lookup(right) ?? (right.offset > 0 && right.offset === column - 1 ? lookup(getScope(right.offset - 1)) : null);
}

export function createScopedLineTokens(context: LineTokens, offset: number): ScopedLineTokens {
	const tokenCount = context.getCount();
	const tokenIndex = context.findTokenIndexAtOffset(offset);
	const desiredLanguageId = context.getLanguageId(tokenIndex);

	let lastTokenIndex = tokenIndex;
	while (lastTokenIndex + 1 < tokenCount && context.getLanguageId(lastTokenIndex + 1) === desiredLanguageId) {
		lastTokenIndex++;
	}

	let firstTokenIndex = tokenIndex;
	while (firstTokenIndex > 0 && context.getLanguageId(firstTokenIndex - 1) === desiredLanguageId) {
		firstTokenIndex--;
	}

	return new ScopedLineTokens(
		context,
		desiredLanguageId,
		firstTokenIndex,
		lastTokenIndex + 1,
		context.getStartOffset(firstTokenIndex),
		context.getEndOffset(lastTokenIndex)
	);
}

export class ScopedLineTokens {
	_scopedLineTokensBrand: void = undefined;

	public readonly languageIdCodec: ILanguageIdCodec;
	public readonly languageId: string;
	private readonly _actual: LineTokens;
	private readonly _firstTokenIndex: number;
	private readonly _lastTokenIndex: number;
	public readonly firstCharOffset: number;
	private readonly _lastCharOffset: number;

	constructor(
		actual: LineTokens,
		languageId: string,
		firstTokenIndex: number,
		lastTokenIndex: number,
		firstCharOffset: number,
		lastCharOffset: number
	) {
		this._actual = actual;
		this.languageId = languageId;
		this._firstTokenIndex = firstTokenIndex;
		this._lastTokenIndex = lastTokenIndex;
		this.firstCharOffset = firstCharOffset;
		this._lastCharOffset = lastCharOffset;
		this.languageIdCodec = actual.languageIdCodec;
	}

	public getLineContent(): string {
		const actualLineContent = this._actual.getLineContent();
		return actualLineContent.substring(this.firstCharOffset, this._lastCharOffset);
	}

	public getWordScope(languageConfigurationService: ILanguageConfigurationService): ILineWordScope {
		return {
			offset: this.firstCharOffset,
			text: this.getLineContent(),
			wordDefinition: languageConfigurationService.getLanguageConfiguration(this.languageId).getWordDefinition()
		};
	}

	public getLineLength(): number {
		return this._lastCharOffset - this.firstCharOffset;
	}

	public getActualLineContentBefore(offset: number): string {
		const actualLineContent = this._actual.getLineContent();
		return actualLineContent.substring(0, this.firstCharOffset + offset);
	}

	public getTokenCount(): number {
		return this._lastTokenIndex - this._firstTokenIndex;
	}

	public findTokenIndexAtOffset(offset: number): number {
		return this._actual.findTokenIndexAtOffset(offset + this.firstCharOffset) - this._firstTokenIndex;
	}

	public getStandardTokenType(tokenIndex: number): StandardTokenType {
		return this._actual.getStandardTokenType(tokenIndex + this._firstTokenIndex);
	}

	public toIViewLineTokens(): IViewLineTokens {
		return this._actual.sliceAndInflate(this.firstCharOffset, this._lastCharOffset, 0);
	}
}

const enum IgnoreBracketsInTokens {
	value = StandardTokenType.Comment | StandardTokenType.String | StandardTokenType.RegEx
}

export function ignoreBracketsInToken(standardTokenType: StandardTokenType): boolean {
	return (standardTokenType & IgnoreBracketsInTokens.value) !== 0;
}
