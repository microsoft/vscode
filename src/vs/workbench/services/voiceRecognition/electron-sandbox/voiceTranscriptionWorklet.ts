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
			const buffer = this.buffer;
			this.buffer = [];

			this.sharedProcessConnection.postMessage(buffer);

			this.startTime = Date.now();
		}

		return !this.stopped;
	}
}

// @ts-ignore
registerProcessor('voice-transcription-worklet', VoiceTranscriptionWorklet);
