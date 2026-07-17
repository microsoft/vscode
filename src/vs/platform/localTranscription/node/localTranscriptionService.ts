/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import {
	ILocalTranscriptionModelStatus,
	ILocalTranscriptionResult,
	ILocalTranscriptionService,
	LocalTranscriptionModelState,
} from '../common/localTranscription.js';
import { NemotronTranscriber } from './nemotronTranscriber.js';

/** Sample rate (Hz) the model expects; the renderer captures at this rate. */
const SAMPLE_RATE = 16000;

/**
 * On-device model used for dictation: NVIDIA Nemotron RNN-T — a streaming,
 * multilingual (35+ languages, auto-detected) transducer, matching the model
 * the GitHub Copilot desktop app ships.
 */
const DEFAULT_MODEL = 'onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4';

/** Minimum audio (seconds) before a first interim transcription is attempted. */
const MIN_INTERIM_SECONDS = 1.0;

/** Debounce (ms) between interim transcription passes while recording. */
const INTERIM_DEBOUNCE_MS = 1200;

/**
 * Map a raw model download/load error message to a fixed, low-cardinality code
 * safe to emit as telemetry. The raw message can contain paths, URLs, or other
 * dynamic detail, so only the returned allowlisted code should be reported.
 */
function classifyModelError(message: string): string {
	const text = message.toLowerCase();
	if (/\b(404|not found|no such file|does not exist|could not locate|repository not found)\b/.test(text)) {
		return 'notFound';
	}
	if (/\b(network|fetch|econn|enotfound|etimedout|socket|dns|offline|proxy|tls|certificate|getaddrinfo)\b/.test(text)) {
		return 'network';
	}
	if (/\b(out of memory|oom|enomem|allocation failed|cannot allocate)\b/.test(text)) {
		return 'memory';
	}
	if (/\b(enospc|no space left|disk)\b/.test(text)) {
		return 'disk';
	}
	if (/\b(eacces|eperm|permission denied|access is denied)\b/.test(text)) {
		return 'permission';
	}
	return 'unknown';
}

export class LocalTranscriptionService extends Disposable implements ILocalTranscriptionService {

	declare readonly _serviceBrand: undefined;

	readonly isSupported = true;

	private readonly _onDidChangeModelStatus = this._register(new Emitter<ILocalTranscriptionModelStatus>());
	readonly onDidChangeModelStatus: Event<ILocalTranscriptionModelStatus> = this._onDidChangeModelStatus.event;

	private readonly _onDidTranscribe = this._register(new Emitter<ILocalTranscriptionResult>());
	readonly onDidTranscribe: Event<ILocalTranscriptionResult> = this._onDidTranscribe.event;

	private _status: ILocalTranscriptionModelStatus = { state: LocalTranscriptionModelState.Idle };

	/** The streaming RNN-T transducer; undefined until loaded. */
	private _nemotron: NemotronTranscriber | undefined;
	private _nemotronPromise: Promise<NemotronTranscriber> | undefined;
	private _loadedModel: string | undefined;

	/** Accumulated Float32 PCM for the active session (mono, 16 kHz). */
	private _samples: Float32Array[] = [];
	private _sampleCount = 0;
	private _sessionActive = false;

	/**
	 * Monotonically bumped whenever a session starts or is reset, so a slow
	 * inference started for one session can detect that it is now stale and
	 * avoid emitting its transcript into a later session.
	 */
	private _generation = 0;

	/** Coalesces interim passes so only one inference runs at a time. */
	private _inferenceInFlight = false;
	private _interimTimer: ReturnType<typeof setTimeout> | undefined;
	private _lastText = '';

	/**
	 * Set when a session is torn down while an inference is still awaiting an
	 * ONNX run: resetting the transducer's streaming state right then would race
	 * with the in-flight call (which would resume and write cache/LSTM/token
	 * results into the freshly-reset state, contaminating the next session). The
	 * reset is deferred until that inference finishes instead.
	 */
	private _pendingStreamReset = false;

	constructor() {
		super();
		// Release the ~800MB of native ONNX allocations when the service (and its
		// utility process) goes away, rather than leaking them for its lifetime.
		this._register(toDisposable(() => { void this._nemotron?.release(); this._nemotron = undefined; }));
	}

	async getModelStatus(): Promise<ILocalTranscriptionModelStatus> {
		return this._status;
	}

	private _setStatus(status: ILocalTranscriptionModelStatus): void {
		this._status = status;
		this._onDidChangeModelStatus.fire(status);
	}

	async start(options: { cacheDir: string; model?: string; language?: string }): Promise<void> {
		this._resetSession();
		this._sessionActive = true;
		// Kick off (or reuse) model loading; do not block starting capture on it.
		this._ensureModel(options.cacheDir, options.model ?? DEFAULT_MODEL).catch(() => { /* status already reported */ });
	}

	/**
	 * Download (if needed) and load the Nemotron RNN-T transducer. Idempotent:
	 * a load already in flight (or a model already loaded) is reused. The three
	 * ONNX graphs are driven directly via onnxruntime-node, since this is a
	 * transducer that transformers.js cannot run.
	 */
	private async _ensureModel(cacheDir: string, model: string): Promise<NemotronTranscriber> {
		if (this._nemotron && this._loadedModel === model) {
			return this._nemotron;
		}
		if (this._nemotronPromise && this._loadedModel === model) {
			return this._nemotronPromise;
		}

		this._loadedModel = model;
		this._nemotronPromise = (async () => {
			try {
				this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: 0 });

				// Reaching here means we are (re)loading rather than reusing an
				// already-loaded backend, so release any previous transducer's
				// native sessions before opening the replacement.
				if (this._nemotron) {
					const previous = this._nemotron;
					this._nemotron = undefined;
					await previous.release();
				}

				// `prepare` reports `downloaded:false` progress callbacks only for
				// bytes actually fetched from the network; a fully-cached model
				// loads without them. Track that so the model-prepare telemetry
				// can distinguish a first-use download from a cache hit.
				let didDownload = false;
				const transcriber = new NemotronTranscriber();
				try {
					await transcriber.prepare(cacheDir, model, ({ downloaded, progress }) => {
						if (downloaded) {
							this._setStatus({ state: LocalTranscriptionModelState.Loading });
						} else {
							didDownload = true;
							this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: progress ?? 0 });
						}
					});
				} catch (err) {
					// Release anything the failed load left open before rethrowing.
					await transcriber.release();
					throw err;
				}
				this._nemotron = transcriber;
				this._setStatus({ state: LocalTranscriptionModelState.Ready, downloaded: didDownload });
				return transcriber;
			} catch (err) {
				this._nemotron = undefined;
				this._nemotronPromise = undefined;
				this._loadedModel = undefined;
				const message = String(err instanceof Error ? err.message : err);
				this._setStatus({ state: LocalTranscriptionModelState.Error, error: message, errorCode: classifyModelError(message) });
				throw err;
			}
		})();
		return this._nemotronPromise;
	}

	async pushAudio(chunk: VSBuffer): Promise<void> {
		if (!this._sessionActive) {
			return;
		}
		this._samples.push(pcm16ToFloat32(chunk));
		this._sampleCount += chunk.byteLength / 2;
		this._scheduleInterim();
	}

	private _scheduleInterim(): void {
		if (this._interimTimer || this._inferenceInFlight) {
			return;
		}
		if (this._sampleCount < SAMPLE_RATE * MIN_INTERIM_SECONDS) {
			return;
		}
		this._interimTimer = setTimeout(() => {
			this._interimTimer = undefined;
			void this._runInference(false);
		}, INTERIM_DEBOUNCE_MS);
	}

	private async _runInference(isFinal: boolean): Promise<string> {
		const nemotron = this._nemotron;
		if (!nemotron || this._sampleCount === 0) {
			return this._lastText;
		}
		if (this._inferenceInFlight && !isFinal) {
			return this._lastText;
		}
		const generation = this._generation;
		this._inferenceInFlight = true;
		try {
			// Streaming transducer: feed the cumulative buffer; only the newly
			// appended samples are processed and prior tokens are carried
			// forward, so the tail is flushed on the final pass (no trailing
			// silence needed).
			const audio = this._mergedSamples();
			const text = (await nemotron.transcribeStreaming(audio, isFinal)).trim();
			// The session may have been cancelled/replaced while this inference
			// was running; drop the result so it can't leak into a later session.
			if (generation !== this._generation) {
				return this._lastText;
			}
			this._lastText = text;
			if (this._sessionActive || isFinal) {
				this._onDidTranscribe.fire({ text, isFinal });
			}
			return text;
		} finally {
			this._inferenceInFlight = false;
			// A session torn down mid-inference deferred its stream reset to avoid
			// racing this call; now that it has finished mutating the transducer's
			// streaming state, apply the reset so the next session starts clean.
			if (this._pendingStreamReset) {
				this._pendingStreamReset = false;
				this._nemotron?.resetStream();
			}
		}
	}

	private _mergedSamples(): Float32Array {
		if (this._samples.length === 1) {
			return this._samples[0];
		}
		const merged = new Float32Array(this._sampleCount);
		let offset = 0;
		for (const part of this._samples) {
			merged.set(part, offset);
			offset += part.length;
		}
		this._samples = [merged];
		return merged;
	}

	async stop(): Promise<string> {
		if (this._interimTimer) {
			clearTimeout(this._interimTimer);
			this._interimTimer = undefined;
		}
		// On first use the model may still be downloading/loading when the user
		// stops. Wait for it so the whole recording is transcribed instead of
		// being dropped and returning an empty string.
		if (!this._nemotron && this._nemotronPromise) {
			try {
				await this._nemotronPromise;
			} catch {
				// Load failed; status already reported as Error. Fall through to
				// the no-model path below.
			}
		}
		if (!this._nemotron) {
			// Model never finished loading; nothing to transcribe.
			const text = this._lastText;
			this._resetSession();
			return text;
		}
		// Wait out any in-flight interim pass, then do a final full transcription.
		while (this._inferenceInFlight) {
			await new Promise(res => setTimeout(res, 50));
		}
		const text = await this._runInference(true);
		this._resetSession();
		return text;
	}

	async cancel(): Promise<void> {
		if (this._interimTimer) {
			clearTimeout(this._interimTimer);
			this._interimTimer = undefined;
		}
		this._resetSession();
	}

	private _resetSession(): void {
		this._sessionActive = false;
		// Invalidate any inference still running for the session being torn down.
		this._generation++;
		this._samples = [];
		this._sampleCount = 0;
		this._lastText = '';
		// Drop the streaming transducer's per-session state (caches, LSTM state,
		// emitted tokens) so the next session starts from a clean slate. If an
		// inference is still awaiting an ONNX run, resetting now would race it
		// (it would resume and write results into the reset state); defer the
		// reset until that call finishes instead.
		if (this._inferenceInFlight) {
			this._pendingStreamReset = true;
		} else {
			this._nemotron?.resetStream();
		}
	}
}

/** Convert little-endian PCM16 bytes into normalized Float32 samples in [-1, 1). */
function pcm16ToFloat32(buffer: VSBuffer): Float32Array {
	const bytes = buffer.buffer;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const count = Math.floor(bytes.byteLength / 2);
	const out = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		out[i] = view.getInt16(i * 2, true) / 32768;
	}
	return out;
}
