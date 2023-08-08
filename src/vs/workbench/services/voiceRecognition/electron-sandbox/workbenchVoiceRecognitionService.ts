/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { VSFloat32Array } from 'vs/base/common/buffer';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IVoiceRecognitionService } from 'vs/platform/voiceRecognition/common/voiceRecognitionService';
import { Emitter, Event } from 'vs/base/common/event';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { DeferredPromise } from 'vs/base/common/async';

export const IWorkbenchVoiceRecognitionService = createDecorator<IWorkbenchVoiceRecognitionService>('workbenchVoiceRecognitionService');

export interface IWorkbenchVoiceRecognitionService {

	readonly _serviceBrand: undefined;

	/**
	 * Starts listening to the microphone transcribing the voice to text.
	 *
	 * @param cancellation a cancellation token to stop transcribing and
	 * listening to the microphone.
	 */
	transcribe(cancellation: CancellationToken): Event<string>;
}

// TODO@voice
// - load `navigator.mediaDevices.getUserMedia` lazily on startup? or would it trigger a permission prompt?
// - figure out the ugly `any` cast for AudioContext
// - how to prevent data processing accumulation when processing is slow?
// - how to make this a singleton service that enables ref-counting on multiple callers?
// - cancellation should flow to the shared process
// - voice module should directly transcribe the PCM32 data
// - we should transfer the Float32Array directly without serialisation overhead

export class WorkbenchVoiceRecognitionService implements IWorkbenchVoiceRecognitionService {

	declare readonly _serviceBrand: undefined;

	private static readonly AUDIO_TIME_SLICE = 2000;
	private static readonly AUDIO_MIME_TYPE = 'audio/webm;codecs=opus';

	constructor(
		@IVoiceRecognitionService private readonly voiceRecognitionService: IVoiceRecognitionService,
		@IProgressService private readonly progressService: IProgressService
	) { }

	transcribe(cancellation: CancellationToken): Event<string> {
		const cts = new CancellationTokenSource(cancellation);
		const emitter = new Emitter<string>();
		cancellation.onCancellationRequested(() => emitter.dispose());

		this.doTranscribe(emitter, cts.token);

		return emitter.event;
	}

	private async doTranscribe(emitter: Emitter<string>, token: CancellationToken): Promise<void> {
		return this.progressService.withProgress({
			location: ProgressLocation.Window,
			title: localize('voiceTranscription', "Voice Transcription"),
		}, async progress => {
			const recordingDone = new DeferredPromise<void>();

			progress.report({ message: localize('voiceTranscriptionGettingReady', "Getting microphone ready...") });

			const audioDevice = await navigator.mediaDevices.getUserMedia({ audio: true });

			if (token.isCancellationRequested) {
				return;
			}

			const audioRecorder = new MediaRecorder(audioDevice, { mimeType: WorkbenchVoiceRecognitionService.AUDIO_MIME_TYPE });
			audioRecorder.start(WorkbenchVoiceRecognitionService.AUDIO_TIME_SLICE);

			token.onCancellationRequested(() => {
				audioRecorder.stop();
				recordingDone.complete();
			});

			progress.report({ message: localize('voiceTranscriptionRecording', "Recording from microphone...") });

			const chunks: Blob[] = [];
			audioRecorder.ondataavailable = e => {
				chunks.push(e.data);

				this.doTranscribeChunk(chunks, emitter, token);
			};

			return recordingDone.p;
		});
	}

	private async doTranscribeChunk(chunks: Blob[], emitter: Emitter<string>, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}

		const blob = new Blob(chunks);
		const blobBuffer = await blob.arrayBuffer();
		if (token.isCancellationRequested) {
			return;
		}

		const audioContextOptions = {
			sampleRate: 16000 as const,
			channelCount: 1 as const,
			echoCancellation: false,
			autoGainControl: true,
			noiseSuppression: true
		};

		const context = new AudioContext(audioContextOptions as any);

		const audioBuffer = await context.decodeAudioData(blobBuffer);
		if (token.isCancellationRequested) {
			return;
		}

		const text = await this.voiceRecognitionService.transcribe({
			sampleRate: audioContextOptions.sampleRate,
			channelCount: audioContextOptions.channelCount,
			length: audioBuffer.length,
			channelData: VSFloat32Array.wrap(audioBuffer.getChannelData(0))
		});

		if (token.isCancellationRequested) {
			return;
		}

		emitter.fire(text);
	}
}

// Register Service
registerSingleton(IWorkbenchVoiceRecognitionService, WorkbenchVoiceRecognitionService, InstantiationType.Delayed);
