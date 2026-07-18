/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { localize } from '../../../../../nls.js';
import { AgentsVoiceStorageKeys } from '../../../../contrib/agentsVoice/common/agentsVoice.js';

export const IMicCaptureService = createDecorator<IMicCaptureService>('micCaptureService');

/**
 * Per-PTT-press diagnostic emitted after `pttUp` once the diagnostic
 * window closes. Logged + sent to backend so we can correlate frontend
 * audio bookkeeping with backend ASR results via `turnId`.
 *
 * Drain model: after `pttUp` the service keeps streaming audio chunks
 * for a fixed "drain window" (~500ms by default). The drain ends as
 * soon as it has shipped enough samples to cover the window (or a
 * fallback timer trips if `onaudioprocess` stops firing). Only AFTER
 * the drain has closed does `_onPttEnd` fire. The diagnostic window is
 * intentionally LONGER than the drain window so any audio still
 * produced after drain end (within the diagnostic window) is counted
 * as `postReleaseCallbacks` -- a direct signal that the drain window
 * is too short for this device/load and the fix needs to extend it.
 *
 * Field interpretation:
 *  - `drainChunks` / `drainSamples` => audio captured during the drain
 *    window and shipped to the backend. Non-zero in normal operation.
 *  - `postReleaseCallbacks > 0` => the WebAudio pipeline produced more
 *    audio AFTER the drain window closed but before the diagnostic
 *    window. This audio was DROPPED; if it happens often the drain
 *    window needs to grow.
 *  - `drainSkippedBy*` > 0 => the drain was muted or AEC-suppressed.
 *    Tail audio for that press was lost; investigate the mute / AEC
 *    suppression path rather than the drain window.
 *  - `pttUpWithoutCapture` => pttUp arrived while mic was not capturing.
 *  - `releasedDuringAcquire` => user released while mic was still being
 *    acquired; no audio was ever recorded for this press.
 */
export interface IPttDiagnostic {
	readonly turnId: string;
	readonly msHeld: number;
	readonly chunksSent: number;
	readonly samplesSent: number;
	readonly drainFired: boolean;
	readonly drainChunks: number;
	readonly drainSamples: number;
	readonly drainWindowMs: number;
	readonly drainSkippedByMute: number;
	readonly drainSkippedBySuppression: number;
	readonly postReleaseCallbacks: number;
	readonly postReleaseSamples: number;
	readonly postReleaseSkippedByMute: number;
	readonly postReleaseSkippedBySuppression: number;
	readonly postReleaseWindowMs: number;
	readonly releasedDuringAcquire: boolean;
	readonly pttUpWithoutCapture: boolean;
}

export interface IMicCaptureService {
	readonly _serviceBrand: undefined;

	/**
	 * Store a window reference for later lazy mic acquisition without actually
	 * acquiring the microphone. The mic is acquired on `pttDown()` and released
	 * on `pttUp()`.
	 */
	prepare(window: Window & typeof globalThis): void;

	/** Start capturing audio from the microphone. */
	startCapture(window: Window & typeof globalThis): Promise<void>;

	/** Stop capturing and release mic resources. */
	stopCapture(): void;

	readonly isCapturing: boolean;

	/** Fired when a PTT segment begins (mic ready). */
	readonly onPttStart: Event<void>;

	/** Fired during PTT hold with base64-encoded raw PCM16 chunks. */
	readonly onPttAudioChunk: Event<string>;

	/** Fired when a PTT segment ends. All chunks have been sent before this fires. */
	readonly onPttEnd: Event<void>;

	/**
	 * Fired after the diagnostic window closes (~1s after `pttUp`) with
	 * per-press telemetry. Always fires AFTER `onPttEnd` for normal
	 * presses. Used for tail-loss diagnosis; safe to ignore for normal
	 * operation.
	 */
	readonly onPttDiagnostic: Event<IPttDiagnostic>;

	/** The AnalyserNode for visualisation, available while capturing. */
	readonly analyserNode: AnalyserNode | undefined;

	// --- PTT ---
	/**
	 * Begin a PTT segment. Lazily acquires the microphone if not already
	 * capturing. Returns a promise that resolves once the mic is ready to
	 * record (or rejects if acquisition fails).
	 *
	 * `turnId` is an opaque per-press identifier propagated into the
	 * eventual `onPttDiagnostic` payload for correlation with backend logs.
	 * Pass empty string when no correlation is needed.
	 */
	pttDown(turnId: string): Promise<void>;

	/**
	 * End a PTT segment. Sends any remaining audio chunks, then fires pttEnd.
	 */
	pttUp(): void;

	/**
	 * Abort the current PTT segment WITHOUT firing ``onPttEnd`` and WITHOUT
	 * tearing down the warm mic. Used when the backend ends the turn itself
	 * (server VAD silence / stop phrase): streaming stops immediately for this
	 * press so no further audio is shipped, but no client ``ptt_end`` is
	 * emitted for the turn. Safe to call when no press is active.
	 */
	abortPtt(): void;

	// --- Mute / AEC suppression ---
	isMuted: boolean;

	/** Suppress mic output until the given timestamp (AEC gating). */
	suppressUntil(timestamp: number): void;
}

export class MicCaptureService extends Disposable implements IMicCaptureService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	private _window: (Window & typeof globalThis) | undefined;
	private _micStream: MediaStream | null = null;
	private _micCtx: AudioContext | undefined;
	private _scriptNode: ScriptProcessorNode | undefined;
	private _analyserNode: AnalyserNode | undefined;
	private _isCapturing = false;
	private _pttHeld = false;
	private _pttStreaming = false;
	private _isMuted = false;
	private _suppressUntilTs = 0;
	private _pttAcquiring = false;
	private _pttReleasedDuringAcquire = false;

	// --- Hardware mute detection. ---
	// A hardware microphone kill switch (e.g. on Framework laptops) leaves
	// `getUserMedia` succeeding with a track whose `muted` flag is set, so no
	// acquisition error surfaces. Track the mute state to warn the user.
	private readonly _micTrackListeners = this._register(new DisposableStore());
	private _micMutedNotified = false;

	// --- Drain state (post-release continued streaming). ---
	// Drain length is enforced primarily by counting samples shipped
	// since `pttUp` (immune to main-thread jitter that would skew a
	// pure wall-clock timer). The fallback timer guards against the
	// `onaudioprocess` callback being throttled or stopping entirely.
	private static readonly _PTT_DRAIN_WINDOW_MS = 500;
	private _pttDrainTargetSamples = 0;
	private _pttDrainSamplesSent = 0;
	private _pttDrainFallbackTimer: ReturnType<typeof setTimeout> | undefined;

	// --- Per-press diagnostic counters (reset on pttDown). ---
	// Diagnostic window MUST be > drain window so any audio still
	// produced after drain end is observable as `postReleaseCallbacks`.
	private static readonly _DIAG_POST_RELEASE_WINDOW_MS = 1000;
	private _diagTurnId = '';
	private _diagPttDownTs = 0;
	private _diagPttUpTs = 0;
	private _diagChunksSent = 0;
	private _diagSamplesSent = 0;
	private _diagDrainFired = false;
	private _diagDrainChunks = 0;
	private _diagDrainSamples = 0;
	private _diagDrainSkippedByMute = 0;
	private _diagDrainSkippedBySuppression = 0;
	private _diagPostReleaseCallbacks = 0;
	private _diagPostReleaseSamples = 0;
	private _diagPostReleaseSkippedByMute = 0;
	private _diagPostReleaseSkippedBySuppression = 0;
	private _diagReleasedDuringAcquire = false;
	private _diagPttUpWithoutCapture = false;
	private _diagFireTimer: ReturnType<typeof setTimeout> | undefined;

	private readonly _onPttStart = this._register(new Emitter<void>());
	readonly onPttStart: Event<void> = this._onPttStart.event;

	private readonly _onPttAudioChunk = this._register(new Emitter<string>());
	readonly onPttAudioChunk: Event<string> = this._onPttAudioChunk.event;

	private readonly _onPttEnd = this._register(new Emitter<void>());
	readonly onPttEnd: Event<void> = this._onPttEnd.event;

	private readonly _onPttDiagnostic = this._register(new Emitter<IPttDiagnostic>());
	readonly onPttDiagnostic: Event<IPttDiagnostic> = this._onPttDiagnostic.event;

	get isCapturing(): boolean { return this._isCapturing; }
	get analyserNode(): AnalyserNode | undefined { return this._analyserNode; }

	get isMuted(): boolean { return this._isMuted; }
	set isMuted(value: boolean) { this._isMuted = value; }

	suppressUntil(timestamp: number): void {
		this._suppressUntilTs = timestamp;
	}

	prepare(window: Window & typeof globalThis): void {
		this._window = window;
	}

	async pttDown(turnId: string): Promise<void> {
		if (this._pttHeld) { return; }
		// If a previous press is still in its drain window, finish it
		// now: cancel the fallback timer, mark streaming closed, fire
		// `_onPttEnd`. Otherwise the backend would keep the prior turn
		// open and our new turn would race against it.
		this._finishDrain();
		// If a previous press's diagnostic hasn't fired yet (back-to-back
		// presses inside the diagnostic window), emit it now so it
		// isn't overwritten by this press's reset.
		this._flushPendingDiagnostic();
		this._resetDiagnosticCounters(turnId);
		this._pttHeld = true;
		this._pttStreaming = true;
		this._pttReleasedDuringAcquire = false;
		this._isMuted = false;

		if (this._isCapturing) {
			this._onPttStart.fire();
			return;
		}
		if (!this._window) { return; }
		if (this._pttAcquiring) { return; }

		this._pttAcquiring = true;
		try {
			await this.startCapture(this._window);
		} catch (err) {
			this._pttHeld = false;
			this._pttStreaming = false;
			this._pttAcquiring = false;
			this._pttReleasedDuringAcquire = false;
			throw err;
		}
		this._pttAcquiring = false;
		this._onPttStart.fire();

		if (this._pttReleasedDuringAcquire) {
			this._pttReleasedDuringAcquire = false;
			this._pttStreaming = false;
			this._diagReleasedDuringAcquire = true;
			this._onPttEnd.fire();
			this.stopCapture();
			this._scheduleDiagnosticFire();
		}
	}

	pttUp(): void {
		if (!this._pttHeld) { return; }

		if (this._pttAcquiring) {
			this._pttReleasedDuringAcquire = true;
			this._diagReleasedDuringAcquire = true;
			this._diagPttUpTs = Date.now();
			this._scheduleDiagnosticFire();
			return;
		}

		if (!this._isCapturing) {
			this._pttHeld = false;
			this._pttStreaming = false;
			this._diagPttUpWithoutCapture = true;
			this._diagPttUpTs = Date.now();
			this._scheduleDiagnosticFire();
			return;
		}

		this._pttHeld = false;
		this._diagPttUpTs = Date.now();
		// Start drain: keep `_pttStreaming` true so subsequent
		// `onaudioprocess` callbacks continue to ship audio. End the
		// drain once we've shipped a full window of samples, OR after
		// the fallback timer trips if `onaudioprocess` stops firing.
		const sampleRate = this._micCtx?.sampleRate ?? 16000;
		this._pttDrainTargetSamples = Math.ceil(
			sampleRate * MicCaptureService._PTT_DRAIN_WINDOW_MS / 1000
		);
		this._pttDrainSamplesSent = 0;
		this._pttDrainFallbackTimer = setTimeout(() => {
			this._pttDrainFallbackTimer = undefined;
			this._finishDrain();
		}, MicCaptureService._PTT_DRAIN_WINDOW_MS + 250);
		this._scheduleDiagnosticFire();
	}

	abortPtt(): void {
		if (!this._pttHeld && !this._pttStreaming) { return; }
		// Cancel any in-flight drain and stop streaming immediately. Unlike
		// `pttUp()` this runs NO post-release drain and fires NO `_onPttEnd`:
		// the backend already ended the turn, so we must not ship more audio
		// for it nor emit our own ptt_end. The mic/AudioContext stays warm for
		// the next press.
		if (this._pttDrainFallbackTimer) {
			clearTimeout(this._pttDrainFallbackTimer);
			this._pttDrainFallbackTimer = undefined;
		}
		this._pttDrainTargetSamples = 0;
		this._pttDrainSamplesSent = 0;
		this._pttHeld = false;
		this._pttStreaming = false;
		this._pttReleasedDuringAcquire = false;
		// Still emit the per-press diagnostic (keyed by turnId), matching pttUp.
		this._diagPttUpTs = Date.now();
		this._scheduleDiagnosticFire();
	}

	async startCapture(window: Window & typeof globalThis): Promise<void> {
		this._window = window;
		if (this._isCapturing) { return; }
		const deviceId = this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
		const audioConstraints: MediaTrackConstraints = {
			channelCount: 1,
			sampleRate: 16000,
			echoCancellation: true,
			noiseSuppression: true,
		};
		if (deviceId) {
			audioConstraints.deviceId = { exact: deviceId };
		}

		let micStream: MediaStream;
		try {
			micStream = await window.navigator.mediaDevices.getUserMedia({
				audio: audioConstraints,
			});
		} catch (err) {
			// If the stored device is unavailable (unplugged/stale ID), fall back
			// to system default. Only retry on device-specific errors.
			const isDeviceError = deviceId && err instanceof DOMException &&
				(err.name === 'OverconstrainedError' || err.name === 'NotFoundError');
			if (isDeviceError) {
				this.logService.warn(`[mic] Preferred device ${deviceId.slice(0, 8)}… unavailable, falling back to default`);
				delete audioConstraints.deviceId;
				try {
					micStream = await window.navigator.mediaDevices.getUserMedia({
						audio: audioConstraints,
					});
				} catch (retryErr) {
					this._notifyMicPermissionDenied(retryErr);
					throw retryErr;
				}
			} else {
				this._notifyMicPermissionDenied(err);
				throw err;
			}
		}
		this._micStream = micStream;

		// Detect a hardware-muted microphone (e.g. a physical kill switch).
		// `getUserMedia` succeeds in this case but the track produces silence,
		// so without this check PTT would appear to work while capturing nothing.
		this._micTrackListeners.clear();
		this._micMutedNotified = false;
		const audioTrack = micStream.getAudioTracks()[0];
		if (audioTrack) {
			if (audioTrack.muted) {
				this._notifyMicrophoneMuted();
			}
			this._micTrackListeners.add(addDisposableListener(audioTrack, 'mute', () => this._notifyMicrophoneMuted()));
			this._micTrackListeners.add(addDisposableListener(audioTrack, 'unmute', () => { this._micMutedNotified = false; }));
		}

		if (!this._micCtx) {
			this._micCtx = new window.AudioContext({ sampleRate: 16000 });
		}
		const ctx = this._micCtx;
		const source = ctx.createMediaStreamSource(micStream);

		const analyser = ctx.createAnalyser();
		analyser.fftSize = 256;
		source.connect(analyser);
		this._analyserNode = analyser;

		const processor = ctx.createScriptProcessor(2048, 1, 1);
		this._scriptNode = processor;

		processor.onaudioprocess = (e: AudioProcessingEvent) => {
			const nowTs = Date.now();
			const ptUpTs = this._diagPttUpTs;
			// A callback is a "drain" callback while we're still in the
			// drain window after release: _pttStreaming is true (drain
			// hasn't finished) AND _pttHeld is false (user released).
			const isDrainCallback = this._pttStreaming && !this._pttHeld;
			// A callback is "post-release" once drain has finished
			// (_pttStreaming flipped to false in _finishDrain) but we're
			// still inside the wider diagnostic window. Audio in this
			// window is currently DROPPED; the count is our signal that
			// the drain window is too short.
			const inDiagWindow =
				ptUpTs > 0 &&
				!this._pttHeld &&
				nowTs <= ptUpTs + MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS;
			const isPostReleaseCallback = !this._pttStreaming && inDiagWindow;

			if (this._isMuted) {
				if (isDrainCallback) { this._diagDrainSkippedByMute++; }
				if (isPostReleaseCallback) { this._diagPostReleaseSkippedByMute++; }
				return;
			}

			if (nowTs < this._suppressUntilTs) {
				if (isDrainCallback) { this._diagDrainSkippedBySuppression++; }
				if (isPostReleaseCallback) { this._diagPostReleaseSkippedBySuppression++; }
				return;
			}

			if (!this._pttStreaming) {
				if (isPostReleaseCallback) {
					this._diagPostReleaseCallbacks++;
					this._diagPostReleaseSamples += e.inputBuffer.length;
				}
				return;
			}

			const channelData = e.inputBuffer.getChannelData(0);
			const samples = new Float32Array(channelData);
			const b64 = encodeRawPcm16Base64(samples, this._window!);
			this._diagChunksSent++;
			this._diagSamplesSent += samples.length;
			if (isDrainCallback) {
				this._diagDrainFired = true;
				this._diagDrainChunks++;
				this._diagDrainSamples += samples.length;
				this._pttDrainSamplesSent += samples.length;
			}
			this._onPttAudioChunk.fire(b64);

			// End the drain as soon as we've shipped a full window of
			// audio. Doing this AFTER firing the chunk guarantees the
			// final drain chunk reaches the backend before `_onPttEnd`.
			if (isDrainCallback && this._pttDrainSamplesSent >= this._pttDrainTargetSamples) {
				this._finishDrain();
			}
		};

		source.connect(processor);
		processor.connect(ctx.destination);
		this._isCapturing = true;
	}

	private _notifyMicPermissionDenied(err: unknown): void {
		if (err instanceof DOMException && err.name === 'NotAllowedError') {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('mic.permissionDenied', "Microphone access was denied. Grant microphone permission in your system settings to use Voice Mode."),
			});
		}
	}

	private _notifyMicrophoneMuted(): void {
		if (this._micMutedNotified) {
			return;
		}
		this._micMutedNotified = true;
		this.logService.warn('[mic] Microphone track is muted — likely a hardware mute switch is enabled');
		this.notificationService.notify({
			severity: Severity.Warning,
			message: localize('mic.hardwareMuted', "Your microphone appears to be muted or disabled, possibly by a hardware switch. Voice Mode won't hear you until it's re-enabled."),
		});
	}

	stopCapture(): void {
		// Cancel any in-flight drain; do NOT fire `_onPttEnd` here
		// because callers (reconnect / disconnect / dispose) have
		// already torn down or are about to tear down the backend
		// connection.
		if (this._pttDrainFallbackTimer) {
			clearTimeout(this._pttDrainFallbackTimer);
			this._pttDrainFallbackTimer = undefined;
		}
		this._pttDrainTargetSamples = 0;
		this._pttDrainSamplesSent = 0;
		if (this._scriptNode) {
			this._scriptNode.disconnect();
			this._scriptNode = undefined;
		}
		this._analyserNode = undefined;
		this._micCtx?.close();
		this._micCtx = undefined;
		if (this._micStream) {
			this._micStream.getTracks().forEach(t => t.stop());
			this._micStream = null;
		}
		this._micTrackListeners.clear();
		this._micMutedNotified = false;
		this._isCapturing = false;
		this._pttHeld = false;
		this._pttStreaming = false;
		this._pttReleasedDuringAcquire = false;
	}

	override dispose(): void {
		if (this._diagFireTimer) {
			clearTimeout(this._diagFireTimer);
			this._diagFireTimer = undefined;
		}
		if (this._pttDrainFallbackTimer) {
			clearTimeout(this._pttDrainFallbackTimer);
			this._pttDrainFallbackTimer = undefined;
		}
		this.stopCapture();
		super.dispose();
	}

	/**
	 * End the post-release drain phase: stop accepting more audio for
	 * this turn and fire `_onPttEnd`. Idempotent. Safe to call when no
	 * drain is in progress.
	 */
	private _finishDrain(): void {
		if (this._pttDrainFallbackTimer) {
			clearTimeout(this._pttDrainFallbackTimer);
			this._pttDrainFallbackTimer = undefined;
		}
		this._pttDrainTargetSamples = 0;
		this._pttDrainSamplesSent = 0;
		if (this._pttStreaming && !this._pttHeld) {
			this._pttStreaming = false;
			this._onPttEnd.fire();
		}
	}

	private _resetDiagnosticCounters(turnId: string): void {
		this._diagTurnId = turnId;
		this._diagPttDownTs = Date.now();
		this._diagPttUpTs = 0;
		this._diagChunksSent = 0;
		this._diagSamplesSent = 0;
		this._diagDrainFired = false;
		this._diagDrainChunks = 0;
		this._diagDrainSamples = 0;
		this._diagDrainSkippedByMute = 0;
		this._diagDrainSkippedBySuppression = 0;
		this._diagPostReleaseCallbacks = 0;
		this._diagPostReleaseSamples = 0;
		this._diagPostReleaseSkippedByMute = 0;
		this._diagPostReleaseSkippedBySuppression = 0;
		this._diagReleasedDuringAcquire = false;
		this._diagPttUpWithoutCapture = false;
	}

	private _scheduleDiagnosticFire(): void {
		if (this._diagFireTimer) {
			clearTimeout(this._diagFireTimer);
			this._diagFireTimer = undefined;
		}
		this._diagFireTimer = setTimeout(() => {
			this._diagFireTimer = undefined;
			this._emitDiagnostic();
		}, MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS);
	}

	private _flushPendingDiagnostic(): void {
		if (this._diagFireTimer) {
			clearTimeout(this._diagFireTimer);
			this._diagFireTimer = undefined;
			this._emitDiagnostic();
		}
	}

	private _emitDiagnostic(): void {
		if (!this._diagTurnId && this._diagPttDownTs === 0) { return; }
		const msHeld = this._diagPttUpTs > 0 ? this._diagPttUpTs - this._diagPttDownTs : 0;
		this._onPttDiagnostic.fire({
			turnId: this._diagTurnId,
			msHeld,
			chunksSent: this._diagChunksSent,
			samplesSent: this._diagSamplesSent,
			drainFired: this._diagDrainFired,
			drainChunks: this._diagDrainChunks,
			drainSamples: this._diagDrainSamples,
			drainWindowMs: MicCaptureService._PTT_DRAIN_WINDOW_MS,
			drainSkippedByMute: this._diagDrainSkippedByMute,
			drainSkippedBySuppression: this._diagDrainSkippedBySuppression,
			postReleaseCallbacks: this._diagPostReleaseCallbacks,
			postReleaseSamples: this._diagPostReleaseSamples,
			postReleaseSkippedByMute: this._diagPostReleaseSkippedByMute,
			postReleaseSkippedBySuppression: this._diagPostReleaseSkippedBySuppression,
			postReleaseWindowMs: MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS,
			releasedDuringAcquire: this._diagReleasedDuringAcquire,
			pttUpWithoutCapture: this._diagPttUpWithoutCapture,
		});
	}
}

/**
 * Encode PCM Float32 samples into base64-encoded raw PCM16 (no WAV header).
 */
function encodeRawPcm16Base64(samples: Float32Array, win: Window & typeof globalThis): string {
	const buf = new ArrayBuffer(samples.length * 2);
	const view = new DataView(buf);
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
	}
	const bytes = new Uint8Array(buf);
	let binaryStr = '';
	for (let i = 0; i < bytes.length; i++) {
		binaryStr += String.fromCharCode(bytes[i]);
	}
	return win.btoa(binaryStr);
}

registerSingleton(IMicCaptureService, MicCaptureService, InstantiationType.Delayed);
