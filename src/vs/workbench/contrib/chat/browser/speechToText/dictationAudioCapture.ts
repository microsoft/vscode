/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { AgentsVoiceStorageKeys } from '../../../agentsVoice/common/agentsVoice.js';

const SAMPLE_RATE = 16000;
const DRAIN_WINDOW_MS = 500;

export const IDictationAudioCaptureFactory = createDecorator<IDictationAudioCaptureFactory>('dictationAudioCaptureFactory');

export interface IDictationAudioCaptureFactory {
	readonly _serviceBrand: undefined;
	create(): IDictationAudioCapture;
}

export interface IDictationAudioCapture extends IDisposable {
	readonly onAudioChunk: Event<string>;
	readonly isCapturing: boolean;
	acquire(window: Window & typeof globalThis): Promise<void>;
	start(): void;
	stop(): Promise<void>;
	cancel(): void;
}

export class DictationAudioCapture extends Disposable implements IDictationAudioCapture {
	private readonly _onAudioChunk = this._register(new Emitter<string>());
	readonly onAudioChunk = this._onAudioChunk.event;

	private _window: (Window & typeof globalThis) | undefined;
	private _stream: MediaStream | undefined;
	private _context: AudioContext | undefined;
	private _source: MediaStreamAudioSourceNode | undefined;
	private _processor: ScriptProcessorNode | undefined;
	private _streaming = false;
	private _draining = false;
	private _drainTargetSamples = 0;
	private _drainSamples = 0;
	private _drainTimer: ReturnType<typeof setTimeout> | undefined;
	private _drainDone: DeferredPromise<void> | undefined;
	private _operationId = 0;

	get isCapturing(): boolean {
		return !!this._stream;
	}

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async acquire(window: Window & typeof globalThis): Promise<void> {
		this.cancel();
		const operationId = ++this._operationId;
		this._window = window;
		const stream = await this._acquireStream(window);
		if (operationId !== this._operationId) {
			stream.getTracks().forEach(track => track.stop());
			throw new Error('Dictation audio acquisition was cancelled');
		}
		this._stream = stream;
		try {
			const context = new window.AudioContext({ sampleRate: SAMPLE_RATE });
			this._context = context;
			await context.resume();
			if (operationId !== this._operationId) {
				this._releaseResources();
				throw new Error('Dictation audio acquisition was cancelled');
			}
			const source = context.createMediaStreamSource(stream);
			this._source = source;
			const processor = context.createScriptProcessor(2048, 1, 1);
			this._processor = processor;
			processor.onaudioprocess = event => this._processAudio(event);
			source.connect(processor);
			processor.connect(context.destination);
		} catch (error) {
			this.cancel();
			throw error;
		}
	}

	start(): void {
		if (!this.isCapturing || this._streaming) {
			return;
		}
		this._streaming = true;
	}

	async stop(): Promise<void> {
		if (!this._streaming) {
			this.cancel();
			return;
		}
		this._draining = true;
		this._drainSamples = 0;
		this._drainTargetSamples = Math.ceil((this._context?.sampleRate ?? SAMPLE_RATE) * DRAIN_WINDOW_MS / 1000);
		this._drainDone = new DeferredPromise<void>();
		this._drainTimer = setTimeout(() => this._finishDrain(), DRAIN_WINDOW_MS + 250);
		await this._drainDone.p;
		this._releaseResources();
	}

	cancel(): void {
		this._operationId++;
		this._finishDrain();
		this._releaseResources();
	}

	private _processAudio(event: AudioProcessingEvent): void {
		if (!this._streaming) {
			return;
		}
		const samples = new Float32Array(event.inputBuffer.getChannelData(0));
		this._onAudioChunk.fire(encodeRawPcm16Base64(samples, this._window!));
		if (this._draining) {
			this._drainSamples += samples.length;
			if (this._drainSamples >= this._drainTargetSamples) {
				this._finishDrain();
			}
		}
	}

	private _finishDrain(): void {
		if (this._drainTimer) {
			clearTimeout(this._drainTimer);
			this._drainTimer = undefined;
		}
		this._streaming = false;
		this._draining = false;
		this._drainTargetSamples = 0;
		this._drainSamples = 0;
		this._drainDone?.complete();
		this._drainDone = undefined;
	}

	private _releaseResources(): void {
		if (this._processor) {
			this._processor.onaudioprocess = null;
			try {
				this._processor.disconnect();
			} catch (error) {
				this._logService.trace('[chat-dictation] failed to disconnect audio processor', error);
			}
			this._processor = undefined;
		}
		try {
			this._source?.disconnect();
		} catch (error) {
			this._logService.trace('[chat-dictation] failed to disconnect audio source', error);
		}
		this._source = undefined;
		void this._context?.close();
		this._context = undefined;
		this._stream?.getTracks().forEach(track => track.stop());
		this._stream = undefined;
		this._window = undefined;
	}

	private async _acquireStream(window: Window & typeof globalThis): Promise<MediaStream> {
		const deviceId = this._storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
		const constraints: MediaTrackConstraints = {
			channelCount: 1,
			sampleRate: SAMPLE_RATE,
			echoCancellation: true,
			noiseSuppression: true,
		};
		if (deviceId) {
			constraints.deviceId = { exact: deviceId };
		}

		try {
			return await window.navigator.mediaDevices.getUserMedia({ audio: constraints });
		} catch (error) {
			const staleDevice = deviceId && error instanceof DOMException
				&& (error.name === 'OverconstrainedError' || error.name === 'NotFoundError');
			if (!staleDevice) {
				throw error;
			}
			this._logService.warn('[chat-dictation] preferred microphone is unavailable; using the system default');
			delete constraints.deviceId;
			return window.navigator.mediaDevices.getUserMedia({ audio: constraints });
		}
	}

	override dispose(): void {
		this.cancel();
		super.dispose();
	}
}

export class DictationAudioCaptureFactory implements IDictationAudioCaptureFactory {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) { }

	create(): IDictationAudioCapture {
		return new DictationAudioCapture(this._storageService, this._logService);
	}
}

export function encodeRawPcm16Base64(samples: Float32Array, window: Window & typeof globalThis): string {
	const buffer = new ArrayBuffer(samples.length * 2);
	const view = new DataView(buffer);
	for (let index = 0; index < samples.length; index++) {
		const sample = Math.max(-1, Math.min(1, samples[index]));
		view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
	}
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return window.btoa(binary);
}
