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
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ITtsPlaybackService } from '../../../browser/voiceClient/ttsPlaybackService.js';
import { IVoiceToolDispatchService } from '../../../browser/voiceClient/voiceToolDispatchService.js';
import { IVoiceSessionController, VoiceSessionController } from '../../../browser/voiceClient/voiceSessionController.js';
import { IMicCaptureService } from '../../../browser/voiceClient/micCaptureService.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { IVoiceClientService } from '../../../common/voiceClient/voiceClientService.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IVoiceTranscriptStore } from '../../../../agentsVoice/common/voiceTranscriptStore.js';
import { IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { IChatWidgetService } from '../../../browser/chat.js';

class TestVoiceClientService extends mock<IVoiceClientService>() {
	private narrationCounter = 0;
	readonly requests: { sessionId: string; kind: 'response' | 'confirmation'; text: string; narrationId: string }[] = [];

	override disconnect(): void { }

	override requestNarration(codingSessionId: string, kind: 'response' | 'confirmation', text: string, narrationId?: string): string | undefined {
		const id = narrationId ?? `narration-${++this.narrationCounter}`;
		this.requests.push({ sessionId: codingSessionId, kind, text, narrationId: id });
		return id;
	}
}

class TestTtsPlaybackService extends mock<ITtsPlaybackService>() {
	override readonly isPlaying = false;
	override readonly onPlaybackStarted = Event.None;
	override readonly onPlaybackStopped = Event.None;
	override readonly analyserNode = undefined;
	override getLastPlayedSamples(): Float32Array | null { return null; }
	override closeContext(): void { }
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

	function createController(voiceClientService: TestVoiceClientService): IVoiceSessionController {
		return store.add(new VoiceSessionController(
			voiceClientService,
			new class extends mock<IMicCaptureService>() {
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
			new class extends mock<IVoicePlaybackService>() { }(),
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
			new class extends mock<IAccessibilitySignalService>() { }(),
			new class extends mock<IAccessibilityService>() { }(),
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
});
