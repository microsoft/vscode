/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Registered name of the PCM capture audio worklet processor. */
const PCM_CAPTURE_PROCESSOR = 'vscode-pcm-capture';

/**
 * Control message the main thread posts to the worklet to ask it to emit any
 * partially-filled buffer immediately (rather than waiting for it to reach the
 * chunk size) and acknowledge. Used to flush the trailing audio before capture
 * is torn down so the final spoken words are not dropped.
 */
export const PCM_FLUSH_REQUEST = 'vscode-pcm-flush';

/** Control message the worklet posts back after emitting its buffered tail. */
export const PCM_FLUSH_ACK = 'vscode-pcm-flushed';

/**
 * How long the main thread waits for the worklet's flush acknowledgment before
 * giving up. The audio thread can be suspended or gone (e.g. the context is
 * closing), in which case no ack ever arrives; resolving after this cap keeps
 * `stop()` from hanging.
 */
const FLUSH_TIMEOUT_MS = 250;

/**
 * Builds the source of the PCM capture worklet for a given chunk size. The
 * processor runs on the dedicated audio rendering thread (unlike the deprecated
 * `ScriptProcessorNode`, whose `onaudioprocess` callback runs on the main thread
 * and gets throttled or stops entirely), buffers mono samples into fixed-size
 * chunks and transfers them to the main thread for encoding/streaming.
 *
 * On a `PCM_FLUSH_REQUEST` control message it emits whatever partial buffer has
 * accumulated so far and posts a `PCM_FLUSH_ACK` acknowledgment, so the caller
 * can drain the trailing audio before tearing the node down.
 */
function pcmCaptureWorkletSource(chunkSize: number): string {
	return `
class PcmCaptureProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this._chunkSize = ${chunkSize};
		this._buffer = new Float32Array(this._chunkSize);
		this._offset = 0;
		this.port.onmessage = e => {
			if (e.data && e.data.type === '${PCM_FLUSH_REQUEST}') {
				this._flush();
				this.port.postMessage({ type: '${PCM_FLUSH_ACK}' });
			}
		};
	}
	_flush() {
		if (this._offset > 0) {
			const chunk = this._buffer.slice(0, this._offset);
			this.port.postMessage(chunk, [chunk.buffer]);
			this._offset = 0;
		}
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
 * Subset of {@link MessagePort} used by {@link wirePcmCapturePort}: it posts
 * flush requests and receives chunk/ack messages.
 */
export type IPcmCapturePort = Pick<MessagePort, 'postMessage' | 'onmessage'>;

/** Timer functions used by {@link wirePcmCapturePort} (satisfied by `window`). */
export type IPcmCaptureTimers = Pick<Window & typeof globalThis, 'setTimeout' | 'clearTimeout'>;

/**
 * Wire the main-thread side of the capture worklet's message port: route audio
 * chunks to `onChunk`, and expose a `flush` that asks the worklet to emit its
 * partial trailing buffer and resolves once the acknowledgment arrives (or after
 * a timeout if the audio thread never responds).
 */
export function wirePcmCapturePort(port: IPcmCapturePort, timers: IPcmCaptureTimers, onChunk: (samples: Float32Array) => void): { flush(): Promise<void> } {
	let onFlushed: (() => void) | undefined;
	port.onmessage = e => {
		const data = e.data;
		if (data && (data as { type?: string }).type === PCM_FLUSH_ACK) {
			onFlushed?.();
			return;
		}
		onChunk(data as Float32Array);
	};

	const flush = (): Promise<void> => new Promise<void>(resolve => {
		let settled = false;
		const done = () => {
			if (settled) {
				return;
			}
			settled = true;
			onFlushed = undefined;
			timers.clearTimeout(timer);
			resolve();
		};
		onFlushed = done;
		const timer = timers.setTimeout(done, FLUSH_TIMEOUT_MS);
		port.postMessage({ type: PCM_FLUSH_REQUEST });
	});

	return { flush };
}

/**
 * A PCM capture worklet node together with a `flush` that drains its
 * partially-filled trailing buffer.
 */
export interface IPcmCaptureNode {
	/**
	 * The capture node. Not connected to the audio graph; the caller is
	 * responsible for connecting it (typically source -> node -> destination)
	 * and for disposing it via `node.disconnect()` and clearing
	 * `node.port.onmessage`.
	 */
	readonly node: AudioWorkletNode;
	/**
	 * Ask the worklet to emit any audio buffered so far (a partial chunk that
	 * has not yet reached the chunk size) and resolve once it has. The buffered
	 * samples are delivered through the same `onChunk` callback before this
	 * resolves, so callers can flush the trailing audio to their backend before
	 * stopping capture. Resolves after a short timeout even if the audio thread
	 * never acknowledges (e.g. the context is already closing).
	 */
	flush(): Promise<void>;
}

/**
 * Creates an {@link AudioWorkletNode} that captures mono PCM from `context` in
 * fixed-size chunks, invoking `onChunk` on the main thread for every chunk. The
 * worklet module is loaded from a blob URL, which the renderer's `script-src`
 * CSP allows (worklet scripts fall back to `script-src`).
 */
export async function createPcmCaptureNode(window: Window & typeof globalThis, context: AudioContext, chunkSize: number, onChunk: (samples: Float32Array) => void): Promise<IPcmCaptureNode> {
	const moduleUrl = URL.createObjectURL(new Blob([pcmCaptureWorkletSource(chunkSize)], { type: 'application/javascript' }));
	try {
		await context.audioWorklet.addModule(moduleUrl);
	} finally {
		URL.revokeObjectURL(moduleUrl);
	}

	const node = new window.AudioWorkletNode(context, PCM_CAPTURE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
	const { flush } = wirePcmCapturePort(node.port, window, onChunk);
	return { node, flush };
}
