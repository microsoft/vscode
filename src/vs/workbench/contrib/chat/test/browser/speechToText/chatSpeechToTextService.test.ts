/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILocalTranscriptionModelStatus, ILocalTranscriptionService, LocalTranscriptionModelState } from '../../../../../../platform/localTranscription/common/localTranscription.js';
import { IAudioCaptureLeaseService, AudioCaptureLeaseService } from '../../../browser/voiceClient/audioCaptureLeaseService.js';
import { IRemoteChatSpeechToTextService, RemoteChatSpeechToTextState } from '../../../browser/speechToText/remoteChatSpeechToTextService.js';
import { ChatSpeechToTextService, ChatSpeechToTextState, MAI_VOICE_SPEECH_TO_TEXT_MODEL, SPEECH_TO_TEXT_MODEL_SETTING } from '../../../browser/speechToText/chatSpeechToTextService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

const DEFAULT_LOCAL_MODEL = 'onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4';

class TestLocalTranscriptionService extends Disposable implements ILocalTranscriptionService {
	declare readonly _serviceBrand: undefined;
	readonly isSupported = true;
	readonly onDidChangeModelStatus = Event.None;
	readonly onDidTranscribe = Event.None;
	readonly startGate = new DeferredPromise<void>();
	readonly startCalled = new DeferredPromise<void>();
	readonly stopGate = new DeferredPromise<string>();
	startCount = 0;
	stopCount = 0;
	cancelCount = 0;
	startedModels: (string | undefined)[] = [];
	modelStatus: ILocalTranscriptionModelStatus = { state: LocalTranscriptionModelState.Ready };

	async getModelStatus(): Promise<ILocalTranscriptionModelStatus> {
		return this.modelStatus;
	}

	async start(options: Parameters<ILocalTranscriptionService['start']>[0]): Promise<void> {
		this.startCount++;
		this.startedModels.push(options.model);
		this.startCalled.complete();
		await this.startGate.p;
	}

	async pushAudio(): Promise<void> { }
	async stop(): Promise<string> {
		this.stopCount++;
		return this.stopGate.p;
	}
	async cancel(): Promise<void> { this.cancelCount++; }
}

class TestRemoteSpeechToTextService implements IRemoteChatSpeechToTextService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeState = Event.None;
	readonly onDidUpdateTranscript = Event.None;
	readonly onDidFail = Event.None;
	state = RemoteChatSpeechToTextState.Idle;
	readonly isConfigured = true;
	startCount = 0;
	cancelCount = 0;
	async start(): Promise<void> { this.startCount++; }
	async stopAndTranscribe(): Promise<string | undefined> { return undefined; }
	cancel(): void {
		this.cancelCount++;
		this.state = RemoteChatSpeechToTextState.Idle;
	}
}

suite('ChatSpeechToTextService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createStream(onStop: () => void): MediaStream {
		const track = { stop: onStop } as Partial<MediaStreamTrack> as MediaStreamTrack;
		return { getTracks: () => [track] } as Partial<MediaStream> as MediaStream;
	}

	function createWindow(getUserMedia: () => Promise<MediaStream>): Window & typeof globalThis {
		const mediaDevices = { getUserMedia } as Partial<MediaDevices> as MediaDevices;
		const navigator = new Proxy(mainWindow.navigator, {
			get(target, property, receiver) {
				return property === 'mediaDevices' ? mediaDevices : Reflect.get(target, property, receiver);
			}
		});
		return new Proxy(mainWindow, {
			get(target, property, receiver) {
				return property === 'navigator' ? navigator : Reflect.get(target, property, receiver);
			}
		});
	}

	function createService(
		localTranscription: TestLocalTranscriptionService,
		model = DEFAULT_LOCAL_MODEL,
		remoteSpeechToText = new TestRemoteSpeechToTextService(),
		configurationService = new TestConfigurationService({
			'chat.speechToText.enabled': true,
			[SPEECH_TO_TEXT_MODEL_SETTING]: model,
		}),
	): ChatSpeechToTextService {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(ILocalTranscriptionService, localTranscription);
		instantiationService.stub(IRemoteChatSpeechToTextService, remoteSpeechToText);
		instantiationService.stub(IAudioCaptureLeaseService, new AudioCaptureLeaseService());
		instantiationService.stub(IConfigurationService, configurationService);
		return store.add(instantiationService.createInstance(ChatSpeechToTextService));
	}

	function fireConfigurationChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: candidate => candidate === key,
		});
	}

	test('uses the existing local model by default', async () => {
		const localTranscription = store.add(new TestLocalTranscriptionService());
		const remoteSpeechToText = new TestRemoteSpeechToTextService();
		const service = createService(localTranscription, DEFAULT_LOCAL_MODEL, remoteSpeechToText);
		const starting = service.start(createWindow(async () => createStream(() => { })));
		await localTranscription.startCalled.p;

		assert.deepStrictEqual({
			configured: service.isConfigured,
			localModels: localTranscription.startedModels,
			remoteStarts: remoteSpeechToText.startCount,
		}, {
			configured: true,
			localModels: [DEFAULT_LOCAL_MODEL],
			remoteStarts: 0,
		});

		service.cancel();
		localTranscription.startGate.complete();
		await starting;
	});

	test('restores idle state after local startup failure', async () => {
		const localTranscription = store.add(new TestLocalTranscriptionService());
		const service = createService(localTranscription);

		await assert.rejects(service.start(createWindow(async () => {
			throw new Error('microphone unavailable');
		})), /microphone unavailable/);

		assert.strictEqual(service.state, ChatSpeechToTextState.Idle);
	});

	test('fails immediately when the local model is already in an error state', async () => {
		const localTranscription = store.add(new TestLocalTranscriptionService());
		localTranscription.startGate.complete();
		localTranscription.modelStatus = {
			state: LocalTranscriptionModelState.Error,
			error: 'model unavailable',
			errorCode: 'notFound',
		};
		const service = createService(localTranscription);

		await service.start(createWindow(async () => createStream(() => { })));

		assert.deepStrictEqual({
			state: service.state,
			cancelCount: localTranscription.cancelCount,
		}, {
			state: ChatSpeechToTextState.Idle,
			cancelCount: 2,
		});
	});

	test('switches to MAI Voice between sessions without starting the local loader', async () => {
		const localTranscription = store.add(new TestLocalTranscriptionService());
		const remoteSpeechToText = new TestRemoteSpeechToTextService();
		const configurationService = new TestConfigurationService({
			'chat.speechToText.enabled': true,
			[SPEECH_TO_TEXT_MODEL_SETTING]: DEFAULT_LOCAL_MODEL,
		});
		const service = createService(localTranscription, DEFAULT_LOCAL_MODEL, remoteSpeechToText, configurationService);

		await configurationService.setUserConfiguration(SPEECH_TO_TEXT_MODEL_SETTING, MAI_VOICE_SPEECH_TO_TEXT_MODEL);
		fireConfigurationChange(configurationService, SPEECH_TO_TEXT_MODEL_SETTING);
		await service.start(mainWindow);

		assert.deepStrictEqual({
			localStarts: localTranscription.startCount,
			remoteStarts: remoteSpeechToText.startCount,
		}, {
			localStarts: 0,
			remoteStarts: 1,
		});
	});

	test('cancels an active MAI Voice session when the model changes', async () => {
		const localTranscription = store.add(new TestLocalTranscriptionService());
		const remoteSpeechToText = new TestRemoteSpeechToTextService();
		remoteSpeechToText.state = RemoteChatSpeechToTextState.Recording;
		const configurationService = new TestConfigurationService({
			'chat.speechToText.enabled': true,
			[SPEECH_TO_TEXT_MODEL_SETTING]: MAI_VOICE_SPEECH_TO_TEXT_MODEL,
		});
		const service = createService(localTranscription, MAI_VOICE_SPEECH_TO_TEXT_MODEL, remoteSpeechToText, configurationService);

		await configurationService.setUserConfiguration(SPEECH_TO_TEXT_MODEL_SETTING, DEFAULT_LOCAL_MODEL);
		fireConfigurationChange(configurationService, SPEECH_TO_TEXT_MODEL_SETTING);

		assert.deepStrictEqual({
			state: service.state,
			remoteCancels: remoteSpeechToText.cancelCount,
			localStarts: localTranscription.startCount,
		}, {
			state: ChatSpeechToTextState.Idle,
			remoteCancels: 1,
			localStarts: 0,
		});
	});

	test('cancels while microphone acquisition is pending and discards the late stream', async () => {
		const localTranscription = store.add(new TestLocalTranscriptionService());
		const service = createService(localTranscription);
		const streamGate = new DeferredPromise<MediaStream>();
		let stoppedTracks = 0;

		const starting = service.start(createWindow(() => streamGate.p));
		assert.strictEqual(service.state, ChatSpeechToTextState.Starting);
		service.cancel();
		streamGate.complete(createStream(() => stoppedTracks++));
		await starting;

		assert.deepStrictEqual({
			state: service.state,
			localStarts: localTranscription.startCount,
			stoppedTracks,
		}, {
			state: ChatSpeechToTextState.Idle,
			localStarts: 0,
			stoppedTracks: 1,
		});
	});

	test('cancels while local model startup is pending and does not begin recording afterward', async () => {
		const localTranscription = store.add(new TestLocalTranscriptionService());
		const service = createService(localTranscription);
		let stoppedTracks = 0;
		let microphoneRequests = 0;
		const window = createWindow(async () => {
			microphoneRequests++;
			return createStream(() => stoppedTracks++);
		});

		const starting = service.start(window);
		await localTranscription.startCalled.p;
		assert.strictEqual(service.state, ChatSpeechToTextState.Starting);
		service.cancel();
		await service.start(window);
		localTranscription.startGate.complete();
		await starting;

		assert.deepStrictEqual({
			state: service.state,
			localStarts: localTranscription.startCount,
			cancelCount: localTranscription.cancelCount,
			stoppedTracks,
			microphoneRequests,
		}, {
			state: ChatSpeechToTextState.Idle,
			localStarts: 1,
			cancelCount: 2,
			stoppedTracks: 1,
			microphoneRequests: 1,
		});
	});

	test('blocks restart until cancelled local finalization settles', async () => {
		const localTranscription = store.add(new TestLocalTranscriptionService());
		const service = createService(localTranscription);
		let microphoneRequests = 0;
		const window = createWindow(async () => {
			microphoneRequests++;
			return createStream(() => { });
		});
		Reflect.set(service, '_state', ChatSpeechToTextState.Recording);

		const stopping = service.stopAndTranscribe();
		assert.strictEqual(service.state, ChatSpeechToTextState.Transcribing);
		service.cancel();
		await service.start(window);
		localTranscription.stopGate.complete('late final');
		const finalText = await stopping;

		assert.deepStrictEqual({
			state: service.state,
			stopCount: localTranscription.stopCount,
			microphoneRequests,
			finalText,
		}, {
			state: ChatSpeechToTextState.Idle,
			stopCount: 1,
			microphoneRequests: 0,
			finalText: undefined,
		});
	});
});
