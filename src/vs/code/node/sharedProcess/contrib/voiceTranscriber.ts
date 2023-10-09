/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { MessagePortMain, MessageEvent } from 'vs/base/parts/sandbox/node/electronTypes';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IVoiceRecognitionService } from 'vs/platform/voiceRecognition/node/voiceRecognitionService';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { LimitedQueue, Queue } from 'vs/base/common/async';

export class VoiceTranscriptionManager extends Disposable {

	private static USE_SLIDING_WINDOW = !!process.env.VSCODE_VOICE_USE_SLIDING_WINDOW;

	constructor(
		private readonly onDidWindowConnectRaw: Event<MessagePortMain>,
		@IVoiceRecognitionService private readonly voiceRecognitionService: IVoiceRecognitionService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onDidWindowConnectRaw(port => {
			this.logService.info(`[voice] transcriber: new connection (sliding window: ${VoiceTranscriptionManager.USE_SLIDING_WINDOW})`);

			if (VoiceTranscriptionManager.USE_SLIDING_WINDOW) {
				this._register(new SlidingWindowVoiceTranscriber(port, this.voiceRecognitionService, this.logService));
			} else {
				this._register(new FullWindowVoiceTranscriber(port, this.voiceRecognitionService, this.logService));
			}
		}));
	}
}

abstract class VoiceTranscriber extends Disposable {

	protected static MAX_DATA_LENGTH = 30 /* seconds */ * 16000 /* sampling rate */ * 16 /* bith depth */ * 1 /* channels */ / 8;

	constructor(
		protected readonly port: MessagePortMain,
		protected readonly voiceRecognitionService: IVoiceRecognitionService,
		protected readonly logService: ILogService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		const cts = new CancellationTokenSource();
		this._register(toDisposable(() => cts.dispose(true)));

		const requestHandler = (e: MessageEvent) => {
			if (!(e.data instanceof Float32Array)) {
				return;
			}

			this.handleRequest(e.data, cts.token);
		};
		this.port.on('message', requestHandler);
		this._register(toDisposable(() => this.port.off('message', requestHandler)));

		this.port.start();

		let closed = false;
		this.port.on('close', () => {
			this.logService.info(`[voice] transcriber: closed connection`);

			closed = true;
			this.dispose();
		});

		this._register(toDisposable(() => {
			if (!closed) {
				this.port.close();
			}
		}));
	}

	protected abstract handleRequest(data: Float32Array, cancellation: CancellationToken): Promise<void>;

	protected joinFloat32Arrays(float32Arrays: Float32Array[]): Float32Array {
		const result = new Float32Array(float32Arrays.reduce((prev, curr) => prev + curr.length, 0));

		let offset = 0;
		for (const float32Array of float32Arrays) {
			result.set(float32Array, offset);
			offset += float32Array.length;
		}

		return result;
	}
}

class SlidingWindowVoiceTranscriber extends VoiceTranscriber {

	private readonly transcriptionQueue = this._register(new Queue());

	private transcribedResults: string[] = [];
	private data: Float32Array = new Float32Array(0);

	protected async handleRequest(data: Float32Array, cancellation: CancellationToken): Promise<void> {
		if (data.length > 0) {
			this.logService.info(`[voice] transcriber: voice detected, storing in buffer`);

			this.data = this.data ? this.joinFloat32Arrays([this.data, data]) : data;
		} else {
			this.logService.info(`[voice] transcriber: silence detected, transcribing window...`);

			const data = this.data.slice(0);
			this.data = new Float32Array(0);

			this.transcriptionQueue.queue(() => this.transcribe(data, cancellation));
		}
	}

	private async transcribe(data: Float32Array, cancellation: CancellationToken): Promise<void> {
		if (cancellation.isCancellationRequested) {
			return;
		}

		if (data.length > VoiceTranscriber.MAX_DATA_LENGTH) {
			this.logService.warn(`[voice] transcriber: refusing to accept more than 30s of audio data`);
			return;
		}

		if (data.length !== 0) {
			const result = await this.voiceRecognitionService.transcribe(data, cancellation);
			if (result) {
				this.transcribedResults.push(result);
			}
		}

		if (cancellation.isCancellationRequested) {
			return;
		}

		this.port.postMessage(this.transcribedResults.join(' '));
	}

	override dispose(): void {
		super.dispose();

		this.data = new Float32Array(0);
	}
}

class FullWindowVoiceTranscriber extends VoiceTranscriber {

	private readonly transcriptionQueue = new LimitedQueue();

	private data: Float32Array | undefined = undefined;

	private transcribedDataLength = 0;
	private transcribedResult = '';

	protected async handleRequest(data: Float32Array, cancellation: CancellationToken): Promise<void> {
		const dataCandidate = this.data ? this.joinFloat32Arrays([this.data, data]) : data;
		if (dataCandidate.length > VoiceTranscriber.MAX_DATA_LENGTH) {
			this.logService.warn(`[voice] transcriber: refusing to accept more than 30s of audio data`);
			return;
		}

		this.data = dataCandidate;

		this.transcriptionQueue.queue(() => this.transcribe(cancellation));
	}

	private async transcribe(cancellation: CancellationToken): Promise<void> {
		if (cancellation.isCancellationRequested) {
			return;
		}

		const data = this.data?.slice(0);
		if (!data) {
			return;
		}

		let result: string;
		if (data.length === this.transcribedDataLength) {
			// Optimization: if the data is the same as the last time
			// we transcribed, don't transcribe again, just return the
			// same result as we had last time.
			this.logService.info(`[voice] transcriber: silence detected, reusing previous transcription result`);
			result = this.transcribedResult;
		} else {
			this.logService.info(`[voice] transcriber: voice detected, transcribing everything...`);
			result = await this.voiceRecognitionService.transcribe(data, cancellation);
		}

		this.transcribedResult = result;
		this.transcribedDataLength = data.length;

		if (cancellation.isCancellationRequested) {
			return;
		}

		this.port.postMessage(result);
	}

	override dispose(): void {
		super.dispose();

		this.data = undefined;
	}
}
