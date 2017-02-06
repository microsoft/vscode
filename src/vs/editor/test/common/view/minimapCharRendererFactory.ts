/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Constants, MinimapCharRenderer } from 'vs/editor/common/view/minimapCharRenderer';

export class MinimapCharRendererFactory {

	public static create(source: Uint8ClampedArray): MinimapCharRenderer {
		const expectedLength = (Constants.SAMPLED_CHAR_HEIGHT * Constants.SAMPLED_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * Constants.CHAR_COUNT);
		if (source.length !== expectedLength) {
			throw new Error('Unexpected source in MinimapCharRenderer');
		}

		let x2CharData = MinimapCharRendererFactory._downsample2x(source);
		let x1CharData = MinimapCharRendererFactory._downsample1x(source);
		return new MinimapCharRenderer(x2CharData, x1CharData);
	}

	private static _extractSampledChar(source: Uint8ClampedArray, charIndex: number, dest: Uint8ClampedArray) {
		let destOffset = 0;
		for (let i = 0; i < Constants.SAMPLED_CHAR_HEIGHT; i++) {
			let sourceOffset = (
				Constants.SAMPLED_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * Constants.CHAR_COUNT * i
				+ Constants.SAMPLED_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT * charIndex
			);
			for (let j = 0; j < Constants.SAMPLED_CHAR_WIDTH; j++) {
				for (let c = 0; c < Constants.RGBA_CHANNELS_CNT; c++) {
					dest[destOffset] = source[sourceOffset];
					sourceOffset++;
					destOffset++;
				}
			}
		}
	}

	private static _downsample2xChar(source: Uint8ClampedArray, dest: Uint8ClampedArray): void {
		// chars are 2 x 4px (width x height)
		const resultLen = Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT;
		const result = new Uint16Array(resultLen);
		for (let i = 0; i < resultLen; i++) {
			result[i] = 0;
		}

		let inputOffset = 0, globalOutputOffset = 0;
		for (let i = 0; i < Constants.SAMPLED_CHAR_HEIGHT; i++) {

			let outputOffset = globalOutputOffset;

			let color = 0;
			let alpha = 0;
			for (let j = 0; j < Constants.SAMPLED_HALF_CHAR_WIDTH; j++) {
				color += source[inputOffset]; // R
				alpha += source[inputOffset + 3]; // A
				inputOffset += Constants.RGBA_CHANNELS_CNT;
			}
			result[outputOffset] += color;
			result[outputOffset + 1] += alpha;
			outputOffset += Constants.CA_CHANNELS_CNT;

			color = 0;
			alpha = 0;
			for (let j = 0; j < Constants.SAMPLED_HALF_CHAR_WIDTH; j++) {
				color += source[inputOffset]; // R
				alpha += source[inputOffset + 3]; // A
				inputOffset += Constants.RGBA_CHANNELS_CNT;
			}
			result[outputOffset] += color;
			result[outputOffset + 1] += alpha;
			outputOffset += Constants.CA_CHANNELS_CNT;

			if (i === 2 || i === 5 || i === 8) {
				globalOutputOffset = outputOffset;
			}
		}

		for (let i = 0; i < resultLen; i++) {
			dest[i] = result[i] / 12; // 15 it should be
		}
	}

	private static _downsample2x(data: Uint8ClampedArray): Uint8ClampedArray {
		const resultLen = Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT * Constants.CHAR_COUNT;
		const result = new Uint8ClampedArray(resultLen);

		const sampledChar = new Uint8ClampedArray(Constants.SAMPLED_CHAR_HEIGHT * Constants.SAMPLED_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT);
		const downsampledChar = new Uint8ClampedArray(Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT);

		for (let charIndex = 0; charIndex < Constants.CHAR_COUNT; charIndex++) {
			this._extractSampledChar(data, charIndex, sampledChar);
			this._downsample2xChar(sampledChar, downsampledChar);
			let resultOffset = (Constants.x2_CHAR_HEIGHT * Constants.x2_CHAR_WIDTH * Constants.CA_CHANNELS_CNT * charIndex);
			for (let i = 0; i < downsampledChar.length; i++) {
				result[resultOffset + i] = downsampledChar[i];
			}
		}

		return result;
	}

	private static _downsample1xChar(source: Uint8ClampedArray, dest: Uint8ClampedArray): void {
		// chars are 1 x 2px (width x height)
		const resultLen = Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT;
		const result = new Uint16Array(resultLen);
		for (let i = 0; i < resultLen; i++) {
			result[i] = 0;
		}

		let inputOffset = 0, globalOutputOffset = 0;
		for (let i = 0; i < Constants.SAMPLED_CHAR_HEIGHT; i++) {

			let outputOffset = globalOutputOffset;

			let color = 0;
			let alpha = 0;
			for (let j = 0; j < Constants.SAMPLED_CHAR_WIDTH; j++) {
				color += source[inputOffset]; // R
				alpha += source[inputOffset + 3]; // A
				inputOffset += Constants.RGBA_CHANNELS_CNT;
			}
			result[outputOffset] += color;
			result[outputOffset + 1] += alpha;
			outputOffset += Constants.CA_CHANNELS_CNT;

			if (i === 5) {
				globalOutputOffset = outputOffset;
			}
		}

		for (let i = 0; i < resultLen; i++) {
			dest[i] = result[i] / 50; // 60 it should be
		}
	}

	private static _downsample1x(data: Uint8ClampedArray): Uint8ClampedArray {
		const resultLen = Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT * Constants.CHAR_COUNT;
		const result = new Uint8ClampedArray(resultLen);

		const sampledChar = new Uint8ClampedArray(Constants.SAMPLED_CHAR_HEIGHT * Constants.SAMPLED_CHAR_WIDTH * Constants.RGBA_CHANNELS_CNT);
		const downsampledChar = new Uint8ClampedArray(Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT);

		for (let charIndex = 0; charIndex < Constants.CHAR_COUNT; charIndex++) {
			this._extractSampledChar(data, charIndex, sampledChar);
			this._downsample1xChar(sampledChar, downsampledChar);
			let resultOffset = (Constants.x1_CHAR_HEIGHT * Constants.x1_CHAR_WIDTH * Constants.CA_CHANNELS_CNT * charIndex);
			for (let i = 0; i < downsampledChar.length; i++) {
				result[resultOffset + i] = downsampledChar[i];
			}
		}

		return result;
	}
}
