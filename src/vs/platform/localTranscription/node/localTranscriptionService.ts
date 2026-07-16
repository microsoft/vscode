/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import {
	ILocalTranscriptionModelStatus,
	ILocalTranscriptionResult,
	ILocalTranscriptionService,
	LocalTranscriptionModelState,
} from '../common/localTranscription.js';

/** Sample rate (Hz) the Whisper models expect; the renderer captures at this rate. */
const SAMPLE_RATE = 16000;

/** Default downloaded model. `base` balances quality and size (~faster than small). */
const DEFAULT_MODEL = 'onnx-community/whisper-base';

/** Minimum audio (seconds) before a first interim transcription is attempted. */
const MIN_INTERIM_SECONDS = 1.0;

/**
 * Upper bound (seconds) on how much audio interim passes will re-transcribe.
 * Each interim pass re-runs Whisper over all audio since recording began, so
 * cost grows with utterance length; past this we stop scheduling interims and
 * let the final pass produce the complete transcript, keeping interim CPU
 * bounded. The last interim result stays visible until stop().
 */
const MAX_INTERIM_SECONDS = 45;

/** Debounce (ms) between interim transcription passes while recording. */
const INTERIM_DEBOUNCE_MS = 1200;

/**
 * Silence (seconds) appended to the audio before the final transcription pass.
 * Whisper frequently fails to emit the last word when the recording ends
 * abruptly right after it (no trailing silence to mark the utterance end), so a
 * short pad of zeros gives the model the context it needs to finalize the tail.
 */
const FINAL_PASS_TRAILING_SILENCE_SECONDS = 0.5;

/**
 * transformers.js is a heavy, ESM-only dependency that also loads the native
 * onnxruntime-node addon. Import it lazily so forking the utility process stays
 * cheap; the model itself is only downloaded/loaded when dictation first runs.
 */
type Transformers = typeof import('@huggingface/transformers');
type ASRResult = { text?: string } | Array<{ text?: string }>;
type ASRPipeline = (audio: Float32Array, options?: Record<string, unknown>) => Promise<ASRResult>;

export class LocalTranscriptionService extends Disposable implements ILocalTranscriptionService {

	declare readonly _serviceBrand: undefined;

	readonly isSupported = true;

	private readonly _onDidChangeModelStatus = this._register(new Emitter<ILocalTranscriptionModelStatus>());
	readonly onDidChangeModelStatus: Event<ILocalTranscriptionModelStatus> = this._onDidChangeModelStatus.event;

	private readonly _onDidTranscribe = this._register(new Emitter<ILocalTranscriptionResult>());
	readonly onDidTranscribe: Event<ILocalTranscriptionResult> = this._onDidTranscribe.event;

	private _status: ILocalTranscriptionModelStatus = { state: LocalTranscriptionModelState.Idle };

	private _transformers: Transformers | undefined;
	private _pipeline: ASRPipeline | undefined;
	private _pipelinePromise: Promise<ASRPipeline> | undefined;
	private _loadedModel: string | undefined;

	/** Accumulated Float32 PCM for the active session (mono, 16 kHz). */
	private _samples: Float32Array[] = [];
	private _sampleCount = 0;
	private _language: string | undefined;
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

	async getModelStatus(): Promise<ILocalTranscriptionModelStatus> {
		return this._status;
	}

	private _setStatus(status: ILocalTranscriptionModelStatus): void {
		this._status = status;
		this._onDidChangeModelStatus.fire(status);
	}

	async start(options: { cacheDir: string; model?: string; language?: string }): Promise<void> {
		this._resetSession();
		this._language = options.language;
		this._sessionActive = true;
		// Kick off (or reuse) model loading; do not block starting capture on it.
		this._ensurePipeline(options.cacheDir, options.model ?? DEFAULT_MODEL).catch(() => { /* status already reported */ });
	}
	private async _ensurePipeline(cacheDir: string, model: string): Promise<ASRPipeline> {
		if (this._pipeline && this._loadedModel === model) {
			return this._pipeline;
		}
		if (this._pipelinePromise && this._loadedModel === model) {
			return this._pipelinePromise;
		}

		this._loadedModel = model;
		this._pipelinePromise = (async () => {
			try {
				if (!this._transformers) {
					this._transformers = await import('@huggingface/transformers');
				}
				const { pipeline, env } = this._transformers;
				// Store downloaded model files on disk so subsequent sessions
				// load without a network round-trip ("model management").
				env.cacheDir = cacheDir;
				env.allowRemoteModels = true;

				this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: 0 });
				const pipe = await pipeline('automatic-speech-recognition', model, {
					progress_callback: (p: { status?: string; progress?: number }) => {
						if (p.status === 'progress' && typeof p.progress === 'number') {
							this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: Math.min(1, p.progress / 100) });
						} else if (p.status === 'ready') {
							this._setStatus({ state: LocalTranscriptionModelState.Loading });
						}
					},
				});
				// The transformers.js pipeline() return type is a broad union that
				// isn't directly callable; narrow it to our ASR call signature.
				this._pipeline = pipe as unknown as ASRPipeline;
				this._setStatus({ state: LocalTranscriptionModelState.Ready });
				return this._pipeline;
			} catch (err) {
				this._pipeline = undefined;
				this._pipelinePromise = undefined;
				this._loadedModel = undefined;
				this._setStatus({ state: LocalTranscriptionModelState.Error, error: String(err instanceof Error ? err.message : err) });
				throw err;
			}
		})();
		return this._pipelinePromise;
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
		// Stop live interim passes once the utterance is long enough that
		// re-transcribing all of it each time gets expensive; the final pass on
		// stop() still transcribes the full recording.
		if (this._sampleCount > SAMPLE_RATE * MAX_INTERIM_SECONDS) {
			return;
		}
		this._interimTimer = setTimeout(() => {
			this._interimTimer = undefined;
			void this._runInference(false);
		}, INTERIM_DEBOUNCE_MS);
	}

	private async _runInference(isFinal: boolean): Promise<string> {
		const pipe = this._pipeline;
		if (!pipe || this._sampleCount === 0) {
			return this._lastText;
		}
		if (this._inferenceInFlight && !isFinal) {
			return this._lastText;
		}
		const generation = this._generation;
		this._inferenceInFlight = true;
		try {
			const audio = this._mergedSamples();
			// Pad the final pass with trailing silence so Whisper reliably emits
			// the last word even when the user stops speaking abruptly.
			const input = isFinal ? this._withTrailingSilence(audio, FINAL_PASS_TRAILING_SILENCE_SECONDS) : audio;
			const result = await pipe(input, {
				chunk_length_s: 30,
				stride_length_s: 5,
				language: this._language,
				task: 'transcribe',
			});
			// The session may have been cancelled/replaced while this inference
			// was running; drop the result so it can't leak into a later session.
			if (generation !== this._generation) {
				return this._lastText;
			}
			const text = (Array.isArray(result) ? result.map(r => r.text).join(' ') : result.text ?? '').trim();
			this._lastText = text;
			if (this._sessionActive || isFinal) {
				this._onDidTranscribe.fire({ text, isFinal });
			}
			return text;
		} finally {
			this._inferenceInFlight = false;
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

	/** Return `audio` with `seconds` of trailing silence (zeros) appended. */
	private _withTrailingSilence(audio: Float32Array, seconds: number): Float32Array {
		const padded = new Float32Array(audio.length + Math.round(SAMPLE_RATE * seconds));
		padded.set(audio, 0);
		return padded;
	}

	async stop(): Promise<string> {
		if (this._interimTimer) {
			clearTimeout(this._interimTimer);
			this._interimTimer = undefined;
		}
		// On first use the model may still be downloading/loading when the user
		// stops. Wait for it so the whole recording is transcribed instead of
		// being dropped and returning an empty string.
		if (!this._pipeline && this._pipelinePromise) {
			try {
				await this._pipelinePromise;
			} catch {
				// Load failed; status already reported as Error below we fall
				// through to the no-pipeline path.
			}
		}
		if (!this._pipeline) {
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
		this._language = undefined;
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
