/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IVoiceTranscriptStore, IVoiceTranscriptTurn } from '../../../../agentsVoice/common/voiceTranscriptStore.js';
import { IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { IMicCaptureService } from '../../../browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController, VoiceSessionController } from '../../../browser/voiceClient/voiceSessionController.js';
import { IVoiceToolDispatchService } from '../../../browser/voiceClient/voiceToolDispatchService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IVoiceClientService, IVoiceTranscription } from '../../../common/voiceClient/voiceClientService.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';

class TestVoiceClientService extends mock<IVoiceClientService>() {
	private narrationCounter = 0;
	readonly requests: { sessionId: string; kind: 'response' | 'confirmation'; text: string; narrationId: string }[] = [];

	override disconnect(): void { }

	override sendSessionContext(): void { }

	override flushSessionContext(): void { }

	override requestNarration(codingSessionId: string, kind: 'response' | 'confirmation', text: string, narrationId?: string): string | undefined {
		const id = narrationId ?? `narration-${++this.narrationCounter}`;
		this.requests.push({ sessionId: codingSessionId, kind, text, narrationId: id });
		return id;
	}
}

class RecordingMicCaptureService extends mock<IMicCaptureService>() {
	readonly pttDownCalls: { turnId: string; passive: boolean | undefined }[] = [];
	abortCalls = 0;
	override readonly onPttStart = Event.None;
	override readonly onPttAudioChunk = Event.None;
	override readonly onPttEnd = Event.None;
	override readonly onPttDiagnostic = Event.None;
	override readonly analyserNode = undefined;
	override isMuted = false;
	override prepare(): void { }
	override async startCapture(): Promise<void> { }
	override stopCapture(): void { }
	override abortPtt(): void { this.abortCalls++; }
	override pttUp(): void { }
	override suppressUntil(): void { }
	override async pttDown(turnId: string, passive?: boolean): Promise<void> {
		this.pttDownCalls.push({ turnId, passive });
	}
}

class TestTtsPlaybackService extends mock<ITtsPlaybackService>() {
	override readonly isPlaying = false;
	override readonly onPlaybackStarted = Event.None;
	override readonly onPlaybackStopped = Event.None;
	override readonly analyserNode = undefined;
	override getLastPlayedSamples(): Float32Array | null { return null; }
	override closeContext(): void { }
	override stopPlayback(): void { }
}

class TestAgentSessionsService extends mock<IAgentSessionsService>() {
	override readonly onDidChangeSessionArchivedState = Event.None;
	override readonly model: IAgentSessionsModel = {
		onWillResolve: Event.None,
		onDidResolve: Event.None,
		sessions: [],
		onDidChangeSessions: Event.None,
		onDidChangeSessionArchivedState: Event.None,
		resolved: true,
		getSession: () => undefined,
		observeSession: () => observableValue('session', undefined),
		resolve: async () => { },
	};
}

class TestChatService extends mock<IChatService>() {
	override readonly chatModels = observableValue('chatModels', []);
	override getSession(): undefined { return undefined; }
}

class TestChatWidgetService extends mock<IChatWidgetService>() {
	override readonly onDidChangeFocusedSession = Event.None;
	override readonly onDidAddWidget = Event.None;
	override getAllWidgets() { return []; }
}

suite('VoiceSessionController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => {
		clock.restore();
		sinon.restore();
	});

	function createController(voiceClientService: TestVoiceClientService, micCaptureService?: IMicCaptureService): IVoiceSessionController {
		return store.add(new VoiceSessionController(
			voiceClientService,
			micCaptureService ?? new class extends mock<IMicCaptureService>() {
				override readonly onPttStart = Event.None;
				override readonly onPttAudioChunk = Event.None;
				override readonly onPttEnd = Event.None;
				override readonly onPttDiagnostic = Event.None;
				override readonly analyserNode = undefined;
				override prepare(): void { }
				override async startCapture(): Promise<void> { }
				override stopCapture(): void { }
			}(),
			new TestTtsPlaybackService(),
			new class extends mock<IVoiceToolDispatchService>() {
				override setDelegate(): void { }
			}(),
			new class extends mock<IVoicePlaybackService>() {
				override notifyPlaybackStart(): void { }
			}(),
			new TestAgentSessionsService(),
			new TestChatService(),
			new class extends mock<ICommandService>() {
				override async executeCommand(): Promise<undefined> { return undefined; }
			}(),
			new class extends mock<IAuthenticationService>() {
				override async getSessions(): Promise<[]> { return []; }
			}(),
			new class extends mock<IVoiceTranscriptStore>() {
				override async loadTurns(): Promise<[]> { return []; }
			}(),
			new NullLogService(),
			new class extends mock<IWorkbenchEnvironmentService>() { }(),
			NullTelemetryService,
			new TestConfigurationService({ 'agents.voice.handsFree': false }),
			new class extends mock<IAccessibilitySignalService>() {
				override async playSignal(): Promise<void> { }
			}(),
			new TestAccessibilityService(),
			new TestChatWidgetService(),
			new class extends mock<INotificationService>() { }(),
		));
	}

	test('restores idle state when solicited narration never starts returning audio', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: 'response' | 'confirmation', text: string) => boolean;
		const pendingSolicitedNarrations = Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, unknown>;

		assert.strictEqual(narrate.call(controller, 'agent-host-copilot:/session-1', 'response', 'Done'), true);
		assert.deepStrictEqual(voiceClientService.requests, [{
			sessionId: 'agent-host-copilot:/session-1',
			kind: 'response',
			text: 'Done',
			narrationId: 'narration-1',
		}]);

		clock.tick(30_000);

		assert.strictEqual(controller.voiceState.get(), 'idle');
		assert.strictEqual(controller.statusText.get(), 'Hold to speak...');
		assert.strictEqual(pendingSolicitedNarrations.size, 0);
	});

	test('stops the audio-start watchdog once audio arrives and does not time out the stream', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: 'response' | 'confirmation', text: string) => boolean;
		const markAudioStarted = Reflect.get(controller, '_markSolicitedNarrationAudioStarted') as (narrationId: string | undefined) => void;
		const pendingSolicitedNarrations = Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, unknown>;

		assert.strictEqual(narrate.call(controller, URI.parse('agent-host-copilot:/session-2').toString(), 'response', 'Ready'), true);

		// Audio starts before the audio-start watchdog fires, so it is cancelled.
		clock.tick(10_000);
		markAudioStarted.call(controller, 'narration-1');

		// Well past any timeout: the stream is left to finalize normally, so the
		// narration stays tracked and state is untouched (no finalize timeout).
		clock.tick(120_000);

		assert.strictEqual(pendingSolicitedNarrations.size, 1);
		assert.strictEqual(controller.statusText.get(), 'Tap to start');
	});

	test('does not restore state while another solicited narration is still awaiting audio', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: 'response' | 'confirmation', text: string) => boolean;
		const pendingSolicitedNarrations = Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, unknown>;

		// First narration armed at t=0 (audio-start watchdog fires at t=30s).
		assert.strictEqual(narrate.call(controller, 'agent-host-copilot:/session-a', 'response', 'First'), true);
		// Second narration armed at t=15s (its watchdog fires at t=45s).
		clock.tick(15_000);
		assert.strictEqual(narrate.call(controller, 'agent-host-copilot:/session-b', 'response', 'Second'), true);
		assert.strictEqual(pendingSolicitedNarrations.size, 2);

		// First watchdog fires: the second narration is still awaiting audio, so
		// state must NOT be restored yet — its own watchdog owns that.
		clock.tick(15_000);
		assert.strictEqual(pendingSolicitedNarrations.size, 1);
		assert.strictEqual(controller.statusText.get(), 'Tap to start');

		// Second (last outstanding) watchdog fires: now state is restored.
		clock.tick(15_000);
		assert.strictEqual(pendingSolicitedNarrations.size, 0);
		assert.strictEqual(controller.voiceState.get(), 'idle');
		assert.strictEqual(controller.statusText.get(), 'Hold to speak...');
	});

	test('does not restore state while a direct reply is still awaited', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: 'response' | 'confirmation', text: string) => boolean;
		const setAwaitingReply = Reflect.get(controller, '_setAwaitingReply') as () => void;
		const pendingSolicitedNarrations = Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, unknown>;

		// Narration armed at t=0 (audio-start watchdog fires at t=30s).
		assert.strictEqual(narrate.call(controller, 'agent-host-copilot:/session-c', 'response', 'Done'), true);
		// A direct reply becomes awaited at t=1s (its own watchdog fires at t=31s,
		// after the narration's), so `_awaitingReplyAudio` is still set when the
		// narration times out.
		clock.tick(1_000);
		setAwaitingReply.call(controller);

		clock.tick(29_000);

		// The narration's audio-start watchdog fired, but a direct reply is still
		// expected, so it must not clobber that reply's state.
		assert.strictEqual(pendingSolicitedNarrations.size, 0);
		assert.strictEqual(controller.statusText.get(), 'Tap to start');
	});
	test('auto-listen opens a passive mic turn so the backend does not latch user_is_speaking', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		const enterAutoListen = Reflect.get(controller, '_enterAutoListen') as () => void;
		enterAutoListen.call(controller);

		assert.strictEqual(mic.pttDownCalls.length, 1);
		assert.strictEqual(mic.pttDownCalls[0].passive, true);
	});

	test('a deliberate user press opens a non-passive mic turn', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		controller.pttDown();

		assert.strictEqual(mic.pttDownCalls.length, 1);
		assert.strictEqual(mic.pttDownCalls[0].passive, false);
	});

	test('a deliberate press awaiting narration is preserved so its ptt_end clears the backend latch', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		controller.pttDown();
		assert.strictEqual(Reflect.get(controller, '_pttHeld'), true);

		(Reflect.get(controller, '_prepareForPlayback') as () => void).call(controller);

		// The non-passive press latched `user_is_speaking` on the backend; aborting
		// it here would send no ptt_end and strand the latch, so it stays open.
		assert.strictEqual(mic.abortCalls, 0);
		assert.strictEqual(Reflect.get(controller, '_pttHeld'), true);
	});

	test('a passive open-mic turn is torn down for playback since it never latched', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		Reflect.set(controller, '_pttCurrentTurnId', 'passive-turn');
		Reflect.set(controller, '_pttCurrentTurnPassive', true);
		Reflect.set(controller, '_pttHeld', true);

		(Reflect.get(controller, '_prepareForPlayback') as () => void).call(controller);

		assert.strictEqual(mic.abortCalls, 1);
		assert.strictEqual(Reflect.get(controller, '_pttHeld'), false);
	});

	test('a held deliberate press keeps buffered narration deferred instead of playing over the press', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		// A deliberate (non-passive) press is being held; it latched the backend.
		Reflect.set(controller, '_pttCurrentTurnId', 'deliberate-turn');
		Reflect.set(controller, '_pttCurrentTurnPassive', false);
		Reflect.set(controller, '_pttHeld', true);

		// Buffer a finished response for a session that is now focused.
		const deferred = Reflect.get(controller, '_deferredResponses') as Map<string, { responseId?: string; finalized: boolean; chunks: { audio: string; isFirstChunk: boolean; isFinal: boolean; transcript: string | undefined }[] }[]>;
		deferred.set('session-1', [{
			responseId: 'r1',
			finalized: true,
			chunks: [{ audio: 'AAAA', isFirstChunk: true, isFinal: true, transcript: 'hello there' }],
		}]);

		const flush = Reflect.get(controller, '_flushDeferredResponse') as (sessionId: string) => { flushed: boolean; retained?: boolean; finalTranscripts: readonly string[] };
		const result = flush.call(controller, 'session-1');

		// The press is preserved, so nothing plays and the response stays buffered
		// for a later flush (the periodic safety-net re-flush once the press
		// releases, or a later focus). `retained` tells the focus path to skip
		// issuing a fresh narration for this same reply.
		assert.strictEqual(result.flushed, false);
		assert.strictEqual(result.retained, true);
		assert.strictEqual(Reflect.get(controller, '_currentPlaybackSessionId'), null);
		assert.strictEqual((Reflect.get(controller, '_audioQueue') as unknown[]).length, 0);
		const remaining = deferred.get('session-1');
		assert.ok(remaining && remaining.length === 1, 'buffered response should remain deferred');
		assert.strictEqual(Reflect.get(controller, '_pttHeld'), true);
	});

	test('a buffered reply retained under a held press is not re-narrated (no duplicate on release)', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		const key = URI.parse('agent-host-copilot:/session-1').toString();

		// A deliberate (non-passive) press is held; it latched the backend.
		Reflect.set(controller, '_pttCurrentTurnId', 'deliberate-turn');
		Reflect.set(controller, '_pttCurrentTurnPassive', false);
		Reflect.set(controller, '_pttHeld', true);

		// The session has a completed reply present BOTH as buffered audio and as
		// a pending summary - the same reply the focus path would otherwise speak.
		const deferred = Reflect.get(controller, '_deferredResponses') as Map<string, { responseId?: string; finalized: boolean; chunks: { audio: string; isFirstChunk: boolean; isFinal: boolean; transcript: string | undefined }[] }[]>;
		deferred.set(key, [{
			responseId: 'r1',
			finalized: true,
			chunks: [{ audio: 'AAAA', isFirstChunk: true, isFinal: true, transcript: 'all done' }],
		}]);
		(Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).set(key, 'all done');

		// Focus the session while the press is still held.
		(Reflect.get(controller, '_activateShownSession') as (resource: URI) => void).call(controller, URI.parse(key));

		// No fresh narration is requested: the buffered audio plays on release, so
		// issuing one now (NACK'd busy, deferred, retried on release) would double
		// up with that buffer. The reply stays buffered until the press releases.
		assert.strictEqual(voiceClientService.requests.length, 0, 'no narration should be requested while the press retains the buffer');
		const remaining = deferred.get(key);
		assert.ok(remaining && remaining.length === 1, 'buffered reply stays deferred for release');
	});

	test('a different pending reply is still narrated when an unrelated buffer is retained under a held press', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		const key = URI.parse('agent-host-copilot:/session-1').toString();

		// A deliberate (non-passive) press is held; it latched the backend.
		Reflect.set(controller, '_pttCurrentTurnId', 'deliberate-turn');
		Reflect.set(controller, '_pttCurrentTurnPassive', false);
		Reflect.set(controller, '_pttHeld', true);

		// The buffer holds an OLDER reply, but the session's current pending
		// summary is a DIFFERENT, newer reply (the buffer survived a new turn -
		// a `thinking` transition clears _deferredNarrations, not _deferredResponses).
		const deferred = Reflect.get(controller, '_deferredResponses') as Map<string, { responseId?: string; finalized: boolean; chunks: { audio: string; isFirstChunk: boolean; isFinal: boolean; transcript: string | undefined }[] }[]>;
		deferred.set(key, [{
			responseId: 'r1',
			finalized: true,
			chunks: [{ audio: 'AAAA', isFirstChunk: true, isFinal: true, transcript: 'old reply' }],
		}]);
		(Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).set(key, 'a different newer reply');

		(Reflect.get(controller, '_activateShownSession') as (resource: URI) => void).call(controller, URI.parse(key));

		// Retention must suppress ONLY a duplicate of the buffered reply, so the
		// different pending reply still narrates (deferred/retried while held).
		assert.strictEqual(voiceClientService.requests.length, 1, 'the different reply must still be narrated');
		assert.strictEqual(voiceClientService.requests[0].text, 'a different newer reply');
		const remaining = deferred.get(key);
		assert.ok(remaining && remaining.length === 1, 'the unrelated buffered reply stays deferred');
	});

	test('promoting a passive barge-in listen clears the passive flag so playback preserves the press', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		// A passive barge-in listen is streaming during assistant playback.
		Reflect.set(controller, '_bargeInListenActive', true);
		Reflect.set(controller, '_pttHeld', true);
		Reflect.set(controller, '_pttCurrentTurnPassive', true);

		// A deliberate press promotes it into a user-driven interrupt.
		controller.pttDown();

		assert.strictEqual(Reflect.get(controller, '_pttCurrentTurnPassive'), false);

		// A promoted deliberate press must be preserved (not torn down) by
		// playback prep, since it latched the backend just like a fresh press.
		const prepared = (Reflect.get(controller, '_prepareForPlayback') as () => boolean).call(controller);
		assert.strictEqual(prepared, false);
		assert.strictEqual(mic.abortCalls, 0);
		assert.strictEqual(Reflect.get(controller, '_pttHeld'), true);
	});
});

suite('VoiceSessionController live transcription', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createController(options: { liveTranscript?: boolean } = {}): { controller: VoiceSessionController; persisted: IVoiceTranscriptTurn[] } {
		const liveTranscript = options.liveTranscript ?? true;
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		const persisted: IVoiceTranscriptTurn[] = [];

		instantiationService.stub(IVoiceClientService, {
			disconnect: () => { },
		});
		instantiationService.stub(IMicCaptureService, {
			isMuted: false,
			pttDown: async () => { },
			pttUp: () => { },
			abortPtt: () => { },
			stopCapture: () => { },
			suppressUntil: () => { },
		});
		instantiationService.stub(ITtsPlaybackService, {
			isPlaying: false,
			stopPlayback: () => { },
			closeContext: () => { },
		});
		instantiationService.stub(IVoiceToolDispatchService, {
			setDelegate: () => { },
		});
		instantiationService.stub(IVoicePlaybackService, {
			notifyPlaybackEnd: () => { },
		});
		const agentSessionsModel: IAgentSessionsModel = {
			onWillResolve: Event.None,
			onDidResolve: Event.None,
			onDidChangeSessions: Event.None,
			onDidChangeSessionArchivedState: Event.None,
			resolved: true,
			sessions: [],
			getSession: () => undefined,
			observeSession: () => observableValue('testSession', undefined),
			resolve: async () => { },
		};
		instantiationService.stub(IAgentSessionsService, { model: agentSessionsModel });
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IVoiceTranscriptStore, {
			appendTurn: async (_userId, turn) => {
				persisted.push(turn);
			},
		});
		instantiationService.stub(IConfigurationService, new TestConfigurationService({
			'agents.voice.liveTranscript': liveTranscript,
		}));
		instantiationService.stub(IAccessibilitySignalService, {
			playSignal: async () => { },
		});
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(IChatWidgetService, {
			lastFocusedWidget: undefined,
			onDidAddWidget: Event.None,
			onDidChangeFocusedSession: Event.None,
			getAllWidgets: () => [],
		});

		const controller = store.add(instantiationService.createInstance(VoiceSessionController));
		controller['_isConnected'].set(true, undefined);
		controller['_userLogin'] = 'test-user';
		return { controller, persisted };
	}

	function beginTurn(controller: VoiceSessionController): string {
		controller.pttDown();
		return controller['_pttCurrentTurnId'];
	}

	function finishTurn(controller: VoiceSessionController): void {
		controller['_finishPtt']('local');
	}

	function transcribe(controller: VoiceSessionController, event: IVoiceTranscription): void {
		controller['_handleTranscription'](event);
	}

	test('replaces cumulative partials and final exactly once', () => {
		const { controller, persisted } = createController();
		const turnId = beginTurn(controller);

		transcribe(controller, { text: 'open', committed: 'op', status: 'partial', turnId, revision: 1 });
		transcribe(controller, { text: 'open the file', committed: 'open ', status: 'partial', turnId, revision: 2 });
		transcribe(controller, { text: 'stale lower', committed: '', status: 'partial', turnId, revision: 1 });
		transcribe(controller, { text: 'stale same', committed: '', status: 'partial', turnId, revision: 2 });
		finishTurn(controller);
		transcribe(controller, { text: 'delete the file instead', status: 'final', turnId, revision: 3 });
		transcribe(controller, { text: 'late partial', status: 'partial', turnId, revision: 4 });
		transcribe(controller, { text: 'duplicate final', status: 'final', turnId, revision: 5 });

		assert.deepStrictEqual({
			turns: controller.transcriptTurns.get(),
			persisted: persisted.map(turn => turn.text),
		}, {
			turns: [{
				speaker: 'user',
				text: 'delete the file instead',
				committed: '',
				isPartial: false,
			}],
			persisted: ['delete the file instead'],
		});
	});

	test('ignores a scoped event for another turn', () => {
		const { controller, persisted } = createController();
		const turnId = beginTurn(controller);

		transcribe(controller, { text: 'wrong turn', status: 'final', turnId: `${turnId}-other`, revision: 1 });
		finishTurn(controller);

		assert.deepStrictEqual({
			turns: controller.transcriptTurns.get(),
			persisted,
		}, {
			turns: [{ speaker: 'user', text: '', committed: '', isPartial: true }],
			persisted: [],
		});
	});

	test('accepts the final after auto-end', () => {
		const { controller, persisted } = createController();
		const turnId = beginTurn(controller);

		transcribe(controller, { text: 'run the tests', committed: 'run ', status: 'partial', turnId, revision: 1 });
		controller['_handleTurnAutoEnded']({ reason: 'vad_silence', turnId });
		transcribe(controller, { text: 'run the focused tests', status: 'final', turnId, revision: 2 });

		assert.deepStrictEqual({
			turns: controller.transcriptTurns.get(),
			persisted: persisted.map(turn => turn.text),
		}, {
			turns: [{ speaker: 'user', text: 'run the focused tests', committed: '', isPartial: false }],
			persisted: ['run the focused tests'],
		});
	});

	test('a new turn resets revision tracking', () => {
		const { controller } = createController();
		const firstTurnId = beginTurn(controller);
		transcribe(controller, { text: 'first turn', status: 'partial', turnId: firstTurnId, revision: 10 });
		finishTurn(controller);

		const secondTurnId = beginTurn(controller);
		transcribe(controller, { text: 'second turn', committed: 'second ', status: 'partial', turnId: secondTurnId, revision: 1 });
		finishTurn(controller);

		assert.deepStrictEqual(controller.transcriptTurns.get(), [
			{ speaker: 'user', text: 'first turn', committed: '', isPartial: true },
			{ speaker: 'user', text: 'second turn', committed: 'second ', isPartial: true },
		]);
	});

	test('unscoped legacy events retain replacement and persistence behavior', () => {
		const { controller, persisted } = createController();

		transcribe(controller, { text: 'legacy partial', committed: 'legacy ', status: 'partial' });
		transcribe(controller, { text: 'legacy final corrected', status: 'final' });

		assert.deepStrictEqual({
			turns: controller.transcriptTurns.get(),
			persisted: persisted.map(turn => turn.text),
		}, {
			turns: [{ speaker: 'user', text: 'legacy final corrected', committed: '', isPartial: false }],
			persisted: ['legacy final corrected'],
		});
	});

	test('barge-in and reconnect clear scoped turn tracking', () => {
		const { controller, persisted } = createController();
		const bargeInTurnId = beginTurn(controller);
		finishTurn(controller);
		controller['_handleBargeIn']();
		transcribe(controller, { text: 'after barge-in', status: 'final', turnId: bargeInTurnId, revision: 1 });

		controller['_isConnected'].set(true, undefined);
		const reconnectTurnId = beginTurn(controller);
		finishTurn(controller);
		controller['_onConnectionLost']();
		transcribe(controller, { text: 'after reconnect', status: 'final', turnId: reconnectTurnId, revision: 1 });

		assert.deepStrictEqual(persisted, []);
	});

	test('skips live partials when live transcript is disabled but keeps the final', () => {
		const { controller, persisted } = createController({ liveTranscript: false });
		const turnId = beginTurn(controller);

		transcribe(controller, { text: 'open', committed: 'op', status: 'partial', turnId, revision: 1 });
		transcribe(controller, { text: 'open the file', committed: 'open ', status: 'partial', turnId, revision: 2 });
		finishTurn(controller);
		transcribe(controller, { text: 'open the file', status: 'final', turnId, revision: 3 });

		assert.deepStrictEqual({
			turns: controller.transcriptTurns.get(),
			persisted: persisted.map(turn => turn.text),
		}, {
			turns: [{ speaker: 'user', text: 'open the file', committed: '', isPartial: false }],
			persisted: ['open the file'],
		});
	});
});
