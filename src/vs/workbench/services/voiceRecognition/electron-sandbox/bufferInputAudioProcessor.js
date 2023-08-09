/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// @ts-ignore
class BufferInputAudioProcessor extends AudioWorkletProcessor {

	constructor() {
		super();

		this.channelCount = 1;
		this.bufferTimespan = 4000;
		this.startTime = undefined;

		this.allInputChannelDataBuffer = undefined;
		this.currentInputChannelDataBuffer = []; // buffer over the duration of bufferTimespan
	}

	/**
	 * @param {[[Float32Array]]} inputs
	 */
	process(inputs) {
		if (this.startTime === undefined) {
			this.startTime = Date.now();
		}

		const inputChannelData = inputs[0][0];
		this.currentInputChannelDataBuffer.push(inputChannelData.slice(0));

		if (Date.now() - this.startTime > this.bufferTimespan) {
			const currentInputChannelDataBuffer = this.currentInputChannelDataBuffer;
			this.currentInputChannelDataBuffer = [];

			this.allInputChannelDataBuffer = this._joinFloat32Arrays(this.allInputChannelDataBuffer ? [this.allInputChannelDataBuffer, ...currentInputChannelDataBuffer] : currentInputChannelDataBuffer);

			// @ts-ignore
			this.port.postMessage(this.allInputChannelDataBuffer);

			this.startTime = Date.now();
		}

		return true;
	}

	/**
	 * @param {Float32Array[]} float32Arrays
	 * @returns {Float32Array}
	 */
	_joinFloat32Arrays(float32Arrays) {
		const result = new Float32Array(float32Arrays.reduce((acc, curr) => acc + curr.length, 0));

		let offset = 0;
		for (const float32Array of float32Arrays) {
			result.set(float32Array, offset);
			offset += float32Array.length;
		}

		return result;
	}
}

// @ts-ignore
registerProcessor('buffer-input-audio-processor', BufferInputAudioProcessor);
