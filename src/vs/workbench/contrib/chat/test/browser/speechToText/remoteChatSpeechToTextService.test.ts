/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { TestAuthenticationService } from '../../../../../services/authentication/test/browser/authenticationQueryServiceMocks.js';
import { IDictationAudioCapture, IDictationAudioCaptureFactory } from '../../../browser/speechToText/dictationAudioCapture.js';
import { RemoteChatSpeechToTextService, RemoteChatSpeechToTextState } from '../../../browser/speechToText/remoteChatSpeechToTextService.js';
import { IVoiceCodeTranscription, IVoiceCodeTranscriptionClient, IVoiceCodeTranscriptionError } from '../../../browser/speechToText/voiceCodeTranscriptionClient.js';
import { AudioCaptureLeaseService, IAudioCaptureLeaseService } from '../../../browser/voiceClient/audioCaptureLeaseService.js';

class TestAudioCapture implements IDictationAudioCapture {
	private readonly _onAudioChunk = new Emitter<string>();
	readonly onAudioChunk = this._onAudioChunk.event;
	isCapturing = false;

	async acquire(): Promise<void> {
		this.isCapturing = true;
	}

	start(): void { }

	async stop(): Promise<void> {
		this._onAudioChunk.fire('drain-audio');
		this.isCapturing = false;
	}

	cancel(): void {
		this.isCapturing = false;
	}

	dispose(): void {
		this._onAudioChunk.dispose();
	}
}

class TestAudioCaptureFactory implements IDictationAudioCaptureFactory {
	declare readonly _serviceBrand: undefined;

	create(): IDictationAudioCapture {
		return new TestAudioCapture();
	}
}

class TestTranscriptionClient extends Disposable implements IVoiceCodeTranscriptionClient {
	declare readonly _serviceBrand: undefined;
	private readonly _onTranscription = this._register(new Emitter<IVoiceCodeTranscription>());
	readonly onTranscription = this._onTranscription.event;
	private readonly _onError = this._register(new Emitter<IVoiceCodeTranscriptionError>());
	readonly onError = this._onError.event;
	readonly onDidClose = Event.None;
	isConnected = false;
	readonly sent: { type: string; turnId?: string }[] = [];

	async connect(): Promise<void> {
		this.isConnected = true;
		this.sent.push({ type: 'connect' });
	}

	async startSession(): Promise<void> {
		this.sent.push({ type: 'start_session' });
	}

	sendPttStart(turnId: string): void {
		this.sent.push({ type: 'ptt_start', turnId });
	}

	sendPttAudioChunk(turnId: string): void {
		this.sent.push({ type: 'ptt_audio_chunk', turnId });
	}

	sendPttEnd(turnId: string): void {
		this.sent.push({ type: 'ptt_end', turnId });
	}

	disconnect(): void {
		this.isConnected = false;
	}

	emitFinal(turnId: string, text: string): void {
		this._onTranscription.fire({ turnId, text, status: 'final', revision: 1 });
	}

	emitError(error: IVoiceCodeTranscriptionError): void {
		this._onError.fire(error);
	}
}

class ExistingSessionAuthenticationService extends TestAuthenticationService {
	readonly session: AuthenticationSession = {
		id: 'session',
		accessToken: 'github-token',
		account: { id: 'account', label: 'account' },
		scopes: ['read:user', 'user:email'],
	};
	createCount = 0;

	override async getSessions(): Promise<readonly AuthenticationSession[]> {
		return [this.session];
	}

	override async createSession(): Promise<AuthenticationSession> {
		this.createCount++;
		return this.session;
	}
}

class DelayedAuthenticationService extends ExistingSessionAuthenticationService {
	private readonly _sessionGate = new DeferredPromise<AuthenticationSession>();

	override async getSessions(): Promise<readonly AuthenticationSession[]> {
		return [await this._sessionGate.p];
	}

	resolve(): void {
		this._sessionGate.complete(this.session);
	}
}

suite('RemoteChatSpeechToTextService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(authenticationService = new ExistingSessionAuthenticationService()): {
		service: RemoteChatSpeechToTextService;
		client: TestTranscriptionClient;
		authenticationService: ExistingSessionAuthenticationService;
	} {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		const configurationService = new TestConfigurationService();
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'wss://voice.test/voice-code/api/v1/realtime/voice',
		};
		const client = store.add(new TestTranscriptionClient());
		store.add(authenticationService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IProductService, productService);
		instantiationService.stub(IVoiceCodeTranscriptionClient, client);
		instantiationService.stub(IDictationAudioCaptureFactory, new TestAudioCaptureFactory());
		instantiationService.stub(IAuthenticationService, authenticationService);
		instantiationService.stub(IAudioCaptureLeaseService, new AudioCaptureLeaseService());
		const service = store.add(instantiationService.createInstance(RemoteChatSpeechToTextService));
		return { service, client, authenticationService };
	}

	test('uses an existing user:email session and waits for the authoritative final', async () => {
		const { service, client, authenticationService } = createService();
		await service.start(mainWindow);
		const turnId = client.sent.find(event => event.type === 'ptt_start')?.turnId;
		assert.ok(turnId);

		const final = service.stopAndTranscribe();
		await Promise.resolve();
		client.emitFinal(turnId, 'authoritative final');

		assert.deepStrictEqual({
			text: await final,
			state: service.state,
			authCreates: authenticationService.createCount,
			protocol: client.sent.map(event => event.type),
		}, {
			text: 'authoritative final',
			state: RemoteChatSpeechToTextState.Idle,
			authCreates: 0,
			protocol: ['connect', 'start_session', 'ptt_start', 'ptt_audio_chunk', 'ptt_end'],
		});
	});

	test('treats quota denial as a terminal turn error without optional accounting fields', async () => {
		const { service, client } = createService();
		let failures = 0;
		store.add(service.onDidFail(() => failures++));
		await service.start(mainWindow);
		const turnId = client.sent.find(event => event.type === 'ptt_start')?.turnId;
		assert.ok(turnId);

		client.emitError({
			detail: 'Daily transcription quota reached',
			code: 'daily_transcription_limit_reached',
			turnId,
			terminal: true,
		});

		assert.deepStrictEqual({
			state: service.state,
			failures,
			connected: client.isConnected,
		}, {
			state: RemoteChatSpeechToTextState.Idle,
			failures: 1,
			connected: false,
		});
	});

	test('does not let a cancelled start clean up a newer session', async () => {
		const authenticationService = new DelayedAuthenticationService();
		const { service, client } = createService(authenticationService);
		const firstStart = service.start(mainWindow);
		assert.strictEqual(service.state, RemoteChatSpeechToTextState.Starting);

		service.cancel();
		await service.start(mainWindow);
		authenticationService.resolve();
		await firstStart;
		assert.deepStrictEqual({
			state: service.state,
			connects: client.sent.filter(event => event.type === 'connect').length,
		}, {
			state: RemoteChatSpeechToTextState.Idle,
			connects: 0,
		});

		await service.start(mainWindow);
		assert.deepStrictEqual({
			state: service.state,
			connects: client.sent.filter(event => event.type === 'connect').length,
		}, {
			state: RemoteChatSpeechToTextState.Recording,
			connects: 1,
		});
		service.cancel();
	});
});
