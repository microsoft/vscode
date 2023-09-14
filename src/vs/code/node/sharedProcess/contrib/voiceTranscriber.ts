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
import { LimitedQueue } from 'vs/base/common/async';

export class VoiceTranscriptionManager extends Disposable {

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
			this._register(new VoiceTranscriber(port, this.voiceRecognitionService, this.logService));
		}));
	}
}

class VoiceTranscriber extends Disposable {

	private static MAX_DATA_LENGTH = 30 /* seconds */ * 16000 /* sampling rate */ * 16 /* bith depth */ * 1 /* channels */ / 8;

	private readonly transcriptionQueue = new LimitedQueue();

	private data: Float32Array | undefined = undefined;

	constructor(
		private readonly port: MessagePortMain,
		private readonly voiceRecognitionService: IVoiceRecognitionService,
		private readonly logService: ILogService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.logService.info(`[voice] transcriber: new connection`);

		const cts = new CancellationTokenSource();
		this._register(toDisposable(() => cts.dispose(true)));

		const requestHandler = (e: MessageEvent) => this.handleRequest(e, cts.token);
		this.port.on('message', requestHandler);
		this._register(toDisposable(() => this.port.off('message', requestHandler)));

		this.port.start();
		this._register(toDisposable(() => this.port.close()));

		this.port.on('close', () => {
			this.logService.info(`[voice] transcriber: closed connection`);

			cts.dispose(true);
		});
	}

	private async handleRequest(e: MessageEvent, cancellation: CancellationToken): Promise<void> {
		if (!(Array.isArray(e.data))) {
			return;
		}

		const newData: Float32Array[] = [];
		for (const channelData of e.data) {
			if (channelData instanceof Float32Array) {
				newData.push(channelData);
			}
		}

		const dataCandidate = this.joinFloat32Arrays(this.data ? [this.data, ...newData] : newData);

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

		const result = await this.voiceRecognitionService.transcribe(data, cancellation);

		if (cancellation.isCancellationRequested) {
			return;
		}

		this.port.postMessage(result);
	}

	private joinFloat32Arrays(float32Arrays: Float32Array[]): Float32Array {
		const result = new Float32Array(float32Arrays.reduce((prev, curr) => prev + curr.length, 0));

		let offset = 0;
		for (const float32Array of float32Arrays) {
			result.set(float32Array, offset);
			offset += float32Array.length;
		}

		return result;
	}
}
