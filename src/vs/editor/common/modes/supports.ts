/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { StandardTokenType } from 'vs/editor/common/modes';

export function createScopedLineTokens(context: LineTokens, offset: number): ScopedLineTokens {
	let tokenCount = context.getCount();
	let tokenIndex = context.findTokenIndexAtOffset(offset);
	let desiredLanguageId = context.getLanguageId(tokenIndex);

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
	}

	public getLineContent(): string {
		const actualLineContent = this._actual.getLineContent();
		return actualLineContent.substring(this.firstCharOffset, this._lastCharOffset);
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
}

const enum IgnoreBracketsInTokens {
	value = StandardTokenType.Comment | StandardTokenType.String | StandardTokenType.RegEx
}

export function ignoreBracketsInToken(standardTokenType: StandardTokenType): boolean {
	return (standardTokenType & IgnoreBracketsInTokens.value) !== 0;
}
