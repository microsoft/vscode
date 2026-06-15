/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

export const ITtsPlaybackService = createDecorator<ITtsPlaybackService>('ttsPlaybackService');

export interface ITtsPlaybackService {
	readonly _serviceBrand: undefined;

	/** Append a base64-encoded audio chunk for streaming playback. */
	playAudioChunk(audio: string, isFinal: boolean, window: Window & typeof globalThis): void;

	/** Stop any current playback immediately. */
	stopPlayback(): void;

	readonly isPlaying: boolean;

	readonly onPlaybackStarted: Event<void>;
	readonly onPlaybackStopped: Event<void>;

	/** Returns the PCM samples from the last completed playback turn, or null. */
	getLastPlayedSamples(): Float32Array | null;

	/** The playback AnalyserNode for visualisation, available during playback. */
	readonly analyserNode: AnalyserNode | undefined;

	/**
	 * Ensure the playback AudioContext exists and is resumed.
	 * Returns the AudioContext for callers that need it (e.g. pre-warming).
	 */
	ensureContext(window: Window & typeof globalThis): AudioContext;

	/** Close the AudioContext entirely (for full teardown). */
	closeContext(): void;
}

const PLAYBACK_SAMPLE_RATE = 24000;
const MAX_PLAYBACK_SAMPLES = PLAYBACK_SAMPLE_RATE * 180; // 3 min ceiling

type PlaybackTurn = {
	buffer: AudioBuffer;
	sourceNode: AudioBufferSourceNode | null;
	writeOffset: number;
	startCtxTime: number;
	started: boolean;
	writeChain: Promise<void>;
};

export class TtsPlaybackService extends Disposable implements ITtsPlaybackService {
	declare readonly _serviceBrand: undefined;

	constructor(@ILogService private readonly logService: ILogService) {
		super();
	}

	private _window: (Window & typeof globalThis) | undefined;
	private _playbackCtx: AudioContext | undefined;
	private _playbackTurn: PlaybackTurn | null = null;
	private _playbackGen = 0;
	private _analyserNode: AnalyserNode | undefined;
	private _isPlaying = false;
	private _lastPlayedSamples: Float32Array | null = null;

	private readonly _onPlaybackStarted = this._register(new Emitter<void>());
	readonly onPlaybackStarted: Event<void> = this._onPlaybackStarted.event;

	private readonly _onPlaybackStopped = this._register(new Emitter<void>());
	readonly onPlaybackStopped: Event<void> = this._onPlaybackStopped.event;

	get isPlaying(): boolean { return this._isPlaying; }
	get analyserNode(): AnalyserNode | undefined { return this._analyserNode; }

	getLastPlayedSamples(): Float32Array | null {
		return this._lastPlayedSamples;
	}

	ensureContext(window: Window & typeof globalThis): AudioContext {
		this._window = window;
		if (!this._playbackCtx) {
			this._playbackCtx = new window.AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
		}
		return this._playbackCtx;
	}

	playAudioChunk(audio: string, isFinal: boolean, window: Window & typeof globalThis): void {
		this._window = window;
		if (!audio && isFinal) {
			const turn = this._ensurePlayTurn(window);
			turn.writeChain = turn.writeChain.then(() => this._schedulePlayStop());
			return;
		}
		if (!audio) { return; }

		const turn = this._ensurePlayTurn(window);
		const gen = this._playbackGen;
		const binary = window.atob(audio);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
		const arrayBuf = bytes.buffer;
		turn.writeChain = turn.writeChain.then(async () => {
			if (gen !== this._playbackGen) { return; }
			try {
				const ctx = this.ensureContext(this._window!);
				const decoded = await ctx.decodeAudioData(arrayBuf);
				if (gen !== this._playbackGen) { return; }
				this._writeToPlayBuffer(decoded);
				if (!this._playbackTurn?.started) {
					this._startPlayback();
				}
			} catch (err) { this.logService.error('[voice] TTS decode error', err); }
		});
		if (isFinal) {
			turn.writeChain = turn.writeChain.then(() => this._schedulePlayStop());
		}
	}

	stopPlayback(): void {
		this._playbackGen++;
		if (this._playbackTurn) {
			this._captureSamples(this._playbackTurn);
		}
		try { this._playbackTurn?.sourceNode?.stop(); } catch { /* already stopped */ }
		this._playbackTurn = null;
		this._analyserNode = undefined;
		if (this._isPlaying) {
			this._isPlaying = false;
			this._onPlaybackStopped.fire();
		}
	}

	/** Close the AudioContext entirely (for full teardown). */
	closeContext(): void {
		this.stopPlayback();
		if (this._playbackCtx) {
			this._playbackCtx.close();
			this._playbackCtx = undefined;
		}
	}

	private _ensurePlayTurn(window: Window & typeof globalThis): PlaybackTurn {
		const ctx = this.ensureContext(window);
		if (this._playbackTurn) { return this._playbackTurn; }
		const turn: PlaybackTurn = {
			buffer: ctx.createBuffer(1, MAX_PLAYBACK_SAMPLES, PLAYBACK_SAMPLE_RATE),
			sourceNode: null,
			writeOffset: 0,
			startCtxTime: 0,
			started: false,
			writeChain: Promise.resolve(),
		};
		this._playbackTurn = turn;
		return turn;
	}

	private _writeToPlayBuffer(decoded: AudioBuffer): void {
		if (!this._playbackTurn) { return; }
		const src = decoded.getChannelData(0);
		const dst = this._playbackTurn.buffer.getChannelData(0);
		const toWrite = Math.min(src.length, MAX_PLAYBACK_SAMPLES - this._playbackTurn.writeOffset);
		for (let i = 0; i < toWrite; i++) {
			dst[this._playbackTurn.writeOffset + i] = src[i];
		}
		this._playbackTurn.writeOffset += toWrite;
	}

	private _startPlayback(): void {
		const ctx = this._playbackCtx;
		const turn = this._playbackTurn;
		if (!ctx || !turn || turn.started) { return; }
		turn.started = true;
		const node = ctx.createBufferSource();
		node.buffer = turn.buffer;
		turn.sourceNode = node;

		const analyser = ctx.createAnalyser();
		analyser.fftSize = 256;
		node.connect(analyser);
		analyser.connect(ctx.destination);
		this._analyserNode = analyser;

		turn.startCtxTime = ctx.currentTime;
		node.start(0);

		if (!this._isPlaying) {
			this._isPlaying = true;
			this._onPlaybackStarted.fire();
		}
	}

	private _schedulePlayStop(): void {
		const ctx = this._playbackCtx;
		const turn = this._playbackTurn;
		if (!ctx || !turn) { return; }
		if (!turn.started) { this._startPlayback(); }
		const node = turn.sourceNode;
		if (!node) { return; }
		const stopAt = turn.startCtxTime + turn.writeOffset / PLAYBACK_SAMPLE_RATE;
		const endedTurn = turn;
		node.stop(Math.max(stopAt, ctx.currentTime));
		node.onended = () => {
			if (this._playbackTurn !== endedTurn) { return; }
			this._captureSamples(endedTurn);
			this._playbackTurn = null;
			this._analyserNode = undefined;
			if (this._isPlaying) {
				this._isPlaying = false;
				this._onPlaybackStopped.fire();
			}
		};
	}

	private _captureSamples(turn: PlaybackTurn): void {
		if (turn.writeOffset > 0) {
			this._lastPlayedSamples = turn.buffer.getChannelData(0).slice(0, turn.writeOffset);
		}
	}

	override dispose(): void {
		this.closeContext();
		super.dispose();
	}
}

registerSingleton(ITtsPlaybackService, TtsPlaybackService, InstantiationType.Delayed);
