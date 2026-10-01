/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { GptLiveSessionCommandResult, IGptLiveDataChannel, IGptLivePeerConnection, resolveAutomaticVoiceLanguage, VoiceClientService } from '../../../browser/voiceClient/voiceClientService.js';
import { IMicCaptureService } from '../../../browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../browser/voiceClient/ttsPlaybackService.js';
import { IVoiceAudioResponse, IVoiceBargeIn, IVoiceConnectionIssue, IVoiceDispatchResult, IVoiceFatalDisconnect, IVoiceNarrationAck, IVoiceNarrationSignal, IVoiceSessionContext, IVoiceSpeechStarted, IVoiceToolCall, IVoiceTranscription, normalizeAgentsVoiceId } from '../../../common/voiceClient/voiceClientService.js';
import { ISpeechService } from '../../../../speech/common/speechService.js';

class TestWebSocket {
	static instance: TestWebSocket | undefined;

	readyState: number = WebSocket.OPEN;
	readonly sent: Record<string, unknown>[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;

	constructor() {
		TestWebSocket.instance = this;
	}

	close(): void {
		this.readyState = WebSocket.CLOSED;
	}

	send(data: string): void {
		this.sent.push(JSON.parse(data) as Record<string, unknown>);
	}
}

class TestSpeechService extends mock<ISpeechService>() {
	override createVoiceLiveSession(): Promise<undefined> {
		return Promise.resolve(undefined);
	}
}

class TestMediaStreamTrack extends mock<MediaStreamTrack>() {
	override enabled = true;
}

class TestMediaStream extends mock<MediaStream>() {
	constructor(private readonly track: MediaStreamTrack) {
		super();
	}

	override getAudioTracks(): MediaStreamTrack[] {
		return [this.track];
	}
}

class TestRtcTrackEvent extends mock<RTCTrackEvent>() {
	constructor(override readonly track: MediaStreamTrack) {
		super();
	}
}

class TestAudioElement extends mock<HTMLAudioElement>() {
	override autoplay = false;
	override muted = false;
	override srcObject: MediaProvider | null = null;
	playCalls = 0;
	pauseCalls = 0;
	playResult: Promise<void> | undefined;

	override play(): Promise<void> {
		this.playCalls++;
		return this.playResult ?? Promise.resolve();
	}

	override pause(): void { this.pauseCalls++; }
}

class TestMicCaptureService extends mock<IMicCaptureService>() {
	stopCaptureCalls = 0;
	override isMuted = false;

	constructor(override readonly mediaStream: MediaStream | undefined = undefined) {
		super();
	}

	override async startCapture(): Promise<void> { }
	override stopCapture(): void { this.stopCaptureCalls++; }
}

class DeferredTestMicCaptureService extends TestMicCaptureService {
	readonly startCaptureStarted = new DeferredPromise<void>();
	readonly allowStartCapture = new DeferredPromise<void>();

	override async startCapture(): Promise<void> {
		this.startCaptureStarted.complete();
		await this.allowStartCapture.p;
	}
}

class TestRtcDataChannel extends mock<IGptLiveDataChannel>() {
	override readyState: RTCDataChannelState = 'open';
	override onmessage: ((event: MessageEvent) => void) | null = null;
	override onclose: ((event: Event) => void) | null = null;
	readonly sent: Record<string, unknown>[] = [];

	override send(data: string): void {
		this.sent.push(JSON.parse(data) as Record<string, unknown>);
	}

	override close(): void { }

	fireMessage(event: Record<string, unknown>): void {
		this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
	}
}

class TestRtcPeerConnection extends mock<IGptLivePeerConnection>() {
	override iceGatheringState: RTCIceGatheringState = 'complete';
	override connectionState: RTCPeerConnectionState = 'connected';
	override readonly localDescription: RTCSessionDescription = { type: 'offer', sdp: 'offer-sdp', toJSON: () => ({ type: 'offer', sdp: 'offer-sdp' }) };
	override ontrack: ((event: RTCTrackEvent) => void) | null = null;
	override onconnectionstatechange: ((event: Event) => void) | null = null;
	readonly channel = new TestRtcDataChannel();
	remoteDescription: RTCSessionDescriptionInit | undefined;
	readonly gatheringStarted = new DeferredPromise<void>();
	readonly iceListeners = new Set<() => void>();
	closeCalls = 0;

	override addTrack(): RTCRtpSender {
		return new class extends mock<RTCRtpSender>() { };
	}

	override createDataChannel(): IGptLiveDataChannel {
		return this.channel;
	}

	override async createOffer(): Promise<RTCSessionDescriptionInit> {
		return { type: 'offer', sdp: 'offer-sdp' };
	}

	override async setLocalDescription(): Promise<void> { }

	override async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
		this.remoteDescription = description;
	}

	override addEventListener(_type: 'icegatheringstatechange', listener: () => void): void {
		this.iceListeners.add(listener);
		this.gatheringStarted.complete();
	}

	override removeEventListener(_type: 'icegatheringstatechange', listener: () => void): void {
		this.iceListeners.delete(listener);
	}

	override close(): void { this.closeCalls++; }

	fireConnectionState(state: RTCPeerConnectionState): void {
		this.connectionState = state;
		this.onconnectionstatechange?.(new Event('connectionstatechange'));
	}
}

class TestGptLiveVoiceClientService extends VoiceClientService {
	readonly audio = new TestAudioElement();
	readonly configurationService: TestConfigurationService;

	constructor(
		private readonly peer: TestRtcPeerConnection,
		micCaptureService: IMicCaptureService,
		productService: IProductService,
		configuration: Record<string, unknown> = {},
		playbackService: ITtsPlaybackService = new class extends mock<ITtsPlaybackService>() { }(),
	) {
		const configurationService = new TestConfigurationService(configuration);
		super(configurationService, new NullLogService(), productService, micCaptureService, new TestSpeechService(), playbackService);
		this.configurationService = configurationService;
	}

	protected override _executeGptLiveSessionCommand(sdp?: string): Promise<GptLiveSessionCommandResult> {
		return Promise.resolve(sdp === undefined
			? { available: true }
			: { available: true, session: { sessionId: 'live-123', sdp: 'answer-sdp' } });
	}

	protected override _createPeerConnection(): IGptLivePeerConnection {
		return this.peer;
	}

	protected override _createGptLiveAudioElement(): HTMLAudioElement {
		return this.audio;
	}

	protected override _createGptLiveRemoteStream(_window: Window & typeof globalThis, track: MediaStreamTrack): MediaStream {
		return new TestMediaStream(track);
	}
}

function createTestWindow(language = 'en-US'): Window & typeof globalThis {
	return new Proxy(mainWindow, {
		get(target, property, receiver) {
			if (property === 'WebSocket') {
				return TestWebSocket;
			}
			// Native timer methods are branded to their owning `window` and throw
			// "Illegal invocation" when called with a Proxy as `this`; bind to the real target.
			if (property === 'setInterval' || property === 'clearInterval') {
				return target[property].bind(target);
			}
			if (property === 'navigator') {
				return new Proxy(target.navigator, {
					get(navigatorTarget, navigatorProperty, navigatorReceiver) {
						if (navigatorProperty === 'language') {
							return language;
						}
						return Reflect.get(navigatorTarget, navigatorProperty, navigatorReceiver);
					}
				});
			}
			return Reflect.get(target, property, receiver);
		}
	});
}

suite('VoiceClientService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const productService: IProductService = {
		_serviceBrand: undefined,
		...product,
		voiceWsUrl: 'ws://voice.test/realtime/voice',
	};

	setup(() => {
		TestWebSocket.instance = undefined;
	});
	teardown(() => sinon.restore());

	function createService(configuration: Record<string, unknown> = {}): { service: VoiceClientService; configurationService: TestConfigurationService } {
		const configurationService = new TestConfigurationService(configuration);
		const service = store.add(new VoiceClientService(
			configurationService,
			new NullLogService(),
			productService,
			new TestMicCaptureService(),
			new TestSpeechService(),
			new class extends mock<ITtsPlaybackService>() { }(),
		));
		return { service, configurationService };
	}

	function socket(): TestWebSocket {
		if (!TestWebSocket.instance) {
			throw new Error('Voice WebSocket was not created');
		}
		return TestWebSocket.instance;
	}

	function fireConfigurationChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: candidate => candidate === key,
		});
	}

	test('emits barge-in events from the backend', async () => {
		const { service } = createService();
		const events: IVoiceBargeIn[] = [];
		store.add(service.onBargeIn(event => events.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		if (!webSocket.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		webSocket.onmessage(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'barge_in',
				turn_id: 'interrupting-turn',
				interrupted_turn_id: 'cancelled-turn',
			}),
		}));

		assert.deepStrictEqual(events, [{
			turnId: 'interrupting-turn',
			interruptedTurnId: 'cancelled-turn',
		}]);
	});

	test('uses GPT-Live BYOK and maps delegation events onto the existing voice contract', async () => {
		const track = new TestMediaStreamTrack();
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(track)), productService));
		const transcriptions: IVoiceTranscription[] = [];
		const toolCalls: { callId: string; name: string; args: Record<string, unknown> }[] = [];
		const remoteAudioStates: boolean[] = [];
		const initializedSessions: string[] = [];
		store.add(service.onTranscription(event => transcriptions.push(event)));
		store.add(service.onToolCall(event => toolCalls.push(event)));
		store.add(service.onDidChangeRemoteAudioState(state => remoteAudioStates.push(state)));
		store.add(service.onSessionInit(event => initializedSessions.push(event.sessionId)));

		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-123' } });
		service.sendStartSession({ sessions: [{ id: 'session-1', is_active: true, agent_state: 'idle' }], display_locale: '' }, 'machine');
		service.sendStartSession({ sessions: [{ id: 'session-1', is_active: true, agent_state: 'idle' }], display_locale: '' }, 'machine');
		await Promise.resolve();
		service.sendPttStart('turn-1', { hasActiveSession: true });
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: 'Fix the tests' });
		peer.channel.fireMessage({ type: 'session.delegation.created', delegation: { id: 'delegation-1', target: 'client' } });
		service.sendToolResult('delegation-1', 'ok');
		service.requestNarration('session-1', 'response', 'The tests are fixed.', 'narration-1');
		peer.channel.fireMessage({ type: 'session.output_transcript.delta', delta: 'The tests are fixed.' });
		service.sendPttEnd();
		const sent = peer.channel.sent.filter(event => event.type !== 'session.instructions.append' && !(event.type === 'session.thinking.append' && event.delegation_id === null));

		assert.deepStrictEqual({
			connected: service.isConnected,
			sessionId: service.currentSessionId,
			remoteDescription: peer.remoteDescription,
			trackEnabled: track.enabled,
			initializedSessions,
			transcriptions,
			toolCalls,
			remoteAudioStates,
			sent,
		}, {
			connected: true,
			sessionId: 'live-123',
			remoteDescription: { type: 'answer', sdp: 'answer-sdp' },
			trackEnabled: false,
			initializedSessions: ['live-123'],
			transcriptions: [
				{ text: 'Fix the tests', status: 'partial', turnId: 'turn-1' },
				{ text: 'Fix the tests', status: 'final', turnId: 'turn-1' },
			],
			toolCalls: [
				{ callId: 'delegation-1', name: 'send_to_chat', args: { text: 'Fix the tests', coding_session_id: 'session-1' }, turnId: 'turn-1' },
			],
			remoteAudioStates: [true],
			sent: [
				{ type: 'session.input_audio.unmute', event_id: sent[0].event_id },
				{ type: 'session.thinking.append', event_id: sent[1].event_id, delegation_id: 'delegation-1', content: '{"ok":true,"request_status":"accepted","coding_task_status":"pending"}' },
				{ type: 'session.commentary.append', event_id: 'narration-1', delegation_id: 'delegation-1', content: 'The tests are fixed.' },
				{ type: 'session.input_audio.mute', event_id: sent[3].event_id },
			],
		});
	});

	test('grounds direct voice in the chat input and dispatches approval to its captured pending occurrence', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		const calls: IVoiceToolCall[] = [];
		store.add(service.onToolCall(call => calls.push(call)));
		const context = (active: string): IVoiceSessionContext => ({
			display_locale: 'en-US',
			sessions: ['chat-session:/a', 'chat-session:/b'].map(id => ({
				id, label: id, is_active: id === active, agent_state: 'waiting_for_confirmation',
				pending: { type: 'approval', request_id: `request-${id}`, pending_id: `pending-${id}` },
			})),
		});
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-approval' } });
		service.sendStartSession(context('chat-session:/a'), 'machine');
		service.sendPttStart('turn-a', { hasActiveSession: true });
		service.sendSessionContext(context('chat-session:/b'));
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: 'approve', is_final: true });
		peer.channel.fireMessage({ type: 'session.delegation.created', delegation: { id: 'approval-a' } });
		service.sendToolResult('approval-a', { ok: true });
		assert.deepStrictEqual({
			calls,
			grounding: peer.channel.sent.filter(event => event.type === 'session.thinking.append' && event.delegation_id === null).map(event => event.content),
			result: peer.channel.sent.filter(event => event.type === 'session.thinking.append' && event.delegation_id === 'approval-a').at(-1)?.content,
		}, {
			calls: [{
				callId: 'approval-a', name: 'respond_to_session', turnId: 'turn-a', args: {
					coding_session_id: 'chat-session:/a', request_id: 'request-chat-session:/a', pending_id: 'pending-chat-session:/a', response: { type: 'approve' },
				}
			}],
			grounding: [
				'Current chat input: {"id":"chat-session:/a","label":"chat-session:/a","state":"waiting_for_confirmation","pending_type":"approval"}. This is context, not a request to speak.',
				'Current chat input: {"id":"chat-session:/b","label":"chat-session:/b","state":"waiting_for_confirmation","pending_type":"approval"}. This is context, not a request to speak.',
			],
			result: '{"ok":true}',
		});
	});

	test('grounds the initial welcome composer and requires real client delegation before claiming submission', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-composer' } });
		const context: IVoiceSessionContext = { sessions: [], display_locale: 'en-US' };
		service.sendStartSession(context, 'machine');
		service.sendSessionContext(context);
		const instructions = peer.channel.sent.filter(event => event.type === 'session.instructions.append').map(event => event.content).join('');
		assert.deepStrictEqual({
			grounding: peer.channel.sent.filter(event => event.type === 'session.thinking.append').map(event => event.content),
			delegatesCoding: instructions.includes('Delegate every request for coding work or a question for the coding agent to the client.'),
			requiresActualDelegation: instructions.includes('create a client delegation and wait for its result.'),
			usesInput: instructions.includes('when it is null, the client uses the new-session composer. Never ask which chat to use.'),
		}, {
			grounding: ['Current chat input: null. The client routes coding requests to this input\'s new-session composer. This is context, not a request to speak.'],
			delegatesCoding: true, requiresActualDelegation: true, usesInput: true,
		});
	});

	test('keeps dispatch results quiet and distinguishes request acceptance from coding-task completion', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-acknowledgements' } });
		service.sendStartSession({ sessions: [], display_locale: 'en-US' }, 'machine');
		const instructions = peer.channel.sent.filter(event => event.type === 'session.instructions.append').map(event => event.content).join('');
		assert.deepStrictEqual({
			contextAware: instructions.includes('give a brief, context-aware acknowledgement in one short sentence'),
			concise: instructions.includes('Do not repeatedly promise to report back'),
			acceptedNotRunning: instructions.includes('Acceptance does not mean execution has started'),
		}, { contextAware: true, concise: true, acceptedNotRunning: true });
		const results: (string | IVoiceDispatchResult)[] = ['ok', 'error', { ok: true }, { ok: false, reason: 'stale_pending' }];
		for (const [index, result] of results.entries()) {
			service.sendToolResult(`dispatch-${index}`, result);
		}
		assert.deepStrictEqual(peer.channel.sent.filter(event => event.delegation_id).map(event => ({
			type: event.type, delegation: event.delegation_id, content: event.content,
		})), [
			{ type: 'session.thinking.append', delegation: 'dispatch-0', content: '{"ok":true,"request_status":"accepted","coding_task_status":"pending"}' },
			{ type: 'session.thinking.append', delegation: 'dispatch-1', content: 'error' },
			{ type: 'session.commentary.append', delegation: 'dispatch-1', content: 'Your request was not sent. Please review the chat input and send it from there.' },
			{ type: 'session.thinking.append', delegation: 'dispatch-2', content: '{"ok":true}' },
			{ type: 'session.commentary.append', delegation: 'dispatch-2', content: 'Your response was submitted.' },
			{ type: 'session.thinking.append', delegation: 'dispatch-3', content: '{"ok":false,"reason":"stale_pending"}' },
			{ type: 'session.commentary.append', delegation: 'dispatch-3', content: 'The prompt could not be answered. Please check the current prompt in the chat input.' },
		]);
	});

	test('captures a promoted chat at speech onset rather than when passive listening was armed', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		const calls: IVoiceToolCall[] = [];
		store.add(service.onToolCall(call => calls.push(call)));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-promoted' } });
		service.sendSessionContext({ sessions: [], display_locale: 'en-US' });
		service.sendPttStart('passive-turn', { hasActiveSession: false, passive: true });
		service.sendSessionContext({
			sessions: [{ id: 'chat-session:/created', is_active: true, agent_state: 'idle' }],
			display_locale: 'en-US',
		});
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: 'Now fix the tests', start_ms: 100, end_ms: 200 });
		peer.channel.fireMessage({ type: 'session.delegation.created', offset_ms: 250, delegation: { id: 'follow-up' } });
		assert.deepStrictEqual(calls, [{
			callId: 'follow-up', name: 'send_to_chat', turnId: 'passive-turn',
			args: { text: 'Now fix the tests', coding_session_id: 'chat-session:/created' },
		}]);
	});

	test('plays autoplay-blocked remote audio through shared WebAudio with mute, interruption, and disposal', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const disconnected: string[] = [];
			const streams: MediaStream[] = [];
			let resumes = 0;
			let contextCloses = 0;
			const gain: GainNode = upcastPartial<GainNode>({
				gain: upcastPartial<AudioParam>({ value: 1 }),
				connect: () => gain,
				disconnect: () => disconnected.push('gain'),
			});
			const source = upcastPartial<MediaStreamAudioSourceNode>({
				connect: () => gain,
				disconnect: () => disconnected.push('source'),
			});
			const context = upcastPartial<AudioContext>({
				destination: upcastPartial<AudioDestinationNode>({}),
				createMediaStreamSource: stream => { streams.push(stream); return source; },
				createGain: () => gain,
				resume: async () => { resumes++; },
				close: async () => { contextCloses++; },
			});
			const peer = new TestRtcPeerConnection();
			const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService, {}, new class extends mock<ITtsPlaybackService>() {
				override ensureContext(): AudioContext { return context; }
			}()));
			await service.connect(createTestWindow());
			peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-audio-fallback' } });
			service.audio.playResult = Promise.reject(new DOMException('Playback requires a user gesture', 'NotAllowedError'));
			peer.ontrack?.(new TestRtcTrackEvent(new TestMediaStreamTrack()));
			await clock.tickAsync(0);
			const levels = [gain.gain.value];
			await service.configurationService.setUserConfiguration('agents.voice.speakResponses', false);
			fireConfigurationChange(service.configurationService, 'agents.voice.speakResponses');
			levels.push(gain.gain.value);
			await service.configurationService.setUserConfiguration('agents.voice.speakResponses', true);
			fireConfigurationChange(service.configurationService, 'agents.voice.speakResponses');
			levels.push(gain.gain.value);
			peer.channel.fireMessage({ type: 'session.output_transcript.delta', delta: 'Speaking.' });
			service.stopSpeaking();
			levels.push(gain.gain.value);
			await clock.tickAsync(751);
			peer.channel.fireMessage({ type: 'session.output_transcript.delta', delta: 'New reply.' });
			levels.push(gain.gain.value);
			service.disconnect();
			assert.deepStrictEqual({
				levels, streams: streams.length, resumes, contextCloses, disconnected, htmlPlayCalls: service.audio.playCalls, htmlMuted: service.audio.muted,
			}, {
				levels: [1, 0, 1, 0, 1], streams: 1, resumes: 1, contextCloses: 0,
				disconnected: ['source', 'gain'], htmlPlayCalls: 1, htmlMuted: true,
			});
		} finally {
			clock.restore();
		}
	});

	test('does not create a remote audio fallback after its connection was retired', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		const playing = new DeferredPromise<void>();
		const errors: string[] = [];
		store.add(service.onError(message => errors.push(message)));
		await service.connect(createTestWindow());
		service.audio.playResult = playing.p;
		peer.ontrack?.(new TestRtcTrackEvent(new TestMediaStreamTrack()));
		service.disconnect();
		playing.error(new DOMException('Playback requires a user gesture', 'NotAllowedError'));
		await playing.p.catch(() => { });
		await Promise.resolve();
		assert.deepStrictEqual({ errors, stream: service.audio.srcObject }, { errors: [], stream: null });
	});

	test('surfaces non-autoplay remote playback failures', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		const errors: string[] = [];
		store.add(service.onError(message => errors.push(message)));
		await service.connect(createTestWindow());
		service.audio.playResult = Promise.reject(new Error('Invalid audio playback'));
		peer.ontrack?.(new TestRtcTrackEvent(new TestMediaStreamTrack()));
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual(errors, ['Voice playback could not start. Restart Voice Mode from the chat input.']);
	});

	test('matches a delegation inside its last transcript fragment without authorizing later speech', async () => {
		const results = [];
		for (const kind of ['task', 'qualified-approval', 'later-approval'] as const) {
			const peer = new TestRtcPeerConnection();
			const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
			const calls: IVoiceToolCall[] = [];
			store.add(service.onToolCall(call => calls.push(call)));
			await service.connect(createTestWindow());
			peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-overlap' } });
			service.sendSessionContext({
				sessions: [{
					id: 'chat-session:/owner', is_active: true, agent_state: kind === 'task' ? 'idle' : 'waiting_for_confirmation',
					...(kind === 'task' ? {} : { pending: { type: 'approval' as const, request_id: 'request', pending_id: 'pending' } }),
				}],
				display_locale: 'en-US',
			});
			service.sendPttStart('turn', { hasActiveSession: true, passive: true });
			peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: kind === 'task' ? 'Make a ' : '', start_ms: 2000, end_ms: 2200 });
			peer.channel.fireMessage({
				type: 'session.input_transcript.delta', delta: kind === 'task' ? 'tic-tac-toe game.' : kind === 'qualified-approval' ? 'approve, but wait' : 'approve',
				start_ms: kind === 'later-approval' ? 6800 : 6400, end_ms: kind === 'later-approval' ? 7000 : 6800,
			});
			peer.channel.fireMessage({ type: 'session.delegation.created', offset_ms: 6600, delegation: { id: kind } });
			results.push({ kind, calls, clarification: calls.length ? undefined : peer.channel.sent.at(-1)?.content });
		}
		assert.deepStrictEqual(results, [
			{ kind: 'task', calls: [{ callId: 'task', name: 'send_to_chat', turnId: 'turn', args: { text: 'Make a tic-tac-toe game.', coding_session_id: 'chat-session:/owner' } }], clarification: undefined },
			{ kind: 'qualified-approval', calls: [], clarification: 'Please say approve or reject for this prompt, or respond in the chat input.' },
			{ kind: 'later-approval', calls: [], clarification: 'I could not identify the voice turn for this request. Please repeat it in the intended chat input.' },
		]);
	});

	test('direct audio defers background prompts rather than making them answerable from the wrong input', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-scope' } });
		service.sendStartSession({
			display_locale: 'en-US',
			sessions: ['chat-session:/a', 'chat-session:/b'].map(id => ({
				id, is_active: id === 'chat-session:/a', agent_state: 'waiting_for_confirmation',
				pending: { type: 'approval', request_id: 'request', pending_id: id },
			})),
		}, 'machine');
		const background = service.requestNarration('chat-session:/b', 'confirmation', 'Approve B?', 'background', undefined, 'tool', { pendingId: 'chat-session:/b' });
		const active = service.requestNarration('chat-session:/a', 'confirmation', 'Approve A?', 'active', undefined, 'tool', { pendingId: 'chat-session:/a' });
		assert.deepStrictEqual({
			background, active, spoken: peer.channel.sent.filter(event => event.type === 'session.commentary.append').map(event => event.content),
		}, { background: undefined, active: 'active', spoken: ['Approve A?'] });
	});

	test('uses provider timestamps to route late delegations instead of reusing the latest transcript', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		const calls: IVoiceToolCall[] = [];
		store.add(service.onToolCall(call => calls.push(call)));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-timed' } });
		service.sendSessionContext({ sessions: [{ id: 'chat-session:/a', is_active: true, agent_state: 'idle' }], display_locale: 'en-US' });
		service.sendPttStart('turn-a', { hasActiveSession: true });
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: 'Fix A', start_ms: 100, end_ms: 200, is_final: true });
		service.sendSessionContext({ sessions: [{ id: 'chat-session:/a', is_active: false, agent_state: 'idle' }, { id: 'chat-session:/b', is_active: true, agent_state: 'idle' }], display_locale: 'en-US' });
		service.sendPttStart('turn-b', { hasActiveSession: true });
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: 'Fix B', start_ms: 300, end_ms: 400, is_final: true });
		peer.channel.fireMessage({ type: 'session.delegation.created', offset_ms: 250, delegation: { id: 'late-a' } });
		peer.channel.fireMessage({ type: 'session.delegation.created', offset_ms: 450, delegation: { id: 'b' } });
		peer.channel.fireMessage({ type: 'session.delegation.created', offset_ms: 250, delegation: { id: 'duplicate-a' } });
		assert.deepStrictEqual(calls, [
			{ callId: 'late-a', name: 'send_to_chat', args: { text: 'Fix A', coding_session_id: 'chat-session:/a' }, turnId: 'turn-a' },
			{ callId: 'b', name: 'send_to_chat', args: { text: 'Fix B', coding_session_id: 'chat-session:/b' }, turnId: 'turn-b' },
		]);
	});

	test('does not finalize consent fragments when assistant output interleaves with the user correction', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		const calls: IVoiceToolCall[] = [];
		const finals: string[] = [];
		store.add(service.onToolCall(call => calls.push(call)));
		store.add(service.onTranscription(event => { if (event.status === 'final') { finals.push(event.text); } }));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-correction' } });
		service.sendSessionContext({
			sessions: [{ id: 'chat-session:/a', is_active: true, agent_state: 'waiting_for_confirmation', pending: { type: 'approval', request_id: 'request', pending_id: 'pending' } }],
			display_locale: 'en-US',
		});
		service.sendPttStart('turn', { hasActiveSession: true });
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: 'yes', start_ms: 100, end_ms: 200 });
		peer.channel.fireMessage({ type: 'session.output_transcript.delta', delta: 'I am listening.' });
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: ', but wait', start_ms: 200, end_ms: 300 });
		peer.channel.fireMessage({ type: 'session.delegation.created', offset_ms: 350, delegation: { id: 'qualified-reply' } });
		assert.deepStrictEqual({ calls, finals, clarification: peer.channel.sent.at(-1)?.content }, {
			calls: [], finals: ['yes, but wait'], clarification: 'Please say approve or reject for this prompt, or respond in the chat input.',
		});
	});

	test('preserves complete Unicode narration within append limits and does not acknowledge a closed channel', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		const acknowledgements: IVoiceNarrationAck[] = [];
		store.add(service.onNarrationAck(event => acknowledgements.push(event)));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-long-prompt' } });
		service.sendStartSession({ sessions: [{ id: 'chat-session:/a', is_active: true, agent_state: 'idle' }], display_locale: 'en-US' }, 'machine');
		const text = `Please review ${'\u{1f680}'.repeat(600)} and then say approve or reject.`;
		const accepted = service.requestNarration('chat-session:/a', 'confirmation', text, 'full-prompt');
		const parts = peer.channel.sent.filter(event => event.type === 'session.commentary.append').map(event => String(event.content));
		peer.channel.readyState = 'closed';
		const rejected = service.requestNarration('chat-session:/a', 'confirmation', 'Another prompt', 'closed-prompt');
		assert.deepStrictEqual({
			accepted, rejected, content: parts.join(''), bounded: parts.every(part => new TextEncoder().encode(part).byteLength <= 500),
			acknowledgements,
		}, {
			accepted: 'full-prompt', rejected: undefined, content: text, bounded: true,
			acknowledgements: [{ narrationId: 'full-prompt', codingSessionId: 'chat-session:/a', disposition: 'accepted' }],
		});
	});

	test('asks for clarification instead of dispatching ambiguous untimed turns and accepts a fresh retry', async () => {
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
		const calls: IVoiceToolCall[] = [];
		store.add(service.onToolCall(call => calls.push(call)));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-untimed' } });
		service.sendSessionContext({ sessions: [{ id: 'chat-session:/a', is_active: true, agent_state: 'idle' }], display_locale: 'en-US' });
		for (const text of ['Fix A', 'Fix B']) {
			service.sendPttStart(text, { hasActiveSession: true });
			peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: text, is_final: true });
		}
		peer.channel.fireMessage({ type: 'session.delegation.created', delegation: { id: 'ambiguous' } });
		const clarification = peer.channel.sent.at(-1)?.content;
		service.sendPttStart('retry', { hasActiveSession: true });
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: 'Fix C', is_final: true });
		peer.channel.fireMessage({ type: 'session.delegation.created', delegation: { id: 'retry' } });
		assert.deepStrictEqual({ calls, clarification }, {
			calls: [{ callId: 'retry', name: 'send_to_chat', args: { text: 'Fix C', coding_session_id: 'chat-session:/a' }, turnId: 'retry' }],
			clarification: 'I could not identify the voice turn for this request. Please repeat it in the intended chat input.',
		});
	});

	test('cancels pending GPT-Live setup when disconnected', async () => {
		const track = new TestMediaStreamTrack();
		const micCaptureService = new DeferredTestMicCaptureService(new TestMediaStream(track));
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, micCaptureService, productService));

		const connectPromise = service.connect(createTestWindow());
		await micCaptureService.startCaptureStarted.p;
		service.disconnect();
		micCaptureService.allowStartCapture.complete();
		await connectPromise;

		assert.deepStrictEqual({
			remoteDescription: peer.remoteDescription,
			stopCaptureCalls: micCaptureService.stopCaptureCalls,
			trackEnabled: track.enabled,
		}, {
			remoteDescription: undefined,
			stopCaptureCalls: 1,
			trackEnabled: true,
		});
	});

	test('falls back before BYOK selection but not after session creation fails', async () => {
		const outcomes = [];
		for (const selected of [false, true]) {
			const peer = new TestRtcPeerConnection();
			const track = new TestMediaStreamTrack();
			const service = store.add(new class extends TestGptLiveVoiceClientService {
				protected override async _executeGptLiveSessionCommand(sdp?: string): Promise<GptLiveSessionCommandResult> {
					if (selected && sdp === undefined) {
						return { available: true };
					}
					throw new Error('provider unavailable');
				}
			}(peer, new TestMicCaptureService(new TestMediaStream(track)), productService));
			const fatal: IVoiceFatalDisconnect[] = [];
			store.add(service.onFatalDisconnect(event => fatal.push(event)));
			TestWebSocket.instance = undefined;
			await service.connect(createTestWindow());
			outcomes.push({ selected, hosted: !!TestWebSocket.instance, fatal: fatal.length });
		}
		assert.deepStrictEqual(outcomes, [
			{ selected: false, hosted: true, fatal: 0 },
			{ selected: true, hosted: false, fatal: 1 },
		]);
	});

	test('keeps GPT-Live audio synchronized with the speak responses setting', async () => {
		const track = new TestMediaStreamTrack();
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(
			peer,
			new TestMicCaptureService(new TestMediaStream(track)),
			productService,
			{ 'agents.voice.speakResponses': false },
		));

		await service.connect(createTestWindow());
		peer.ontrack?.(new TestRtcTrackEvent(track));
		const initiallyMuted = service.audio.muted;
		await service.configurationService.setUserConfiguration('agents.voice.speakResponses', true);
		fireConfigurationChange(service.configurationService, 'agents.voice.speakResponses');

		assert.deepStrictEqual({
			initiallyMuted,
			mutedAfterEnabling: service.audio.muted,
		}, {
			initiallyMuted: true,
			mutedAfterEnabling: false,
		});
	});

	test('retains finalized input for delayed delegations and dispatches each delegation only once', async () => {
		const track = new TestMediaStreamTrack();
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(track)), productService));
		const transcriptions: IVoiceTranscription[] = [];
		const calls: string[] = [];
		store.add(service.onTranscription(event => transcriptions.push(event)));
		store.add(service.onToolCall(event => calls.push(String(event.args.text))));

		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started', session: { id: 'live-delayed' } });
		service.sendStartSession({ sessions: [{ id: 'chat-session:/a', is_active: true, agent_state: 'idle' }], display_locale: 'en-US' }, 'machine');
		service.sendPttStart('turn-1', { hasActiveSession: true });
		peer.channel.fireMessage({ type: 'session.input_transcript.delta', delta: 'Fix the tests', is_final: true });
		peer.channel.fireMessage({ type: 'session.output_transcript.delta', delta: 'I will do that.' });
		peer.channel.fireMessage({ type: 'session.delegation.created', delegation: { id: 'delegation-1' } });
		peer.channel.fireMessage({ type: 'session.delegation.created', delegation: { id: 'delegation-1' } });

		assert.deepStrictEqual({ transcriptions, calls }, {
			transcriptions: [{ text: 'Fix the tests', status: 'final', turnId: 'turn-1' }],
			calls: ['Fix the tests'],
		});
	});

	test('ignores retired WebRTC callbacks and detaches handlers on disconnect', async () => {
		const track = new TestMediaStreamTrack();
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(track)), productService));
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));
		await service.connect(createTestWindow());
		const onmessage = peer.channel.onmessage;
		const ontrack = peer.ontrack;
		const onclose = peer.channel.onclose;
		service.disconnect();
		ontrack?.(new TestRtcTrackEvent(track));
		onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'session.started' }) }));
		onclose?.(new Event('close'));

		assert.deepStrictEqual({
			connected: service.isConnected,
			playCalls: service.audio.playCalls,
			closeCalls: peer.closeCalls,
			fatal,
			handlers: [peer.ontrack, peer.onconnectionstatechange, peer.channel.onmessage, peer.channel.onclose],
		}, { connected: false, playCalls: 0, closeCalls: 1, fatal: [], handlers: [null, null, null, null] });
	});

	test('keeps a transient WebRTC disconnect alive and cancels its grace timer on recovery', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const peer = new TestRtcPeerConnection();
			const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
			const fatal: IVoiceFatalDisconnect[] = [];
			store.add(service.onFatalDisconnect(event => fatal.push(event)));
			await service.connect(createTestWindow());
			peer.channel.fireMessage({ type: 'session.started' });
			peer.fireConnectionState('disconnected');
			await clock.tickAsync(9_999);
			const beforeRecovery = service.isConnected;
			peer.fireConnectionState('connected');
			await clock.tickAsync(10_001);
			assert.deepStrictEqual({ beforeRecovery, connected: service.isConnected, closeCalls: peer.closeCalls, fatal }, {
				beforeRecovery: true, connected: true, closeCalls: 0, fatal: [],
			});
		} finally {
			clock.restore();
		}
	});

	test('ends a sustained WebRTC disconnect at the original grace deadline', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const peer = new TestRtcPeerConnection();
			const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
			const fatal: IVoiceFatalDisconnect[] = [];
			store.add(service.onFatalDisconnect(event => fatal.push(event)));
			await service.connect(createTestWindow());
			peer.channel.fireMessage({ type: 'session.started' });
			peer.fireConnectionState('disconnected');
			await clock.tickAsync(9_999);
			peer.fireConnectionState('disconnected');
			const beforeDeadline = service.isConnected;
			await clock.tickAsync(1);
			assert.deepStrictEqual({ beforeDeadline, connected: service.isConnected, closeCalls: peer.closeCalls, fatalCount: fatal.length }, {
				beforeDeadline: true, connected: false, closeCalls: 1, fatalCount: 1,
			});
		} finally {
			clock.restore();
		}
	});

	test('failed WebRTC peers terminate immediately and explicit disconnect cancels a recovery timer', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const peer = new TestRtcPeerConnection();
			const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(new TestMediaStreamTrack())), productService));
			const fatal: IVoiceFatalDisconnect[] = [];
			store.add(service.onFatalDisconnect(event => fatal.push(event)));
			await service.connect(createTestWindow());
			peer.channel.fireMessage({ type: 'session.started' });
			peer.fireConnectionState('disconnected');
			peer.fireConnectionState('failed');
			const failedImmediately = !service.isConnected;
			peer.connectionState = 'connected';
			await service.connect(createTestWindow());
			peer.channel.fireMessage({ type: 'session.started' });
			peer.fireConnectionState('disconnected');
			service.disconnect();
			await clock.tickAsync(10_000);
			assert.deepStrictEqual({ failedImmediately, connected: service.isConnected, closeCalls: peer.closeCalls, fatalCount: fatal.length }, {
				failedImmediately: true, connected: false, closeCalls: 2, fatalCount: 1,
			});
		} finally {
			clock.restore();
		}
	});

	test('cancels ICE gathering immediately and removes the listener', async () => {
		const track = new TestMediaStreamTrack();
		const peer = new TestRtcPeerConnection();
		peer.iceGatheringState = 'gathering';
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(track)), productService));
		const connection = service.connect(createTestWindow());
		await peer.gatheringStarted.p;
		service.disconnect();
		await connection;

		assert.deepStrictEqual({ listeners: peer.iceListeners.size, answer: peer.remoteDescription }, { listeners: 0, answer: undefined });
	});

	test('reports server session closure as a terminal disconnect', async () => {
		const track = new TestMediaStreamTrack();
		const peer = new TestRtcPeerConnection();
		const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(track)), productService));
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));
		await service.connect(createTestWindow());
		peer.channel.fireMessage({ type: 'session.started' });
		peer.channel.fireMessage({ type: 'session.closed' });

		assert.deepStrictEqual({ connected: service.isConnected, fatalCount: fatal.length, closeCalls: peer.closeCalls }, { connected: false, fatalCount: 1, closeCalls: 1 });
	});

	test('resumes remote playback for the next response after stopping speech', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const track = new TestMediaStreamTrack();
			const peer = new TestRtcPeerConnection();
			const service = store.add(new TestGptLiveVoiceClientService(peer, new TestMicCaptureService(new TestMediaStream(track)), productService));
			await service.connect(createTestWindow());
			peer.ontrack?.(new TestRtcTrackEvent(track));
			peer.channel.fireMessage({ type: 'session.output_transcript.delta', delta: 'First response' });
			service.stopSpeaking();
			peer.channel.fireMessage({ type: 'session.output_transcript.delta', delta: ' continuation' });
			const playsDuringInterruption = service.audio.playCalls;
			await clock.tickAsync(800);
			peer.channel.fireMessage({ type: 'session.output_transcript.delta', delta: 'Next response' });
			assert.deepStrictEqual({ playsDuringInterruption, playsAfterNextResponse: service.audio.playCalls }, { playsDuringInterruption: 2, playsAfterNextResponse: 3 });
		} finally {
			clock.restore();
		}
	});

	test('preserves the turn ID on speech-started events', async () => {
		const { service } = createService();
		const events: IVoiceSpeechStarted[] = [];
		store.add(service.onSpeechStarted(event => events.push(event)));

		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'speech_started',
				turn_id: 'passive-turn',
			}),
		}));

		assert.deepStrictEqual(events, [{ turnId: 'passive-turn' }]);
	});

	test('preserves checkpoint interruption metadata from the backend', async () => {
		const { service } = createService();
		const events: IVoiceNarrationSignal[] = [];
		store.add(service.onNarrationInterrupted(event => events.push(event)));

		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'narration_interrupted',
				narration_id: 'checkpoint-narration',
				coding_session_id: 'chat-session:/one',
				retryable: false,
				reason: 'superseded_by_response',
			}),
		}));

		assert.deepStrictEqual(events, [{
			narrationId: 'checkpoint-narration',
			codingSessionId: 'chat-session:/one',
			retryable: false,
			reason: 'superseded_by_response',
		}]);
	});

	test('preserves the backend turn ID when audio has a narration ID', async () => {
		const { service } = createService();
		const events: IVoiceAudioResponse[] = [];
		store.add(service.onAudioResponse(event => events.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		if (!webSocket.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		webSocket.onmessage(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'audio_response',
				audio: 'audio',
				is_first_chunk: true,
				is_final: false,
				turn_id: 'backend-turn',
				narration_id: 'client-narration',
				request_id: 'request-1',
				checkpoint_id: 'planning',
				sequence: 1,
				narration_kind: 'checkpoint',
				playback_id: 'playback-1',
			}),
		}));

		assert.deepStrictEqual(events, [{
			audio: 'audio',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: undefined,
			transcript: undefined,
			turnId: 'backend-turn',
			responseId: 'client-narration',
			requestId: 'request-1',
			checkpointId: 'planning',
			sequence: 1,
			narrationKind: 'checkpoint',
			playbackId: 'playback-1',
		}]);
	});

	test('validates and translates scoped transcription metadata', async () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'ws://voice.test/realtime/voice',
		};
		const service = store.add(new VoiceClientService(
			new TestConfigurationService(),
			new NullLogService(),
			productService,
			new TestMicCaptureService(),
			new TestSpeechService(),
			new class extends mock<ITtsPlaybackService>() { }(),
		));
		const events: IVoiceTranscription[] = [];
		store.add(service.onTranscription(event => events.push(event)));

		await service.connect(createTestWindow());
		const socket = TestWebSocket.instance;
		if (!socket?.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		socket.onmessage(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'transcription',
				text: 'create a file',
				status: 'partial',
				committed: 'create ',
				turn_id: 'turn-1',
				revision: 3,
			}),
		}));

		assert.deepStrictEqual(events, [{
			text: 'create a file',
			status: 'partial',
			committed: 'create ',
			turnId: 'turn-1',
			revision: 3,
		}]);
	});

	test('rejects invalid transcription status and revision', async () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'ws://voice.test/realtime/voice',
		};
		const service = store.add(new VoiceClientService(
			new TestConfigurationService(),
			new NullLogService(),
			productService,
			new TestMicCaptureService(),
			new TestSpeechService(),
			new class extends mock<ITtsPlaybackService>() { }(),
		));
		const events: IVoiceTranscription[] = [];
		store.add(service.onTranscription(event => events.push(event)));

		await service.connect(createTestWindow());
		const socket = TestWebSocket.instance;
		if (!socket?.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		for (const message of [
			{ type: 'transcription', text: 'invalid status', status: 'pending' },
			{ type: 'transcription', text: 'unscoped revision', status: 'partial', revision: 1 },
			{ type: 'transcription', text: 'invalid revision', status: 'partial', turn_id: 'turn-1', revision: 1.5 },
			{ type: 'transcription', text: 'negative revision', status: 'partial', turn_id: 'turn-1', revision: -1 },
			{ type: 'transcription', text: 'legacy final' },
		]) {
			socket.onmessage(new mainWindow.MessageEvent('message', { data: JSON.stringify(message) }));
		}

		assert.deepStrictEqual(events, [{
			text: 'legacy final',
			status: 'final',
			committed: '',
			turnId: undefined,
			revision: undefined,
		}]);
	});

	test('sends microphone audio using the PTT protocol', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		service.sendPttStart('turn-1', { hasActiveSession: false });
		service.sendPttAudioChunk('cGNt');
		service.sendPttEnd();

		assert.deepStrictEqual(socket().sent, [
			{ type: 'ptt_start', turn_id: 'turn-1', has_active_session: false },
			{ type: 'ptt_audio_chunk', audio: 'cGNt' },
			{ type: 'ptt_end' },
		]);
	});

	test('sends first-class checkpoint narration metadata', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		const narrationId = service.requestNarration('chat-session:/one', 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 2,
		});
		service.sendNarrationPlaybackComplete('chat-session:/one', narrationId!, 'playback-1');

		assert.deepStrictEqual(socket().sent.slice(1), [
			{
				type: 'request_narration',
				coding_session_id: 'chat-session:/one',
				kind: 'checkpoint',
				text: 'Updating the code.',
				narration_id: narrationId,
				request_id: 'request-1',
				checkpoint_id: 'editing',
				sequence: 2,
			},
			{
				type: 'narration_playback_complete',
				coding_session_id: 'chat-session:/one',
				narration_id: narrationId,
				playback_id: 'playback-1',
			},
		]);
	});

	test('sends typed confirmation narration metadata', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		const narrationId = service.requestNarration(
			'chat-session:/one',
			'confirmation',
			'questionnaire: 1 question',
			undefined,
			undefined,
			'questionnaire',
		);

		assert.deepStrictEqual(socket().sent[1], {
			type: 'request_narration',
			coding_session_id: 'chat-session:/one',
			kind: 'confirmation',
			text: 'questionnaire: 1 question',
			narration_id: narrationId,
			confirmation_type: 'questionnaire',
		});
	});

	test('persists and clears typed confirmation session state', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onopen?.();
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		service.sendSessionContext({
			sessions: [{
				id: 'chat-session:/one',
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: 'questionnaire: 1 question',
				confirmation_type: 'questionnaire',
			}],
			display_locale: 'en-US',
		});
		service.flushSessionContext();
		service.sendSessionContext({
			sessions: [{
				id: 'chat-session:/one',
				is_active: true,
				agent_state: 'idle',
			}],
			display_locale: 'en-US',
		});
		service.flushSessionContext();

		assert.deepStrictEqual(socket().sent.slice(1), [
			{
				type: 'session_context',
				mode: 'delta',
				upserts: [{
					id: 'chat-session:/one',
					is_active: true,
					agent_state: 'waiting_for_confirmation',
					agent_state_detail: 'questionnaire: 1 question',
					confirmation_type: 'questionnaire',
				}],
				removes: [],
			},
			{
				type: 'session_context',
				mode: 'delta',
				upserts: [{
					id: 'chat-session:/one',
					agent_state: 'idle',
					agent_state_detail: null,
					confirmation_type: null,
				}],
				removes: [],
			},
		]);
	});

	test('invalidated context preserves pending deletion tombstones', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onopen?.();
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const sessionId = 'chat-session:/one';

		service.sendSessionContext({
			sessions: [{
				id: sessionId,
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: 'Which region?',
				confirmation_type: 'questionnaire',
				pending: {
					type: 'questions',
					pending_id: 'request-1#p1',
					request_id: 'request-1',
					questions: [],
				},
			}],
			display_locale: 'en-US',
		});
		service.flushSessionContext();
		service.invalidateSessionCache(sessionId);
		service.sendSessionContext({
			sessions: [{
				id: sessionId,
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: 'Which region?',
				confirmation_type: 'questionnaire',
			}],
			display_locale: 'en-US',
		});
		service.flushSessionContext();

		assert.deepStrictEqual(socket().sent.at(-1), {
			type: 'session_context',
			mode: 'delta',
			upserts: [{
				id: sessionId,
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: 'Which region?',
				confirmation_type: 'questionnaire',
				pending: null,
			}],
			removes: [],
		});
	});

	test('normalizes legacy suppressed narration acknowledgements', async () => {
		const { service } = createService();
		const events: IVoiceNarrationAck[] = [];
		store.add(service.onNarrationAck(event => events.push(event)));
		await service.connect(createTestWindow());

		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'narration_ack',
				narration_id: 'narration-1',
				coding_session_id: 'chat-session:/one',
				disposition: 'suppressed',
				reason: 'stale',
			}),
		}));
		assert.deepStrictEqual(events, [{
			narrationId: 'narration-1',
			codingSessionId: 'chat-session:/one',
			disposition: 'suppressed',
			reason: 'stale',
		}]);
	});

	test('flags a passive ptt_start for hands-free barge-in listens', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		service.sendPttStart('turn-passive', { hasActiveSession: true, passive: true });
		service.sendPttStart('turn-real', { hasActiveSession: true, passive: false });
		service.sendPttStart('turn-default', { hasActiveSession: false });

		assert.deepStrictEqual(socket().sent, [
			{ type: 'ptt_start', turn_id: 'turn-passive', has_active_session: true, passive: true },
			{ type: 'ptt_start', turn_id: 'turn-real', has_active_session: true },
			{ type: 'ptt_start', turn_id: 'turn-default', has_active_session: false },
		]);
	});

	test('serializes the pending id on a question narration', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const questionId = service.requestNarration('cs1', 'question', 'Which region?', undefined, undefined, undefined, { pendingId: 'p1' });
		const replyId = service.requestNarration('cs1', 'response', 'Done.');

		assert.deepStrictEqual(socket().sent.filter(message => message.type === 'request_narration'), [
			{ type: 'request_narration', coding_session_id: 'cs1', kind: 'question', text: 'Which region?', narration_id: questionId, pending_id: 'p1' },
			{ type: 'request_narration', coding_session_id: 'cs1', kind: 'response', text: 'Done.', narration_id: replyId },
		]);
	});

	test('drops a narration requested before the session starts', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		const narrationId = service.requestNarration('cs1', 'question', 'Which region?', undefined, undefined, undefined, { pendingId: 'p1' });

		assert.strictEqual(narrationId, undefined);
		assert.deepStrictEqual(socket().sent.filter(message => message.type === 'request_narration'), []);
	});

	test('normalizes a legacy voice identifier in start_session', async () => {
		const { service } = createService({
			'agents.voice.language': 'fr-fr',
			'agents.voice.voice': 'kevin_neutral',
		});

		await service.connect(createTestWindow('de-DE'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent.map(message => ({
			type: message.type,
			session_context: message.session_context,
			voice: message.voice,
			auto_narrate: message.auto_narrate,
		})), [{
			type: 'start_session',
			session_context: { sessions: [], display_locale: 'fr-FR' },
			voice: 'oak_neutral',
			auto_narrate: false,
		}]);
	});

	test('normalizes every canonical and legacy voice identifier, and falls back for invalid values', () => {
		assert.deepStrictEqual(
			[
				'harper_neutral', 'birch_neutral', 'junho_neutral', 'oak_neutral',
				'victoria_neutral', 'maya_neutral', 'daniel_neutral', 'kevin_neutral',
				undefined, '  ', 42, 'unknown_voice',
			].map(normalizeAgentsVoiceId),
			[
				'harper_neutral', 'birch_neutral', 'junho_neutral', 'oak_neutral',
				'harper_neutral', 'birch_neutral', 'junho_neutral', 'oak_neutral',
				'birch_neutral', 'birch_neutral', 'birch_neutral', 'birch_neutral',
			]
		);
	});

	test('uses Birch for missing and legacy Maya values in start_session', async () => {
		const voices = [];
		for (const configuration of [undefined, { 'agents.voice.voice': 'maya_neutral' }]) {
			const { service } = createService(configuration);
			await service.connect(createTestWindow());
			service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
			voices.push(socket().sent[0].voice);
			service.disconnect();
		}

		assert.deepStrictEqual(voices, ['birch_neutral', 'birch_neutral']);
	});

	test('sends voice instructions when starting a session', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine', undefined, undefined, 'Pronounce "Contoso DB" as written.');

		assert.deepStrictEqual(socket().sent.map(message => ({
			type: message.type,
			voice_instructions: message.voice_instructions,
		})), [{
			type: 'start_session',
			voice_instructions: 'Pronounce "Contoso DB" as written.',
		}]);
	});

	test('uses the display language for auto', async () => {
		const first = createService({ 'agents.voice.language': 'auto' });
		await first.service.connect(createTestWindow('pt-BR'));
		first.service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const withBrowserLocale = socket().sent[0].session_context;

		const second = createService({ 'agents.voice.language': 'auto' });
		await second.service.connect(createTestWindow(''));
		second.service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const withoutBrowserLocale = socket().sent[0].session_context;

		assert.deepStrictEqual({ withBrowserLocale, withoutBrowserLocale }, {
			withBrowserLocale: { sessions: [], display_locale: 'en' },
			withoutBrowserLocale: { sessions: [], display_locale: 'en' },
		});
	});

	test('resolves automatic language from display language before browser locale', () => {
		assert.deepStrictEqual({
			displayLanguage: resolveAutomaticVoiceLanguage('en-US', 'de'),
			englishDisplayLanguage: resolveAutomaticVoiceLanguage('de-DE', 'en'),
			browserLocale: resolveAutomaticVoiceLanguage('pt-BR', undefined),
			unsupportedDisplayLanguage: resolveAutomaticVoiceLanguage('pt-BR', 'he-IL'),
			missing: resolveAutomaticVoiceLanguage(undefined, undefined),
		}, {
			displayLanguage: 'de',
			englishDisplayLanguage: 'en',
			browserLocale: 'pt-BR',
			unsupportedDisplayLanguage: 'pt-BR',
			missing: 'en-US',
		});
	});

	test('falls back for an unsupported configured BCP-47 locale', async () => {
		const { service } = createService({ 'agents.voice.language': 'uk-UA' });

		await service.connect(createTestWindow('fr-FR'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en-US',
		});
	});

	test('falls back for a configured ASR-only language', async () => {
		const { service } = createService({ 'agents.voice.language': 'ar' });

		await service.connect(createTestWindow('ar-SA'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en-US',
		});
	});

	test('prefers the display language over an ASR-only browser locale', async () => {
		const { service } = createService({ 'agents.voice.language': 'auto' });

		await service.connect(createTestWindow('ar-SA'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en',
		});
	});

	test('prefers the display language over an unsupported browser locale', async () => {
		const { service } = createService({ 'agents.voice.language': 'auto' });

		await service.connect(createTestWindow('he-IL'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en',
		});
	});

	test('sends one live language update without changing voice', async () => {
		const { service, configurationService } = createService({
			'agents.voice.language': 'auto',
			'agents.voice.voice': 'victoria_neutral',
		});
		await service.connect(createTestWindow('en-GB'));
		service.sendStartSession({ sessions: [], display_locale: 'en-GB' }, 'machine');

		await configurationService.setUserConfiguration('agents.voice.language', 'fr-FR');
		fireConfigurationChange(configurationService, 'agents.voice.language');

		assert.deepStrictEqual(socket().sent.map(message => message.type === 'start_session' ? {
			type: message.type,
			session_context: message.session_context,
			voice: message.voice,
		} : message), [
			{
				type: 'start_session',
				session_context: { sessions: [], display_locale: 'en' },
				voice: 'harper_neutral',
			},
			{ type: 'set_language', language: 'fr-FR' },
		]);
	});

	test('defers a language update until the session starts', async () => {
		const { service, configurationService } = createService({ 'agents.voice.language': 'auto' });
		await service.connect(createTestWindow('en-US'));

		await configurationService.setUserConfiguration('agents.voice.language', 'fr');
		fireConfigurationChange(configurationService, 'agents.voice.language');
		service.sendStartSession({ sessions: [], display_locale: 'en-US' }, 'machine');

		assert.deepStrictEqual(socket().sent.map(message => ({
			type: message.type,
			session_context: message.session_context,
		})), [{
			type: 'start_session',
			session_context: { sessions: [], display_locale: 'fr' },
		}]);
	});

	test('does not update while disconnected and retains language on resume', async () => {
		const { service, configurationService } = createService({
			'agents.voice.language': 'auto',
			'agents.voice.voice': 'daniel_neutral',
		});
		await service.connect(createTestWindow('en-US'));
		const firstSocket = socket();
		firstSocket.onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));
		firstSocket.readyState = WebSocket.CLOSED;

		await configurationService.setUserConfiguration('agents.voice.language', 'de-DE');
		fireConfigurationChange(configurationService, 'agents.voice.language');
		await service.connect(createTestWindow('en-US'));
		service.sendResumeSession({ sessions: [], display_locale: 'en-US' }, 'machine', 'Keep replies concise.');

		assert.deepStrictEqual({
			disconnectedMessages: firstSocket.sent,
			resumeMessages: socket().sent.map(message => ({
				type: message.type,
				session_id: message.session_id,
				session_context: message.session_context,
				voice: message.voice,
				voice_instructions: message.voice_instructions,
				auto_narrate: message.auto_narrate,
			})),
		}, {
			disconnectedMessages: [],
			resumeMessages: [{
				type: 'resume_session',
				session_id: 'session-1',
				session_context: { sessions: [], display_locale: 'de-DE' },
				voice: 'junho_neutral',
				voice_instructions: 'Keep replies concise.',
				auto_narrate: false,
			}],
		});
	});

	test('adopts the server session id and clears isResuming on session_init, even after a failed resume', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));
		assert.strictEqual(service.currentSessionId, 'session-1');
		assert.strictEqual(service.isResuming, false);

		// Simulate a reconnect attempt: the socket opens (marking us as
		// resuming the prior session id) but the server can't resume and
		// starts a brand new session instead.
		socket().onopen?.();
		assert.strictEqual(service.isResuming, true);

		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-2' }),
		}));

		assert.strictEqual(service.currentSessionId, 'session-2');
		assert.strictEqual(service.isResuming, false);
	});

	test('adopts the server session id and clears isResuming on session_resumed', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));
		socket().onopen?.();
		assert.strictEqual(service.isResuming, true);

		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_resumed', session_id: 'session-1' }),
		}));

		assert.strictEqual(service.currentSessionId, 'session-1');
		assert.strictEqual(service.isResuming, false);
	});

	test('resets isResuming on cleanup (terminal disconnect)', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));
		socket().onopen?.();
		assert.strictEqual(service.isResuming, true);

		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 1000, wasClean: true }));

		assert.strictEqual(service.isResuming, false);
		assert.strictEqual(service.currentSessionId, undefined);
	});

	test('reports when an abnormal close has scheduled a reconnect', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onopen?.();

		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4000 }));

		assert.strictEqual(service.willReconnect, true);
		service.disconnect();
		assert.strictEqual(service.willReconnect, false);
	});

	test('treats a registry fatal code as terminal and does not reconnect', async () => {
		const { service } = createService();
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		webSocket.onopen?.();
		webSocket.onclose?.(new mainWindow.CloseEvent('close', {
			code: 4003,
			reason: 'Voice Mode needs a verified @microsoft.com email',
		}));

		assert.strictEqual(fatal.length, 1);
		assert.strictEqual(fatal[0].code, 4003);
		assert.strictEqual(fatal[0].kind, 'fatal');
		assert.strictEqual(fatal[0].reason, 'Voice Mode needs a verified @microsoft.com email');
	});

	test('reports a clean close as terminal so the UI cannot strand on Reconnecting', async () => {
		const { service } = createService();
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		webSocket.onopen?.();
		webSocket.onclose?.(new mainWindow.CloseEvent('close', { code: 1001, reason: 'Session idle timeout' }));

		assert.strictEqual(fatal.length, 1);
		assert.strictEqual(fatal[0].kind, 'expected');
	});

	test('keeps reconnecting for a transient registry code but says why', async () => {
		const { service } = createService();
		const fatal: IVoiceFatalDisconnect[] = [];
		const issues: IVoiceConnectionIssue[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));
		store.add(service.onConnectionIssue(event => issues.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		webSocket.onopen?.();
		webSocket.onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'Cannot reach GitHub' }));

		assert.strictEqual(fatal.length, 0, 'a transient code must not be terminal');
		assert.deepStrictEqual(issues, [{ code: 4503, reason: 'Cannot reach GitHub' }]);
	});

	test('a rejected connection does not refill the reconnect budget', async () => {
		const { service } = createService();
		const reconnect = Reflect.get(service, '_connectWebSocket') as () => void;
		await service.connect(createTestWindow());

		socket().onopen?.();
		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'GitHub' }));
		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 1);

		reconnect.call(service);
		socket().onopen?.();
		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 1, 'onopen must not reset the budget');

		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'GitHub' }));
		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 2);
	});

	test('a recoverable close reports its reason after the disconnect is visible', async () => {
		const { service } = createService();
		const order: string[] = [];
		store.add(service.onDidChangeConnectionState(connected => order.push(`connected:${connected}`)));
		store.add(service.onConnectionIssue(e => order.push(`issue:${e.reason}`)));

		await service.connect(createTestWindow());
		socket().onopen?.();
		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'Cannot reach GitHub' }));

		assert.deepStrictEqual(order, ['connected:true', 'connected:false', 'issue:Cannot reach GitHub']);
	});

	test('a confirmed session resets the reconnect budget', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		const webSocket = socket();
		webSocket.onopen?.();
		webSocket.onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'GitHub' }));
		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 1);

		(Reflect.get(service, '_connectWebSocket') as () => void).call(service);
		socket().onopen?.();
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));

		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 0);
	});

	test('reports a missing backend URL instead of failing silently', async () => {
		const productWithoutUrl: IProductService = { _serviceBrand: undefined, ...product, voiceWsUrl: '' };
		const configurationService = new TestConfigurationService({});
		const service = store.add(new VoiceClientService(configurationService, new NullLogService(), productWithoutUrl, new TestMicCaptureService(), new TestSpeechService(), new class extends mock<ITtsPlaybackService>() { }()));
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));

		await service.connect(createTestWindow());

		assert.strictEqual(fatal.length, 1);
		assert.strictEqual(fatal[0].clientSide, true);
	});


	test('gives up after the reconnect budget rather than retrying for minutes', async () => {
		// The budget is deliberately short: a user watching a reconnect would rather
		// be told it failed than wait. Pin it so it cannot silently grow again.
		const { service } = createService();
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));
		await service.connect(createTestWindow());

		const reconnect = Reflect.get(service, '_connectWebSocket') as () => void;
		const started = Date.now() - 61_000;
		Reflect.set(service, '_reconnectStartedAt', started);

		socket().onopen?.();
		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'GitHub' }));

		assert.strictEqual(fatal.length, 1, 'an exhausted budget must report itself');
		assert.strictEqual(fatal[0].kind, 'fatal');
		assert.strictEqual(service.willReconnect, false, 'no retry may remain scheduled');
		void reconnect;
	});

});
