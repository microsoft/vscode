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

		this.allInputUint8Array = undefined;
		this.currentInputUint8Arrays = []; // buffer over the duration of bufferTimespan
	}

	/**
	 * @param {[[Float32Array]]} inputs
	 */
	process(inputs) {
		if (this.startTime === undefined) {
			this.startTime = Date.now();
		}

		const inputChannelData = inputs[0][0];
		this.currentInputUint8Arrays.push(this.float32ArrayToUint8Array(inputChannelData.slice(0)));

		if (Date.now() - this.startTime > this.bufferTimespan) {
			const currentInputUint8Arrays = this.currentInputUint8Arrays;
			this.currentInputUint8Arrays = [];

			this.allInputUint8Array = this.joinUint8Arrays(this.allInputUint8Array ? [this.allInputUint8Array, ...currentInputUint8Arrays] : currentInputUint8Arrays);

			// @ts-ignore
			this.port.postMessage(this.allInputUint8Array);

			this.startTime = Date.now();
		}

		return true;
	}

	/**
	 * @param {Uint8Array[]} uint8Arrays
	 * @returns {Uint8Array}
	 */
	joinUint8Arrays(uint8Arrays) {
		const result = new Uint8Array(uint8Arrays.reduce((acc, curr) => acc + curr.length, 0));

		let offset = 0;
		for (const uint8Array of uint8Arrays) {
			result.set(uint8Array, offset);
			offset += uint8Array.length;
		}

		return result;
	}

	/**
	 *
	 * @param {Float32Array} float32Array
	 * @returns {Uint8Array}
	 */
	float32ArrayToUint8Array(float32Array) {
		const uint8Array = new Uint8Array(float32Array.length * 4);
		let offset = 0;

		for (let i = 0; i < float32Array.length; i++) {
			const buffer = new ArrayBuffer(4);
			const view = new DataView(buffer);
			view.setFloat32(0, float32Array[i], true);

			for (let j = 0; j < 4; j++) {
				uint8Array[offset++] = view.getUint8(j);
			}
		}

		return uint8Array;
	}
}

// @ts-ignore
registerProcessor('buffer-input-audio-processor', BufferInputAudioProcessor);
