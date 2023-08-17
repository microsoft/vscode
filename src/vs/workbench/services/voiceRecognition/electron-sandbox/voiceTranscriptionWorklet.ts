/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare class AudioWorkletProcessor {

	readonly port: MessagePort;

	process(inputs: [Float32Array[]], outputs: [Float32Array[]]): boolean;
}

class VoiceTranscriptionWorklet extends AudioWorkletProcessor {

	private static readonly BUFFER_TIMESPAN = 2000;

	private startTime: number | undefined = undefined;

	private allInputFloat32Array: Float32Array | undefined = undefined;
	private currentInputFloat32Arrays: Float32Array[] = [];

	private sharedProcessConnection: MessagePort | undefined = undefined;

	private stopped: boolean = false;

	constructor() {
		super();

		this.registerListeners();
	}

	private registerListeners() {
		this.port.onmessage = event => {
			switch (event.data) {
				case 'vscode:startVoiceTranscription': {
					this.sharedProcessConnection = event.ports[0];

					this.sharedProcessConnection.onmessage = event => {
						if (this.stopped) {
							return;
						}

						if (typeof event.data === 'string') {
							this.port.postMessage(event.data);
						}
					};

					this.sharedProcessConnection.start();
					break;
				}

				case 'vscode:stopVoiceTranscription': {
					this.stopped = true;

					this.sharedProcessConnection?.close();
					this.sharedProcessConnection = undefined;

					break;
				}
			}
		};
	}

	override process(inputs: [Float32Array[]]): boolean {
		if (this.startTime === undefined) {
			this.startTime = Date.now();
		}

		const inputChannelData = inputs[0][0];
		if ((!(inputChannelData instanceof Float32Array))) {
			return !this.stopped;
		}

		this.currentInputFloat32Arrays.push(inputChannelData.slice(0));

		if (Date.now() - this.startTime > VoiceTranscriptionWorklet.BUFFER_TIMESPAN && this.sharedProcessConnection) {
			const currentInputFloat32Arrays = this.currentInputFloat32Arrays;
			this.currentInputFloat32Arrays = [];

			this.allInputFloat32Array = this.joinFloat32Arrays(this.allInputFloat32Array ? [this.allInputFloat32Array, ...currentInputFloat32Arrays] : currentInputFloat32Arrays);

			this.sharedProcessConnection.postMessage(this.allInputFloat32Array);

			this.startTime = Date.now();
		}

		return !this.stopped;
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
registerProcessor('voice-transcription-worklet', VoiceTranscriptionWorklet);
