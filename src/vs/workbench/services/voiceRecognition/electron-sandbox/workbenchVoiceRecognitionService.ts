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
import { FileAccess } from 'vs/base/common/network';

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

class BufferInputAudioNode extends AudioWorkletNode {
	constructor(context: BaseAudioContext, options: AudioWorkletNodeOptions) {
		super(context, 'buffer-input-audio-processor', options);
	}
}

// TODO@voice
// - load `navigator.mediaDevices.getUserMedia` lazily on startup? or would it trigger a permission prompt?
// - how to prevent data processing accumulation when processing is slow?
// - how to make this a singleton service that enables ref-counting on multiple callers?
// - cancellation should flow to the shared process
// - voice module should directly transcribe the PCM32 data
// - we should transfer the Float32Array directly without serialisation overhead

export class WorkbenchVoiceRecognitionService implements IWorkbenchVoiceRecognitionService {

	declare readonly _serviceBrand: undefined;

	private static readonly AUDIO_SAMPLE_RATE = 16000;
	private static readonly AUDIO_SAMPLE_SIZE = 16;
	private static readonly AUDIO_CHANNELS = 1;

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

			const microphoneDevice = await navigator.mediaDevices.getUserMedia({
				audio: {
					sampleRate: WorkbenchVoiceRecognitionService.AUDIO_SAMPLE_RATE,
					sampleSize: WorkbenchVoiceRecognitionService.AUDIO_SAMPLE_SIZE,
					channelCount: WorkbenchVoiceRecognitionService.AUDIO_CHANNELS,
					autoGainControl: true,
					noiseSuppression: true
				}
			});

			if (token.isCancellationRequested) {
				return;
			}

			const audioContext = new AudioContext({
				sampleRate: WorkbenchVoiceRecognitionService.AUDIO_SAMPLE_RATE,
				latencyHint: 'interactive'
			});

			const microphoneSource = audioContext.createMediaStreamSource(microphoneDevice);

			token.onCancellationRequested(() => {
				microphoneDevice.getTracks().forEach(track => track.stop());
				microphoneSource.disconnect();
				audioContext.close();
				recordingDone.complete();
			});

			await audioContext.audioWorklet.addModule(FileAccess.asBrowserUri('vs/workbench/services/voiceRecognition/electron-sandbox/bufferInputAudioProcessor.js').toString(true));

			const bufferInputAudioTarget = new BufferInputAudioNode(audioContext, {
				channelCount: WorkbenchVoiceRecognitionService.AUDIO_CHANNELS,
				channelCountMode: 'explicit'
			});

			microphoneSource.connect(bufferInputAudioTarget);

			progress.report({ message: localize('voiceTranscriptionRecording', "Recording from microphone...") });

			bufferInputAudioTarget.port.onmessage = async e => {
				if (e.data instanceof Float32Array) {
					this.doTranscribeChunk(e.data, emitter, token);
				}
			};

			return recordingDone.p;
		});
	}

	private async doTranscribeChunk(data: Float32Array, emitter: Emitter<string>, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}

		const text = await this.voiceRecognitionService.transcribe({
			sampleRate: WorkbenchVoiceRecognitionService.AUDIO_SAMPLE_RATE,
			sampleSize: WorkbenchVoiceRecognitionService.AUDIO_SAMPLE_SIZE,
			channelCount: WorkbenchVoiceRecognitionService.AUDIO_CHANNELS,
			channelData: VSFloat32Array.wrap(data)
		});

		if (token.isCancellationRequested) {
			return;
		}

		emitter.fire(text);
	}
}

// Register Service
registerSingleton(IWorkbenchVoiceRecognitionService, WorkbenchVoiceRecognitionService, InstantiationType.Delayed);
