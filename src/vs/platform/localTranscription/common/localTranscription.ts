/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ILocalTranscriptionService = createDecorator<ILocalTranscriptionService>('localTranscriptionService');

/** IPC channel name used to reach the transcription service in the utility process. */
export const localTranscriptionChannelName = 'localTranscription';

/** Lifecycle of the downloaded transcription model. */
export const enum LocalTranscriptionModelState {
	/** Model has not been requested yet. */
	Idle = 'idle',
	/** Model files are being downloaded to the on-disk cache. */
	Downloading = 'downloading',
	/** Model is being loaded into memory. */
	Loading = 'loading',
	/** Model is loaded and ready to transcribe. */
	Ready = 'ready',
	/** Model failed to download or load. */
	Error = 'error',
}

export interface ILocalTranscriptionModelStatus {
	readonly state: LocalTranscriptionModelState;
	/** Overall download progress in [0, 1] while `Downloading`. */
	readonly progress?: number;
	/**
	 * Whether model files were actually fetched from the network (a cache miss)
	 * during this preparation, as opposed to loaded from the on-disk cache. Set
	 * on the `Ready` status. Used for download telemetry.
	 */
	readonly downloaded?: boolean;
	/** Human-readable error message when `state === Error` (for UI/logging). */
	readonly error?: string;
	/**
	 * Allowlisted, low-cardinality error identifier when `state === Error`
	 * (e.g. `network`, `notFound`, `memory`), safe to send as telemetry.
	 */
	readonly errorCode?: string;
}

export interface ILocalTranscriptionResult {
	/** Cumulative transcript for the active session. */
	readonly text: string;
	/** True for the final result emitted after `stop`. */
	readonly isFinal: boolean;
}

/**
 * On-device speech-to-text using a downloaded NeMo RNN-T model (Nemotron, run
 * directly on onnxruntime-node). Runs in a utility process. A single
 * transcription session is active at a time (dictation is a singleton in the
 * renderer).
 *
 * The renderer streams PCM16 mono 16 kHz audio via `pushAudio`; the service
 * emits interim transcripts on `onDidTranscribe` and a final one after `stop`.
 */
export interface ILocalTranscriptionService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether on-device transcription can run in this environment. False on web
	 * (no utility process) and on desktop platforms/architectures without an
	 * onnxruntime-node binary. When false, dictation is unavailable — there is
	 * no cloud fallback.
	 */
	readonly isSupported: boolean;

	/** Fires as the model downloads/loads so the UI can show progress. */
	readonly onDidChangeModelStatus: Event<ILocalTranscriptionModelStatus>;

	/** Fires with interim (and, after stop, final) transcripts. */
	readonly onDidTranscribe: Event<ILocalTranscriptionResult>;

	/** Current model status (e.g. to gate the dictation UI). */
	getModelStatus(): Promise<ILocalTranscriptionModelStatus>;

	/**
	 * Ensure the model is downloaded/loaded (idempotent) and begin a new
	 * transcription session. `cacheDir` is where model files are stored.
	 */
	start(options: { readonly cacheDir: string; readonly model?: string; readonly language?: string }): Promise<void>;

	/** Append captured audio (raw little-endian PCM16 mono 16 kHz). */
	pushAudio(chunk: VSBuffer): Promise<void>;

	/** Finish the session; resolves with the final transcript. */
	stop(): Promise<string>;

	/** Abort the session, discarding the transcript. */
	cancel(): Promise<void>;
}
