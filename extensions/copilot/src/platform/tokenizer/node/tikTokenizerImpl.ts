/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTokenizer, getRegexByEncoder, getSpecialTokensByEncoder, TikTokenizer } from '@microsoft/tiktokenizer';
import { MovingAverage } from '../../../util/vs/base/common/numbers';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { parseTikTokenBinary } from './parseTikTokens';

export type TokenDictionaryParser = (file: string) => string | Map<Uint8Array, number>;

export class TikTokenImpl {

	private static _instance: TikTokenImpl | undefined;

	private _values: (TikTokenizer | undefined)[] = [];
	private _stats = {
		encodeDuration: new MovingAverage(),
		textLength: new MovingAverage(),
		callCount: 0,
	};

	private constructor() { }

	static get instance(): TikTokenImpl {
		if (!this._instance) {
			this._instance = new TikTokenImpl();
		}
		return this._instance;
	}

	init(tokenFilePath: string, encoderName: string, useBinaryTokens: boolean): number {
		const handle = this._values.length;
		const parser: TokenDictionaryParser = useBinaryTokens ? parseTikTokenBinary : f => f;

		this._values.push(createTokenizer(
			parser(tokenFilePath),
			getSpecialTokensByEncoder(encoderName),
			getRegexByEncoder(encoderName),
			64000
		));

		return handle;
	}

	encode(handle: number, text: string, allowedSpecial?: readonly string[]): number[] {
		const sw = StopWatch.create(true);
		const result = this._values[handle]!.encode(text, allowedSpecial);

		this._stats.callCount += 1;
		this._stats.encodeDuration.update(sw.elapsed());
		this._stats.textLength.update(text.length);

		return result;
	}

	destroy(handle: number) {
		this._values[handle] = undefined;
	}

	resetStats() {
		const oldValue = this._stats;
		const result = {
			callCount: oldValue.callCount,
			encodeDuration: oldValue.encodeDuration.value,
			textLength: oldValue.textLength.value
		};
		this._stats.encodeDuration = new MovingAverage();
		this._stats.textLength = new MovingAverage();
		this._stats.callCount = 0;
		return result;
	}
}
