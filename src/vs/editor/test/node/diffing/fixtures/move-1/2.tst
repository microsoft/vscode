/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { IdleDeadline, runWhenIdle } from 'vs/base/common/async';
import { BugIndicatingError, onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { setTimeout0 } from 'vs/base/common/platform';
import { StopWatch } from 'vs/base/common/stopwatch';
import { countEOL } from 'vs/editor/common/core/eolCounter';
import { Position } from 'vs/editor/common/core/position';
import { IRange } from 'vs/editor/common/core/range';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { EncodedTokenizationResult, IBackgroundTokenizationStore, IBackgroundTokenizer, ILanguageIdCodec, IState, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { nullTokenizeEncoded } from 'vs/editor/common/languages/nullTokenize';
import { ITextModel } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import { TokenizationTextModelPart } from 'vs/editor/common/model/tokenizationTextModelPart';
import { IModelContentChangedEvent, IModelLanguageChangedEvent } from 'vs/editor/common/textModelEvents';
import { ContiguousMultilineTokensBuilder } from 'vs/editor/common/tokens/contiguousMultilineTokensBuilder';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';

/**
 * An array that avoids being sparse by always
 * filling up unused indices with a default value.
 */
export class ContiguousGrowingArray<T> {

	private _store: T[] = [];

	constructor(
		private readonly _default: T
	) { }

	public get(index: number): T {
		if (index < this._store.length) {
			return this._store[index];
		}
		return this._default;
	}

	public set(index: number, value: T): void {
		while (index >= this._store.length) {
			this._store[this._store.length] = this._default;
		}
		this._store[index] = value;
	}

	// TODO have `replace` instead of `delete` and `insert`
	public delete(deleteIndex: number, deleteCount: number): void {
		if (deleteCount === 0 || deleteIndex >= this._store.length) {
			return;
		}
		this._store.splice(deleteIndex, deleteCount);
	}

	public insert(insertIndex: number, insertCount: number): void {
		if (insertCount === 0 || insertIndex >= this._store.length) {
			return;
		}
		const arr: T[] = [];
		for (let i = 0; i < insertCount; i++) {
			arr[i] = this._default;
		}
		this._store = arrays.arrayInsert(this._store, insertIndex, arr);
	}
}

const enum Constants {
	CHEAP_TOKENIZATION_LENGTH_LIMIT = 1024
}

/**
 * Stores the states at the start of each line and keeps track of which lines
 * must be re-tokenized. Also uses state equality to quickly validate lines
 * that don't need to be re-tokenized.
 *
 * For example, when typing on a line, the line gets marked as needing to be tokenized.
 * Once the line is tokenized, the end state is checked for equality against the begin
 * state of the next line. If the states are equal, tokenization doesn't need to run
 * again over the rest of the file. If the states are not equal, the next line gets marked
 * as needing to be tokenized.
 */
export class TokenizationStateStore {
	requestTokens(startLineNumber: number, endLineNumberExclusive: number): void {
		for (let lineNumber = startLineNumber; lineNumber < endLineNumberExclusive; lineNumber++) {
			this._stateStore.markMustBeTokenized(lineNumber - 1);
		}
	}
}
