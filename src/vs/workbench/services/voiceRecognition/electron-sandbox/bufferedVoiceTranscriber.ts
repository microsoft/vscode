/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare class AudioWorkletProcessor {

	readonly port: MessagePort;

	process(inputs: [Float32Array[]], outputs: [Float32Array[]]): boolean;
}

class BufferedVoiceTranscriber extends AudioWorkletProcessor {

	private static readonly BUFFER_TIMESPAN = 2000;

	private startTime: number | undefined = undefined;

	private allInputFloat32Array: Float32Array | undefined = undefined;
	private currentInputFloat32Arrays: Float32Array[] = [];

	private sharedProcessConnection: MessagePort | undefined = undefined;

	constructor() {
		super();

		this.registerListeners();
	}

	private registerListeners() {
		this.port.onmessage = event => {
			if (event.data === 'vscode:transferSharedProcessConnection') {
				this.sharedProcessConnection = event.ports[0];

				this.sharedProcessConnection.onmessage = event => {
					if (typeof event.data === 'string') {
						this.port.postMessage(event.data);
					}
				};

				this.sharedProcessConnection.start();
			}
		};
	}

	override process(inputs: [Float32Array[]]): boolean {
		if (this.startTime === undefined) {
			this.startTime = Date.now();
		}

		const inputChannelData = inputs[0][0];
		if ((!(inputChannelData instanceof Float32Array))) {
			return true;
		}

		this.currentInputFloat32Arrays.push(inputChannelData.slice(0));

		if (Date.now() - this.startTime > BufferedVoiceTranscriber.BUFFER_TIMESPAN && this.sharedProcessConnection) {
			const currentInputFloat32Arrays = this.currentInputFloat32Arrays;
			this.currentInputFloat32Arrays = [];

			this.allInputFloat32Array = this.joinFloat32Arrays(this.allInputFloat32Array ? [this.allInputFloat32Array, ...currentInputFloat32Arrays] : currentInputFloat32Arrays);

			this.sharedProcessConnection.postMessage(this.allInputFloat32Array);

			this.startTime = Date.now();
		}

		return true;
	}

	private joinFloat32Arrays(float32Arrays: Float32Array[]): Float32Array {
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
