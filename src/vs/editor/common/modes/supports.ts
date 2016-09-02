/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import * as modes from 'vs/editor/common/modes';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {Token} from 'vs/editor/common/core/token';

export class LineTokens implements modes.ILineTokens {
	_lineTokensBrand: void;

	tokens: Token[];
	modeTransitions: ModeTransition[];
	actualStopOffset: number;
	endState: modes.IState;
	retokenize: TPromise<void>;

	constructor(tokens:Token[], modeTransitions: ModeTransition[], actualStopOffset:number, endState:modes.IState) {
		this.tokens = tokens;
		this.modeTransitions = modeTransitions;
		this.actualStopOffset = actualStopOffset;
		this.endState = endState;
		this.retokenize = null;
	}
}

export function handleEvent<T>(context:modes.ILineContext, offset:number, runner:(modeId:string, newContext:modes.ILineContext, offset:number)=>T):T {
	let modeTransitions = context.modeTransitions;
	if (modeTransitions.length === 1) {
		return runner(modeTransitions[0].modeId, context, offset);
	}

	let modeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, offset);
	let nestedModeId = modeTransitions[modeIndex].modeId;
	let modeStartIndex = modeTransitions[modeIndex].startIndex;

	let firstTokenInModeIndex = context.findIndexOfOffset(modeStartIndex);
	let nextCharacterAfterModeIndex = -1;
	let nextTokenAfterMode = -1;
	if (modeIndex + 1 < modeTransitions.length) {
		nextTokenAfterMode = context.findIndexOfOffset(modeTransitions[modeIndex + 1].startIndex);
		nextCharacterAfterModeIndex = context.getTokenStartIndex(nextTokenAfterMode);
	} else {
		nextTokenAfterMode = context.getTokenCount();
		nextCharacterAfterModeIndex = context.getLineContent().length;
	}

	let firstTokenCharacterOffset = context.getTokenStartIndex(firstTokenInModeIndex);
	let newCtx = new FilteredLineContext(context, nestedModeId, firstTokenInModeIndex, nextTokenAfterMode, firstTokenCharacterOffset, nextCharacterAfterModeIndex);
	return runner(nestedModeId, newCtx, offset - firstTokenCharacterOffset);
}

export class FilteredLineContext implements modes.ILineContext {

	public modeTransitions: ModeTransition[];

	private _actual:modes.ILineContext;
	private _firstTokenInModeIndex:number;
	private _nextTokenAfterMode:number;
	private _firstTokenCharacterOffset:number;
	private _nextCharacterAfterModeIndex:number;

	constructor(actual:modes.ILineContext, modeId:string,
			firstTokenInModeIndex:number, nextTokenAfterMode:number,
			firstTokenCharacterOffset:number, nextCharacterAfterModeIndex:number) {

		this.modeTransitions = [new ModeTransition(0, modeId)];
		this._actual = actual;
		this._firstTokenInModeIndex = firstTokenInModeIndex;
		this._nextTokenAfterMode = nextTokenAfterMode;
		this._firstTokenCharacterOffset = firstTokenCharacterOffset;
		this._nextCharacterAfterModeIndex = nextCharacterAfterModeIndex;
	}

	public getLineContent(): string {
		var actualLineContent = this._actual.getLineContent();
		return actualLineContent.substring(this._firstTokenCharacterOffset, this._nextCharacterAfterModeIndex);
	}

	public getTokenCount(): number {
		return this._nextTokenAfterMode - this._firstTokenInModeIndex;
	}

	public findIndexOfOffset(offset:number): number {
		return this._actual.findIndexOfOffset(offset + this._firstTokenCharacterOffset) - this._firstTokenInModeIndex;
	}

	public getTokenStartIndex(tokenIndex:number): number {
		return this._actual.getTokenStartIndex(tokenIndex + this._firstTokenInModeIndex) - this._firstTokenCharacterOffset;
	}

	public getTokenType(tokenIndex:number): string {
		return this._actual.getTokenType(tokenIndex + this._firstTokenInModeIndex);
	}
}

const IGNORE_IN_TOKENS = /\b(comment|string|regex)\b/;
export function ignoreBracketsInToken(tokenType:string): boolean {
	return IGNORE_IN_TOKENS.test(tokenType);
}
