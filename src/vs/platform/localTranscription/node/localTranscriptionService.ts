/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { dirname, join } from '../../../base/common/path.js';
import { ensureFoundryLocalRuntime } from './foundryLocalRuntime.js';
import {
	ILocalTranscriptionModelStatus,
	ILocalTranscriptionResult,
	ILocalTranscriptionService,
	LocalTranscriptionModelState,
} from '../common/localTranscription.js';

/** PCM audio format the renderer captures and streams: mono 16 kHz signed 16-bit. */
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/**
 * Default on-device model. `nemotron-speech-streaming-en-0.6b` is the NVIDIA
 * Nemotron streaming RNN-T model the GitHub Copilot app ships for dictation; it
 * runs through Foundry Local's native streaming ASR engine (ORT + ORT-GenAI).
 */
const DEFAULT_MODEL = 'nemotron-speech-streaming-en-0.6b';

/** Application name reported to Foundry Local for logs/telemetry and its data dir. */
const FOUNDRY_APP_NAME = 'vscode-dictation';

/**
 * Directory holding the on-demand Foundry Local native runtime (addon + core
 * libraries). Derived as a sibling of the model cache dir so both live under VS
 * Code's cache home; kept separate from model files since it is versioned by SDK
 * version and provisioned independently.
 */
function runtimeCacheDir(modelCacheDir: string): string {
	return join(dirname(modelCacheDir), 'chatDictationRuntime');
}

/**
 * Foundry Local JS SDK. It is an ESM package that loads a native addon
 * (`foundry_local_napi.node`) plus the Foundry Local Core / onnxruntime /
 * onnxruntime-genai shared libraries. Import it lazily so forking the utility
 * process stays cheap; the model itself is only downloaded/loaded when dictation
 * first runs.
 */
type FoundryLocal = typeof import('foundry-local-sdk');
type FoundryLocalManager = import('foundry-local-sdk').FoundryLocalManager;
type IModel = import('foundry-local-sdk').IModel;
type LiveAudioTranscriptionSession = import('foundry-local-sdk').LiveAudioTranscriptionSession;
type LiveAudioTranscriptionResponse = import('foundry-local-sdk').LiveAudioTranscriptionResponse;

/**
 * Map a raw model download/load error message to a fixed, low-cardinality code
 * safe to emit as telemetry. The raw message can contain paths, URLs, or other
 * dynamic detail, so only the returned allowlisted code should be reported.
 */
function classifyModelError(message: string): string {
	const text = message.toLowerCase();
	if (/\b(404|not found|no such file|does not exist|could not locate|repository not found|unknown model)\b/.test(text)) {
		return 'notFound';
	}
	if (/\b(network|fetch|econn|enotfound|etimedout|socket|dns|offline|proxy|tls|certificate|getaddrinfo|feed)\b/.test(text)) {
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

/**
 * Choose the separator to place between two transcript fragments. Mirrors the
 * GitHub Copilot app's joining rule: no space if the left already ends in an
 * opener/whitespace or the right begins with whitespace or closing punctuation,
 * otherwise a single space.
 */
function transcriptSeparator(current: string, next: string): '' | ' ' {
	if (!current || !next || /[\s([{]$/.test(current) || /^\s|^[,.;:!?)}\]'"]/.test(next)) {
		return '';
	}
	return ' ';
}

/**
 * Append a non-final (interim) transcript chunk to the current partial text.
 * Foundry Local emits interim results for the in-progress segment as *deltas* —
 * each carries only the newly recognized text (with its own leading/trailing
 * spacing), NOT the cumulative partial so far — so they must be concatenated
 * verbatim rather than replaced. Replacing would drop earlier partial words
 * (e.g. interim "hello" then " world" must yield "hello world", not "world").
 * Mirrors the GitHub Copilot app's `appendVoiceTranscriptChunk`.
 */
function appendTranscriptChunk(current: string, next: string): string {
	if (!next.trim()) {
		return current;
	}
	if (!current) {
		return next.trimStart();
	}
	return `${current}${next}`;
}

interface IFinalSegment {
	readonly order: number;
	readonly startTime: number | null;
	readonly endTime: number | null;
	text: string;
}

/**
 * Accumulates the cumulative transcript from Foundry Local's per-segment
 * streaming results. Foundry emits results whose text is scoped to a single
 * endpointed segment (NOT the whole session), and re-emits the same segment
 * multiple times as it refines the hypothesis — so finalized segments must be
 * keyed (by their start/end time) and replaced on refinement, then the distinct
 * segments joined in time order. Blindly appending every `is_final` result would
 * duplicate words. Mirrors the GitHub Copilot app's `VoiceTranscriptAccumulator`.
 */
class TranscriptAccumulator {
	private readonly _segments = new Map<string, IFinalSegment>();
	private _nextOrder = 0;

	/** Record a finalized segment, replacing an earlier revision of the same one. */
	addFinal(text: string, startTime: number | null, endTime: number | null): void {
		const normalized = text.trim();
		if (!normalized) {
			return;
		}
		const key = (startTime !== null || endTime !== null)
			? `${startTime ?? 'na'}:${endTime ?? 'na'}`
			: `untimed:${this._nextOrder}`;
		const existing = this._segments.get(key);
		if (existing) {
			existing.text = normalized;
			return;
		}
		this._segments.set(key, { order: this._nextOrder, startTime, endTime, text: normalized });
		this._nextOrder++;
	}

	/** The cumulative finalized transcript, segments joined in time order. */
	getText(): string {
		return [...this._segments.values()]
			.sort((a, b) => {
				if (a.startTime !== null && b.startTime !== null) {
					return a.startTime - b.startTime;
				}
				if (a.startTime !== null) {
					return -1;
				}
				if (b.startTime !== null) {
					return 1;
				}
				return a.order - b.order;
			})
			.reduce((text, seg) => `${text}${transcriptSeparator(text, seg.text)}${seg.text}`, '')
			.trim();
	}

	reset(): void {
		this._segments.clear();
		this._nextOrder = 0;
	}
}

/**
 * On-device speech-to-text backed by Foundry Local's streaming ASR engine. Runs
 * in a utility process. A single transcription session is active at a time
 * (dictation is a singleton in the renderer): the renderer streams PCM16 mono
 * 16 kHz audio via `pushAudio`, and the service emits interim transcripts on
 * `onDidTranscribe` and a final one after `stop`.
 */
export class LocalTranscriptionService extends Disposable implements ILocalTranscriptionService {

	declare readonly _serviceBrand: undefined;

	readonly isSupported = true;

	private readonly _onDidChangeModelStatus = this._register(new Emitter<ILocalTranscriptionModelStatus>());
	readonly onDidChangeModelStatus: Event<ILocalTranscriptionModelStatus> = this._onDidChangeModelStatus.event;

	private readonly _onDidTranscribe = this._register(new Emitter<ILocalTranscriptionResult>());
	readonly onDidTranscribe: Event<ILocalTranscriptionResult> = this._onDidTranscribe.event;

	private _status: ILocalTranscriptionModelStatus = { state: LocalTranscriptionModelState.Idle };

	private _sdk: FoundryLocal | undefined;
	private _manager: FoundryLocalManager | undefined;
	private _model: IModel | undefined;
	private _loadedModelId: string | undefined;
	/** In-flight (or resolved) model download+load for the selected model. */
	private _modelPromise: Promise<IModel> | undefined;

	/** The active streaming session, once `start()` has opened it. */
	private _session: LiveAudioTranscriptionSession | undefined;
	/** Resolves when the background stream consumer for `_session` has drained. */
	private _consumePromise: Promise<void> | undefined;
	/** In-flight model download/load + session open for the active recording. */
	private _openPromise: Promise<void> | undefined;
	private _sessionActive = false;

	/** Cumulative finalized transcript, accumulated per timed segment. */
	private readonly _accumulator = new TranscriptAccumulator();
	/** Latest interim (not-yet-finalized) segment text. */
	private _partialText = '';
	/**
	 * Set when the native streaming session fails mid-recording (its result
	 * stream throws). `stop()` rethrows this so the renderer treats the session
	 * as failed instead of reporting the partial transcript as a success.
	 */
	private _runtimeError: Error | undefined;

	/**
	 * PCM chunks captured before the model finished loading and the session
	 * opened. Flushed in order once the session starts so no leading audio is
	 * dropped while the first-use download/load completes.
	 */
	private _pendingChunks: Uint8Array[] = [];

	/**
	 * Serializes every `session.append()` through a single FIFO chain. Both the
	 * buffered-backlog flush and live `pushAudio()` enqueue here, so audio is
	 * always appended to native core in capture order — even across the first-use
	 * handoff — and `stop()` can await this to guarantee the final chunk lands
	 * before `session.stop()` drains the stream. The stored tail swallows
	 * rejections so one failed append doesn't break ordering for the rest; the
	 * real (rejectable) promise is returned to callers that need to observe it.
	 */
	private _appendChain: Promise<void> = Promise.resolve();

	/**
	 * Monotonically bumped whenever a session starts or is reset, so a slow
	 * session opened for one recording can detect that it is now stale and avoid
	 * emitting its transcript into a later session.
	 */
	private _generation = 0;

	constructor() {
		super();
		// Tear down the active session (and its native ASR resources) when the
		// service — and its utility process — goes away.
		this._register(toDisposable(() => { void this._disposeSession(); }));
	}

	async getModelStatus(): Promise<ILocalTranscriptionModelStatus> {
		return this._status;
	}

	private _setStatus(status: ILocalTranscriptionModelStatus): void {
		this._status = status;
		this._onDidChangeModelStatus.fire(status);
	}

	async start(options: { cacheDir: string; model?: string; language?: string; proxyUrl?: string; noProxy?: string; proxyStrictSSL?: boolean; proxyAuthorization?: string }): Promise<void> {
		// Bridge VS Code's proxy settings into this process's environment before any
		// first-use download, so both our own fetches and the native Foundry Local
		// model download route through the configured proxy (they read the OS/env
		// proxy, not VS Code settings directly).
		this._applyProxyEnv(options.proxyUrl, options.noProxy, options.proxyStrictSSL, options.proxyAuthorization);

		// Reset any prior session before starting a new one.
		await this._disposeSession();
		this._generation++;
		const generation = this._generation;
		this._sessionActive = true;
		this._accumulator.reset();
		this._partialText = '';
		this._pendingChunks = [];
		this._runtimeError = undefined;

		const model = options.model ?? DEFAULT_MODEL;
		const language = options.language;
		// Do not block capture on the (possibly first-use) model download/load and
		// session open; buffer audio until the session is ready, then flush it.
		this._openPromise = this._openSession(options.cacheDir, model, language, generation);
		this._openPromise.catch(() => { /* status already reported */ });
	}

	/**
	 * Apply VS Code's proxy settings as environment variables for this process, so
	 * every download leg (our fetches and the native model download) honors a proxy
	 * configured only in VS Code (not in the OS environment):
	 * - `http.proxy`/`http.noProxy` → `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`.
	 * - `http.proxyAuthorization` (a `Basic <base64>` value) → folded into the proxy
	 *   URL's userinfo so both our `HttpsProxyAgent` and the native HTTP stack send
	 *   `Proxy-Authorization`. Non-`Basic` schemes (e.g. Negotiate/NTLM) cannot be
	 *   carried this way and are left to OS-level auth.
	 * - `http.proxyStrictSSL === false` → disable TLS certificate verification for
	 *   the Node download legs. The native model leg still requires the CA in the OS
	 *   trust store.
	 *
	 * A blank/undefined `proxyUrl` leaves any inherited environment proxy untouched.
	 */
	private _applyProxyEnv(proxyUrl: string | undefined, noProxy: string | undefined, proxyStrictSSL: boolean | undefined, proxyAuthorization: string | undefined): void {
		if (proxyStrictSSL === false) {
			// Covers both Node legs uniformly (our fetch and the SDK's bare
			// `https.get` NuGet install); scoped to this dedicated utility process.
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		}
		if (!proxyUrl) {
			return;
		}
		const effectiveProxyUrl = this._embedProxyCredentials(proxyUrl, proxyAuthorization);
		process.env.HTTPS_PROXY = effectiveProxyUrl;
		process.env.HTTP_PROXY = effectiveProxyUrl;
		if (noProxy) {
			process.env.NO_PROXY = noProxy;
		}
	}

	/**
	 * Fold a `Basic <base64>` `http.proxyAuthorization` value into `proxyUrl`'s
	 * userinfo so proxy credentials survive the env-var bridge to every leg.
	 * Returns `proxyUrl` unchanged when there is nothing to add or the header is
	 * not a decodable `Basic` credential or the URL already carries credentials.
	 */
	private _embedProxyCredentials(proxyUrl: string, proxyAuthorization: string | undefined): string {
		if (!proxyAuthorization) {
			return proxyUrl;
		}
		const basic = /^Basic\s+(?<token>[A-Za-z0-9+/=]+)$/i.exec(proxyAuthorization.trim());
		if (!basic?.groups?.token) {
			return proxyUrl;
		}
		let parsed: URL;
		try {
			parsed = new URL(proxyUrl);
		} catch {
			return proxyUrl;
		}
		if (parsed.username || parsed.password) {
			return proxyUrl;
		}
		const decoded = Buffer.from(basic.groups.token, 'base64').toString('utf8');
		const separator = decoded.indexOf(':');
		if (separator < 0) {
			return proxyUrl;
		}
		parsed.username = encodeURIComponent(decoded.slice(0, separator));
		parsed.password = encodeURIComponent(decoded.slice(separator + 1));
		return parsed.toString();
	}

	/**
	 * Ensure the Foundry Local manager exists, the selected model is downloaded
	 * and loaded, and a fresh live transcription session is started. Buffered
	 * audio captured while this was in flight is flushed once the session opens.
	 */
	private async _openSession(cacheDir: string, modelId: string, language: string | undefined, generation: number): Promise<void> {
		try {
			const model = await this._ensureModel(cacheDir, modelId);
			if (generation !== this._generation) {
				return; // superseded by a newer session
			}

			const audioClient = model.createAudioClient();
			if (language) {
				audioClient.settings.language = language;
			}
			const session = audioClient.createLiveTranscriptionSession();
			session.settings.sampleRate = SAMPLE_RATE;
			session.settings.channels = CHANNELS;
			session.settings.bitsPerSample = BITS_PER_SAMPLE;
			if (language) {
				session.settings.language = language;
			}
			await session.start();

			if (generation !== this._generation) {
				// A newer session replaced this one while it was opening; discard.
				await session.dispose();
				return;
			}

			this._session = session;
			this._setStatus({ state: LocalTranscriptionModelState.Ready });

			// Consume streaming results in the background, accumulating a
			// cumulative transcript and emitting interims as segments arrive.
			this._consumePromise = this._consume(session, generation);

			// Flush any audio captured before the session was ready, in order.
			// Enqueue synchronously (no `await` before the loop completes) so the
			// entire backlog is queued ahead of any live `pushAudio()` append —
			// exposing `_session` above must not let a freshly captured chunk jump
			// ahead of the buffered backlog.
			const buffered = this._pendingChunks;
			this._pendingChunks = [];
			for (const chunk of buffered) {
				if (generation !== this._generation) {
					break;
				}
				this._enqueueAppend(session, generation, chunk).catch(err => {
					if (generation === this._generation) {
						const message = String(err instanceof Error ? err.message : err);
						this._setStatus({ state: LocalTranscriptionModelState.Error, error: message, errorCode: classifyModelError(message) });
					}
				});
			}
		} catch (err) {
			if (generation === this._generation) {
				const message = String(err instanceof Error ? err.message : err);
				this._setStatus({ state: LocalTranscriptionModelState.Error, error: message, errorCode: classifyModelError(message) });
			}
			throw err;
		}
	}

	/**
	 * Append `chunk` to `session` after every previously enqueued append has
	 * completed, preserving capture order. Returns a promise that rejects if this
	 * particular append fails (for callers that must surface it); the internal
	 * chain continues regardless so ordering is preserved for later chunks.
	 */
	private _enqueueAppend(session: LiveAudioTranscriptionSession, generation: number, chunk: Uint8Array): Promise<void> {
		const result = this._appendChain.then(() => {
			if (generation !== this._generation || this._session !== session) {
				return; // superseded/reset; drop stale append
			}
			return session.append(chunk);
		});
		this._appendChain = result.catch(() => { /* keep the chain alive after a failed append */ });
		return result;
	}

	/**
	 * Download (if needed) and load the selected model through Foundry Local,
	 * reporting download/load progress via the model status. Idempotent: a load
	 * already in flight (or the same model already loaded) is reused.
	 */
	private async _ensureModel(cacheDir: string, modelId: string): Promise<IModel> {
		if (this._model && this._loadedModelId === modelId) {
			return this._model;
		}
		if (this._modelPromise && this._loadedModelId === modelId) {
			return this._modelPromise;
		}

		this._loadedModelId = modelId;
		this._modelPromise = (async () => {
			try {
				this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: 0 });

				// Ensure the Foundry Local native runtime (N-API addon + core
				// libraries) is available before loading the SDK. We do not ship
				// it — the addon requires a newer glibc than our minimum supported
				// Linux distros — so it is downloaded on demand into a per-user
				// cache and the SDK loader is pointed at it via env var. This is a
				// no-op once cached.
				const nativeDir = await ensureFoundryLocalRuntime(runtimeCacheDir(cacheDir), CancellationToken.None);
				process.env.VSCODE_FOUNDRY_LOCAL_NATIVE_DIR = nativeDir;

				if (!this._sdk) {
					this._sdk = await import('foundry-local-sdk');
				}
				if (!this._manager) {
					// Store downloaded model files under VS Code's cache dir so
					// subsequent sessions load without re-downloading ("model
					// management"). `createAsync` avoids blocking the event loop
					// during native init.
					this._manager = await this._sdk.FoundryLocalManager.createAsync({
						appName: FOUNDRY_APP_NAME,
						modelCacheDir: cacheDir,
						logLevel: 'warn',
					});
				}

				const model = await this._manager.catalog.getModel(modelId);

				let didDownload = false;
				if (!model.isCached) {
					didDownload = true;
					await model.download((percent: number) => {
						this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: Math.min(1, Math.max(0, percent / 100)) });
					});
				}

				this._setStatus({ state: LocalTranscriptionModelState.Loading });
				await model.load();

				this._model = model;
				this._setStatus({ state: LocalTranscriptionModelState.Ready, downloaded: didDownload });
				return model;
			} catch (err) {
				this._model = undefined;
				this._modelPromise = undefined;
				this._loadedModelId = undefined;
				throw err;
			}
		})();
		return this._modelPromise;
	}

	/**
	 * Drain the session's result stream, maintaining a cumulative transcript.
	 * Foundry emits per-segment results flagged `is_final`; a finalized segment is
	 * recorded (and replaced if later refined) in the accumulator, while a
	 * non-final result is the interim tail of the segment currently being spoken.
	 * Each update fires the full cumulative transcript so the renderer can shimmer
	 * the interim tail and solidify finalized text.
	 */
	private async _consume(session: LiveAudioTranscriptionSession, generation: number): Promise<void> {
		try {
			for await (const result of session.getStream()) {
				if (generation !== this._generation) {
					break;
				}
				const text = this._resultText(result);
				if (result.is_final) {
					this._accumulator.addFinal(text, result.start_time ?? null, result.end_time ?? null);
					this._partialText = '';
				} else {
					// Interim results are deltas of the in-progress segment; append
					// them (preserving their own spacing) rather than replacing, so
					// earlier partial words are not lost.
					this._partialText = appendTranscriptChunk(this._partialText, text);
				}
				if (this._sessionActive) {
					this._onDidTranscribe.fire({ text: this._cumulativeText(), isFinal: false, finalizedText: this._accumulator.getText() });
				}
			}
		} catch (err) {
			// A native streaming/push failure terminates the stream. If it happened
			// while recording (not during our own teardown), record it and surface
			// an error status so the renderer tears the session down and informs the
			// user; stop() also rethrows it rather than reporting a false success.
			if (generation === this._generation && this._sessionActive) {
				const error = err instanceof Error ? err : new Error(String(err));
				this._runtimeError = error;
				this._setStatus({ state: LocalTranscriptionModelState.Error, error: error.message, errorCode: 'runtime' });
			}
		}
	}

	/** Finalized transcript plus the current interim tail, joined naturally. */
	private _cumulativeText(): string {
		const finalized = this._accumulator.getText();
		const partial = this._partialText;
		if (!partial) {
			return finalized;
		}
		if (!finalized) {
			return partial;
		}
		return `${finalized}${transcriptSeparator(finalized, partial)}${partial}`;
	}

	private _resultText(result: LiveAudioTranscriptionResponse): string {
		const part = result.content?.[0];
		// Return the raw text (not trimmed): interim deltas carry significant
		// leading/trailing spacing used to concatenate them. `addFinal` trims
		// finalized segments itself.
		return part?.text ?? part?.transcript ?? '';
	}

	async pushAudio(chunk: VSBuffer): Promise<void> {
		if (!this._sessionActive) {
			return;
		}
		const bytes = chunk.buffer;
		// Copy out of the shared VSBuffer backing store; `append` takes ownership
		// of the bytes it queues to native core.
		const pcm = new Uint8Array(bytes.byteLength);
		pcm.set(bytes);
		if (this._session) {
			// Route through the shared append queue so this live chunk lands
			// after any still-draining buffered backlog (preserving order across
			// the first-use handoff). Let a rejection propagate: the renderer's
			// pushAudio().catch fails the session so dictation doesn't silently
			// continue while every subsequent chunk is dropped. Late failures
			// after stop() are ignored by the renderer.
			await this._enqueueAppend(this._session, this._generation, pcm);
		} else {
			// Model still loading / session not open yet: buffer until it is.
			this._pendingChunks.push(pcm);
		}
	}

	async stop(): Promise<string> {
		const generation = this._generation;
		this._sessionActive = false;

		// Always wait for the in-flight session open to settle. `_session` is
		// assigned before `_openSession` finishes flushing the buffered audio it
		// captured during model load, so stopping right after the session opens
		// must not race that flush — otherwise `session.stop()` can reject the
		// remaining appends and return a truncated transcript.
		if (this._openPromise) {
			try {
				await this._openPromise;
			} catch {
				// Load failed; status already reported as Error.
			}
		}

		if (generation !== this._generation) {
			return '';
		}

		const session = this._session;
		if (!session) {
			// Model never finished loading; nothing to transcribe.
			const text = this._cumulativeText();
			this._resetSessionState();
			return text;
		}

		try {
			// Drain every queued append (buffered backlog + live chunks) so the
			// final captured audio reaches native core before we stop — otherwise
			// `stop()` can complete the stream while the tail append is still
			// pending, truncating the transcript.
			try {
				await this._appendChain;
			} catch { /* individual append failures already surfaced */ }
			// `stop()` drains any buffered audio, emits final results into the
			// stream, then completes it — so the consumer loop ends after this.
			await session.stop();
		} catch {
			// Best-effort: fall through to whatever transcript we accumulated.
		}
		if (this._consumePromise) {
			try {
				await this._consumePromise;
			} catch { /* consumer swallows its own errors */ }
		}

		// The native stream failed mid-recording: fail the stop rather than
		// reporting the partial transcript as a successful dictation result.
		const runtimeError = this._runtimeError;
		if (runtimeError && generation === this._generation) {
			await this._disposeSession();
			this._resetSessionState();
			throw runtimeError;
		}

		const text = this._cumulativeText();
		if (generation === this._generation) {
			// On stop everything is finalized: no shimmering tail remains.
			this._onDidTranscribe.fire({ text, isFinal: true, finalizedText: text });
		}
		await this._disposeSession();
		this._resetSessionState();
		return text;
	}

	async cancel(): Promise<void> {
		this._sessionActive = false;
		this._generation++;
		await this._disposeSession();
		this._resetSessionState();
	}

	private async _disposeSession(): Promise<void> {
		const session = this._session;
		this._session = undefined;
		const consume = this._consumePromise;
		this._consumePromise = undefined;
		if (session) {
			try {
				await session.dispose();
			} catch { /* best-effort teardown */ }
		}
		if (consume) {
			try {
				await consume;
			} catch { /* consumer swallows its own errors */ }
		}
	}

	private _resetSessionState(): void {
		this._sessionActive = false;
		this._accumulator.reset();
		this._partialText = '';
		this._pendingChunks = [];
		this._appendChain = Promise.resolve();
		this._runtimeError = undefined;
	}
}
