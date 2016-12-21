/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as modes from 'vs/editor/common/modes';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';
import { LineTokens, StandardTokenType } from 'vs/editor/common/core/lineTokens';

export class RawLineTokens implements modes.ILineTokens {
	_lineTokensBrand: void;

	tokens: Token[];
	modeTransitions: ModeTransition[];
	actualStopOffset: number;
	endState: modes.IState;

	constructor(tokens: Token[], modeTransitions: ModeTransition[], actualStopOffset: number, endState: modes.IState) {
		this.tokens = tokens;
		this.modeTransitions = modeTransitions;
		this.actualStopOffset = actualStopOffset;
		this.endState = endState;
	}
}

export function createScopedLineTokens(context: LineTokens, offset: number): ScopedLineTokens {
	let modeTransitions = context.modeTransitions;
	if (modeTransitions.length === 1) {
		return new ScopedLineTokens(context, modeTransitions[0].modeId, 0, context.getTokenCount(), 0, context.getLineContent().length);
	}

	let modeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, offset);
	let nestedModeId = modeTransitions[modeIndex].modeId;
	let modeStartIndex = modeTransitions[modeIndex].startIndex;

	let firstTokenIndex = context.findTokenIndexAtOffset(modeStartIndex);
	let lastCharOffset = -1;
	let lastTokenIndex = -1;
	if (modeIndex + 1 < modeTransitions.length) {
		lastTokenIndex = context.findTokenIndexAtOffset(modeTransitions[modeIndex + 1].startIndex);
		lastCharOffset = context.getTokenStartOffset(lastTokenIndex);
	} else {
		lastTokenIndex = context.getTokenCount();
		lastCharOffset = context.getLineContent().length;
	}

	let firstCharOffset = context.getTokenStartOffset(firstTokenIndex);
	return new ScopedLineTokens(context, nestedModeId, firstTokenIndex, lastTokenIndex, firstCharOffset, lastCharOffset);
}

export class ScopedLineTokens {
	_scopedLineTokensBrand: void;

	public readonly modeId: string;
	private readonly _actual: LineTokens;
	private readonly _firstTokenIndex: number;
	private readonly _lastTokenIndex: number;
	public readonly firstCharOffset: number;
	private readonly _lastCharOffset: number;

	constructor(
		actual: LineTokens,
		modeId: string,
		firstTokenIndex: number,
		lastTokenIndex: number,
		firstCharOffset: number,
		lastCharOffset: number
	) {
		this._actual = actual;
		this.modeId = modeId;
		this._firstTokenIndex = firstTokenIndex;
		this._lastTokenIndex = lastTokenIndex;
		this.firstCharOffset = firstCharOffset;
		this._lastCharOffset = lastCharOffset;
	}

	public getLineContent(): string {
		var actualLineContent = this._actual.getLineContent();
		return actualLineContent.substring(this.firstCharOffset, this._lastCharOffset);
	}

	public getTokenCount(): number {
		return this._lastTokenIndex - this._firstTokenIndex;
	}

	public findTokenIndexAtOffset(offset: number): number {
		return this._actual.findTokenIndexAtOffset(offset + this.firstCharOffset) - this._firstTokenIndex;
	}

	public getTokenStartOffset(tokenIndex: number): number {
		return this._actual.getTokenStartOffset(tokenIndex + this._firstTokenIndex) - this.firstCharOffset;
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
