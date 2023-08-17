/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// @ts-ignore
class BufferedVoiceTranscriber extends AudioWorkletProcessor {

	constructor() {
		super();

		this.channelCount = 1;
		this.bufferTimespan = 4000;
		this.startTime = undefined;

		this.allInputFloat32Array = undefined;
		this.currentInputFloat32Arrays = []; // buffer over the duration of bufferTimespan

		this.registerListeners();
	}

	registerListeners() {

		// @ts-ignore
		const port = this.port;
		port.onmessage = event => {
			if (event.data === 'vscode:transferPortToAudioWorklet') {
				this.sharedProcessPort = event.ports[0];

				this.sharedProcessPort.onmessage = event => {
					if (typeof event.data === 'string') {
						port.postMessage(event.data);
					}
				};

				this.sharedProcessPort.start();
			}
		};
	}

	/**
	 * @param {[[Float32Array]]} inputs
	 */
	process(inputs) {
		if (this.startTime === undefined) {
			this.startTime = Date.now();
		}

		const inputChannelData = inputs[0][0];
		if ((!(inputChannelData instanceof Float32Array))) {
			return;
		}

		this.currentInputFloat32Arrays.push(inputChannelData.slice(0));

		if (Date.now() - this.startTime > this.bufferTimespan && this.sharedProcessPort) {
			const currentInputFloat32Arrays = this.currentInputFloat32Arrays;
			this.currentInputFloat32Arrays = [];

			this.allInputFloat32Array = this.joinFloat32Arrays(this.allInputFloat32Array ? [this.allInputFloat32Array, ...currentInputFloat32Arrays] : currentInputFloat32Arrays);

			// @ts-ignore
			this.sharedProcessPort.postMessage(this.allInputFloat32Array);

			this.startTime = Date.now();
		}

		return true;
	}

	/**
	 * @param {Float32Array[]} float32Arrays
	 * @returns {Float32Array}
	 */
	joinFloat32Arrays(float32Arrays) {
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
registerProcessor('buffered-voice-transcriber', BufferedVoiceTranscriber);
