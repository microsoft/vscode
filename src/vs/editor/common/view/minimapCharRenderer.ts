/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CharCode } from 'vs/base/common/charCode';

export const enum Constants {
	START_CH_CODE = 32, // Space
	END_CH_CODE = 126, // Tilde (~)
	CHAR_COUNT = END_CH_CODE - START_CH_CODE + 1,

	SAMPLED_CHAR_HEIGHT = 16,
	SAMPLED_CHAR_WIDTH = 10,
	SAMPLED_HALF_CHAR_WIDTH = SAMPLED_CHAR_WIDTH / 2,

	x2_CHAR_HEIGHT = 4,
	x2_CHAR_WIDTH = 2,

	x1_CHAR_HEIGHT = 2,
	x1_CHAR_WIDTH = 1,

	RGBA_CHANNELS_CNT = 4,
	CA_CHANNELS_CNT = 2,
}

export class MinimapCharRenderer {

	_minimapCharRendererBrand: void;

	public readonly x2charData: Uint8ClampedArray;
	public readonly x1charData: Uint8ClampedArray;

	constructor(x2CharData: Uint8ClampedArray, x1CharData: Uint8ClampedArray) {
		const x2ExpectedLen = Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT * Constants.CHAR_COUNT;
		if (x2CharData.length !== x2ExpectedLen) {
			throw new Error('Invalid x2CharData');
		}
		const x1ExpectedLen = Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT * Constants.CHAR_COUNT;
		if (x1CharData.length !== x1ExpectedLen) {
			throw new Error('Invalid x1CharData');
		}
		this.x2charData = x2CharData;
		this.x1charData = x1CharData;
	}

	/**
	 * Assumes a line height of 4px and a char width of 2px
	 */
	public x2RenderChar(target: Uint8ClampedArray, lineLen: number, lineIndex: number, charIndex: number, chCode: number): void {
		const x2CharData = this.x2charData;

		const outWidth = Constants.x2_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * lineLen;

		if (chCode < Constants.START_CH_CODE || chCode > Constants.END_CH_CODE) {
			chCode = CharCode.N;
		}
		const chIndex = chCode - Constants.START_CH_CODE;

		let sourceOffset = chIndex * Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT;
		const c1 = x2CharData[sourceOffset];
		const a1 = x2CharData[sourceOffset + 1];
		const c2 = x2CharData[sourceOffset + 2];
		const a2 = x2CharData[sourceOffset + 3];

		const c3 = x2CharData[sourceOffset + 4];
		const a3 = x2CharData[sourceOffset + 5];
		const c4 = x2CharData[sourceOffset + 6];
		const a4 = x2CharData[sourceOffset + 7];

		const c5 = x2CharData[sourceOffset + 8];
		const a5 = x2CharData[sourceOffset + 9];
		const c6 = x2CharData[sourceOffset + 10];
		const a6 = x2CharData[sourceOffset + 11];

		const c7 = x2CharData[sourceOffset + 12];
		const a7 = x2CharData[sourceOffset + 13];
		const c8 = x2CharData[sourceOffset + 14];
		const a8 = x2CharData[sourceOffset + 15];

		let resultOffset = Constants.x2_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * charIndex;
		target[resultOffset + 0] = c1;
		target[resultOffset + 1] = c1;
		target[resultOffset + 2] = c1;
		target[resultOffset + 3] = a1;
		target[resultOffset + 4] = c2;
		target[resultOffset + 5] = c2;
		target[resultOffset + 6] = c2;
		target[resultOffset + 7] = a2;
		resultOffset += outWidth;
		target[resultOffset + 0] = c3;
		target[resultOffset + 1] = c3;
		target[resultOffset + 2] = c3;
		target[resultOffset + 3] = a3;
		target[resultOffset + 4] = c4;
		target[resultOffset + 5] = c4;
		target[resultOffset + 6] = c4;
		target[resultOffset + 7] = a4;
		resultOffset += outWidth;
		target[resultOffset + 0] = c5;
		target[resultOffset + 1] = c5;
		target[resultOffset + 2] = c5;
		target[resultOffset + 3] = a5;
		target[resultOffset + 4] = c6;
		target[resultOffset + 5] = c6;
		target[resultOffset + 6] = c6;
		target[resultOffset + 7] = a6;
		resultOffset += outWidth;
		target[resultOffset + 0] = c7;
		target[resultOffset + 1] = c7;
		target[resultOffset + 2] = c7;
		target[resultOffset + 3] = a7;
		target[resultOffset + 4] = c8;
		target[resultOffset + 5] = c8;
		target[resultOffset + 6] = c8;
		target[resultOffset + 7] = a8;
	}

	/**
	 * Assumes a line height of 2px and a char width of 1px
	 */
	public x1RenderChar(target: Uint8ClampedArray, lineLen: number, lineIndex: number, charIndex: number, chCode: number): void {
		const x1CharData = this.x1charData;

		const outWidth = Constants.x1_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * lineLen;

		if (chCode < Constants.START_CH_CODE || chCode > Constants.END_CH_CODE) {
			chCode = CharCode.N;
		}
		const chIndex = chCode - Constants.START_CH_CODE;

		let sourceOffset = chIndex * Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT;
		const c1 = x1CharData[sourceOffset];
		const a1 = x1CharData[sourceOffset + 1];
		const c2 = x1CharData[sourceOffset + 2];
		const a2 = x1CharData[sourceOffset + 3];

		let resultOffset = Constants.x1_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * charIndex;
		target[resultOffset + 0] = c1;
		target[resultOffset + 1] = c1;
		target[resultOffset + 2] = c1;
		target[resultOffset + 3] = a1;
		resultOffset += outWidth;
		target[resultOffset + 0] = c2;
		target[resultOffset + 1] = c2;
		target[resultOffset + 2] = c2;
		target[resultOffset + 3] = a2;
	}
}
