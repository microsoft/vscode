/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare class AudioWorkletProcessor {

	readonly port: MessagePort;

	process(inputs: [Float32Array[]], outputs: [Float32Array[]]): boolean;
}

interface IVoiceTranscriptionWorkletOptions extends AudioWorkletNodeOptions {
	processorOptions: {
		readonly bufferTimespan: number;
		readonly vadThreshold: number;
	};
}

class VoiceTranscriptionWorklet extends AudioWorkletProcessor {

	private startTime: number | undefined = undefined;
	private stopped: boolean = false;

	private buffer: Float32Array[] = [];

	private sharedProcessConnection: MessagePort | undefined = undefined;

	constructor(private readonly options: IVoiceTranscriptionWorkletOptions) {
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

		this.buffer.push(inputChannelData.slice(0));

		if (Date.now() - this.startTime > this.options.processorOptions.bufferTimespan && this.sharedProcessConnection) {
			const buffer = this.joinFloat32Arrays(this.buffer);
			this.buffer = [];

			// Send buffer to shared process for transcription.
			// Send an empty buffer if it appears to be silence
			// so that we can still trigger the transcription
			// service and let it know about this.

			this.sharedProcessConnection.postMessage(this.appearsToBeSilence(buffer) ? new Float32Array(0) : buffer);

			this.startTime = Date.now();
		}

		return !this.stopped;
	}

	private appearsToBeSilence(data: Float32Array): boolean {

		// This is the most simple Voice Activity Detection (VAD)
		// and it is based on the Root Mean Square (RMS) of the signal
		// with a certain threshold. Good for testing but probably
		// not suitable for shipping to stable (TODO@bpasero).

		let sum = 0;
		for (let i = 0; i < data.length; i++) {
			sum += data[i] * data[i];
		}

		const rms = Math.sqrt(sum / data.length);

		return rms < this.options.processorOptions.vadThreshold;
	}

	private joinFloat32Arrays(float32Arrays: Float32Array[]): Float32Array {
		const result = new Float32Array(float32Arrays.reduce((prev, curr) => prev + curr.length, 0));

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
