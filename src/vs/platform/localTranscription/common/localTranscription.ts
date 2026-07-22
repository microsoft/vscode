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
	/**
	 * The leading portion of `text` that Foundry has already finalized (its
	 * endpointed segments). The remainder of `text` is the still-in-progress
	 * interim tail. Lets the renderer stop shimmering finalized text as soon as
	 * a segment is endpointed — including the last one during a trailing silence
	 * — instead of waiting for a later interim to confirm it stopped changing.
	 */
	readonly finalizedText?: string;
}


/**
 * On-device speech-to-text using a downloaded model. Transcription runs through
 * Microsoft's Foundry Local streaming ASR engine (onnxruntime + onnxruntime-genai
 * native runtime), which handles decoding, VAD and endpointing internally; the
 * default model is NVIDIA's `nemotron-speech-streaming-en-0.6b` streaming RNN-T
 * (the model the GitHub Copilot app ships for dictation). The model is chosen by
 * the `chat.speechToText.model` setting. Runs in a utility process. A single
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
	 * (no utility process) and on desktop platforms/architectures without a
	 * Foundry Local native runtime. When false, dictation is unavailable — there
	 * is no cloud fallback.
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
	 * transcription session. `cacheDir` is where model files are stored. `model`
	 * selects the on-device Foundry Local model; when omitted the service default
	 * is used. `language` optionally hints the spoken language.
	 *
	 * `proxyUrl`/`noProxy` bridge VS Code's `http.proxy`/`http.noProxy` settings
	 * into this utility process: when set, they are applied as the standard proxy
	 * environment variables before any download, so all provisioning legs — the
	 * addon tarball and NuGet core libraries (our own fetches) and the native
	 * Foundry Local *model* download — route through the proxy. When they are
	 * omitted, the process's inherited OS environment proxy vars still apply.
	 *
	 * `proxyStrictSSL === false` (VS Code's `http.proxyStrictSSL`) disables TLS
	 * certificate verification for the JavaScript download legs. `proxyAuthorization`
	 * (VS Code's `http.proxyAuthorization`, a `Basic <base64>` value) is folded into
	 * the proxy URL's credentials so both our fetches and the native model download
	 * authenticate to the proxy. TLS-intercepting proxies otherwise rely on the CA
	 * being in the OS trust store (matching `@vscode/proxy-agent` and the desktop
	 * app).
	 */
	start(options: { readonly cacheDir: string; readonly model?: string; readonly language?: string; readonly proxyUrl?: string; readonly noProxy?: string; readonly proxyStrictSSL?: boolean; readonly proxyAuthorization?: string }): Promise<void>;

	/** Append captured audio (raw little-endian PCM16 mono 16 kHz). */
	pushAudio(chunk: VSBuffer): Promise<void>;

	/** Finish the session; resolves with the final transcript. */
	stop(): Promise<string>;

	/** Abort the session, discarding the transcript. */
	cancel(): Promise<void>;
}
