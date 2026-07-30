/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
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
import { INotification, INotificationHandle, INotificationService, NoOpNotification } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IVoiceTranscriptStore, IVoiceTranscriptTurn } from '../../../../agentsVoice/common/voiceTranscriptStore.js';
import { AgentSessionStatus, IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { IMicCaptureService } from '../../../browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../browser/voiceClient/ttsPlaybackService.js';
import { IVoiceSessionController, VoiceSessionController } from '../../../browser/voiceClient/voiceSessionController.js';
import { IVoiceToolDispatchService } from '../../../browser/voiceClient/voiceToolDispatchService.js';
import { IChatService, IChatToolInvocation } from '../../../common/chatService/chatService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { derivePendingId, IVoiceAudioResponse, IVoiceBargeIn, IVoiceClientService, IVoiceNarrationSignal, IVoiceSpeechStarted, IVoiceToolCall, IVoiceTranscription, VoiceNarrationKind, IVoiceDispatchResult } from '../../../common/voiceClient/voiceClientService.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';

class TestVoiceClientService extends mock<IVoiceClientService>() {
	private narrationCounter = 0;
	readonly requests: { sessionId: string; kind: VoiceNarrationKind; text: string; narrationId: string; pendingId?: string }[] = [];
	readonly sessionCommands: ('start' | 'resume')[] = [];
	readonly sessionCommandSent = new DeferredPromise<void>();
	private readonly audioResponseEmitter = new Emitter<IVoiceAudioResponse>();
	override readonly onAudioResponse = this.audioResponseEmitter.event;
	private readonly bargeInEmitter = new Emitter<IVoiceBargeIn>();
	override readonly onBargeIn = this.bargeInEmitter.event;
	private readonly transcriptionEmitter = new Emitter<IVoiceTranscription>();
	override readonly onTranscription = this.transcriptionEmitter.event;
	private readonly toolCallEmitter = new Emitter<IVoiceToolCall>();
	override readonly onToolCall = this.toolCallEmitter.event;
	private readonly speechStartedEmitter = new Emitter<IVoiceSpeechStarted>();
	override readonly onSpeechStarted = this.speechStartedEmitter.event;
	override readonly onNarrationAck = Event.None;
	private readonly narrationUnblockedEmitter = new Emitter<IVoiceNarrationSignal>();
	override readonly onNarrationUnblocked = this.narrationUnblockedEmitter.event;
	private readonly narrationInterruptedEmitter = new Emitter<IVoiceNarrationSignal>();
	override readonly onNarrationInterrupted = this.narrationInterruptedEmitter.event;
	override readonly onSessionInit = Event.None;
	override readonly onError = Event.None;
	private readonly connectionStateEmitter = new Emitter<boolean>();
	override readonly onDidChangeConnectionState = this.connectionStateEmitter.event;
	override readonly onFatalDisconnect = Event.None;
	override readonly onTurnAutoEnded = Event.None;
	private connected = false;
	private resuming = false;
	private reconnecting = false;

	override get isConnected(): boolean { return this.connected; }
	override get isResuming(): boolean { return this.resuming; }
	override get willReconnect(): boolean { return this.reconnecting; }
	override disconnect(): void { this.connected = false; }
	override async connect(): Promise<void> { }
	override sendSessionContext(): void { }
	override flushSessionContext(): void { }
	override sendStartSession(): void {
		this.sessionCommands.push('start');
		this.sessionCommandSent.complete();
	}
	override sendResumeSession(): void {
		this.sessionCommands.push('resume');
		this.sessionCommandSent.complete();
	}
	readonly toolResults: { callId: string; result: string }[] = [];
	private toolResultResolver: (() => void) | undefined;
	readonly toolResultReceived = new Promise<void>(resolve => this.toolResultResolver = resolve);
	override sendToolResult(callId: string, result: string): void {
		this.toolResults.push({ callId, result });
		this.toolResultResolver?.();
	}

	override requestNarration(codingSessionId: string, kind: VoiceNarrationKind, text: string, narrationId?: string, pending?: { pendingId: string }): string | undefined {
		const id = narrationId ?? `narration-${++this.narrationCounter}`;
		this.requests.push({ sessionId: codingSessionId, kind, text, narrationId: id, ...(pending ? { pendingId: pending.pendingId } : {}) });
		return id;
	}

	fireAudioResponse(event: IVoiceAudioResponse): void {
		this.audioResponseEmitter.fire(event);
	}

	fireBargeIn(event: IVoiceBargeIn): void {
		this.bargeInEmitter.fire(event);
	}

	fireTranscription(event: IVoiceTranscription): void {
		this.transcriptionEmitter.fire(event);
	}

	fireToolCall(event: IVoiceToolCall): void {
		this.toolCallEmitter.fire(event);
	}

	fireSpeechStarted(turnId?: string): void {
		this.speechStartedEmitter.fire({ turnId });
	}

	fireNarrationInterrupted(event: IVoiceNarrationSignal): void {
		this.narrationInterruptedEmitter.fire(event);
	}

	fireNarrationUnblocked(event: IVoiceNarrationSignal): void {
		this.narrationUnblockedEmitter.fire(event);
	}

	fireConnectionState(connected: boolean, willReconnect = false): void {
		this.connected = connected;
		this.reconnecting = !connected && willReconnect;
		this.connectionStateEmitter.fire(connected);
	}

	setResuming(resuming: boolean): void {
		this.resuming = resuming;
	}

	dispose(): void {
		this.audioResponseEmitter.dispose();
		this.bargeInEmitter.dispose();
		this.transcriptionEmitter.dispose();
		this.toolCallEmitter.dispose();
		this.speechStartedEmitter.dispose();
		this.narrationUnblockedEmitter.dispose();
		this.narrationInterruptedEmitter.dispose();
		this.connectionStateEmitter.dispose();
	}
}

class RecordingMicCaptureService extends mock<IMicCaptureService>() {
	readonly pttDownCalls: { turnId: string; passive: boolean | undefined }[] = [];
	abortCalls = 0;
	prepareCalls = 0;
	startCaptureCalls = 0;
	stopCaptureCalls = 0;
	readonly captureStarted = new DeferredPromise<void>();
	constructor(private readonly captureBarrier?: Promise<void>) {
		super();
	}
	override readonly onPttStart = Event.None;
	override readonly onPttAudioChunk = Event.None;
	override readonly onPttEnd = Event.None;
	override readonly onPttDiagnostic = Event.None;
	override readonly analyserNode = undefined;
	override isMuted = false;
	override prepare(): void { this.prepareCalls++; }
	override async startCapture(): Promise<void> {
		this.startCaptureCalls++;
		if (this.startCaptureCalls === 1) {
			this.captureStarted.complete();
		}
		await this.captureBarrier;
	}
	override stopCapture(): void { this.stopCaptureCalls++; }
	override abortPtt(): void { this.abortCalls++; }
	override pttUp(): void { }
	override suppressUntil(): void { }
	override async pttDown(turnId: string, passive?: boolean): Promise<void> {
		this.pttDownCalls.push({ turnId, passive });
	}
}

class VoiceTestNotificationService extends TestNotificationService {
	readonly notifications: INotification[] = [];

	override notify(notification: INotification): INotificationHandle {
		this.notifications.push(notification);
		return new NoOpNotification();
	}
}

class TestTtsPlaybackService extends mock<ITtsPlaybackService>() {
	readonly playedAudio: string[] = [];
	stopCount = 0;
	private playing = false;
	private readonly playbackStoppedEmitter = new Emitter<void>();

	override get isPlaying(): boolean { return this.playing; }
	override readonly onPlaybackStarted = Event.None;
	override readonly onPlaybackStopped = this.playbackStoppedEmitter.event;
	override readonly analyserNode = undefined;
	override ensureContext(): AudioContext {
		return new class extends mock<AudioContext>() {
			override resume(): Promise<void> { return Promise.resolve(); }
		}();
	}
	override playAudioChunk(audio: string): void {
		if (audio) {
			this.playedAudio.push(audio);
			this.playing = true;
		}
	}
	override stopPlayback(): void {
		this.stopCount++;
		const wasPlaying = this.playing;
		this.playing = false;
		if (wasPlaying) {
			this.playbackStoppedEmitter.fire();
		}
	}
	override getLastPlayedSamples(): Float32Array | null { return null; }
	override closeContext(): void { }
	dispose(): void {
		this.playbackStoppedEmitter.dispose();
	}
}

class TestMicCaptureService extends mock<IMicCaptureService>() {
	override readonly onPttStart = Event.None;
	override readonly onPttAudioChunk = Event.None;
	override readonly onPttEnd = Event.None;
	override readonly onPttDiagnostic = Event.None;
	override readonly analyserNode = undefined;
	override isMuted = false;
	readonly pttTurns: string[] = [];

	override prepare(): void { }
	override async startCapture(): Promise<void> { }
	override stopCapture(): void { }
	override suppressUntil(): void { }
	override async pttDown(turnId: string): Promise<void> {
		this.pttTurns.push(turnId);
	}
	override pttUp(): void { }
	override abortPtt(): void { }
}

class TestAgentSessionsService extends mock<IAgentSessionsService>() {
	override readonly onDidChangeSessionArchivedState = Event.None;
	override readonly model: IAgentSessionsModel;

	constructor(sessions: readonly unknown[] = []) {
		super();
		this.model = {
			onWillResolve: Event.None,
			onDidResolve: Event.None,
			sessions: sessions as IAgentSessionsModel['sessions'],
			onDidChangeSessions: Event.None,
			onDidChangeSessionArchivedState: Event.None,
			resolved: true,
			getSession: () => undefined,
			observeSession: () => observableValue('session', undefined),
			resolve: async () => { },
		};
	}
}

/** An agent session entry as `_buildSessionContext` reads it. */
function agentSessionEntry(id: string, label: string | undefined, status: AgentSessionStatus) {
	return {
		resource: URI.parse(id),
		label,
		status,
		isArchived: () => false,
		timing: { created: Date.now(), lastRequestEnded: Date.now() },
	};
}

class TestChatService extends mock<IChatService>() {
	override readonly chatModels = observableValue('chatModels', []);
	override getSession(): undefined { return undefined; }
	/** A session that never loads: the controller eagerly loads models for waiting sessions. */
	override async acquireOrLoadSession(): Promise<undefined> { return undefined; }
}

/**
 * Chat service whose tracked models can be driven from a test, so the
 * controller's always-on pending-confirmation tracker can be exercised.
 */
class ControllableChatService extends mock<IChatService>() {
	override readonly chatModels = observableValue<readonly IChatModel[]>('chatModels', []);
	private readonly _sessions = new Map<string, IChatModel>();
	override getSession(resource: URI): IChatModel | undefined { return this._sessions.get(resource.toString()); }
	setModels(models: readonly IChatModel[]): void {
		this._sessions.clear();
		for (const model of models) {
			this._sessions.set(model.sessionResource.toString(), model);
		}
		this.chatModels.set(models, undefined);
	}
}

/** Minimal chat model whose last request carries one unanswered question form. */
function pendingPartsModel(parts: object | object[], requestId = 'req-1', pendingDetail?: string): IChatModel {
	const value = Array.isArray(parts) ? parts : [parts];
	const lastRequest = {
		id: requestId,
		response: {
			response: { value },
			isPendingConfirmation: observableValue<{ detail?: string } | undefined>(
				'pending',
				pendingDetail === undefined ? undefined : { detail: pendingDetail },
			),
		},
	};
	return {
		getRequests: () => [lastRequest],
	} as unknown as IChatModel;
}

/**
 * Minimal chat model that the tracker reads as having one pending tool
 * confirmation on its last request.
 */
function pendingConfirmationModel(resource: URI): IChatModel {
	const response = {
		isPendingConfirmation: observableValue<{ detail?: string } | undefined>('pending', { detail: 'Needs approval' }),
		response: { value: [] as readonly { kind: string }[] },
	};
	const lastRequest = { response };
	return {
		sessionResource: resource,
		title: 'Chat',
		getRequests: () => [lastRequest],
		lastRequestObs: observableValue('lastRequest', lastRequest),
	} as unknown as IChatModel;
}

function completedResponseModel(markdown: string, errorMessage?: string, isCanceled = false): IChatModel {
	const response = {
		isPendingConfirmation: observableValue('pending', undefined),
		isIncomplete: observableValue('incomplete', false),
		isCanceled,
		response: {
			value: [],
			getMarkdown: () => markdown,
		},
		result: errorMessage ? { errorDetails: { message: errorMessage } } : undefined,
	};
	return {
		getRequests: () => [{ response }],
	} as unknown as IChatModel;
}

class TestChatWidgetService extends mock<IChatWidgetService>() {
	override readonly onDidChangeFocusedSession = Event.None;
	override readonly onDidAddWidget = Event.None;
	override getAllWidgets() { return []; }
}

class TestCommandService extends mock<ICommandService>() {
	readonly acceptedInputs: string[] = [];

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T> {
		let result: string | undefined;
		if (commandId === '_chat.voice.getCurrentSession') {
			result = 'chat-session';
		} else if (commandId === '_chat.voice.acceptInput' && typeof args[0] === 'string') {
			this.acceptedInputs.push(args[0]);
		}
		return result as T;
	}
}

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { name: string; data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
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

	function createController(
		voiceClientService: TestVoiceClientService,
		ttsPlaybackService = new TestTtsPlaybackService(),
		commandService: ICommandService = new TestCommandService(),
		telemetryService: NullTelemetryServiceShape = NullTelemetryService,
		micCaptureService: IMicCaptureService = new TestMicCaptureService(),
		configurationService: IConfigurationService = new TestConfigurationService({ 'agents.voice.handsFree': false }),
		chatService: IChatService = new TestChatService(),
		promptsService: IPromptsService = new class extends mock<IPromptsService>() {
			override async getVoiceInstructions(): Promise<undefined> { return undefined; }
		}(),
		agentSessionsService: IAgentSessionsService = new TestAgentSessionsService(),
		notificationService: INotificationService = new VoiceTestNotificationService(),
	): IVoiceSessionController {
		store.add({ dispose: () => voiceClientService.dispose() });
		store.add(ttsPlaybackService);
		return store.add(new VoiceSessionController(
			voiceClientService,
			micCaptureService,
			ttsPlaybackService,
			new class extends mock<IVoiceToolDispatchService>() {
				override setDelegate(): void { }
				override async respondToSession(): Promise<IVoiceDispatchResult> { return { ok: true }; }
			}(),
			new class extends mock<IVoicePlaybackService>() {
				override notifyPlaybackStart(): void { }
				override notifyPlaybackEnd(): void { }
			}(),
			agentSessionsService,
			chatService,
			commandService,
			new class extends mock<IAuthenticationService>() {
				override async getSessions(): Promise<[]> { return []; }
			}(),
			new class extends mock<IVoiceTranscriptStore>() {
				override async loadTurns(): Promise<[]> { return []; }
			}(),
			new NullLogService(),
			new class extends mock<IWorkbenchEnvironmentService>() { }(),
			telemetryService,
			configurationService,
			new class extends mock<IAccessibilitySignalService>() {
				override async playSignal(): Promise<void> { }
			}(),
			new TestAccessibilityService(),
			new TestChatWidgetService(),
			notificationService,
			promptsService,
		));
	}

	test('includes response errors in the summary sent to the voice backend', () => {
		const controller = createController(new TestVoiceClientService());
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; last_response_summary?: string };

		assert.deepStrictEqual([
			getAgentStateInfo.call(controller, completedResponseModel('', 'The branch main was not found.')),
			getAgentStateInfo.call(controller, completedResponseModel('I could not rebase the branch.', 'The branch main was not found.')),
			getAgentStateInfo.call(controller, completedResponseModel('The rebase completed.')),
		], [
			{ state: 'idle', last_response_summary: 'The branch main was not found.' },
			{ state: 'idle', last_response_summary: 'I could not rebase the branch.\n\nThe branch main was not found.' },
			{ state: 'idle', last_response_summary: 'The rebase completed.' },
		]);
	});

	test('does not narrate a summary for a cancelled turn', () => {
		const controller = createController(new TestVoiceClientService());
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; last_response_summary?: string };

		assert.deepStrictEqual(
			getAgentStateInfo.call(controller, completedResponseModel('Some partial work the user interrupted.', undefined, true)),
			{ state: 'idle' },
		);
	});

	test('does not finish connecting after voice instructions resolve for a stale attempt', async () => {
		const voiceClientService = new TestVoiceClientService();
		const micCaptureService = new RecordingMicCaptureService();
		const voiceInstructionsStarted = new DeferredPromise<void>();
		const voiceInstructions = new DeferredPromise<string | undefined>();
		const promptsService = new class extends mock<IPromptsService>() {
			override getVoiceInstructions(): Promise<string | undefined> {
				voiceInstructionsStarted.complete();
				return voiceInstructions.p;
			}
		}();
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			micCaptureService,
			undefined,
			undefined,
			promptsService,
		);
		await controller.connect(mainWindow);

		voiceClientService.fireConnectionState(true);
		await voiceInstructionsStarted.p;
		controller.disconnect();
		voiceInstructions.complete('Use Contoso DB.');
		await Promise.resolve();

		assert.deepStrictEqual({
			connected: controller.isConnected.get(),
			prepareCalls: micCaptureService.prepareCalls,
		}, {
			connected: false,
			prepareCalls: 0,
		});
	});

	test('warms hands-free capture before starting or resuming the backend session', async () => {
		const results: {
			command: 'start' | 'resume';
			beforeWarmup: {
				prepareCalls: number;
				startCaptureCalls: number;
				stopCaptureCalls: number;
				sessionCommands: readonly ('start' | 'resume')[];
				socketConnected: boolean;
			};
			afterWarmup: readonly ('start' | 'resume')[];
		}[] = [];
		for (const command of ['start', 'resume'] as const) {
			const voiceClientService = new TestVoiceClientService();
			voiceClientService.setResuming(command === 'resume');
			const captureBarrier = new DeferredPromise<void>();
			const micCaptureService = new RecordingMicCaptureService(captureBarrier.p);
			const controller = createController(
				voiceClientService,
				undefined,
				undefined,
				undefined,
				micCaptureService,
				new TestConfigurationService({ 'agents.voice.handsFree': true }),
			);
			await controller.connect(mainWindow);

			voiceClientService.fireConnectionState(true);
			await micCaptureService.captureStarted.p;
			const beforeWarmup = {
				prepareCalls: micCaptureService.prepareCalls,
				startCaptureCalls: micCaptureService.startCaptureCalls,
				stopCaptureCalls: micCaptureService.stopCaptureCalls,
				sessionCommands: [...voiceClientService.sessionCommands],
				socketConnected: voiceClientService.isConnected,
			};

			captureBarrier.complete();
			await voiceClientService.sessionCommandSent.p;
			results.push({ command, beforeWarmup, afterWarmup: voiceClientService.sessionCommands });
		}

		assert.deepStrictEqual(results, [{
			command: 'start',
			beforeWarmup: {
				prepareCalls: 1,
				startCaptureCalls: 1,
				stopCaptureCalls: 0,
				sessionCommands: [],
				socketConnected: true,
			},
			afterWarmup: ['start'],
		}, {
			command: 'resume',
			beforeWarmup: {
				prepareCalls: 1,
				startCaptureCalls: 1,
				stopCaptureCalls: 1,
				sessionCommands: [],
				socketConnected: true,
			},
			afterWarmup: ['resume'],
		}]);
	});

	test('keeps microphone acquisition lazy when hands-free mode is disabled', async () => {
		const voiceClientService = new TestVoiceClientService();
		const micCaptureService = new RecordingMicCaptureService();
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			micCaptureService,
			new TestConfigurationService({ 'agents.voice.handsFree': false }),
		);
		await controller.connect(mainWindow);

		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;

		assert.deepStrictEqual({
			prepareCalls: micCaptureService.prepareCalls,
			startCaptureCalls: micCaptureService.startCaptureCalls,
			sessionCommands: voiceClientService.sessionCommands,
		}, {
			prepareCalls: 1,
			startCaptureCalls: 0,
			sessionCommands: ['start'],
		});
	});

	test('hands-free warm-up failure returns to idle and allows retry', async () => {
		const voiceClientService = new TestVoiceClientService();
		const resetObserved = new DeferredPromise<void>();
		const micCaptureService = new class extends RecordingMicCaptureService {
			override async startCapture(): Promise<void> {
				this.startCaptureCalls++;
				if (this.startCaptureCalls === 1) {
					throw new Error('microphone unavailable');
				}
			}
		}();
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			micCaptureService,
			new TestConfigurationService({ 'agents.voice.handsFree': true }),
			undefined,
			undefined,
			undefined,
			new class extends VoiceTestNotificationService {
				override notify(notification: INotification): INotificationHandle {
					resetObserved.complete();
					return super.notify(notification);
				}
			}(),
		);
		await controller.connect(mainWindow);

		voiceClientService.fireConnectionState(true);
		await resetObserved.p;
		await Promise.resolve();
		const afterFailure = {
			startCaptureCalls: micCaptureService.startCaptureCalls,
			stopCaptureCalls: micCaptureService.stopCaptureCalls,
			sessionCommands: [...voiceClientService.sessionCommands],
			connecting: controller.isConnecting.get(),
			connected: controller.isConnected.get(),
			status: controller.statusText.get(),
		};

		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual({
			afterFailure,
			startCaptureCalls: micCaptureService.startCaptureCalls,
			sessionCommands: voiceClientService.sessionCommands,
		}, {
			afterFailure: {
				startCaptureCalls: 1,
				stopCaptureCalls: 1,
				sessionCommands: [],
				connecting: false,
				connected: false,
				status: 'Tap to start',
			},
			startCaptureCalls: 2,
			sessionCommands: ['start'],
		});
	});

	test('hands-free permission denial does not add a generic connection notification', async () => {
		const voiceClientService = new TestVoiceClientService();
		const notificationService = new VoiceTestNotificationService();
		const permissionError = new Error('Permission denied');
		permissionError.name = 'NotAllowedError';
		const micCaptureService = new class extends RecordingMicCaptureService {
			override async startCapture(): Promise<void> {
				this.startCaptureCalls++;
				throw permissionError;
			}
		}();
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			micCaptureService,
			new TestConfigurationService({ 'agents.voice.handsFree': true }),
			undefined,
			undefined,
			undefined,
			notificationService,
		);
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await clock.tickAsync(0);

		assert.deepStrictEqual({
			startCaptureCalls: micCaptureService.startCaptureCalls,
			notifications: notificationService.notifications.map(notification => notification.message),
			sessionCommands: voiceClientService.sessionCommands,
			connecting: controller.isConnecting.get(),
			connected: controller.isConnected.get(),
			status: controller.statusText.get(),
		}, {
			startCaptureCalls: 1,
			notifications: [],
			sessionCommands: [],
			connecting: false,
			connected: false,
			status: 'Tap to start',
		});
	});

	test('connect watchdog covers a stalled hands-free warm-up', async () => {
		const voiceClientService = new TestVoiceClientService();
		const captureBarrier = new DeferredPromise<void>();
		const micCaptureService = new RecordingMicCaptureService(captureBarrier.p);
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			micCaptureService,
			new TestConfigurationService({ 'agents.voice.handsFree': true }),
		);
		await controller.connect(mainWindow);

		voiceClientService.fireConnectionState(true);
		await micCaptureService.captureStarted.p;
		clock.tick(10_000);
		captureBarrier.complete();
		await Promise.resolve();

		assert.deepStrictEqual({
			stopCaptureCalls: micCaptureService.stopCaptureCalls,
			sessionCommands: voiceClientService.sessionCommands,
			connecting: controller.isConnecting.get(),
			connected: controller.isConnected.get(),
			status: controller.statusText.get(),
		}, {
			stopCaptureCalls: 1,
			sessionCommands: [],
			connecting: false,
			connected: false,
			status: 'Tap to start',
		});
	});

	test('clean socket close during acquisition aborts initialization and allows explicit retry', async () => {
		const voiceClientService = new TestVoiceClientService();
		const firstCaptureBarrier = new DeferredPromise<void>();
		const micCaptureService = new RecordingMicCaptureService(firstCaptureBarrier.p);
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			micCaptureService,
			new TestConfigurationService({ 'agents.voice.handsFree': true }),
		);
		await controller.connect(mainWindow);

		voiceClientService.fireConnectionState(true);
		await micCaptureService.captureStarted.p;
		voiceClientService.fireConnectionState(false);
		firstCaptureBarrier.complete();
		await Promise.resolve();

		const afterDrop = {
			startCaptureCalls: micCaptureService.startCaptureCalls,
			stopCaptureCalls: micCaptureService.stopCaptureCalls,
			sessionCommands: [...voiceClientService.sessionCommands],
			connected: controller.isConnected.get(),
			status: controller.statusText.get(),
		};

		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;

		assert.deepStrictEqual({
			afterDrop,
			afterRetry: {
				startCaptureCalls: micCaptureService.startCaptureCalls,
				stopCaptureCalls: micCaptureService.stopCaptureCalls,
				sessionCommands: voiceClientService.sessionCommands,
				connected: controller.isConnected.get(),
			},
		}, {
			afterDrop: {
				startCaptureCalls: 1,
				stopCaptureCalls: 1,
				sessionCommands: [],
				connected: false,
				status: 'Tap to start',
			},
			afterRetry: {
				startCaptureCalls: 2,
				stopCaptureCalls: 1,
				sessionCommands: ['start'],
				connected: true,
			},
		});
	});

	test('transient socket drop during acquisition retries warm-up before starting the session', async () => {
		const voiceClientService = new TestVoiceClientService();
		const firstCaptureBarrier = new DeferredPromise<void>();
		const micCaptureService = new RecordingMicCaptureService(firstCaptureBarrier.p);
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			micCaptureService,
			new TestConfigurationService({ 'agents.voice.handsFree': true }),
		);
		await controller.connect(mainWindow);

		voiceClientService.fireConnectionState(true);
		await micCaptureService.captureStarted.p;
		voiceClientService.fireConnectionState(false, true);
		firstCaptureBarrier.complete();
		await Promise.resolve();
		const afterDrop = {
			connecting: controller.isConnecting.get(),
			reconnecting: controller.isReconnecting.get(),
			stopCaptureCalls: micCaptureService.stopCaptureCalls,
			sessionCommands: [...voiceClientService.sessionCommands],
			status: controller.statusText.get(),
		};

		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;

		assert.deepStrictEqual({
			afterDrop,
			afterRetry: {
				startCaptureCalls: micCaptureService.startCaptureCalls,
				sessionCommands: voiceClientService.sessionCommands,
				connected: controller.isConnected.get(),
			},
		}, {
			afterDrop: {
				connecting: false,
				reconnecting: true,
				stopCaptureCalls: 1,
				sessionCommands: [],
				status: 'Reconnecting...',
			},
			afterRetry: {
				startCaptureCalls: 2,
				sessionCommands: ['start'],
				connected: true,
			},
		});
	});

	test('explicit disconnect clears routing target and pending confirmations and the tracker cannot repopulate them before reconnect', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);

		const target = URI.parse('agent-host-copilot:/session-1');
		controller.setTargetSession(target);
		chatService.setModels([pendingConfirmationModel(URI.parse('agent-host-copilot:/session-1'))]);

		// Precondition: the tracker sees the pending confirmation and the target
		// is pinned.
		assert.strictEqual(controller.pendingToolConfirmations.get().length, 1);
		assert.strictEqual(controller.targetSession.get()?.toString(), target.toString());

		controller.disconnect('explicit');

		// Cleared by the teardown...
		assert.strictEqual(controller.targetSession.get(), undefined);
		assert.strictEqual(controller.pendingToolConfirmations.get().length, 0);

		// ...and a later model update cannot make the always-on tracker
		// repopulate the snapshot from the still-pending old session.
		chatService.setModels([pendingConfirmationModel(URI.parse('agent-host-copilot:/session-1'))]);
		assert.strictEqual(controller.pendingToolConfirmations.get().length, 0);
	});

	test('reports only genuine approvals as approvals', async () => {
		// One tool now carries approve, reject, answer and skip. Widening the
		// approval event to match would silently change what it counts.
		const voiceClientService = new TestVoiceClientService();
		const telemetryService = new TestTelemetryService();
		const controller = createController(voiceClientService, undefined, undefined, telemetryService);
		await controller.connect(mainWindow);

		for (const type of ['approve', 'reject', 'answer', 'skip']) {
			voiceClientService.fireToolCall({
				callId: `call-${type}`,
				name: 'respond_to_session',
				args: { coding_session_id: 'session-1', response: { type } },
			});
			await voiceClientService.toolResultReceived;
		}

		assert.deepStrictEqual(
			telemetryService.events.filter(event => event.name === 'voiceToolApproval').map(event => (event.data as { approved: boolean }).approved),
			[true, false],
		);
	});

	test('publishes a question form as a structured pending payload', () => {
		// The whole point of the typed payload: `agent_state_detail` can say a form
		// is up, but only this carries the ids, values and displayed order a
		// spoken answer needs to land on.
		const controller = createController(new TestVoiceClientService());
		const buildPendingPayload = Reflect.get(controller, '_buildPendingPayload') as (model: IChatModel) => unknown;
		const part = {
			kind: 'questionCarousel',
			allowSkip: true,
			questions: [{
				id: 'region',
				type: 'singleSelect',
				title: 'Deploy settings',
				message: 'Which region should this deploy to?',
				defaultValue: 'east',
				options: [
					{ id: 'west', label: 'West US', value: 'westus' },
					{ id: 'east', label: 'East US', value: 'eastus' },
				],
			}],
		};

		const payload = buildPendingPayload.call(controller, pendingPartsModel(part));

		assert.deepStrictEqual(payload, {
			type: 'questions',
			pending_id: derivePendingId('req-1', part),
			request_id: 'req-1',
			allow_skip: true,
			questions: [{
				id: 'region',
				type: 'singleSelect',
				// The question the widget shows, not its header.
				title: 'Which region should this deploy to?',
				allow_freeform: true,
				// Default first, matching what the widget renders and the user hears.
				options: [
					{ label: 'East US', value: 'eastus' },
					{ label: 'West US', value: 'westus' },
				],
			}],
		});
	});

	test('does not publish a question form that has already been answered', () => {
		const controller = createController(new TestVoiceClientService());
		const buildPendingPayload = Reflect.get(controller, '_buildPendingPayload') as (model: IChatModel) => unknown;
		const questions = [{ id: 'region', type: 'singleSelect', title: 'Which region?', options: [{ id: 'west', label: 'West US', value: 'westus' }] }];

		assert.strictEqual(buildPendingPayload.call(controller, pendingPartsModel({ kind: 'questionCarousel', isUsed: true, questions })), undefined);
		assert.strictEqual(buildPendingPayload.call(controller, pendingPartsModel({ kind: 'questionCarousel', answeredExternally: true, questions })), undefined);
		assert.strictEqual(buildPendingPayload.call(controller, pendingPartsModel({ kind: 'questionCarousel', questions: [] })), undefined);
	});

	test('selects the oldest still-open pending part, not the newest', () => {
		// Voice is a serial channel: a second form arriving must not take the turn
		// from the one the user was just read out and is part-way through
		// answering. Oldest-first is also what the chat model itself does when it
		// decides what a response is waiting on.
		const controller = createController(new TestVoiceClientService());
		const selectPendingPart = Reflect.get(controller, '_selectPendingPart') as (model: IChatModel) => { requestId: string; part: { kind: string } } | undefined;
		const older = { kind: 'questionCarousel', questions: [{ id: 'a', type: 'singleSelect', title: 'A?', options: [] }] };
		const newer = { kind: 'questionCarousel', questions: [{ id: 'b', type: 'singleSelect', title: 'B?', options: [] }] };

		const selected = selectPendingPart.call(controller, pendingPartsModel([older, newer]));

		assert.strictEqual(selected?.part, older);
		assert.strictEqual(selected?.requestId, 'req-1');
	});

	test('moves on once the oldest pending part is resolved', () => {
		const controller = createController(new TestVoiceClientService());
		const selectPendingPart = Reflect.get(controller, '_selectPendingPart') as (model: IChatModel) => { part: { kind: string } } | undefined;
		const answered = { kind: 'questionCarousel', isUsed: true, questions: [{ id: 'a', type: 'singleSelect', title: 'A?', options: [] }] };
		const newer = { kind: 'questionCarousel', questions: [{ id: 'b', type: 'singleSelect', title: 'B?', options: [] }] };

		assert.strictEqual(selectPendingPart.call(controller, pendingPartsModel([answered, newer]))?.part, newer);
		assert.strictEqual(selectPendingPart.call(controller, pendingPartsModel([answered]))?.part, undefined);
	});

	test('an executing tool does not shadow the form it opened', () => {
		// askQuestions appends its carousel from inside invoke(), so its own tool
		// part is always earlier in the list. It declares no confirmationMessages
		// and therefore sits in Executing, not WaitingForConfirmation - if that
		// ever changed, oldest-first would publish an approval for a question form
		// and the form would never reach voice.
		const controller = createController(new TestVoiceClientService());
		const selectPendingPart = Reflect.get(controller, '_selectPendingPart') as (model: IChatModel) => { part: { kind: string } } | undefined;
		const executingTool = {
			kind: 'toolInvocation',
			state: observableValue('state', { type: IChatToolInvocation.StateKind.Executing }),
		};
		const carousel = { kind: 'questionCarousel', questions: [{ id: 'a', type: 'singleSelect', title: 'A?', options: [] }] };

		assert.strictEqual(selectPendingPart.call(controller, pendingPartsModel([executingTool, carousel]))?.part, carousel);
	});

	test('keeps publishing the older form when a second one arrives', () => {
		// Without this the payload flips to the newest form with no narration, so
		// an answer meant for the first form is applied to the second.
		const controller = createController(new TestVoiceClientService());
		const buildPendingPayload = Reflect.get(controller, '_buildPendingPayload') as (model: IChatModel) => { pending_id?: string; questions?: { id: string }[] } | undefined;
		const older = { kind: 'questionCarousel', questions: [{ id: 'region', type: 'singleSelect', title: 'Which region?', options: [{ id: 'w', label: 'West US', value: 'westus' }] }] };
		const newer = { kind: 'questionCarousel', questions: [{ id: 'tier', type: 'singleSelect', title: 'Which tier?', options: [{ id: 'p', label: 'Premium', value: 'premium' }] }] };

		const payload = buildPendingPayload.call(controller, pendingPartsModel([older, newer]));

		assert.deepStrictEqual(payload?.questions?.map(question => question.id), ['region']);
		assert.strictEqual(payload?.pending_id, derivePendingId('req-1', older));
	});

	test('payload and spoken detail name the same form when two are open', () => {
		// If these two disagree, the newer form flips the detail, that counts as a
		// transition, and the narration path then reads the OLDER form aloud again.
		const controller = createController(new TestVoiceClientService());
		const buildPendingPayload = Reflect.get(controller, '_buildPendingPayload') as (model: IChatModel) => { questions?: { title: string }[] } | undefined;
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; detail?: string };
		const older = { kind: 'questionCarousel', questions: [{ id: 'region', type: 'singleSelect', title: 'Which region?', options: [] }] };
		const newer = { kind: 'questionCarousel', questions: [{ id: 'tier', type: 'singleSelect', title: 'Which tier?', options: [] }] };
		const model = pendingPartsModel([older, newer], 'req-1', 'Answer questions to continue...');

		const info = getAgentStateInfo.call(controller, model);

		assert.strictEqual(info.state, 'waiting_for_confirmation');
		assert.strictEqual(info.detail, 'questions: Which region?');
		assert.deepStrictEqual(buildPendingPayload.call(controller, model)?.questions?.map(question => question.title), ['Which region?']);
	});

	test('sends each agent session label so two waiting sessions can be told apart', () => {
		// The label is the only human-readable handle the backend has. Without it
		// every session is "Untitled" and naming one out loud cannot disambiguate
		// which of two open forms an answer is for.
		const controller = createController(
			new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			new TestAgentSessionsService([
				agentSessionEntry('vscode-chat://a', 'Auth fix', AgentSessionStatus.NeedsInput),
				agentSessionEntry('vscode-chat://b', 'Billing refactor', AgentSessionStatus.InProgress),
			]),
		);
		const buildSessionContext = Reflect.get(controller, '_buildSessionContext') as () => { sessions: { id: string; label?: string }[] };

		const labels = buildSessionContext.call(controller).sessions.map(session => session.label);

		assert.deepStrictEqual(labels, ['Auth fix', 'Billing refactor']);
	});

	test('omits the label for an unlabelled agent session rather than sending an empty one', () => {
		// An empty string would render as a nameless label the model might try to
		// quote back at the user; absent lets the backend fall back to "Untitled".
		const controller = createController(
			new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			new TestAgentSessionsService([agentSessionEntry('vscode-chat://a', undefined, AgentSessionStatus.NeedsInput)]),
		);
		const buildSessionContext = Reflect.get(controller, '_buildSessionContext') as () => { sessions: { id: string; label?: string }[] };

		const [session] = buildSessionContext.call(controller).sessions;

		assert.strictEqual(session.id, 'vscode-chat://a');
		assert.ok(!Object.hasOwn(session, 'label'));
	});

	test('sends the agent session label once its model is resident too', () => {
		// The label is emitted from two branches - model resident or not - and a
		// session flips between them as VS Code loads and disposes models. Only
		// covering the unloaded branch would let the loaded one lose the label
		// silently, which is exactly when a form is on screen to disambiguate.
		const chatService = new ControllableChatService();
		const resource = URI.parse('vscode-chat://a');
		chatService.setModels([pendingConfirmationModel(resource)]);
		const controller = createController(
			new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, chatService, undefined,
			new TestAgentSessionsService([agentSessionEntry(resource.toString(), 'Auth fix', AgentSessionStatus.NeedsInput)]),
		);
		const buildSessionContext = Reflect.get(controller, '_buildSessionContext') as () => { sessions: { id: string; label?: string; agent_state: string }[] };
		// Make it the active session: a background confirmation is deliberately
		// downgraded to `thinking`, which would hide whether the resident branch
		// ran at all.
		controller.setTargetSession(resource);

		const [session] = buildSessionContext.call(controller).sessions;

		assert.strictEqual(session.agent_state, 'waiting_for_confirmation');
		assert.strictEqual(session.label, 'Auth fix');
	});

	test('an older tool confirmation holds the turn ahead of a newer form', () => {
		// Queue semantics applied uniformly: approve the command you were asked
		// about, then answer the questions.
		const controller = createController(new TestVoiceClientService());
		const buildPendingPayload = Reflect.get(controller, '_buildPendingPayload') as (model: IChatModel) => { type?: string } | undefined;
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { detail?: string };
		const approval = {
			kind: 'toolInvocation',
			invocationMessage: 'Run a command',
			state: observableValue('state', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { command: 'docker push myapp:latest' },
			}),
		};
		const form = { kind: 'questionCarousel', questions: [{ id: 'tier', type: 'singleSelect', title: 'Which tier?', options: [] }] };
		const model = pendingPartsModel([approval, form], 'req-1', 'Run command?');

		assert.strictEqual(buildPendingPayload.call(controller, model)?.type, 'approval');
		assert.strictEqual(getAgentStateInfo.call(controller, model).detail, 'command: docker push myapp:latest');
	});

	test('an older confirmation suppresses a newer form payload but still speaks', () => {
		// `confirmation` has no typed wire shape, so the queue costs the newer form
		// its structured payload until the confirmation is resolved. Deliberate.
		const controller = createController(new TestVoiceClientService());
		const buildPendingPayload = Reflect.get(controller, '_buildPendingPayload') as (model: IChatModel) => unknown;
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { detail?: string };
		const confirmation = { kind: 'confirmation', title: 'Delete the branch?' };
		const form = { kind: 'questionCarousel', questions: [{ id: 'tier', type: 'singleSelect', title: 'Which tier?', options: [] }] };
		const model = pendingPartsModel([confirmation, form], 'req-1', 'Delete the branch?');

		assert.strictEqual(buildPendingPayload.call(controller, model), undefined);
		assert.strictEqual(getAgentStateInfo.call(controller, model).detail, 'Delete the branch?');
	});

	test('a newer form answered by mouse leaves the focused form untouched', () => {
		// Resolving B out of order must not move the turn, and must not change the
		// detail either - a detail change alone counts as a transition and would
		// read A aloud a second time.
		const controller = createController(new TestVoiceClientService());
		const buildPendingPayload = Reflect.get(controller, '_buildPendingPayload') as (model: IChatModel) => { questions?: { id: string }[] } | undefined;
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { detail?: string };
		const older = { kind: 'questionCarousel', questions: [{ id: 'region', type: 'singleSelect', title: 'Which region?', options: [] }] };
		const newerAnswered = { kind: 'questionCarousel', isUsed: true, questions: [{ id: 'tier', type: 'singleSelect', title: 'Which tier?', options: [] }] };
		const model = pendingPartsModel([older, newerAnswered], 'req-1', 'Answer questions to continue...');

		assert.deepStrictEqual(buildPendingPayload.call(controller, model)?.questions?.map(question => question.id), ['region']);
		assert.strictEqual(getAgentStateInfo.call(controller, model).detail, 'questions: Which region?');
	});

	test('fatal disconnect clears routing target and pending confirmations and the tracker cannot repopulate them before reconnect', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const handleFatalDisconnect = Reflect.get(controller, '_handleFatalDisconnect') as (code: number, reason: string) => void;

		controller.setTargetSession(URI.parse('agent-host-copilot:/session-1'));
		chatService.setModels([pendingConfirmationModel(URI.parse('agent-host-copilot:/session-1'))]);
		assert.strictEqual(controller.pendingToolConfirmations.get().length, 1);

		// 4008 = another window took over the single voice session (terminal).
		handleFatalDisconnect.call(controller, 4008, 'taken over');

		assert.strictEqual(controller.targetSession.get(), undefined);
		assert.strictEqual(controller.pendingToolConfirmations.get().length, 0);

		chatService.setModels([pendingConfirmationModel(URI.parse('agent-host-copilot:/session-1'))]);
		assert.strictEqual(controller.pendingToolConfirmations.get().length, 0);
	});

	test('barge-in drops delayed audio from the interrupted turn before playing the follow-up', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const commandService = new TestCommandService();
		const controller = createController(
			voiceClientService,
			ttsPlaybackService,
			commandService,
			NullTelemetryService,
			undefined,
			new TestConfigurationService({ 'agents.voice.handsFree': true }),
		);
		await controller.connect(mainWindow);

		voiceClientService.fireAudioResponse({
			audio: 'story-start',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response-1',
		});
		voiceClientService.fireAudioResponse({
			audio: 'queued-story-segment',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response-2',
		});
		voiceClientService.fireSpeechStarted();
		voiceClientService.fireBargeIn({
			turnId: 'follow-up-turn',
			interruptedTurnId: 'story-turn',
		});
		voiceClientService.fireTranscription({
			text: 'actually scratch that and check the code in the repository',
			status: 'final',
			turnId: 'follow-up-turn',
			revision: 1,
		});
		voiceClientService.fireToolCall({
			callId: 'send-follow-up',
			name: 'send_to_chat',
			args: { text: 'actually scratch that and check the code in the repository' },
		});
		await voiceClientService.toolResultReceived;

		voiceClientService.fireAudioResponse({
			audio: 'stale-story-continuation',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response-2',
		});
		voiceClientService.fireAudioResponse({
			audio: 'follow-up-acknowledgement',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'follow-up-turn',
			responseId: 'follow-up-response',
		});

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			stopCount: ttsPlaybackService.stopCount,
			transcript: controller.transcriptTurns.get().at(-1),
			acceptedInputs: commandService.acceptedInputs,
			toolResults: voiceClientService.toolResults,
		}, {
			playedAudio: ['story-start', 'follow-up-acknowledgement'],
			stopCount: 2,
			transcript: {
				speaker: 'user',
				text: 'actually scratch that and check the code in the repository',
				committed: '',
				isPartial: false,
			},
			acceptedInputs: ['actually scratch that and check the code in the repository'],
			toolResults: [{ callId: 'send-follow-up', result: 'ok' }],
		});
	});

	test('speech-started alone interrupts playback and accepts the scoped passive turn', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		await controller.connect(mainWindow);

		voiceClientService.fireAudioResponse({
			audio: 'story-start',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response',
		});
		voiceClientService.fireSpeechStarted('follow-up-turn');
		voiceClientService.fireTranscription({
			text: 'check the repository instead',
			status: 'final',
			turnId: 'follow-up-turn',
			revision: 1,
		});
		voiceClientService.fireAudioResponse({
			audio: 'stale-story',
			isFirstChunk: false,
			isFinal: true,
			turnId: 'story-turn',
			responseId: 'story-response',
		});
		voiceClientService.fireAudioResponse({
			audio: 'follow-up',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'follow-up-turn',
			responseId: 'follow-up-response',
		});

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			stopCount: ttsPlaybackService.stopCount,
			transcript: controller.transcriptTurns.get().at(-1),
		}, {
			playedAudio: ['story-start', 'follow-up'],
			stopCount: 1,
			transcript: {
				speaker: 'user',
				text: 'check the repository instead',
				committed: '',
				isPartial: false,
			},
		});
	});

	test('stale interrupted audio does not consume follow-up latency telemetry', async () => {
		const voiceClientService = new TestVoiceClientService();
		const telemetryService = new TestTelemetryService();
		const controller = createController(voiceClientService, new TestTtsPlaybackService(), new TestCommandService(), telemetryService);
		await controller.connect(mainWindow);
		voiceClientService.fireSpeechStarted();
		voiceClientService.fireBargeIn({
			turnId: 'follow-up-turn',
			interruptedTurnId: 'story-turn',
		});
		clock.setSystemTime(5_000);
		Reflect.set(controller, '_telemetryPttDownMs', 500);
		Reflect.set(controller, '_telemetryFirstTranscriptionMs', 750);
		Reflect.set(controller, '_telemetryPttUpMs', 1_000);

		voiceClientService.fireAudioResponse({
			audio: 'stale-story',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response',
		});
		clock.tick(1_000);
		voiceClientService.fireAudioResponse({
			audio: 'follow-up',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'follow-up-turn',
			responseId: 'follow-up-response',
		});

		assert.deepStrictEqual({
			latencyEvents: telemetryService.events.filter(event => event.name === 'voiceLatency'),
			pendingLatencyStart: Reflect.get(controller, '_telemetryPttUpMs'),
		}, {
			latencyEvents: [{
				name: 'voiceLatency',
				data: {
					timeToFirstTranscriptionMs: 250,
					endToEndTurnMs: 5_000,
				},
			}],
			pendingLatencyStart: undefined,
		});
	});

	test('barge-in purges deferred audio before the interrupted session is focused', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const backgroundSession = URI.parse('agent-host-copilot:/background-session');
		await controller.connect(mainWindow);

		voiceClientService.fireAudioResponse({
			audio: 'buffered-story',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: backgroundSession.toString(),
			turnId: 'story-turn',
			responseId: 'story-response',
		});
		voiceClientService.fireSpeechStarted();
		voiceClientService.fireBargeIn({
			turnId: 'follow-up-turn',
			interruptedTurnId: 'story-turn',
		});
		controller.setActiveSessionShown(backgroundSession);
		voiceClientService.fireAudioResponse({
			audio: 'follow-up',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: backgroundSession.toString(),
			turnId: 'follow-up-turn',
			responseId: 'follow-up-response',
		});

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['follow-up']);
	});

	test('speech-started keeps an interrupted solicited narration retryable', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'agent-host-copilot:/session-1';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: 'response' | 'confirmation', text: string) => boolean;
		await controller.connect(mainWindow);

		assert.strictEqual(narrate.call(controller, sessionId, 'response', 'Done'), true);
		voiceClientService.fireAudioResponse({
			audio: 'narration',
			isFirstChunk: true,
			isFinal: false,
			responseId: 'narration-1',
		});
		voiceClientService.fireSpeechStarted();
		voiceClientService.fireNarrationInterrupted({
			narrationId: 'narration-1',
			codingSessionId: sessionId,
		});
		Reflect.set(controller, '_currentNarratable', () => ({ kind: 'response', text: 'Done' }));
		controller.setActiveSessionShown(URI.parse(sessionId));
		voiceClientService.fireNarrationUnblocked({
			narrationId: 'narration-1',
			codingSessionId: sessionId,
		});
		const retryRequest = voiceClientService.requests.at(-1);
		if (!retryRequest) {
			throw new Error('Retry narration was not requested');
		}
		voiceClientService.fireAudioResponse({
			audio: 'retry',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'retry-turn',
			responseId: retryRequest.narrationId,
		});

		const pendingSolicitedNarrations = Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, unknown>;
		const deferredNarrations = Reflect.get(controller, '_deferredNarrations') as Map<string, unknown>;
		assert.deepStrictEqual({
			requests: voiceClientService.requests,
			playedAudio: ttsPlaybackService.playedAudio,
			pendingSolicitedNarrations: [...pendingSolicitedNarrations.keys()],
			deferredNarrations: deferredNarrations.size,
		}, {
			requests: [{
				sessionId,
				kind: 'response',
				text: 'Done',
				narrationId: 'narration-1',
			}, {
				sessionId,
				kind: 'response',
				text: 'Done',
				narrationId: 'narration-2',
			}],
			playedAudio: ['narration', 'retry'],
			pendingSolicitedNarrations: ['narration-2'],
			deferredNarrations: 0,
		});
	});

	test('explicit PTT drops stale first chunks before the backend barge-in arrives', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const micCaptureService = new TestMicCaptureService();
		const controller = createController(
			voiceClientService,
			ttsPlaybackService,
			new TestCommandService(),
			NullTelemetryService,
			micCaptureService,
		);
		await controller.connect(mainWindow);
		Reflect.get(controller, '_isConnected').set(true, undefined);

		voiceClientService.fireAudioResponse({
			audio: 'story-start',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response',
		});
		controller.pttDown();
		voiceClientService.fireAudioResponse({
			audio: 'stale-story',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response',
		});

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			pttTurns: micCaptureService.pttTurns.length,
		}, {
			playedAudio: ['story-start'],
			pttTurns: 1,
		});
	});

	test('manual PTT promotes passive hands-free capture without replaying stale audio', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const micCaptureService = new TestMicCaptureService();
		const controller = createController(
			voiceClientService,
			ttsPlaybackService,
			new TestCommandService(),
			NullTelemetryService,
			micCaptureService,
			new TestConfigurationService({ 'agents.voice.handsFree': true }),
		);
		await controller.connect(mainWindow);
		Reflect.get(controller, '_isConnected').set(true, undefined);
		// Install a focused window so the multi-window hands-free focus gate
		// (#8507) lets the passive barge-in turn open; the headless test window
		// reports `document.hasFocus()` as false.
		Reflect.set(controller, '_window', { document: { hasFocus: () => true } });

		voiceClientService.fireAudioResponse({
			audio: 'story-start',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response',
		});
		const passiveTurnId = micCaptureService.pttTurns[0];
		controller.pttDown();
		voiceClientService.fireAudioResponse({
			audio: 'stale-story',
			isFirstChunk: true,
			isFinal: false,
			turnId: 'story-turn',
			responseId: 'story-response',
		});

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			pttTurns: micCaptureService.pttTurns,
			passiveTurnPromoted: Reflect.get(controller, '_pttHeld') && !Reflect.get(controller, '_bargeInListenActive'),
		}, {
			playedAudio: ['story-start'],
			pttTurns: [passiveTurnId],
			passiveTurnPromoted: true,
		});
	});

	test('forced pttDown cancels pending toggle mode and keeps the turn recording instead of finishing it', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		await controller.connect(mainWindow);
		Reflect.get(controller, '_isConnected').set(true, undefined);

		// Advance off the fake-clock epoch (0) so pttDown records a truthy
		// `_telemetryPttDownMs`; at time 0 the tap/hold split reads the press as
		// "no press recorded" (Infinity hold) and never enters toggle mode.
		clock.setSystemTime(5_000);

		// Press + quick release: a sub-threshold tap enters toggle mode, which keeps
		// the mic recording until the next tap.
		controller.pttDown();
		controller.pttUp();
		assert.deepStrictEqual({
			toggle: Reflect.get(controller, '_pttToggleMode'),
			held: Reflect.get(controller, '_pttHeld'),
		}, { toggle: true, held: true }, 'short tap enters toggle mode while still recording');

		// A forced press (the hold-to-talk gesture) cancels the pending toggle mode
		// and keeps recording the same turn, rather than finishing it as a normal
		// second tap would.
		controller.pttDown('explicit', true);
		assert.deepStrictEqual({
			toggle: Reflect.get(controller, '_pttToggleMode'),
			held: Reflect.get(controller, '_pttHeld'),
		}, { toggle: false, held: true }, 'forced pttDown bypasses toggle mode and stays recording');
	});

	test('forced pttUp finishes a sub-threshold turn instead of entering toggle mode', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		await controller.connect(mainWindow);
		Reflect.get(controller, '_isConnected').set(true, undefined);

		controller.pttDown();
		assert.strictEqual(Reflect.get(controller, '_pttHeld'), true, 'pttDown starts recording');

		// A forced release (hold-to-talk release) finishes and sends immediately even
		// for a short hold, instead of dropping into toggle mode and leaving `_pttHeld`
		// active with the mic still open.
		controller.pttUp('explicit', true);
		assert.deepStrictEqual({
			toggle: Reflect.get(controller, '_pttToggleMode'),
			held: Reflect.get(controller, '_pttHeld'),
		}, { toggle: false, held: false }, 'forced pttUp finishes the turn rather than entering toggle mode');
	});

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
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);
		Reflect.set(controller, '_window', { document: { hasFocus: () => true } });

		const enterAutoListen = Reflect.get(controller, '_enterAutoListen') as () => void;
		enterAutoListen.call(controller);

		assert.strictEqual(mic.pttDownCalls.length, 1);
		assert.strictEqual(mic.pttDownCalls[0].passive, true);
	});

	test('connect only arms listening automatically in hands-free mode', () => {
		const manualVoiceClientService = new TestVoiceClientService();
		const manualController = createController(manualVoiceClientService, undefined, undefined, undefined, undefined,
			new TestConfigurationService({ 'agents.voice.handsFree': false }));

		const handsFreeVoiceClientService = new TestVoiceClientService();
		const handsFreeController = createController(handsFreeVoiceClientService, undefined, undefined, undefined, undefined,
			new TestConfigurationService({ 'agents.voice.handsFree': true }));
		const manualShouldArm = Reflect.get(manualController, '_shouldEnterListenOnSessionInit') as (isResuming: boolean) => boolean;
		const handsFreeShouldArm = Reflect.get(handsFreeController, '_shouldEnterListenOnSessionInit') as (isResuming: boolean) => boolean;

		assert.deepStrictEqual({
			manualFreshConnect: manualShouldArm.call(manualController, false),
			handsFreeFreshConnect: handsFreeShouldArm.call(handsFreeController, false),
			handsFreeResume: handsFreeShouldArm.call(handsFreeController, true),
		}, {
			manualFreshConnect: false,
			handsFreeFreshConnect: true,
			handsFreeResume: false,
		});
	});

	test('stopping listening in manual mode submits the transcript', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService();
		const controller = createController(voiceClientService, undefined, commandService);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		controller.pttDown();
		controller.stopListening();
		voiceClientService.fireToolCall({
			callId: 'manual-transcription',
			name: 'send_to_chat',
			args: { text: 'send this when listening stops' },
		});
		await voiceClientService.toolResultReceived;

		assert.deepStrictEqual(commandService.acceptedInputs, ['send this when listening stops']);
	});

	test('auto-listen is skipped when window does not have focus (multi-window hands-free)', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);
		Reflect.set(controller, '_window', { document: { hasFocus: () => false } });

		const enterAutoListen = Reflect.get(controller, '_enterAutoListen') as () => void;
		enterAutoListen.call(controller);

		assert.strictEqual(mic.pttDownCalls.length, 0);
	});

	test('window blur aborts an open passive turn so the background window stops recording', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		Reflect.set(controller, '_pttCurrentTurnId', 'passive-turn');
		Reflect.set(controller, '_pttCurrentTurnPassive', true);
		Reflect.set(controller, '_pttHeld', true);

		(Reflect.get(controller, '_onWindowBlur') as () => void).call(controller);

		assert.strictEqual(mic.abortCalls, 1);
		assert.strictEqual(Reflect.get(controller, '_pttHeld'), false);
	});

	test('window blur does not abort a deliberate (non-passive) turn', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		Reflect.set(controller, '_pttCurrentTurnId', 'deliberate-turn');
		Reflect.set(controller, '_pttCurrentTurnPassive', false);
		Reflect.set(controller, '_pttHeld', true);

		(Reflect.get(controller, '_onWindowBlur') as () => void).call(controller);

		assert.strictEqual(mic.abortCalls, 0);
		assert.strictEqual(Reflect.get(controller, '_pttHeld'), true);
	});

	test('window focus re-arms hands-free auto-listen in the focused window', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic,
			new TestConfigurationService({ 'agents.voice.handsFree': true }));
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);
		Reflect.set(controller, '_window', { document: { hasFocus: () => true } });

		(Reflect.get(controller, '_onWindowFocus') as () => void).call(controller);

		assert.strictEqual(mic.pttDownCalls.length, 1);
		assert.strictEqual(mic.pttDownCalls[0].passive, true);
	});

	test('window focus does not re-arm auto-listen when hands-free is disabled', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic,
			new TestConfigurationService({ 'agents.voice.handsFree': false }));
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);
		Reflect.set(controller, '_window', { document: { hasFocus: () => true } });

		(Reflect.get(controller, '_onWindowFocus') as () => void).call(controller);

		assert.strictEqual(mic.pttDownCalls.length, 0);
	});

	test('a deliberate user press opens a non-passive mic turn', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		controller.pttDown();

		assert.strictEqual(mic.pttDownCalls.length, 1);
		assert.strictEqual(mic.pttDownCalls[0].passive, false);
	});

	test('a deliberate press awaiting narration is preserved so its ptt_end clears the backend latch', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
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
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
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
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
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
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
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
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
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
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
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
		controller['_handleBargeIn']({ turnId: 'new-turn', interruptedTurnId: bargeInTurnId });
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
