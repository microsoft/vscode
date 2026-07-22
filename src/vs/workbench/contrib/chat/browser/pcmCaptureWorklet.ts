/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Registered name of the PCM capture audio worklet processor. */
const PCM_CAPTURE_PROCESSOR = 'vscode-pcm-capture';

/**
 * Builds the source of the PCM capture worklet for a given chunk size. The
 * processor runs on the dedicated audio rendering thread (unlike the deprecated
 * `ScriptProcessorNode`, whose `onaudioprocess` callback runs on the main thread
 * and gets throttled or stops entirely), buffers mono samples into fixed-size
 * chunks and transfers them to the main thread for encoding/streaming.
 */
function pcmCaptureWorkletSource(chunkSize: number): string {
	return `
class PcmCaptureProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this._chunkSize = ${chunkSize};
		this._buffer = new Float32Array(this._chunkSize);
		this._offset = 0;
	}
	process(inputs) {
		const channel = inputs[0] && inputs[0][0];
		if (channel) {
			for (let i = 0; i < channel.length; i++) {
				this._buffer[this._offset++] = channel[i];
				if (this._offset === this._chunkSize) {
					const chunk = this._buffer;
					this.port.postMessage(chunk, [chunk.buffer]);
					this._buffer = new Float32Array(this._chunkSize);
					this._offset = 0;
				}
			}
		}
		return true;
	}
}
registerProcessor('${PCM_CAPTURE_PROCESSOR}', PcmCaptureProcessor);
`;
}

/**
 * Creates an {@link AudioWorkletNode} that captures mono PCM from `context` in
 * fixed-size chunks, invoking `onChunk` on the main thread for every chunk. The
 * worklet module is loaded from a blob URL, which the renderer's `script-src`
 * CSP allows (worklet scripts fall back to `script-src`).
 *
 * The returned node is not connected to the audio graph; the caller is
 * responsible for connecting it (typically source -> node -> destination) and
 * for disposing it via `node.disconnect()` and clearing `node.port.onmessage`.
 */
export async function createPcmCaptureNode(window: Window & typeof globalThis, context: AudioContext, chunkSize: number, onChunk: (samples: Float32Array) => void): Promise<AudioWorkletNode> {
	const moduleUrl = URL.createObjectURL(new Blob([pcmCaptureWorkletSource(chunkSize)], { type: 'application/javascript' }));
	try {
		await context.audioWorklet.addModule(moduleUrl);
	} finally {
		URL.revokeObjectURL(moduleUrl);
	}

	const node = new window.AudioWorkletNode(context, PCM_CAPTURE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
	node.port.onmessage = e => onChunk(e.data as Float32Array);
	return node;
}
