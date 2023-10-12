/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { DeferredPromise } from 'vs/base/common/async';
import { FileAccess } from 'vs/base/common/network';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { INotificationService } from 'vs/platform/notification/common/notification';
// eslint-disable-next-line local/code-import-patterns
import { ISpeechService, SpeechToTextStatus } from 'vs/workbench/contrib/speech/common/speechService'; // TODO@bpasero layer break
import { DisposableStore } from 'vs/base/common/lifecycle';

export const IWorkbenchVoiceRecognitionService = createDecorator<IWorkbenchVoiceRecognitionService>('workbenchVoiceRecognitionService');

export interface IWorkbenchVoiceRecognitionOptions {

	/**
	 * Optional event that is fired when the user cancels the voice recognition.
	 */
	readonly onDidCancel?: () => void;
}

export interface IWorkbenchVoiceRecognitionService {

	readonly _serviceBrand: undefined;

	/**
	 * Starts listening to the microphone transcribing the voice to text. Microphone
	 * recording starts when the returned promise is resolved.
	 *
	 * @param cancellation a cancellation token to stop transcribing and
	 * listening to the microphone.
	 */
	transcribe(cancellation: CancellationToken, options?: IWorkbenchVoiceRecognitionOptions): Promise<Event<string>>;
}

interface IVoiceTranscriptionWorkletOptions extends AudioWorkletNodeOptions {
	processorOptions: {
		readonly bufferTimespan: number;
		readonly vadThreshold: number;
	};
}

class VoiceTranscriptionWorkletNode extends AudioWorkletNode {

	constructor(
		context: BaseAudioContext,
		options: IVoiceTranscriptionWorkletOptions,
		private readonly onDidTranscribe: Emitter<string>,
		private readonly sharedProcessService: ISharedProcessService
	) {
		super(context, 'voice-transcription-worklet', options);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.port.onmessage = e => {
			if (typeof e.data === 'string') {
				this.onDidTranscribe.fire(e.data);
			}
		};
	}

	async start(token: CancellationToken): Promise<void> {
		token.onCancellationRequested(() => this.stop());

		const sharedProcessConnection = await this.sharedProcessService.createRawConnection();

		if (token.isCancellationRequested) {
			this.stop();
			return;
		}

		this.port.postMessage('vscode:startVoiceTranscription', [sharedProcessConnection]);
	}

	private stop(): void {
		this.port.postMessage('vscode:stopVoiceTranscription');
		this.disconnect();
	}
}

// @ts-ignore
class AudioWorkletVoiceRecognitionService implements IWorkbenchVoiceRecognitionService {

	declare readonly _serviceBrand: undefined;

	private static readonly AUDIO_SAMPLING_RATE = 16000;
	private static readonly AUDIO_BIT_DEPTH = 16;
	private static readonly AUDIO_CHANNELS = 1;

	private static readonly BUFFER_TIMESPAN = 1000;
	private static readonly VAD_THRESHOLD = 0.02;

	constructor(
		@IProgressService private readonly progressService: IProgressService,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService,
		@INotificationService private readonly notificationService: INotificationService
	) { }

	async transcribe(cancellation: CancellationToken, options?: IWorkbenchVoiceRecognitionOptions): Promise<Event<string>> {
		const cts = new CancellationTokenSource(cancellation);

		const onDidTranscribe = new Emitter<string>();
		cts.token.onCancellationRequested(() => {
			onDidTranscribe.dispose();
			options?.onDidCancel?.();
		});

		await this.doTranscribe(onDidTranscribe, cts);

		return onDidTranscribe.event;
	}

	private doTranscribe(onDidTranscribe: Emitter<string>, cts: CancellationTokenSource): Promise<void> {
		const recordingReady = new DeferredPromise<void>();
		cts.token.onCancellationRequested(() => recordingReady.complete());

		this.progressService.withProgress({
			location: ProgressLocation.Window,
			title: localize('voiceTranscription', "Voice Transcription"),
			cancellable: true
		}, async progress => {
			const recordingDone = new DeferredPromise<void>();
			try {
				progress.report({ message: localize('voiceTranscriptionGettingReady', "Getting microphone ready...") });

				const microphoneDevice = await navigator.mediaDevices.getUserMedia({
					audio: {
						sampleRate: AudioWorkletVoiceRecognitionService.AUDIO_SAMPLING_RATE,
						sampleSize: AudioWorkletVoiceRecognitionService.AUDIO_BIT_DEPTH,
						channelCount: AudioWorkletVoiceRecognitionService.AUDIO_CHANNELS,
						autoGainControl: true,
						noiseSuppression: true,
						echoCancellation: false
					}
				});

				if (cts.token.isCancellationRequested) {
					return;
				}

				const audioContext = new AudioContext({
					sampleRate: AudioWorkletVoiceRecognitionService.AUDIO_SAMPLING_RATE,
					latencyHint: 'interactive'
				});

				const microphoneSource = audioContext.createMediaStreamSource(microphoneDevice);

				cts.token.onCancellationRequested(() => {
					try {
						for (const track of microphoneDevice.getTracks()) {
							track.stop();
						}

						microphoneSource.disconnect();
						audioContext.close();
					} finally {
						recordingDone.complete();
					}
				});

				await audioContext.audioWorklet.addModule(FileAccess.asBrowserUri('vs/workbench/services/voiceRecognition/electron-sandbox/voiceTranscriptionWorklet.js').toString(true));

				if (cts.token.isCancellationRequested) {
					return;
				}

				const voiceTranscriptionTarget = new VoiceTranscriptionWorkletNode(audioContext, {
					channelCount: AudioWorkletVoiceRecognitionService.AUDIO_CHANNELS,
					channelCountMode: 'explicit',
					processorOptions: {
						bufferTimespan: AudioWorkletVoiceRecognitionService.BUFFER_TIMESPAN,
						vadThreshold: AudioWorkletVoiceRecognitionService.VAD_THRESHOLD
					}
				}, onDidTranscribe, this.sharedProcessService);
				await voiceTranscriptionTarget.start(cts.token);

				if (cts.token.isCancellationRequested) {
					return;
				}

				microphoneSource.connect(voiceTranscriptionTarget);

				progress.report({ message: localize('voiceTranscriptionRecording', "Recording from microphone...") });
				recordingReady.complete();

				return recordingDone.p;
			} catch (error) {
				this.notificationService.error(localize('voiceTranscriptionError', "Voice transcription failed: {0}", error.message));

				recordingReady.error(error);
				recordingDone.error(error);
			}
		}, () => {
			cts.cancel();
		});

		return recordingReady.p;
	}
}

class SpeechProviderVoiceRecognitionService implements IWorkbenchVoiceRecognitionService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@ISpeechService private readonly speechService: ISpeechService
	) { }

	async transcribe(token: CancellationToken, options?: IWorkbenchVoiceRecognitionOptions): Promise<Event<string>> {
		const disposables = new DisposableStore();
		const cts = disposables.add(new CancellationTokenSource(token));

		disposables.add(cts.token.onCancellationRequested(() => {
			disposables.dispose();

			options?.onDidCancel?.();
		}));

		const onDidTranscribe = disposables.add(new Emitter<string>());
		await this.doTranscribe(onDidTranscribe, disposables, cts);

		return onDidTranscribe.event;
	}

	private doTranscribe(onDidTranscribe: Emitter<string>, disposables: DisposableStore, cts: CancellationTokenSource): Promise<void> {
		const recordingReady = new DeferredPromise<void>();

		const token = cts.token;
		disposables.add(token.onCancellationRequested(() => recordingReady.complete()));

		this.progressService.withProgress({
			location: ProgressLocation.Window,
			title: localize('voiceTranscription', "Voice Transcription"),
			cancellable: true
		}, async progress => {
			const recordingDone = new DeferredPromise<void>();

			try {
				progress.report({ message: localize('voiceTranscriptionGettingReady', "Getting microphone ready...") });

				const allSentences: string[] = [];
				const currentSentence: string[] = [];

				const session = disposables.add(this.speechService.createSpeechToTextSession('default', token));
				disposables.add(session.onDidChange(e => {
					if (token.isCancellationRequested) {
						return;
					}

					switch (e.status) {
						case SpeechToTextStatus.Started:
							progress.report({ message: localize('voiceTranscriptionRecording', "Recording from microphone...") });
							recordingReady.complete();
							break;
						case SpeechToTextStatus.Recognizing:
							if (e.text) {
								currentSentence.push(e.text);

								onDidTranscribe.fire([allSentences.join(' '), ...currentSentence].join(' '));
							}
							break;
						case SpeechToTextStatus.Recognized:
							if (e.text) {
								allSentences.push(e.text);
								currentSentence.length = 0;

								onDidTranscribe.fire(allSentences.join(' '));
							}

							break;
						case SpeechToTextStatus.Stopped:
							disposables.dispose();
							recordingDone.complete();
							break;
					}
				}));
			} catch (error) {
				this.notificationService.error(localize('voiceTranscriptionError', "Voice transcription failed: {0}", error.message));

				recordingReady.error(error);
				recordingDone.error(error);
			}

			return recordingDone.p;
		}, () => {
			cts.cancel();
		});

		return recordingReady.p;
	}
}

// Register Service
registerSingleton(IWorkbenchVoiceRecognitionService, SpeechProviderVoiceRecognitionService, InstantiationType.Delayed);
