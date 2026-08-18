/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { autorun, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
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
import { INotification, INotificationHandle, INotificationService, IPromptChoice, NoOpNotification, Severity } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestChatEntitlementService } from '../../../../../test/common/workbenchTestServices.js';
import { IVoiceTranscriptStore, IVoiceTranscriptTurn } from '../../../../agentsVoice/common/voiceTranscriptStore.js';
import { AgentSessionStatus, IAgentSessionsModel } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IMicCaptureService } from '../../../browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../browser/voiceClient/ttsPlaybackService.js';
import { VoiceSessionController } from '../../../browser/voiceClient/voiceSessionController.js';
import { IVoiceToolDispatchService } from '../../../browser/voiceClient/voiceToolDispatchService.js';
import { CHAT_INPUT_WINDOW_ACCEPT_VOICE_COMMAND_ID } from '../../../common/chatInputWindow.js';
import { ChatSendResult, ElicitationState, IChatConfirmation, IChatModelReference, IChatSendRequestOptions, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { IPromptsService } from '../../../common/promptSyntax/service/promptsService.js';
import { derivePendingId, isPendingIdResolved, IVoiceAudioResponse, IVoiceBargeIn, IVoiceCheckpointNarrationMetadata, IVoiceClientService, IVoiceDispatchResult, IVoiceFatalDisconnect, IVoiceNarrationAck, IVoiceNarrationSignal, IVoiceSessionContext, IVoiceSpeechStarted, IVoiceToolCall, IVoiceTranscription, markPendingIdResolved, peekPendingId, VoiceConfirmationType, VoiceNarrationKind, VOICE_AGENT_PROGRESS_SETTING } from '../../../common/voiceClient/voiceClientService.js';
import { IChatModel, IChatProgressResponseContent, IChatResponseModel } from '../../../common/model/chatModel.js';
import { ChatElicitationRequestPart } from '../../../common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { IVoicePlaybackService } from '../../../common/voicePlaybackService.js';
import { AskQuestionsToolId } from '../../../common/tools/builtinTools/askQuestionsTool.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';

class TestVoiceClientService extends mock<IVoiceClientService>() {
	private narrationCounter = 0;
	readonly requests: { sessionId: string; kind: VoiceNarrationKind; text: string; narrationId: string; pendingId?: string; checkpoint?: IVoiceCheckpointNarrationMetadata; confirmationType?: VoiceConfirmationType }[] = [];
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
	private readonly narrationAckEmitter = new Emitter<IVoiceNarrationAck>();
	override readonly onNarrationAck = this.narrationAckEmitter.event;
	private readonly narrationUnblockedEmitter = new Emitter<IVoiceNarrationSignal>();
	override readonly onNarrationUnblocked = this.narrationUnblockedEmitter.event;
	private readonly narrationInterruptedEmitter = new Emitter<IVoiceNarrationSignal>();
	override readonly onNarrationInterrupted = this.narrationInterruptedEmitter.event;
	private readonly sessionInitEmitter = new Emitter<{ sessionId: string }>();
	override readonly onSessionInit = this.sessionInitEmitter.event;
	override readonly onError = Event.None;
	private readonly connectionStateEmitter = new Emitter<boolean>();
	override readonly onDidChangeConnectionState = this.connectionStateEmitter.event;
	override readonly onFatalDisconnect = Event.None;
	override readonly onConnectionIssue = Event.None;
	override readonly onTurnAutoEnded = Event.None;
	private connected = false;
	private resuming = false;
	private reconnecting = false;

	override get isConnected(): boolean { return this.connected; }
	override get isResuming(): boolean { return this.resuming; }
	override get willReconnect(): boolean { return this.reconnecting; }
	override disconnect(): void { this.connected = false; }
	override async connect(): Promise<void> { }
	readonly wireEvents: ({ type: 'session_context'; context: IVoiceSessionContext } | { type: 'request_narration'; kind: VoiceNarrationKind; text: string; confirmationType?: VoiceConfirmationType })[] = [];
	pttEndCalls = 0;
	private pendingContext: IVoiceSessionContext | undefined;
	override sendSessionContext(context: IVoiceSessionContext): void {
		this.pendingContext = context;
	}
	override flushSessionContext(): void {
		if (this.pendingContext) {
			this.wireEvents.push({ type: 'session_context', context: this.pendingContext });
			this.pendingContext = undefined;
		}
	}
	override invalidateSessionCache(): void { }
	override sendStartSession(): void {
		this.sessionCommands.push('start');
		this.sessionCommandSent.complete();
	}
	override sendResumeSession(): void {
		this.sessionCommands.push('resume');
		this.sessionCommandSent.complete();
	}
	readonly playbackCompletions: { sessionId: string; narrationId: string; playbackId: string }[] = [];
	override sendNarrationPlaybackComplete(codingSessionId: string, narrationId: string, playbackId: string): void {
		this.playbackCompletions.push({ sessionId: codingSessionId, narrationId, playbackId });
	}
	readonly toolResults: { callId: string; result: string | IVoiceDispatchResult; codingSessionId?: string }[] = [];
	private toolResultResolver: (() => void) | undefined;
	readonly toolResultReceived = new Promise<void>(resolve => this.toolResultResolver = resolve);
	override sendToolResult(callId: string, result: string | IVoiceDispatchResult, codingSessionId?: string): void {
		this.toolResults.push({ callId, result, ...(codingSessionId ? { codingSessionId } : {}) });
		this.toolResultResolver?.();
	}

	override requestNarration(codingSessionId: string, kind: VoiceNarrationKind, text: string, narrationId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata, confirmationType?: VoiceConfirmationType, pending?: { pendingId: string }, prepareToReceiveAudio?: () => void): string | undefined {
		prepareToReceiveAudio?.();
		const id = narrationId ?? `narration-${++this.narrationCounter}`;
		this.requests.push({ sessionId: codingSessionId, kind, text, narrationId: id, ...(pending ? { pendingId: pending.pendingId } : {}), ...(checkpoint ? { checkpoint } : {}), ...(confirmationType ? { confirmationType } : {}) });
		this.wireEvents.push({ type: 'request_narration', kind, text, ...(confirmationType ? { confirmationType } : {}) });
		return id;
	}
	override sendPttEnd(): void {
		this.pttEndCalls++;
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

	fireNarrationAck(event: IVoiceNarrationAck): void {
		this.narrationAckEmitter.fire(event);
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

	fireSessionInit(): void {
		this.sessionInitEmitter.fire({ sessionId: 'voice-session' });
	}

	dispose(): void {
		this.audioResponseEmitter.dispose();
		this.bargeInEmitter.dispose();
		this.transcriptionEmitter.dispose();
		this.toolCallEmitter.dispose();
		this.speechStartedEmitter.dispose();
		this.narrationAckEmitter.dispose();
		this.narrationUnblockedEmitter.dispose();
		this.narrationInterruptedEmitter.dispose();
		this.connectionStateEmitter.dispose();
		this.sessionInitEmitter.dispose();
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
	readonly prompts: { severity: Severity; message: string; choices: readonly IPromptChoice[] }[] = [];

	override notify(notification: INotification): INotificationHandle {
		this.notifications.push(notification);
		return new NoOpNotification();
	}

	override prompt(severity: Severity, message: string, choices: IPromptChoice[]): INotificationHandle {
		this.prompts.push({ severity, message, choices });
		return new NoOpNotification();
	}
}

class MutableTestChatEntitlementService extends TestChatEntitlementService {
	override readonly isInternal: boolean = false;
	private readonly _onDidChangeEntitlement = new Emitter<void>();
	override readonly onDidChangeEntitlement = this._onDidChangeEntitlement.event;

	setEntitlement(entitlement: ChatEntitlement): void {
		this.entitlement = entitlement;
		this._onDidChangeEntitlement.fire();
	}

	transitionEntitlement(intermediate: ChatEntitlement, final: ChatEntitlement): void {
		this.entitlement = intermediate;
		this._onDidChangeEntitlement.fire();
		this.entitlement = final;
		this._onDidChangeEntitlement.fire();
	}
}

class InternalTestChatEntitlementService extends MutableTestChatEntitlementService {
	override readonly isInternal = true;
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

class RecordingVoicePlaybackService extends mock<IVoicePlaybackService>() {
	readonly pendingSessions = new Set<string>();

	override notifyPlaybackStart(): void { }
	override notifyPlaybackEnd(): void { }
	override setPendingResponse(sessionResource: URI, pending: boolean): void {
		if (pending) {
			this.pendingSessions.add(sessionResource.toString());
		} else {
			this.pendingSessions.delete(sessionResource.toString());
		}
	}
}

class DeferredFirstTtsPlaybackService extends TestTtsPlaybackService {
	private deferNextStart = true;

	override playAudioChunk(audio: string): void {
		if (audio && this.deferNextStart) {
			this.deferNextStart = false;
			this.playedAudio.push(audio);
			return;
		}
		super.playAudioChunk(audio);
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
	readonly sendRequestOptions: (IChatSendRequestOptions | undefined)[] = [];
	override getSession(): IChatModel | undefined { return undefined; }
	override async sendRequest(_sessionResource: URI, _message: string, options?: IChatSendRequestOptions): Promise<ChatSendResult> {
		this.sendRequestOptions.push(options);
		return { kind: 'rejected', reason: 'test' };
	}

	/** A session that never loads: the controller eagerly loads models for waiting sessions. */
	override async acquireOrLoadSession(): Promise<undefined> { return undefined; }
}

class TrackingLoadChatService extends TestChatService {
	readonly loaded: string[] = [];
	private residentModel: IChatModel | undefined;

	setResident(resource: URI): void {
		this.residentModel = {
			sessionResource: resource,
			getRequests: () => [],
		} as unknown as IChatModel;
	}

	override getSession(): IChatModel | undefined {
		return this.residentModel;
	}

	override async acquireOrLoadSession(resource?: URI): Promise<undefined> {
		if (resource) {
			this.loaded.push(resource.toString());
		}
		return undefined;
	}
}

/**
 * Chat service that records session creation and sends, so the `new_session`
 * flag on `send_to_chat` can be checked end to end.
 */
class NewSessionChatService extends mock<IChatService>() {
	override readonly chatModels = observableValue<readonly IChatModel[]>('chatModels', []);
	readonly created: URI[] = [];
	readonly sent: { resource: string; message: string }[] = [];
	override getSession(): undefined { return undefined; }
	override startNewLocalSession(): IChatModelReference {
		const resource = URI.parse(`chat-session://new/${this.created.length + 1}`);
		this.created.push(resource);
		return { object: { sessionResource: resource }, dispose: () => { } } as unknown as IChatModelReference;
	}
	override async acquireOrLoadSession(): Promise<IChatModelReference> {
		return { object: {}, dispose: () => { } } as unknown as IChatModelReference;
	}
	override async sendRequest(resource: URI, message: string): Promise<ChatSendResult> {
		this.sent.push({ resource: resource.toString(), message });
		return { kind: 'rejected', reason: 'test' };
	}
}

/**
 * Chat service with real reference-lifecycle semantics: it refcounts the model
 * references it hands out and drops the session once the last one is disposed,
 * mirroring how `ChatService` deletes empty untitled local sessions in
 * `willDisposeModel`. Lets a test tell "the session is still alive" apart from
 * "voice is targeting a session that no longer exists".
 */
class RefCountingChatService extends mock<IChatService>() {
	override readonly chatModels = observableValue<readonly IChatModel[]>('chatModels', []);
	/** Sessions that still exist, keyed by resource string. */
	readonly live = new Set<string>();
	private readonly _refCounts = new Map<string, number>();
	private _createdCount = 0;

	override getSession(): undefined { return undefined; }

	override startNewLocalSession(): IChatModelReference {
		const resource = URI.parse(`chat-session://new/${++this._createdCount}`);
		this.live.add(resource.toString());
		return this._acquire(resource);
	}

	/** Outstanding references for a session, for asserting nothing is leaked. */
	refCount(resource: string): number {
		return this._refCounts.get(resource) ?? 0;
	}

	private _acquire(resource: URI): IChatModelReference {
		const key = resource.toString();
		this._refCounts.set(key, this.refCount(key) + 1);
		let disposed = false;
		return {
			object: { sessionResource: resource },
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				const remaining = this.refCount(key) - 1;
				this._refCounts.set(key, remaining);
				if (remaining === 0) {
					// Last reference gone: an empty untitled local session is deleted.
					this.live.delete(key);
				}
			},
		} as unknown as IChatModelReference;
	}
}

/**
 * Chat service whose tracked models can be driven from a test, so the
 * controller's always-on pending-confirmation tracker can be exercised.
 */
class ControllableChatService extends mock<IChatService>() {
	override readonly chatModels = observableValue<readonly IChatModel[]>('chatModels', []);
	private readonly _sessions = new Map<string, IChatModel>();
	override getSession(resource: URI): IChatModel | undefined { return this._sessions.get(resource.toString()); }
	override acquireOrLoadSession(): Promise<undefined> { return Promise.resolve(undefined); }
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

function pendingResponsePartModel(resource: URI, part: IChatProgressResponseContent, detail = 'Needs approval', reportPending = true, requestId = 'req-1'): IChatModel {
	const response = {
		onDidChange: Event.None,
		isPendingConfirmation: observableValue<{ detail?: string } | undefined>('pending', reportPending ? { detail } : undefined),
		isIncomplete: observableValue('incomplete', false),
		response: { value: [part], getMarkdown: () => '' },
	};
	const lastRequest = { id: requestId, response };
	return {
		sessionResource: resource,
		title: 'Chat',
		getRequests: () => [lastRequest],
		lastRequestObs: observableValue('lastRequest', lastRequest),
	} as unknown as IChatModel;
}

function waitingTerminalTool(toolCallId: string, command = 'npm run build'): IChatToolInvocation & { readonly state: ISettableObservable<IChatToolInvocation.State> } {
	return new class extends mock<IChatToolInvocation>() {
		override readonly kind = 'toolInvocation' as const;
		override readonly toolCallId = toolCallId;
		override readonly toolId = 'runInTerminal';
		override readonly invocationMessage = 'Run zsh command';
		override readonly state = observableValue<IChatToolInvocation.State>(`${toolCallId}State`, {
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command },
			confirmationMessages: {
				title: 'Run zsh command?',
				message: 'Installs dependencies - pulls untrusted third-party code.',
			},
			confirm: () => { },
		});
	}();
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
	override readonly onDidChangeWidgetVisibility = Event.None;
	override readonly onDidAddWidget = Event.None;
	override readonly onDidRemoveWidget: Event<IChatWidget>;
	override lastFocusedWidget: IChatWidgetService['lastFocusedWidget'];
	constructor(private readonly widgets: IChatWidget[] = [], onDidRemoveWidget = Event.None) {
		super();
		this.onDidRemoveWidget = onDidRemoveWidget;
	}

	override getAllWidgets() { return this.widgets; }
	override getWidgetBySessionResource(): undefined { return undefined; }

	focus(resource: URI): void {
		this.lastFocusedWidget = {
			viewModel: { sessionResource: resource },
		} as IChatWidgetService['lastFocusedWidget'];
	}
}

class MaterializingChatWidget extends mock<IChatWidget>() {
	private readonly _onDidChangeViewModel = new Emitter<{ previousSessionResource: URI | undefined; currentSessionResource: URI | undefined }>();
	override readonly onDidChangeViewModel = this._onDidChangeViewModel.event;
	override viewModel: IChatWidget['viewModel'];

	constructor(resource: URI) {
		super();
		this.viewModel = { sessionResource: resource } as IChatWidget['viewModel'];
	}

	materialize(resource: URI): void {
		const previousSessionResource = this.viewModel?.sessionResource;
		this.viewModel = { sessionResource: resource } as IChatWidget['viewModel'];
		this._onDidChangeViewModel.fire({ previousSessionResource, currentSessionResource: resource });
	}

	dispose(): void {
		this._onDidChangeViewModel.dispose();
	}
}

class TestCommandService extends mock<ICommandService>() {
	readonly acceptedInputs: string[] = [];
	readonly acceptedOmniInputs: string[] = [];

	constructor(private readonly omniFocused = false) {
		super();
	}

	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T> {
		let result: string | boolean | undefined;
		if (commandId === '_chat.voice.getCurrentSession') {
			result = 'chat-session';
		} else if (commandId === '_chat.voice.acceptInput' && typeof args[0] === 'string') {
			this.acceptedInputs.push(args[0]);
		} else if (commandId === CHAT_INPUT_WINDOW_ACCEPT_VOICE_COMMAND_ID && typeof args[0] === 'string') {
			if (this.omniFocused) {
				this.acceptedOmniInputs.push(args[0]);
			}
			result = this.omniFocused;
		}
		return result as T;
	}
}

/** Command service whose chat pane adopts the session on `switchToSession`. */
class AdoptingCommandService extends TestCommandService {
	override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T> {
		if (commandId === '_chat.voice.switchToSession') {
			return true as T;
		}
		return super.executeCommand<T>(commandId, ...args);
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
		configurationService: IConfigurationService = new TestConfigurationService({ 'agents.voice.handsFree': false, [VOICE_AGENT_PROGRESS_SETTING]: true }),
		chatService: IChatService = new TestChatService(),
		promptsService: IPromptsService = new class extends mock<IPromptsService>() {
			override async getVoiceInstructions(): Promise<undefined> { return undefined; }
		}(),
		agentSessionsService: IAgentSessionsService = new TestAgentSessionsService(),
		notificationService: INotificationService = new VoiceTestNotificationService(),
		chatEntitlementService: IChatEntitlementService = Object.assign(new TestChatEntitlementService(), { entitlement: ChatEntitlement.Pro }),
		voicePlaybackService: IVoicePlaybackService = new class extends mock<IVoicePlaybackService>() {
			override notifyPlaybackStart(): void { }
			override notifyPlaybackEnd(): void { }
		}(),
		chatWidgetService: IChatWidgetService = new TestChatWidgetService(),
	): VoiceSessionController {
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
			voicePlaybackService,
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
			chatWidgetService,
			notificationService,
			promptsService,
			chatEntitlementService,
		));
	}

	async function connectWithOmniOpen(controller: VoiceSessionController, voiceClientService: TestVoiceClientService): Promise<void> {
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		// An open socket is not a live session: a rejected connect is accepted
		// before it is closed so the close frame can carry a reason, so the
		// controller waits for the backend's ack before reporting connected.
		// Without this the omni inbox stays inactive and nothing narrates.
		voiceClientService.fireSessionInit();
		controller.setOmniInputOpen(true);
	}

	function showSessionsInAgentsList(controller: VoiceSessionController, ...sessionIds: string[]): void {
		const agentSessionsService = Reflect.get(controller, 'agentSessionsService') as IAgentSessionsService;
		(agentSessionsService.model.sessions as unknown[]).push(...sessionIds.map(sessionId =>
			agentSessionEntry(sessionId, 'Test session', AgentSessionStatus.InProgress)));
	}

	function createVoiceProgressResponse(id: string, requestId = `request-${id}`) {
		const changeEmitter = store.add(new Emitter<{ reason: 'other' }>());
		const parts: { kind: 'voiceProgress'; id: string; value: string }[] = [];
		const state = {
			id,
			requestId,
			isComplete: false,
			isCanceled: false,
			onDidChange: changeEmitter.event,
			response: { value: parts },
		};
		return { changeEmitter, parts, response: state as unknown as IChatResponseModel, state };
	}

	test('does not connect without a paid Copilot entitlement', async () => {
		const voiceClientService = new TestVoiceClientService();
		const notificationService = new VoiceTestNotificationService();
		const chatEntitlementService = new MutableTestChatEntitlementService();
		chatEntitlementService.entitlement = ChatEntitlement.Free;
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			notificationService,
			chatEntitlementService,
		);

		await controller.connect(mainWindow);

		assert.strictEqual(controller.isConnecting.get(), false);
		assert.strictEqual(controller.isConnected.get(), false);
		assert.deepStrictEqual(notificationService.notifications.map(notification => notification.message), ['Voice Mode requires a paid GitHub Copilot plan.']);
	});

	test('disconnects when the paid Copilot entitlement is lost', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatEntitlementService = new MutableTestChatEntitlementService();
		chatEntitlementService.entitlement = ChatEntitlement.Pro;
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			chatEntitlementService,
		);
		controller['_isConnected'].set(true, undefined);

		chatEntitlementService.setEntitlement(ChatEntitlement.Free);
		await new Promise<void>(resolve => queueMicrotask(resolve));

		assert.strictEqual(controller.isConnected.get(), false);
	});

	test('stays connected across a paid-to-paid entitlement transition', async () => {
		const chatEntitlementService = new MutableTestChatEntitlementService();
		chatEntitlementService.entitlement = ChatEntitlement.Pro;
		const controller = createController(
			new TestVoiceClientService(),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			chatEntitlementService,
		);
		controller['_isConnected'].set(true, undefined);

		chatEntitlementService.transitionEntitlement(ChatEntitlement.Unresolved, ChatEntitlement.Business);
		await new Promise<void>(resolve => queueMicrotask(resolve));

		assert.strictEqual(controller.isConnected.get(), true);
	});

	test('restricts Voice Mode for external Enterprise users but allows internal staff', async () => {
		const externalNotifications = new VoiceTestNotificationService();
		const externalEntitlement = new MutableTestChatEntitlementService();
		externalEntitlement.entitlement = ChatEntitlement.Enterprise;
		const externalController = createController(
			new TestVoiceClientService(),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			externalNotifications,
			externalEntitlement,
		);

		const internalNotifications = new VoiceTestNotificationService();
		const internalEntitlement = new InternalTestChatEntitlementService();
		internalEntitlement.entitlement = ChatEntitlement.Enterprise;
		const internalController = createController(
			new TestVoiceClientService(),
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			internalNotifications,
			internalEntitlement,
		);

		await externalController.connect(mainWindow);
		await internalController.connect(mainWindow);

		assert.deepStrictEqual({
			externalConnecting: externalController.isConnecting.get(),
			externalNotifications: externalNotifications.notifications.map(notification => notification.message),
			internalConnecting: internalController.isConnecting.get(),
			internalNotifications: internalNotifications.notifications.map(notification => notification.message),
		}, {
			externalConnecting: false,
			externalNotifications: ['Voice Mode is not available for GitHub Copilot Enterprise accounts.'],
			internalConnecting: true,
			internalNotifications: [],
		});
	});

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
		voiceClientService.fireSessionInit();

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
		voiceClientService.fireSessionInit();

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

	test('narrates visible questionnaire prompts and choices immediately without internal ids', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionResource = URI.parse('chat-session:/mars-questionnaire');
		const carousel = new ChatQuestionCarouselData([
			{
				id: 'mars_feature_scope',
				type: 'singleSelect',
				title: 'mars_feature_scope',
				message: new MarkdownString('Which Mars features should the experience include?'),
				description: 'Choose the main exploration scope.',
				options: [
					{ id: 'surface_only', label: 'Surface explorer - Drive between landmarks', value: 'surface_only' },
					{ id: 'science_missions', label: 'Science missions - Collect samples and run experiments', value: 'science_missions' },
				],
			},
			{
				id: 'mars_navigation_mode',
				type: 'singleSelect',
				title: 'mars_navigation_mode',
				message: 'How should people navigate Mars?',
				options: [
					{ id: 'guided', label: 'Guided route', value: 'guided' },
					{ id: 'free_roam', label: 'Free roam', value: 'free_roam' },
				],
			},
			{
				id: 'mars_data_approach',
				type: 'multiSelect',
				title: 'mars_data_approach',
				message: 'Which Mars data should be available?',
				options: [
					{ id: 'terrain', label: 'Terrain maps', value: 'terrain' },
					{ id: 'weather', label: 'Weather readings', value: 'weather' },
				],
			},
			{
				id: 'mars_rendering_style',
				type: 'singleSelect',
				title: 'mars_rendering_style',
				message: 'What visual style should Mars use?',
				options: [
					{ id: 'realistic', label: 'Photorealistic', value: 'realistic' },
					{ id: 'illustrated', label: 'Illustrated', value: 'illustrated' },
				],
				allowFreeformInput: true,
			},
		], true, 'mars_internal_resolve_id', undefined, false, new MarkdownString('Help shape the Mars experience.'));
		const model = pendingResponsePartModel(sessionResource, carousel, 'questions: mars_feature_scope, mars_navigation_mode, mars_data_approach, mars_rendering_style');
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; detail?: string; confirmation_type?: VoiceConfirmationType };
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string, confirmationType?: VoiceConfirmationType) => void;
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;
		const progress = createVoiceProgressResponse('mars-progress');

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, progress.response);
		progress.parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the Mars experience.' });
		progress.changeEmitter.fire({ reason: 'other' });
		const stateInfo = getAgentStateInfo.call(controller, model);
		handleStateChange.call(controller, sessionResource.toString(), stateInfo.state, stateInfo.detail, undefined, sessionResource.toString(), stateInfo.confirmation_type);
		const immediateRequestCount = voiceClientService.requests.length;
		clock.tick(5_000);

		assert.deepStrictEqual({
			stateInfo,
			immediateRequestCount,
			request: voiceClientService.requests.map(request => ({ kind: request.kind, text: request.text, confirmationType: request.confirmationType })),
			containsInternalIds: ['mars_feature_scope', 'mars_navigation_mode', 'mars_data_approach', 'mars_rendering_style', 'surface_only', 'free_roam']
				.some(id => stateInfo.detail?.includes(id)),
		}, {
			stateInfo: {
				state: 'waiting_for_confirmation',
				confirmation_type: 'questionnaire',
				detail: [
					'questionnaire: 4 questions',
					'context: Help shape the Mars experience.',
					'1. Which Mars features should the experience include?',
					'details: Choose the main exploration scope.',
					'options: Surface explorer - Drive between landmarks; Science missions - Collect samples and run experiments; a custom response is also available',
					'2. How should people navigate Mars?',
					'options: Guided route; Free roam; a custom response is also available',
					'3. Which Mars data should be available?',
					'options: Terrain maps; Weather readings; a custom response is also available',
					'4. What visual style should Mars use?',
					'options: Photorealistic; Illustrated; a custom response is also available',
					'The questionnaire is open in GitHub Copilot.',
				].join('\n'),
			},
			immediateRequestCount: 1,
			request: [{
				kind: 'confirmation',
				confirmationType: 'questionnaire',
				text: [
					'questionnaire: 4 questions',
					'context: Help shape the Mars experience.',
					'1. Which Mars features should the experience include?',
					'details: Choose the main exploration scope.',
					'options: Surface explorer - Drive between landmarks; Science missions - Collect samples and run experiments; a custom response is also available',
					'2. How should people navigate Mars?',
					'options: Guided route; Free roam; a custom response is also available',
					'3. Which Mars data should be available?',
					'options: Terrain maps; Weather readings; a custom response is also available',
					'4. What visual style should Mars use?',
					'options: Photorealistic; Illustrated; a custom response is also available',
					'The questionnaire is open in GitHub Copilot.',
				].join('\n'),
			}],
			containsInternalIds: false,
		});
	});

	test('extracts visible runtime askQuestions data before carousel persistence', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const sessionResource = URI.parse('chat-session:/runtime-mars-questionnaire');
		const rawQuestions: {
			header: string;
			question: string;
			message?: string;
			options: { label: string; description: string }[];
			multiSelect?: boolean;
		}[] = [
				{
					header: 'mars_scope',
					question: 'What\'s the scope for Mars integration?',
					message: 'This optional detail appears only after the carousel is appended.',
					options: [
						{ label: 'Full parallel system', description: 'Mars as a complete alternative view with its own layers, data, and panels (like a separate mode)' },
						{ label: 'Comparison view', description: 'Earth and Mars side-by-side for comparison purposes' },
						{ label: 'Solar system integration', description: 'Mars as part of an expandable planetary system (Earth, Mars, potentially others)' },
						{ label: 'Just 3D Mars visualization', description: 'Focus on rendering Mars with minimal data layers for now' },
					],
				},
				{
					header: 'mars_data',
					question: 'What data should Mars display?',
					options: [
						{ label: 'Rovers & missions', description: 'Show NASA/international rovers, landing sites, and active missions' },
						{ label: 'Geological features', description: 'Volcanoes, canyons, polar caps, water ice deposits' },
						{ label: 'Real-time data', description: 'Current rover telemetry, atmospheric data, dust storms' },
						{ label: 'Habitability layers', description: 'Radiation, temperature, water availability zones' },
						{ label: 'All of the above', description: 'Full comprehensive Mars visualization' },
					],
					multiSelect: true,
				},
				{
					header: 'mars_textures',
					question: 'How should Mars be textured?',
					options: [
						{ label: 'Procedurally generated (like Earth)', description: 'Canvas-based procedural generation matching current Earth approach' },
						{ label: 'Real NASA imagery', description: 'Use actual Mars satellite imagery (requires downloading/hosting image files)' },
						{ label: 'Simplified stylized', description: 'Simple color palette (red/orange) like a simplified Earth' },
					],
				},
				{
					header: 'mars_timeline',
					question: 'Should Mars have historical/future data?',
					options: [
						{ label: 'Current only', description: 'Show current rovers and active missions' },
						{ label: 'Historical missions', description: 'Include past rovers (Spirit, Opportunity, etc.) and historical landing sites' },
						{ label: 'Future missions', description: 'Include planned future missions and colonization zones' },
						{ label: 'All timeframes', description: 'Full timeline from first landing to future missions' },
					],
				},
			];
		const backingTool = new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly toolId = AskQuestionsToolId;
			override readonly toolCallId = 'toolu_runtime';
			override readonly invocationMessage = 'Asked 4 questions (mars_scope, mars_data, mars_textures, mars_timeline)';
			override readonly state = observableValue<IChatToolInvocation.State>('toolState', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: { questions: rawQuestions },
				confirmationMessages: undefined,
				confirm: () => { },
			});
		}();
		const parts: IChatProgressResponseContent[] = [backingTool];
		const pendingConfirmation = observableValue<{ detail?: string } | undefined>('pending', { detail: 'Asked 4 questions' });
		const response = {
			isPendingConfirmation: pendingConfirmation,
			isIncomplete: observableValue('incomplete', false),
			response: { value: parts, getMarkdown: () => '' },
		};
		const lastRequest = { id: 'request-runtime-questionnaire', response };
		const model = {
			sessionResource,
			title: 'Chat',
			lastMessageDate: Date.now(),
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel;
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => {
			state: string;
			detail?: string;
			confirmation_type?: VoiceConfirmationType;
		};
		const checkSessionStateChanges = Reflect.get(controller, '_checkSessionStateChanges') as () => void;
		const previousStates = Reflect.get(controller, '_prevSessionStates') as Map<string, {
			state: string;
			detail: string;
			confirmationType?: VoiceConfirmationType;
			lastResponseSummary: string;
		}>;

		controller.setActiveSessionShown(sessionResource);
		chatService.setModels([model]);
		previousStates.set(sessionResource.toString(), { state: 'thinking', detail: '', lastResponseSummary: '' });
		const pendingInfo = getAgentStateInfo.call(controller, model);
		checkSessionStateChanges.call(controller);
		const requestsBeforeCarousel = voiceClientService.requests.length;
		const narrationBeforeCarousel = voiceClientService.requests.at(-1);

		const runtimeCarousel = new ChatQuestionCarouselData(rawQuestions.map((question, index) => ({
			id: `toolu_runtime:${index}`,
			type: question.multiSelect ? 'multiSelect' : 'singleSelect',
			title: question.header,
			message: question.question,
			detailedMessage: question.message,
			options: question.options.map(option => ({
				id: option.label,
				label: `${option.label} - ${option.description}`,
				value: option.label,
			})),
			allowFreeformInput: true,
		})), true, 'toolu_runtime');
		parts.push(runtimeCarousel);
		checkSessionStateChanges.call(controller);
		const requestsAfterCarousel = voiceClientService.requests.length;
		const narrationAfterCarousel = voiceClientService.requests.at(-1);

		assert.deepStrictEqual({
			pendingState: pendingInfo.state,
			pendingType: pendingInfo.confirmation_type,
			pendingHasVisibleDetail: pendingInfo.detail?.startsWith('questionnaire: 4 questions'),
			requestsBeforeCarousel,
			requestsAfterCarousel,
			initialNarrationKind: narrationBeforeCarousel?.kind,
			initialNarrationType: narrationBeforeCarousel?.confirmationType,
			initialHasQuestionCount: narrationBeforeCarousel?.text.startsWith('questionnaire: 4 questions'),
			initialHasFirstPrompt: narrationBeforeCarousel?.text.includes('1. What\'s the scope for Mars integration?'),
			initialHasLastPrompt: narrationBeforeCarousel?.text.includes('4. Should Mars have historical/future data?'),
			followupNarrationKind: narrationAfterCarousel?.kind,
			followupHasVisibleOptionDescription: narrationAfterCarousel?.text.includes('Full parallel system - Mars as a complete alternative view'),
			includesLateDetails: narrationAfterCarousel?.text.includes('This optional detail appears only after the carousel is appended.'),
			usedFallback: narrationBeforeCarousel?.text === 'I need your input in the open questionnaire.',
			containsHiddenIds: ['mars_scope', 'mars_data', 'mars_textures', 'mars_timeline', 'toolu_runtime']
				.some(value => narrationBeforeCarousel?.text.includes(value) || narrationAfterCarousel?.text.includes(value)),
		}, {
			pendingState: 'waiting_for_confirmation',
			pendingType: 'questionnaire',
			pendingHasVisibleDetail: true,
			requestsBeforeCarousel: 1,
			requestsAfterCarousel: 2,
			initialNarrationKind: 'confirmation',
			initialNarrationType: 'questionnaire',
			initialHasQuestionCount: true,
			initialHasFirstPrompt: true,
			initialHasLastPrompt: true,
			followupNarrationKind: 'question',
			followupHasVisibleOptionDescription: true,
			includesLateDetails: false,
			usedFallback: false,
			containsHiddenIds: false,
		});
	});

	test('defers runtime askQuestions narration until visible parameters populate', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const sessionResource = URI.parse('chat-session:/late-runtime-questionnaire');
		const toolState = observableValue<IChatToolInvocation.State>('toolState', {
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { questions: [] },
			confirmationMessages: undefined,
			confirm: () => { },
		});
		const backingTool = new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly toolId = AskQuestionsToolId;
			override readonly invocationMessage = 'Asking a clarifying question';
			override readonly state = toolState;
		}();
		const pendingConfirmation = observableValue<{ detail?: string } | undefined>('pending', { detail: 'Asking a clarifying question' });
		const response = {
			isPendingConfirmation: pendingConfirmation,
			isIncomplete: observableValue('incomplete', false),
			response: { value: [backingTool], getMarkdown: () => '' },
		};
		const lastRequest = { id: 'request-late-questionnaire', response };
		const model = {
			sessionResource,
			title: 'Chat',
			lastMessageDate: Date.now(),
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel;
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => {
			state: string;
			detail?: string;
			confirmation_type?: VoiceConfirmationType;
		};
		const checkSessionStateChanges = Reflect.get(controller, '_checkSessionStateChanges') as () => void;
		const previousStates = Reflect.get(controller, '_prevSessionStates') as Map<string, {
			state: string;
			detail: string;
			confirmationType?: VoiceConfirmationType;
			lastResponseSummary: string;
		}>;

		controller.setActiveSessionShown(sessionResource);
		chatService.setModels([model]);
		previousStates.set(sessionResource.toString(), { state: 'thinking', detail: '', lastResponseSummary: '' });
		const pendingInfo = getAgentStateInfo.call(controller, model);
		checkSessionStateChanges.call(controller);
		const requestsBeforePopulation = voiceClientService.requests.length;

		toolState.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: {
				questions: [{
					header: 'internal_scope',
					question: 'Which Mars scope should GitHub Copilot use?',
					options: [{
						label: 'Comparison view',
						description: 'Show Earth and Mars side-by-side',
						value: 'hidden-value',
					}],
					recommended: true,
				}],
			},
			confirmationMessages: undefined,
			confirm: () => { },
		}, undefined);
		checkSessionStateChanges.call(controller);
		const narration = voiceClientService.requests.at(-1);

		assert.deepStrictEqual({
			pendingInfo,
			requestsBeforePopulation,
			narration: narration ? {
				kind: narration.kind,
				confirmationType: narration.confirmationType,
				text: narration.text,
			} : undefined,
			containsHiddenMetadata: ['internal_scope', 'hidden-value', 'recommended']
				.some(value => narration?.text.includes(value)),
		}, {
			pendingInfo: {
				state: 'waiting_for_confirmation',
				confirmation_type: 'questionnaire',
			},
			requestsBeforePopulation: 0,
			narration: {
				kind: 'confirmation',
				confirmationType: 'questionnaire',
				text: [
					'questionnaire: 1 question',
					'1. Which Mars scope should GitHub Copilot use?',
					'options: Comparison view - Show Earth and Mars side-by-side; a custom response is also available',
					'The questionnaire is open in GitHub Copilot.',
				].join('\n'),
			},
			containsHiddenMetadata: false,
		});
	});

	test('carries questionnaire type in session context and clears it when resolved', () => {
		const chatService = new ControllableChatService();
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, chatService);
		const sessionResource = URI.parse('chat-session:/durable-questionnaire');
		const carousel = new ChatQuestionCarouselData([{
			id: 'hidden-question-id',
			type: 'singleSelect',
			title: 'Hidden title key',
			message: 'Which deployment should GitHub Copilot use?',
			options: [{ id: 'hidden-option-id', label: 'Preview deployment', value: 'hidden-option-value' }],
		}], true);
		const pendingConfirmation = observableValue<{ detail?: string } | undefined>('pending', { detail: 'Needs approval' });
		const response = {
			isPendingConfirmation: pendingConfirmation,
			isIncomplete: observableValue('incomplete', false),
			response: { value: [carousel], getMarkdown: () => '' },
		};
		const lastRequest = { id: 'request-questionnaire', response };
		const model = {
			sessionResource,
			title: 'Chat',
			lastMessageDate: Date.now(),
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel;
		const buildSessionContext = Reflect.get(controller, '_buildSessionContext') as () => { sessions: readonly Record<string, unknown>[] };

		controller.setActiveSessionShown(sessionResource);
		chatService.setModels([model]);
		const pendingContext = buildSessionContext.call(controller).sessions[0];
		carousel.isUsed = true;
		carousel.isUsed = true;
		pendingConfirmation.set(undefined, undefined);
		const resolvedContext = buildSessionContext.call(controller).sessions[0];

		const pending = pendingContext?.['pending'] as Record<string, unknown> | undefined;
		assert.deepStrictEqual({
			pendingContext: pendingContext ? {
				id: pendingContext['id'],
				session_type: pendingContext['session_type'],
				is_active: pendingContext['is_active'],
				agent_state: pendingContext['agent_state'],
				agent_state_detail: pendingContext['agent_state_detail'],
				confirmation_type: pendingContext['confirmation_type'],
				pending: pending ? {
					type: pending['type'],
					request_id: pending['request_id'],
					pendingIdMatchesRequest: typeof pending['pending_id'] === 'string' && pending['pending_id'].startsWith('request-questionnaire#'),
					allow_skip: pending['allow_skip'],
					questions: pending['questions'],
				} : undefined,
			} : undefined,
			resolvedContext,
		}, {
			pendingContext: {
				id: sessionResource.toString(),
				session_type: 'chat',
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: [
					'questionnaire: 1 question',
					'1. Which deployment should GitHub Copilot use?',
					'options: Preview deployment; a custom response is also available',
					'The questionnaire is open in GitHub Copilot.',
				].join('\n'),
				confirmation_type: 'questionnaire',
				pending: {
					type: 'questions',
					request_id: 'request-questionnaire',
					pendingIdMatchesRequest: true,
					allow_skip: true,
					questions: [{
						id: 'hidden-question-id',
						type: 'singleSelect',
						title: 'Which deployment should GitHub Copilot use?',
						allow_freeform: true,
						options: [{ label: 'Preview deployment', value: 'hidden-option-value' }],
					}],
				},
			},
			resolvedContext: {
				id: sessionResource.toString(),
				label: 'Chat',
				session_type: 'chat',
				is_active: true,
				agent_state: 'idle',
			},
		});
	});

	test('routes structured pending responses to the same action that is narrated', () => {
		const chatService = new ControllableChatService();
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, chatService);
		const buildSessionContext = Reflect.get(controller, '_buildSessionContext') as () => { sessions: readonly { pending?: { type: string; pending_id: string; message?: string } }[] };
		const waitingTool = (id: string, postApproval = false) => new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly toolId = id;
			override readonly invocationMessage = `Run ${id}`;
			override readonly state = observableValue<IChatToolInvocation.State>(`${id}State`, postApproval ? {
				type: IChatToolInvocation.StateKind.WaitingForPostApproval,
				parameters: {},
				confirmationMessages: { title: `Approve ${id}?`, message: `Review ${id}.` },
				confirmed: { type: ToolConfirmKind.UserAction },
				resultDetails: undefined,
				confirm: () => { },
				contentForModel: [],
			} : {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: {},
				confirmationMessages: { title: `Approve ${id}?`, message: `Review ${id}.` },
				confirm: () => { },
			});
		}();
		const pendingFor = (resource: URI, requestId: string, parts: IChatProgressResponseContent[]) => {
			const response = {
				isPendingConfirmation: observableValue<{ detail?: string } | undefined>(`${requestId}Pending`, { detail: 'Needs input' }),
				isIncomplete: observableValue(`${requestId}Incomplete`, false),
				response: { value: parts, getMarkdown: () => '' },
			};
			const lastRequest = { id: requestId, response };
			const model = {
				sessionResource: resource,
				title: 'Chat',
				lastMessageDate: Date.now(),
				getRequests: () => [lastRequest],
				lastRequestObs: observableValue(`${requestId}LastRequest`, lastRequest),
			} as unknown as IChatModel;
			controller.setActiveSessionShown(resource);
			chatService.setModels([model]);
			return buildSessionContext.call(controller).sessions[0]?.pending;
		};

		const questionnaire = new ChatQuestionCarouselData([{
			id: 'region',
			type: 'singleSelect',
			title: 'Region',
			message: 'Which region?',
			options: [{ id: 'west', label: 'West US', value: 'westus' }],
		}], true);
		const unrelatedTool = waitingTool('unrelated');
		const questionnairePending = pendingFor(URI.parse('chat-session:/questionnaire-route'), 'request-questionnaire-route', [questionnaire, unrelatedTool]);

		const plan = new ChatPlanReviewData('Review plan', 'Plan body', [{ id: 'implement', label: 'Implement Plan' }], true);
		const olderTool = waitingTool('older');
		const planPending = pendingFor(URI.parse('chat-session:/plan-route'), 'request-plan-route', [olderTool, plan]);

		const postApprovalTool = waitingTool('post-approval', true);
		const postApprovalPending = pendingFor(URI.parse('chat-session:/post-route'), 'request-post-route', [postApprovalTool]);

		const askQuestionsTool = waitingTool(AskQuestionsToolId);
		const olderQuestionnaire = new ChatQuestionCarouselData([{
			id: 'older-region',
			type: 'singleSelect',
			title: 'Older region',
			message: 'Which older region?',
			options: [{ id: 'east', label: 'East US', value: 'eastus' }],
		}], true);
		const askQuestionsPending = pendingFor(URI.parse('chat-session:/ask-route'), 'request-ask-route', [olderQuestionnaire, askQuestionsTool]);

		assert.deepStrictEqual({
			questionnaire: {
				type: questionnairePending?.type,
				idMatches: questionnairePending?.pending_id === peekPendingId('request-questionnaire-route', questionnaire),
			},
			plan: {
				type: planPending?.type,
				idMatches: planPending?.pending_id === peekPendingId('request-plan-route', olderTool),
			},
			postApproval: {
				type: postApprovalPending?.type,
				idMatches: postApprovalPending?.pending_id === peekPendingId('request-post-route', postApprovalTool),
			},
			askQuestionsBeforeCarousel: {
				type: askQuestionsPending?.type,
				idMatches: askQuestionsPending?.pending_id === peekPendingId('request-ask-route', olderQuestionnaire),
			},
		}, {
			questionnaire: { type: 'questions', idMatches: true },
			plan: { type: 'approval', idMatches: true },
			postApproval: { type: 'approval', idMatches: true },
			askQuestionsBeforeCarousel: { type: 'questions', idMatches: true },
		});
	});

	test('flushes exact typed context before fresh and changed confirmation narration', () => {
		const scenarios: {
			name: string;
			part: IChatProgressResponseContent;
			fromState: string;
			fromDetail: string;
			fromType?: VoiceConfirmationType;
			expectedType: VoiceConfirmationType;
			expectedDetail: string;
		}[] = [
				{
					name: 'fresh-generic',
					part: {
						kind: 'confirmation',
						title: 'Install extensions?',
						message: 'Review the visible extension approval.',
						data: {},
					},
					fromState: 'thinking',
					fromDetail: '',
					expectedType: 'generic',
					expectedDetail: [
						'confirmation: Install extensions?',
						'Review the visible extension approval.',
					].join('\n'),
				},
				{
					name: 'plan-to-generic',
					part: {
						kind: 'confirmation',
						title: 'Confirm the revised plan?',
						message: 'Review the revised plan confirmation.',
						data: {},
					},
					fromState: 'waiting_for_confirmation',
					fromDetail: [
						'plan approval: Review the implementation plan',
						'choices: Implement Plan',
						'The plan is open in GitHub Copilot.',
					].join('\n'),
					fromType: 'plan',
					expectedType: 'generic',
					expectedDetail: [
						'confirmation: Confirm the revised plan?',
						'Review the revised plan confirmation.',
					].join('\n'),
				},
				{
					name: 'detail-change',
					part: {
						kind: 'confirmation',
						title: 'Approve the updated extension set?',
						message: 'Review the updated visible extension approval.',
						data: {},
					},
					fromState: 'waiting_for_confirmation',
					fromDetail: 'confirmation: Approve the old extension set?',
					fromType: 'generic',
					expectedType: 'generic',
					expectedDetail: [
						'confirmation: Approve the updated extension set?',
						'Review the updated visible extension approval.',
					].join('\n'),
				},
			];
		const results: {
			name: string;
			contextBeforeRequest: boolean;
			contextSession: Record<string, unknown> | undefined;
			request: { kind: VoiceNarrationKind; text: string; confirmationType?: VoiceConfirmationType } | undefined;
		}[] = [];

		for (const scenario of scenarios) {
			const voiceClientService = new TestVoiceClientService();
			const chatService = new ControllableChatService();
			const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
			const sessionResource = URI.parse(`chat-session:/${scenario.name}`);
			const model = pendingResponsePartModel(sessionResource, scenario.part);
			const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => {
				state: string;
				detail?: string;
				confirmation_type?: VoiceConfirmationType;
			};
			const pendingChanges = Reflect.get(controller, '_pendingStateChanges') as Map<string, {
				sessionId: string;
				currentState: string;
				label: string;
				detail?: string;
				confirmationType?: VoiceConfirmationType;
				fromState: string;
				fromDetail: string;
				fromConfirmationType?: VoiceConfirmationType;
				fromResponseSummary: string;
				pendingId: string;
				fromPendingId: string;
			}>;
			const emitPendingStateChanges = Reflect.get(controller, '_emitPendingStateChanges') as () => void;
			const pendingIdFor = Reflect.get(controller, '_pendingIdFor') as (sessionId: string) => string;

			controller.setActiveSessionShown(sessionResource);
			chatService.setModels([model]);
			voiceClientService.wireEvents.length = 0;
			const stateInfo = getAgentStateInfo.call(controller, model);
			pendingChanges.set(sessionResource.toString(), {
				sessionId: sessionResource.toString(),
				currentState: stateInfo.state,
				label: 'Chat',
				detail: stateInfo.detail,
				confirmationType: stateInfo.confirmation_type,
				fromState: scenario.fromState,
				fromDetail: scenario.fromDetail,
				fromConfirmationType: scenario.fromType,
				fromResponseSummary: '',
				pendingId: pendingIdFor.call(controller, sessionResource.toString()),
				fromPendingId: '',
			});
			emitPendingStateChanges.call(controller);

			const requestIndex = voiceClientService.wireEvents.findIndex(event => event.type === 'request_narration');
			const contextEvents = voiceClientService.wireEvents.slice(0, requestIndex).filter(event => event.type === 'session_context');
			const contextSession = contextEvents.at(-1)?.context.sessions.find(session => session.id === sessionResource.toString());
			const request = voiceClientService.wireEvents[requestIndex];
			results.push({
				name: scenario.name,
				contextBeforeRequest: requestIndex > 0 && contextEvents.length > 0,
				contextSession,
				request: request?.type === 'request_narration' ? request : undefined,
			});
		}

		assert.deepStrictEqual(results.map(result => ({
			name: result.name,
			contextBeforeRequest: result.contextBeforeRequest,
			contextState: result.contextSession?.['agent_state'],
			contextDetail: result.contextSession?.['agent_state_detail'],
			contextType: result.contextSession?.['confirmation_type'],
			request: result.request,
		})), scenarios.map(scenario => ({
			name: scenario.name,
			contextBeforeRequest: true,
			contextState: 'waiting_for_confirmation',
			contextDetail: scenario.expectedDetail,
			contextType: scenario.expectedType,
			request: {
				type: 'request_narration',
				kind: 'confirmation',
				text: scenario.expectedDetail,
				confirmationType: scenario.expectedType,
			},
		})));
	});

	test('assigns occurrence ids to same-text generic confirmations', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const sessionResource = URI.parse('chat-session:/sequential-confirmations');
		const confirmation = (): IChatConfirmation => ({
			kind: 'confirmation',
			title: 'Allow this action?',
			message: 'Review the requested action.',
			data: {},
		});
		const pendingIdFor = Reflect.get(controller, '_pendingIdFor') as (sessionId: string) => string;
		chatService.setModels([pendingResponsePartModel(sessionResource, confirmation(), 'Needs approval', true, 'routed-request')]);
		const firstPendingId = pendingIdFor.call(controller, sessionResource.toString());
		chatService.setModels([pendingResponsePartModel(sessionResource, confirmation(), 'Needs approval', true, 'routed-request')]);
		const secondPendingId = pendingIdFor.call(controller, sessionResource.toString());

		assert.notStrictEqual(firstPendingId, secondPendingId);
	});

	test('replaces an in-flight tool approval with the next identical approval', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const sessionResource = URI.parse('chat-session:/sequential-tool-approvals');
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => {
			state: string;
			detail?: string;
			confirmation_type?: VoiceConfirmationType;
		};
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;

		controller.setActiveSessionShown(sessionResource);
		controller.setTargetSession(sessionResource, 'existing_session');
		const firstTool = waitingTerminalTool('first-tool');
		const firstModel = pendingResponsePartModel(sessionResource, firstTool, 'Needs approval', true, 'routed-request');
		chatService.setModels([firstModel]);
		const firstState = getAgentStateInfo.call(controller, firstModel);
		handleStateChange.call(controller, sessionResource.toString(), firstState.state, firstState.detail, undefined, sessionResource.toString(), firstState.confirmation_type);

		const secondTool = waitingTerminalTool('second-tool');
		const secondModel = pendingResponsePartModel(sessionResource, secondTool, 'Needs approval', true, 'routed-request');
		chatService.setModels([secondModel]);
		const secondState = getAgentStateInfo.call(controller, secondModel);
		Reflect.set(controller, '_pttHeld', true);
		Reflect.set(controller, '_pttCurrentTurnPassive', true);
		(Reflect.get(controller, '_voiceState') as { set(value: string, tx: undefined): void }).set('listening', undefined);
		handleStateChange.call(controller, sessionResource.toString(), secondState.state, secondState.detail, undefined, sessionResource.toString(), secondState.confirmation_type);

		assert.deepStrictEqual({
			requests: voiceClientService.requests.map(request => ({ kind: request.kind, pendingId: request.pendingId })),
			listeningTurnHeld: Reflect.get(controller, '_pttHeld'),
		}, {
			requests: [
				{ kind: 'confirmation', pendingId: derivePendingId('routed-request', firstTool) },
				{ kind: 'confirmation', pendingId: derivePendingId('routed-request', secondTool) },
			],
			listeningTurnHeld: false,
		});
	});

	test('narrates three approvals when one tool invocation is re-armed', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const sessionResource = URI.parse('chat-session:/rearmed-tool-approvals');
		const tool = waitingTerminalTool('rearmed-tool');
		const model = pendingResponsePartModel(sessionResource, tool, 'Needs approval', true, 'routed-request');
		const toolState = tool.state as IChatToolInvocation['state'] & {
			set(value: IChatToolInvocation.State, transaction: undefined): void;
		};
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => {
			state: string;
			detail?: string;
			confirmation_type?: VoiceConfirmationType;
		};
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		const markNarrationHeard = Reflect.get(controller, '_markNarrationHeard') as (narrationId: string) => void;
		const pendingIds: (string | undefined)[] = [];

		controller.setActiveSessionShown(sessionResource);
		controller.setTargetSession(sessionResource, 'existing_session');
		chatService.setModels([model]);

		const narrateCurrentApproval = () => {
			const state = getAgentStateInfo.call(controller, model);
			handleStateChange.call(controller, sessionResource.toString(), state.state, state.detail, undefined, sessionResource.toString(), state.confirmation_type);
			const request = voiceClientService.requests.at(-1)!;
			pendingIds.push(request.pendingId);
			markNarrationHeard.call(controller, request.narrationId);
		};
		const rearm = (command: string) => toolState.set({
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: { command },
			confirmationMessages: {
				title: 'Run zsh command?',
				message: 'Installs dependencies - pulls untrusted third-party code.',
			},
			confirm: () => { },
		}, undefined);

		narrateCurrentApproval();
		rearm('npm install');
		narrateCurrentApproval();
		rearm('npm test');
		narrateCurrentApproval();

		assert.deepStrictEqual({
			requestCount: voiceClientService.requests.length,
			uniquePendingIds: new Set(pendingIds).size,
			kinds: voiceClientService.requests.map(request => request.kind),
		}, {
			requestCount: 3,
			uniquePendingIds: 3,
			kinds: ['confirmation', 'confirmation', 'confirmation'],
		});
	});

	test('confirmation watchdog narrates a sequential approval missed by the transition path', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const sessionResource = URI.parse('chat-session:/watchdog-sequential-tool-approvals');
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => {
			state: string;
			detail?: string;
			confirmation_type?: VoiceConfirmationType;
		};
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		const markNarrationHeard = Reflect.get(controller, '_markNarrationHeard') as (narrationId: string) => void;
		const armConfirmationFlushWatchdog = Reflect.get(controller, '_armConfirmationFlushWatchdog') as (sessionId: string, label: string, isTransition: boolean) => void;

		controller.setActiveSessionShown(sessionResource);
		controller.setTargetSession(sessionResource, 'existing_session');
		const firstTool = waitingTerminalTool('first-watchdog-tool');
		const firstModel = pendingResponsePartModel(sessionResource, firstTool, 'Needs approval', true, 'routed-request');
		chatService.setModels([firstModel]);
		const firstState = getAgentStateInfo.call(controller, firstModel);
		handleStateChange.call(controller, sessionResource.toString(), firstState.state, firstState.detail, undefined, sessionResource.toString(), firstState.confirmation_type);
		markNarrationHeard.call(controller, voiceClientService.requests[0].narrationId);

		// Replace the completed first tool with the next pending occurrence without
		// calling the normal state-change handler, matching the missed-transition
		// condition this fallback exists to recover.
		const secondTool = waitingTerminalTool('second-watchdog-tool', 'npm install');
		chatService.setModels([pendingResponsePartModel(sessionResource, secondTool, 'Needs approval', true, 'routed-request')]);
		Reflect.set(controller, '_pttHeld', true);
		Reflect.set(controller, '_pttCurrentTurnPassive', true);
		(Reflect.get(controller, '_voiceState') as { set(value: string, tx: undefined): void }).set('listening', undefined);
		armConfirmationFlushWatchdog.call(controller, sessionResource.toString(), 'Chat', true);
		clock.tick(1_500);

		assert.deepStrictEqual({
			requests: voiceClientService.requests.map(request => ({ kind: request.kind, pendingId: request.pendingId })),
			listeningTurnHeld: Reflect.get(controller, '_pttHeld'),
		}, {
			requests: [
				{ kind: 'confirmation', pendingId: derivePendingId('routed-request', firstTool) },
				{ kind: 'confirmation', pendingId: derivePendingId('routed-request', secondTool) },
			],
			listeningTurnHeld: false,
		});

		// The watchdog can be re-armed while the same occurrence is still pending;
		// the shared in-flight/occurrence dedup must keep that retry silent.
		armConfirmationFlushWatchdog.call(controller, sessionResource.toString(), 'Chat', false);
		clock.tick(1_500);
		assert.strictEqual(voiceClientService.requests.length, 2);
	});

	test('same confirmation text with a new type is not deduplicated', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionId = 'chat-session:/typed-confirmation-dedup';
		const narrate = Reflect.get(controller, '_narrate') as (
			sessionId: string,
			kind: VoiceNarrationKind,
			text: string,
			reuseId?: string,
			checkpoint?: IVoiceCheckpointNarrationMetadata,
			confirmationType?: VoiceConfirmationType,
		) => boolean;
		await controller.connect(mainWindow);

		const questionnaireSent = narrate.call(controller, sessionId, 'confirmation', 'I need your input.', undefined, undefined, 'questionnaire');
		const duplicateQuestionnaireSent = narrate.call(controller, sessionId, 'confirmation', 'I need your input.', undefined, undefined, 'questionnaire');
		const planSent = narrate.call(controller, sessionId, 'confirmation', 'I need your input.', undefined, undefined, 'plan');

		assert.deepStrictEqual({
			questionnaireSent,
			duplicateQuestionnaireSent,
			planSent,
			types: voiceClientService.requests.map(request => request.confirmationType),
		}, {
			questionnaireSent: true,
			duplicateQuestionnaireSent: false,
			planSent: true,
			types: ['questionnaire', 'plan'],
		});
	});

	test('reconnect replays only confirmations matching current text and type', async () => {
		const cases: {
			name: string;
			pending: { kind: 'response' | 'confirmation'; text: string; confirmationType?: VoiceConfirmationType };
			current: { kind: 'response' | 'confirmation'; text: string; confirmationType?: VoiceConfirmationType } | undefined;
		}[] = [
				{
					name: 'generic-to-plan',
					pending: { kind: 'confirmation', text: 'Review this item.', confirmationType: 'generic' },
					current: { kind: 'confirmation', text: 'Review this item.', confirmationType: 'plan' },
				},
				{
					name: 'generic-to-idle',
					pending: { kind: 'confirmation', text: 'Review this item.', confirmationType: 'generic' },
					current: { kind: 'response', text: 'Done.' },
				},
				{
					name: 'legacy-to-generic',
					pending: { kind: 'confirmation', text: 'Review this item.' },
					current: { kind: 'confirmation', text: 'Review this item.', confirmationType: 'generic' },
				},
				{
					name: 'matching-generic',
					pending: { kind: 'confirmation', text: 'Review this item.', confirmationType: 'generic' },
					current: { kind: 'confirmation', text: 'Review this item.', confirmationType: 'generic' },
				},
				{
					name: 'matching-legacy',
					pending: { kind: 'confirmation', text: 'Legacy confirmation.' },
					current: { kind: 'confirmation', text: 'Legacy confirmation.' },
				},
				{
					name: 'response-conflicts-with-generic',
					pending: { kind: 'response', text: 'Old final response.' },
					current: { kind: 'confirmation', text: 'Current confirmation.', confirmationType: 'generic' },
				},
				{
					name: 'response-summary-changed',
					pending: { kind: 'response', text: 'Old final response.' },
					current: { kind: 'response', text: 'New final response.' },
				},
				{
					name: 'matching-response',
					pending: { kind: 'response', text: 'Final response.' },
					current: { kind: 'response', text: 'Final response.' },
				},
			];
		const results: { name: string; requests: { kind: VoiceNarrationKind; text: string; confirmationType?: VoiceConfirmationType }[] }[] = [];

		for (const testCase of cases) {
			const voiceClientService = new TestVoiceClientService();
			const controller = createController(voiceClientService);
			const sessionId = `chat-session:/${testCase.name}`;
			await controller.connect(mainWindow);
			const retries = Reflect.get(controller, '_pendingNarrationRetries') as Map<string, typeof testCase.pending>;
			retries.set(sessionId, testCase.pending);
			Reflect.set(controller, '_currentNarratable', () => testCase.current);
			controller.setActiveSessionShown(URI.parse(sessionId));

			voiceClientService.fireSessionInit();
			results.push({
				name: testCase.name,
				requests: voiceClientService.requests.map(request => ({
					kind: request.kind,
					text: request.text,
					...(request.confirmationType ? { confirmationType: request.confirmationType } : {}),
				})),
			});
		}

		assert.deepStrictEqual(results, [
			{ name: 'generic-to-plan', requests: [] },
			{ name: 'generic-to-idle', requests: [] },
			{ name: 'legacy-to-generic', requests: [] },
			{ name: 'matching-generic', requests: [{ kind: 'confirmation', text: 'Review this item.', confirmationType: 'generic' }] },
			{ name: 'matching-legacy', requests: [{ kind: 'confirmation', text: 'Legacy confirmation.' }] },
			{ name: 'response-conflicts-with-generic', requests: [] },
			{ name: 'response-summary-changed', requests: [] },
			{ name: 'matching-response', requests: [{ kind: 'response', text: 'Final response.' }] },
		]);
	});

	test('busy confirmation retries only when current text and type still match', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionId = 'chat-session:/deferred-confirmation';
		const sessionKey = (Reflect.get(controller, '_sessionKey') as (sessionId: string) => string).call(controller, sessionId);
		const deferred = Reflect.get(controller, '_deferredNarrations') as Map<string, {
			narrationId: string;
			kind: 'confirmation';
			text: string;
			reuseNarrationId: boolean;
			confirmationType?: VoiceConfirmationType;
		}>;
		const retry = Reflect.get(controller, '_retryDeferredNarration') as (sessionKey: string) => boolean;
		controller.setActiveSessionShown(URI.parse(sessionId));

		deferred.set(sessionKey, {
			narrationId: 'stale-type',
			kind: 'confirmation',
			text: 'Review this item.',
			reuseNarrationId: true,
			confirmationType: 'generic',
		});
		Reflect.set(controller, '_currentNarratable', () => ({ kind: 'confirmation', text: 'Review this item.', confirmationType: 'plan' }));
		const staleTypeRetried = retry.call(controller, sessionKey);

		deferred.set(sessionKey, {
			narrationId: 'stale-text',
			kind: 'confirmation',
			text: 'Old detail.',
			reuseNarrationId: true,
			confirmationType: 'generic',
		});
		Reflect.set(controller, '_currentNarratable', () => ({ kind: 'confirmation', text: 'New detail.', confirmationType: 'generic' }));
		const staleTextRetried = retry.call(controller, sessionKey);

		deferred.set(sessionKey, {
			narrationId: 'matching',
			kind: 'confirmation',
			text: 'Current detail.',
			reuseNarrationId: true,
			confirmationType: 'generic',
		});
		Reflect.set(controller, '_currentNarratable', () => ({ kind: 'confirmation', text: 'Current detail.', confirmationType: 'generic' }));
		const matchingRetried = retry.call(controller, sessionKey);

		assert.deepStrictEqual({
			staleTypeRetried,
			staleTextRetried,
			matchingRetried,
			requests: voiceClientService.requests.map(request => ({
				narrationId: request.narrationId,
				text: request.text,
				confirmationType: request.confirmationType,
			})),
			deferredCount: deferred.size,
		}, {
			staleTypeRetried: false,
			staleTextRetried: false,
			matchingRetried: true,
			requests: [{
				narrationId: 'matching',
				text: 'Current detail.',
				confirmationType: 'generic',
			}],
			deferredCount: 0,
		});
	});

	test('auto-approve ignores questionnaire backing tools', () => {
		const controller = createController(new TestVoiceClientService());
		const confirmed: ToolConfirmKind[] = [];
		const toolInvocation = new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly state = observableValue<IChatToolInvocation.State>('toolState', {
				type: IChatToolInvocation.StateKind.WaitingForConfirmation,
				parameters: {},
				confirmationMessages: {
					title: 'Submit questionnaire?',
					message: 'Submits the questionnaire answers.',
				},
				confirm: reason => confirmed.push(reason.type),
			});
			override readonly invocationMessage = 'Submit questionnaire';
		}();
		const questionnaire = new ChatQuestionCarouselData([{
			id: 'hidden-question-id',
			type: 'singleSelect',
			title: 'Choose an option',
			options: [{ id: 'hidden-option-id', label: 'Visible option', value: 'hidden-value' }],
		}], true);
		const pendingConfirmation = observableValue<{ detail?: string } | undefined>('pending', { detail: 'Needs input' });
		const modelWithQuestionnaire = {
			getRequests: () => [{
				response: {
					isPendingConfirmation: pendingConfirmation,
					response: { value: [toolInvocation, questionnaire] },
				},
			}],
		} as unknown as IChatModel;
		const modelWithTool = {
			getRequests: () => [{
				response: {
					isPendingConfirmation: pendingConfirmation,
					response: { value: [toolInvocation] },
				},
			}],
		} as unknown as IChatModel;
		const autoApprovePendingTools = Reflect.get(controller, '_autoApprovePendingTools') as (model: IChatModel) => void;

		autoApprovePendingTools.call(controller, modelWithQuestionnaire);
		autoApprovePendingTools.call(controller, modelWithTool);

		assert.deepStrictEqual(confirmed, [ToolConfirmKind.UserAction]);
	});

	test('handles freeform and defers empty questionnaire data', () => {
		const controller = createController(new TestVoiceClientService());
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; detail?: string };
		const freeform = new ChatQuestionCarouselData([{
			id: 'internal_name_key',
			type: 'text',
			title: 'internal_name_key',
			message: 'What should we call the Mars explorer?',
		}], false);
		const missing = new ChatQuestionCarouselData([], true, 'hidden_resolve_id');
		const internalTitleOnly = new ChatQuestionCarouselData([{
			id: 'internal_prompt_key',
			type: 'text',
			title: 'internal_prompt_key',
		}], true);
		const noCustomOption = new ChatQuestionCarouselData([{
			id: 'navigation',
			type: 'singleSelect',
			title: 'Navigation',
			message: 'Choose a navigation mode.',
			options: [{ id: 'guided', label: 'Guided route', value: 'guided' }],
			allowFreeformInput: false,
		}], true);

		assert.deepStrictEqual([
			getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/freeform'), freeform, undefined, false)),
			getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/missing'), missing, undefined, false)),
			getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/internal-title'), internalTitleOnly, undefined, false)),
			getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/no-custom'), noCustomOption, undefined, false)),
		], [
			{
				state: 'waiting_for_confirmation',
				confirmation_type: 'questionnaire',
				detail: [
					'questionnaire: 1 question',
					'1. What should we call the Mars explorer?',
					'response: enter a free-form answer in GitHub Copilot',
					'The questionnaire is open in GitHub Copilot.',
				].join('\n'),
			},
			{
				state: 'waiting_for_confirmation',
				confirmation_type: 'questionnaire'
			},
			{
				state: 'waiting_for_confirmation',
				confirmation_type: 'questionnaire',
				detail: [
					'questionnaire: 1 question',
					'1. I need your input in the open questionnaire.',
					'response: enter a free-form answer in GitHub Copilot',
					'The questionnaire is open in GitHub Copilot.',
				].join('\n'),
			},
			{
				state: 'waiting_for_confirmation',
				confirmation_type: 'questionnaire',
				detail: [
					'questionnaire: 1 question',
					'1. Choose a navigation mode.',
					'options: Guided route',
					'The questionnaire is open in GitHub Copilot.',
				].join('\n'),
			},
		]);
	});

	test('bounds questionnaire questions and options with omission counts', () => {
		const controller = createController(new TestVoiceClientService());
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { detail?: string };
		const carousel = new ChatQuestionCarouselData(Array.from({ length: 8 }, (_, questionIndex) => ({
			id: `internal_question_${questionIndex}`,
			type: 'singleSelect' as const,
			title: `Internal question ${questionIndex}`,
			message: `Visible question ${questionIndex + 1}?`,
			options: Array.from({ length: 8 }, (_, optionIndex) => ({
				id: `internal_option_${questionIndex}_${optionIndex}`,
				label: `Visible option ${optionIndex + 1}`,
				value: `hidden_value_${optionIndex}`,
			})),
		})), true);
		const detail = getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/bounded'), carousel)).detail ?? '';

		assert.deepStrictEqual({
			withinLimit: detail.length <= 2_400,
			includesOptionOmission: detail.includes('3 more options'),
			includesQuestionOmission: detail.includes('2 more questions are open in GitHub Copilot.'),
			containsInternalIds: detail.includes('internal_question_') || detail.includes('internal_option_') || detail.includes('hidden_value_'),
		}, {
			withinLimit: true,
			includesOptionOmission: true,
			includesQuestionOmission: true,
			containsInternalIds: false,
		});
	});

	test('distinguishes plan, elicitation, and tool approval using visible text', () => {
		const controller = createController(new TestVoiceClientService());
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; detail?: string };
		const plan = new ChatPlanReviewData('Review the Mars implementation plan', '# Hidden plan body', [
			{ id: 'internal_implement', label: 'Implement Plan', description: 'Start making the changes' },
			{ id: 'internal_autopilot', label: 'Continue in Autopilot', description: 'Proceed automatically' },
		], true, undefined, 'internal_plan_resolve_id');
		const elicitation = new ChatElicitationRequestPart(
			new MarkdownString('Choose a deployment target'),
			'Select where GitHub Copilot should deploy the preview.',
			'Your choice is required before continuing.',
			'Continue',
			'Cancel',
			async () => ElicitationState.Accepted,
		);
		const confirmation: IChatConfirmation = {
			kind: 'confirmation',
			title: 'Install recommended extensions?',
			message: new MarkdownString('This installs the extensions shown in the open approval.'),
			buttons: ['Install', 'Cancel'],
			data: { hiddenInternalId: 'extension_install' },
		};

		assert.deepStrictEqual([
			getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/plan'), plan)),
			getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/elicitation'), elicitation)),
			getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/confirmation'), confirmation)),
		], [
			{
				state: 'waiting_for_confirmation',
				confirmation_type: 'plan',
				detail: [
					'plan approval: Review the Mars implementation plan',
					'choices: Implement Plan - Start making the changes; Continue in Autopilot - Proceed automatically',
					'The plan is open in GitHub Copilot.',
				].join('\n'),
			},
			{
				state: 'waiting_for_confirmation',
				confirmation_type: 'elicitation',
				detail: [
					'input request: Choose a deployment target',
					'Your choice is required before continuing.',
					'Select where GitHub Copilot should deploy the preview.',
					'choices: Continue; Cancel',
				].join('\n'),
			},
			{
				state: 'waiting_for_confirmation',
				confirmation_type: 'generic',
				detail: [
					'confirmation: Install recommended extensions?',
					'This installs the extensions shown in the open approval.',
					'choices: Install; Cancel',
				].join('\n'),
			},
		]);
	});

	test('uses visible tool confirmation messages instead of hidden parameters', () => {
		const controller = createController(new TestVoiceClientService());
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; detail?: string };
		const toolState = observableValue<IChatToolInvocation.State>('toolState', {
			type: IChatToolInvocation.StateKind.WaitingForConfirmation,
			parameters: {
				command: 'hidden-internal-command',
				explanation: 'hidden-internal-explanation',
			},
			confirmationMessages: {
				title: new MarkdownString('Run the workspace build?'),
				message: 'This runs the build task shown in the approval.',
			},
			confirm: () => { },
		});
		const toolInvocation = new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly state = toolState;
			override readonly invocationMessage = 'Run the workspace build';
		}();
		const stateInfo = getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/tool'), toolInvocation));

		assert.deepStrictEqual({
			stateInfo,
			containsHiddenParameters: stateInfo.detail?.includes('hidden-internal'),
		}, {
			stateInfo: {
				state: 'waiting_for_confirmation',
				confirmation_type: 'tool',
				detail: [
					'tool approval: Run the workspace build?',
					'This runs the build task shown in the approval.',
				].join('\n'),
			},
			containsHiddenParameters: false,
		});
	});

	test('narrates authentication using the visible server name without hidden server metadata', () => {
		const controller = createController(new TestVoiceClientService());
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; detail?: string };
		const authenticationState = observableValue<IChatToolInvocation.State>('authenticationState', {
			type: IChatToolInvocation.StateKind.WaitingForAuthentication,
			parameters: { hiddenParameter: 'secret-internal-value' },
			confirmationMessages: undefined,
			confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			server: {
				id: 'hidden-server-id',
				name: 'Mars Data MCP',
				resource: 'hidden-server-resource',
			},
			cancel: () => { },
		});
		const toolInvocation = new class extends mock<IChatToolInvocation>() {
			override readonly kind = 'toolInvocation' as const;
			override readonly state = authenticationState;
			override readonly invocationMessage = 'Authenticate the Mars data server';
		}();
		const stateInfo = getAgentStateInfo.call(controller, pendingResponsePartModel(URI.parse('chat-session:/authentication'), toolInvocation, 'Authenticate Mars Data MCP to continue...'));

		assert.deepStrictEqual({
			stateInfo,
			containsHiddenMetadata: ['hidden-server-id', 'hidden-server-resource', 'secret-internal-value']
				.some(value => stateInfo.detail?.includes(value)),
		}, {
			stateInfo: {
				state: 'waiting_for_confirmation',
				confirmation_type: 'generic',
				detail: [
					'authentication request: MCP authentication required',
					'The MCP server Mars Data MCP requires authentication to continue this tool call.',
					'choices: Authenticate; Cancel',
				].join('\n'),
			},
			containsHiddenMetadata: false,
		});
	});

	test('does not watch progress when agent progress is not enabled', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(
			voiceClientService,
			undefined,
			undefined,
			undefined,
			undefined,
			new TestConfigurationService({ 'agents.voice.handsFree': false }),
		);
		const sessionResource = URI.parse('chat-session:/disabled-progress');
		const { changeEmitter, parts, response } = createVoiceProgressResponse('response-disabled');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, response);
		parts.push({ kind: 'voiceProgress', id: 'investigating', value: 'Investigating the relevant code.' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(10_000);

		assert.deepStrictEqual(voiceClientService.requests, []);
	});

	test('marks voice requests only when agent progress is enabled', async () => {
		const disabledChatService = new TestChatService();
		const disabledController = createController(
			new TestVoiceClientService(),
			undefined,
			undefined,
			undefined,
			undefined,
			new TestConfigurationService({ 'agents.voice.handsFree': false }),
			disabledChatService,
		);
		const enabledChatService = new TestChatService();
		const enabledController = createController(
			new TestVoiceClientService(),
			undefined,
			undefined,
			undefined,
			undefined,
			new TestConfigurationService({ 'agents.voice.handsFree': false, [VOICE_AGENT_PROGRESS_SETTING]: true }),
			enabledChatService,
		);
		const sendVoiceRequest = Reflect.get(disabledController, '_sendVoiceRequest') as (resource: URI, text: string) => Promise<ChatSendResult | undefined>;

		await sendVoiceRequest.call(disabledController, URI.parse('chat-session:/disabled'), 'Check the code.');
		await sendVoiceRequest.call(enabledController, URI.parse('chat-session:/enabled'), 'Check the code.');

		assert.deepStrictEqual({
			disabled: disabledChatService.sendRequestOptions[0]?.isVoiceModeInput,
			enabled: enabledChatService.sendRequestOptions[0]?.isVoiceModeInput,
		}, {
			disabled: false,
			enabled: true,
		});
	});

	test('delays, coalesces, and preserves throttled voice progress for the shown request', () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionResource = URI.parse('chat-session:/voice-progress');
		const { changeEmitter, parts, response } = createVoiceProgressResponse('response-1');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;
		const sessionKey = (Reflect.get(controller, '_sessionKey') as (sessionId: string) => string).call(controller, sessionResource.toString());
		const lastSpokenAt = Reflect.get(controller, '_lastSpokenAtBySession') as Map<string, number>;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, response);
		ttsPlaybackService.playAudioChunk('ack');
		Reflect.set(controller, '_currentPlaybackSessionId', sessionResource.toString());
		Reflect.set(controller, '_currentPlaybackResponseId', 'ack-response');
		parts.push({ kind: 'voiceProgress', id: 'investigating', value: 'Investigating the relevant code.' });
		parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the code.' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(4_000);
		parts.push({ kind: 'voiceProgress', id: 'validating', value: 'Validating the changes.' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(1_000);
		assert.strictEqual(voiceClientService.requests.length, 0);
		lastSpokenAt.set(sessionKey, Date.now());
		ttsPlaybackService.stopPlayback();
		clock.tick(4_999);
		assert.strictEqual(voiceClientService.requests.length, 0);
		clock.tick(1);

		parts.push({ kind: 'voiceProgress', id: 'recovering', value: 'Trying a different approach.' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(9_999);
		assert.strictEqual(voiceClientService.requests.length, 1);
		clock.tick(1);

		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			kind: request.kind,
			text: request.text,
			checkpoint: request.checkpoint,
		})), [
			{
				kind: 'checkpoint',
				text: 'Validating the changes.',
				checkpoint: { requestId: 'request-response-1', checkpointId: 'validating', sequence: 1 },
			},
			{
				kind: 'checkpoint',
				text: 'Trying a different approach.',
				checkpoint: { requestId: 'request-response-1', checkpointId: 'recovering', sequence: 2 },
			},
		]);
	});

	test('sends the first semantic checkpoint after five seconds without prior speech', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionResource = URI.parse('chat-session:/initial-progress-delay');
		const { changeEmitter, parts, response } = createVoiceProgressResponse('response-initial-delay');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, response);
		parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the code.' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(4_999);
		assert.strictEqual(voiceClientService.requests.length, 0);
		clock.tick(1);

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.checkpoint), [{
			requestId: 'request-response-initial-delay',
			checkpointId: 'editing',
			sequence: 1,
		}]);
	});

	test('schedules all five semantic stages once at the existing cadence', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionResource = URI.parse('chat-session:/five-progress-stages');
		const { changeEmitter, parts, response } = createVoiceProgressResponse('response-five-stages');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;
		const stages = ['investigating', 'planning', 'editing', 'validating', 'recovering'] as const;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, response);
		for (const [index, stage] of stages.entries()) {
			parts.push({ kind: 'voiceProgress', id: stage, value: `${stage} update` });
			changeEmitter.fire({ reason: 'other' });
			clock.tick(index === 0 ? 5_000 : 10_000);
		}
		parts.push({ kind: 'voiceProgress', id: 'recovering', value: 'duplicate recovery' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(10_000);

		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			text: request.text,
			checkpoint: request.checkpoint,
		})), stages.map((stage, index) => ({
			text: `${stage} update`,
			checkpoint: {
				requestId: 'request-response-five-stages',
				checkpointId: stage,
				sequence: index + 1,
			},
		})));
	});

	test('final response cancels pending voice progress', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionResource = URI.parse('chat-session:/final-cancels-progress');
		const { changeEmitter, parts, response } = createVoiceProgressResponse('response-final');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string) => void;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, response);
		parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the code.' });
		changeEmitter.fire({ reason: 'other' });
		handleStateChange.call(controller, sessionResource.toString(), 'idle', undefined, 'Finished successfully.', sessionResource.toString());
		clock.tick(5_000);

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.kind), ['response']);
	});

	test('confirmation cancels pending voice progress', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionResource = URI.parse('chat-session:/confirmation-cancels-progress');
		const { changeEmitter, parts, response } = createVoiceProgressResponse('response-confirmation');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string) => void;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, response);
		parts.push({ kind: 'voiceProgress', id: 'validating', value: 'Validating the changes.' });
		changeEmitter.fire({ reason: 'other' });
		handleStateChange.call(controller, sessionResource.toString(), 'waiting_for_confirmation', 'Approve the command.', undefined, sessionResource.toString());
		clock.tick(5_000);

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.kind), ['confirmation']);
	});

	test('request cancellation and disconnect cancel pending voice progress', () => {
		const firstVoiceClient = new TestVoiceClientService();
		const firstController = createController(firstVoiceClient);
		const firstSession = URI.parse('chat-session:/cancelled-progress');
		const firstResponse = createVoiceProgressResponse('response-cancelled');
		const firstConnected = Reflect.get(firstController, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const firstWatch = Reflect.get(firstController, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;

		firstConnected.set(true, undefined);
		firstController.setActiveSessionShown(firstSession);
		firstWatch.call(firstController, firstSession, firstResponse.response);
		firstResponse.parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the code.' });
		firstResponse.changeEmitter.fire({ reason: 'other' });
		firstController.markUserCancelled(firstSession.toString());

		const secondVoiceClient = new TestVoiceClientService();
		const secondController = createController(secondVoiceClient);
		const secondSession = URI.parse('chat-session:/disconnected-progress');
		const secondResponse = createVoiceProgressResponse('response-disconnected');
		const secondConnected = Reflect.get(secondController, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const secondWatch = Reflect.get(secondController, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;

		secondConnected.set(true, undefined);
		secondController.setActiveSessionShown(secondSession);
		secondWatch.call(secondController, secondSession, secondResponse.response);
		secondResponse.parts.push({ kind: 'voiceProgress', id: 'recovering', value: 'Trying another approach.' });
		secondResponse.changeEmitter.fire({ reason: 'other' });
		secondController.disconnect('explicit');
		clock.tick(5_000);

		assert.deepStrictEqual({
			cancelledRequests: firstVoiceClient.requests,
			disconnectedRequests: secondVoiceClient.requests,
		}, {
			cancelledRequests: [],
			disconnectedRequests: [],
		});
	});

	test('transient disconnect retains the latest pending checkpoint until reconnect', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionResource = URI.parse('chat-session:/reconnect-progress');
		const { changeEmitter, parts, response } = createVoiceProgressResponse('response-reconnect');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, response);
		parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the code.' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(4_000);
		isConnected.set(false, undefined);
		clock.tick(1_000);
		assert.strictEqual(voiceClientService.requests.length, 0);
		isConnected.set(true, undefined);

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.checkpoint), [{
			requestId: 'request-response-reconnect',
			checkpointId: 'editing',
			sequence: 1,
		}]);
	});

	test('a new voice request cancels only the shown session checkpoint', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const shownSession = URI.parse('chat-session:/shown-progress');
		const backgroundSession = URI.parse('chat-session:/background-progress');
		const shownResponse = createVoiceProgressResponse('response-shown');
		const backgroundResponse = createVoiceProgressResponse('response-background');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(shownSession);
		watchVoiceProgress.call(controller, shownSession, shownResponse.response);
		watchVoiceProgress.call(controller, backgroundSession, backgroundResponse.response);
		shownResponse.parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating shown code.' });
		backgroundResponse.parts.push({ kind: 'voiceProgress', id: 'validating', value: 'Validating background code.' });
		shownResponse.changeEmitter.fire({ reason: 'other' });
		backgroundResponse.changeEmitter.fire({ reason: 'other' });
		controller.pttDown('explicit');
		controller.setActiveSessionShown(backgroundSession);
		clock.tick(5_000);

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.checkpoint?.requestId), ['request-response-background']);
	});

	test('barge-in and a new explicit voice request cancel pending voice progress', () => {
		const bargeVoiceClient = new TestVoiceClientService();
		const bargeController = createController(bargeVoiceClient);
		const bargeSession = URI.parse('chat-session:/barge-progress');
		const bargeResponse = createVoiceProgressResponse('response-barge');
		const bargeConnected = Reflect.get(bargeController, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const bargeWatch = Reflect.get(bargeController, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;
		const handleBargeIn = Reflect.get(bargeController, '_handleBargeIn') as (event: IVoiceBargeIn) => void;

		bargeConnected.set(true, undefined);
		bargeController.setActiveSessionShown(bargeSession);
		bargeWatch.call(bargeController, bargeSession, bargeResponse.response);
		bargeResponse.parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the code.' });
		bargeResponse.changeEmitter.fire({ reason: 'other' });
		handleBargeIn.call(bargeController, { turnId: 'new-turn', interruptedTurnId: 'old-turn' });

		const pttVoiceClient = new TestVoiceClientService();
		const pttController = createController(pttVoiceClient);
		const pttSession = URI.parse('chat-session:/ptt-progress');
		const pttResponse = createVoiceProgressResponse('response-ptt');
		const pttConnected = Reflect.get(pttController, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const pttWatch = Reflect.get(pttController, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;

		pttConnected.set(true, undefined);
		pttController.setActiveSessionShown(pttSession);
		pttWatch.call(pttController, pttSession, pttResponse.response);
		pttResponse.parts.push({ kind: 'voiceProgress', id: 'validating', value: 'Validating the changes.' });
		pttResponse.changeEmitter.fire({ reason: 'other' });
		pttController.pttDown('explicit');
		clock.tick(5_000);

		assert.deepStrictEqual({
			bargeRequests: bargeVoiceClient.requests,
			pttRequests: pttVoiceClient.requests,
		}, {
			bargeRequests: [],
			pttRequests: [],
		});
	});

	test('busy, invalid, and legacy suppressed checkpoints are never retried', () => {
		const dispositions = ['busy', 'invalid', 'suppressed'] as const;
		const results: boolean[] = [];
		for (const disposition of dispositions) {
			const voiceClientService = new TestVoiceClientService();
			const controller = createController(voiceClientService);
			const sessionId = `chat-session:/${disposition}`;
			const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
			const handleAck = Reflect.get(controller, '_handleNarrationAck') as (event: IVoiceNarrationAck) => void;
			const retryDeferred = Reflect.get(controller, '_retryDeferredNarration') as (sessionKey: string, narrationId?: string) => boolean;
			const sessionKey = (Reflect.get(controller, '_sessionKey') as (sessionId: string) => string).call(controller, sessionId);

			narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
				requestId: `request-${disposition}`,
				checkpointId: 'editing',
				sequence: 1,
			});
			const request = voiceClientService.requests[0];
			handleAck.call(controller, {
				narrationId: request.narrationId,
				codingSessionId: sessionId,
				disposition,
			});
			results.push(retryDeferred.call(controller, sessionKey, request.narrationId));
		}

		assert.deepStrictEqual(results, [false, false, false]);
	});

	test('active checkpoint playback is preempted when final response audio starts', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-final';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const checkpointId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: checkpointId,
		});
		narrate.call(controller, sessionId, 'response', 'Everything is complete.');
		assert.strictEqual(ttsPlaybackService.stopCount, 0);
		const finalId = voiceClientService.requests[1].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'final',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: finalId,
		});
		voiceClientService.fireAudioResponse({
			audio: 'stale-checkpoint',
			isFirstChunk: false,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: checkpointId,
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
			playbackCompletions: voiceClientService.playbackCompletions,
		}, {
			stopCount: 1,
			playedAudio: ['checkpoint', 'final'],
			playbackCompletions: [],
		});
	});

	test('empty final response does not preempt active checkpoint playback', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-empty-response';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const checkpointId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: checkpointId,
		});
		narrate.call(controller, sessionId, 'response', 'Progress-only final summary.');
		const responseId = voiceClientService.requests[1].narrationId;
		voiceClientService.fireAudioResponse({
			audio: '',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId,
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
			isPlaying: ttsPlaybackService.isPlaying,
		}, {
			stopCount: 0,
			playedAudio: ['checkpoint'],
			isPlaying: true,
		});
	});

	test('completed checkpoint playback acknowledges the correlated playback id', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-complete';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const narrationId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: narrationId,
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
			narrationKind: 'checkpoint',
			playbackId: 'playback-1',
		});
		ttsPlaybackService.stopPlayback();

		assert.deepStrictEqual(voiceClientService.playbackCompletions, [{
			sessionId,
			narrationId,
			playbackId: 'playback-1',
		}]);
	});

	test('dropped re-narration does not preempt active checkpoint playback', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-reread';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		const lastHeard = Reflect.get(controller, '_lastHeardTranscriptById') as Map<string, string>;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const checkpointId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: checkpointId,
		});
		lastHeard.set(sessionId, 'already heard');
		voiceClientService.fireAudioResponse({
			audio: 'duplicate',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: 'duplicate-response',
			transcript: 'Already heard.',
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			stopCount: 0,
			playedAudio: ['checkpoint'],
		});
	});

	test('active checkpoint playback is preempted by confirmation', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-confirmation';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Validating the changes.', undefined, {
			requestId: 'request-1',
			checkpointId: 'validating',
			sequence: 1,
		});
		const checkpointId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: checkpointId,
		});
		narrate.call(controller, sessionId, 'confirmation', 'Approve the command.');
		const confirmationId = voiceClientService.requests[1].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'confirmation',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: confirmationId,
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			stopCount: 1,
			playedAudio: ['checkpoint', 'confirmation'],
		});
	});

	test('direct substantive audio preempts active checkpoint playback', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-direct-reply';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const checkpointId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: checkpointId,
		});
		voiceClientService.fireAudioResponse({
			audio: 'direct-reply',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: 'direct-response',
			transcript: 'Here is the substantive result.',
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			stopCount: 1,
			playedAudio: ['checkpoint', 'direct-reply'],
		});
	});

	test('cross-session substantive audio stays deferred while another session owns voice', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const checkpointSessionId = 'chat-session:/checkpoint-background';
		const responseSessionId = 'chat-session:/response-foreground';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(checkpointSessionId));

		narrate.call(controller, checkpointSessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const checkpointId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: checkpointSessionId,
			responseId: checkpointId,
		});
		controller.setActiveSessionShown(URI.parse(responseSessionId));
		voiceClientService.fireAudioResponse({
			audio: 'substantive-response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: responseSessionId,
			responseId: 'direct-response',
			transcript: 'The foreground task is complete.',
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			stopCount: 1,
			playedAudio: ['checkpoint'],
		});
	});

	test('newer checkpoint preempts active older checkpoint and discards stale chunks', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-replacement';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const firstId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'editing',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: firstId,
		});
		narrate.call(controller, sessionId, 'checkpoint', 'Validating the result.', undefined, {
			requestId: 'request-1',
			checkpointId: 'validating',
			sequence: 2,
		});
		const secondId = voiceClientService.requests[1].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'stale-editing',
			isFirstChunk: false,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: firstId,
		});
		voiceClientService.fireAudioResponse({
			audio: 'validating',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: secondId,
		});

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['editing', 'validating']);
	});

	test('cross-session checkpoint stays deferred while another session owns voice', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const firstSessionId = 'chat-session:/checkpoint-first-session';
		const secondSessionId = 'chat-session:/checkpoint-second-session';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(firstSessionId));

		narrate.call(controller, firstSessionId, 'checkpoint', 'Updating the first task.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const firstId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'first-checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: firstSessionId,
			responseId: firstId,
		});
		narrate.call(controller, secondSessionId, 'checkpoint', 'Validating the second task.', undefined, {
			requestId: 'request-2',
			checkpointId: 'validating',
			sequence: 1,
		});
		const secondId = voiceClientService.requests[1].narrationId;
		controller.setActiveSessionShown(URI.parse(secondSessionId));
		voiceClientService.fireAudioResponse({
			audio: 'second-checkpoint',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: secondSessionId,
			responseId: secondId,
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			stopCount: 1,
			playedAudio: ['first-checkpoint'],
		});
	});

	test('pre-decode checkpoint preemption does not poison replacement completion', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new DeferredFirstTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-predecode';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const firstId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'decoding-checkpoint',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: firstId,
			narrationKind: 'checkpoint',
			playbackId: 'playback-1',
		});
		narrate.call(controller, sessionId, 'checkpoint', 'Validating the result.', undefined, {
			requestId: 'request-1',
			checkpointId: 'validating',
			sequence: 2,
		});
		const secondId = voiceClientService.requests[1].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'replacement-checkpoint',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: secondId,
			narrationKind: 'checkpoint',
			playbackId: 'playback-2',
		});
		ttsPlaybackService.stopPlayback();

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playbackCompletions: voiceClientService.playbackCompletions,
		}, {
			stopCount: 2,
			playbackCompletions: [{ sessionId, narrationId: secondId, playbackId: 'playback-2' }],
		});
	});

	test('scheduled newer checkpoint replaces active checkpoint at the cadence boundary', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionResource = URI.parse('chat-session:/scheduled-checkpoint-replacement');
		const { changeEmitter, parts, response } = createVoiceProgressResponse('response-scheduled-replacement');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;

		await controller.connect(mainWindow);
		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, response);
		parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the code.' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(5_000);
		const firstId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'editing',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionResource.toString(),
			responseId: firstId,
		});

		parts.push({ kind: 'voiceProgress', id: 'validating', value: 'Validating the result.' });
		changeEmitter.fire({ reason: 'other' });
		clock.tick(10_000);
		const secondId = voiceClientService.requests[1].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'stale-editing',
			isFirstChunk: false,
			isFinal: true,
			codingSessionId: sessionResource.toString(),
			responseId: firstId,
		});
		voiceClientService.fireAudioResponse({
			audio: 'validating',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionResource.toString(),
			responseId: secondId,
		});

		assert.deepStrictEqual({
			checkpoints: voiceClientService.requests.map(request => request.checkpoint),
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			checkpoints: [
				{ requestId: 'request-response-scheduled-replacement', checkpointId: 'editing', sequence: 1 },
				{ requestId: 'request-response-scheduled-replacement', checkpointId: 'validating', sequence: 2 },
			],
			stopCount: 1,
			playedAudio: ['editing', 'validating'],
		});
	});

	test('request cancellation preempts active checkpoint playback and discards trailing chunks', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/active-checkpoint-cancellation';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;

		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));
		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const narrationId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: narrationId,
		});
		controller.markUserCancelled(sessionId);
		voiceClientService.fireAudioResponse({
			audio: 'stale-checkpoint',
			isFirstChunk: false,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: narrationId,
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			stopCount: 1,
			playedAudio: ['checkpoint'],
		});
	});

	test('explicit PTT retires checkpoint tracking before clearing playback correlation', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionId = 'chat-session:/checkpoint-ptt-tracking';
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		isConnected.set(true, undefined);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const firstId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: firstId,
		});
		controller.pttDown('explicit');
		const sentNextCheckpoint = narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-2',
			checkpointId: 'editing',
			sequence: 1,
		});

		assert.deepStrictEqual({
			sentNextCheckpoint,
			requestIds: voiceClientService.requests.map(request => request.checkpoint?.requestId),
		}, {
			sentNextCheckpoint: true,
			requestIds: ['request-1', 'request-2'],
		});
	});

	test('barge-in stops active checkpoint playback and discards trailing chunks', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-barge';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		const handleBargeIn = Reflect.get(controller, '_handleBargeIn') as (event: IVoiceBargeIn) => void;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const checkpointId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: checkpointId,
			turnId: 'checkpoint-turn',
		});
		handleBargeIn.call(controller, { turnId: 'user-turn', interruptedTurnId: checkpointId });
		voiceClientService.fireAudioResponse({
			audio: 'stale-checkpoint',
			isFirstChunk: false,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: checkpointId,
			turnId: 'checkpoint-turn',
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			stopCount: 1,
			playedAudio: ['checkpoint'],
		});
	});

	test('backend interruption stops only the matching active checkpoint', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-server-interruption';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const narrationId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: narrationId,
		});
		voiceClientService.fireNarrationInterrupted({
			narrationId,
			codingSessionId: sessionId,
			retryable: false,
			reason: 'superseded_by_response',
		});
		voiceClientService.fireAudioResponse({
			audio: 'stale-checkpoint',
			isFirstChunk: false,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: narrationId,
		});

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playedAudio: ttsPlaybackService.playedAudio,
			playbackCompletions: voiceClientService.playbackCompletions,
		}, {
			stopCount: 1,
			playedAudio: ['checkpoint'],
			playbackCompletions: [],
		});
	});

	test('late backend interruption does not stop a replacement checkpoint', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-late-server-interruption';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const firstId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'first-checkpoint',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: sessionId,
			responseId: firstId,
		});
		narrate.call(controller, sessionId, 'checkpoint', 'Validating the result.', undefined, {
			requestId: 'request-1',
			checkpointId: 'validating',
			sequence: 2,
		});
		const secondId = voiceClientService.requests[1].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'second-checkpoint',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: secondId,
			narrationKind: 'checkpoint',
			playbackId: 'playback-2',
		});
		voiceClientService.fireNarrationInterrupted({
			narrationId: firstId,
			codingSessionId: sessionId,
			retryable: false,
			reason: 'superseded_by_checkpoint',
		});
		ttsPlaybackService.stopPlayback();

		assert.deepStrictEqual({
			stopCount: ttsPlaybackService.stopCount,
			playbackCompletions: voiceClientService.playbackCompletions,
		}, {
			stopCount: 2,
			playbackCompletions: [{ sessionId, narrationId: secondId, playbackId: 'playback-2' }],
		});
	});

	test('checkpoint sequence restarts for the next chat request', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionResource = URI.parse('chat-session:/sequence-reset');
		const first = createVoiceProgressResponse('response-sequence-1', 'request-1');
		const second = createVoiceProgressResponse('response-sequence-2', 'request-2');
		const isConnected = Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void };
		const watchVoiceProgress = Reflect.get(controller, '_watchVoiceProgress') as (resource: URI, response: IChatResponseModel) => void;
		const handleAck = Reflect.get(controller, '_handleNarrationAck') as (event: IVoiceNarrationAck) => void;

		isConnected.set(true, undefined);
		controller.setActiveSessionShown(sessionResource);
		watchVoiceProgress.call(controller, sessionResource, first.response);
		first.parts.push({ kind: 'voiceProgress', id: 'editing', value: 'Updating the first request.' });
		first.changeEmitter.fire({ reason: 'other' });
		clock.tick(5_000);
		handleAck.call(controller, {
			narrationId: voiceClientService.requests[0].narrationId,
			codingSessionId: sessionResource.toString(),
			disposition: 'suppressed',
		});
		first.state.isComplete = true;
		first.changeEmitter.fire({ reason: 'other' });

		watchVoiceProgress.call(controller, sessionResource, second.response);
		second.parts.push({ kind: 'voiceProgress', id: 'validating', value: 'Validating the second request.' });
		second.changeEmitter.fire({ reason: 'other' });
		clock.tick(5_000);

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.checkpoint), [
			{ requestId: 'request-1', checkpointId: 'editing', sequence: 1 },
			{ requestId: 'request-2', checkpointId: 'validating', sequence: 1 },
		]);
	});

	test('first-and-final empty checkpoint clears without acknowledging playback', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionId = 'chat-session:/checkpoint-empty-final';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const narrationId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: '',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: narrationId,
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
			narrationKind: 'checkpoint',
			playbackId: 'playback-empty',
		});

		assert.deepStrictEqual({
			pending: [...(Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, unknown>).keys()],
			deferred: [...(Reflect.get(controller, '_deferredNarrations') as Map<string, unknown>).keys()],
			playbackCompletions: voiceClientService.playbackCompletions,
		}, {
			pending: [],
			deferred: [],
			playbackCompletions: [],
		});
	});

	test('empty checkpoint terminal without playback id clears without acknowledgement', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionId = 'chat-session:/checkpoint-empty-final-no-playback';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const narrationId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: '',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: narrationId,
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
			narrationKind: 'checkpoint',
		});

		assert.deepStrictEqual({
			pending: [...(Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, unknown>).keys()],
			playbackCompletions: voiceClientService.playbackCompletions,
		}, {
			pending: [],
			playbackCompletions: [],
		});
	});

	test('checkpoint audio prefix followed by empty failure final acknowledges after playback drains', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = 'chat-session:/checkpoint-partial-failure';
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string, reuseId?: string, checkpoint?: IVoiceCheckpointNarrationMetadata) => boolean;
		await controller.connect(mainWindow);
		controller.setActiveSessionShown(URI.parse(sessionId));

		narrate.call(controller, sessionId, 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 1,
		});
		const narrationId = voiceClientService.requests[0].narrationId;
		const correlation = {
			codingSessionId: sessionId,
			responseId: narrationId,
			requestId: 'request-1',
			checkpointId: 'editing' as const,
			sequence: 1,
			narrationKind: 'checkpoint' as const,
			playbackId: 'playback-partial',
		};
		voiceClientService.fireAudioResponse({
			...correlation,
			audio: 'checkpoint-prefix',
			isFirstChunk: true,
			isFinal: false,
		});
		voiceClientService.fireAudioResponse({
			...correlation,
			audio: '',
			isFirstChunk: false,
			isFinal: true,
		});

		assert.deepStrictEqual(voiceClientService.playbackCompletions, []);
		ttsPlaybackService.stopPlayback();
		assert.deepStrictEqual(voiceClientService.playbackCompletions, [{
			sessionId,
			narrationId,
			playbackId: 'playback-partial',
		}]);
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

	test('switching through a draft keeps voice in its original session until the user returns', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const voiceSession = URI.parse('agent-host-copilot:/voice-session');
		const otherSession = URI.parse('agent-host-copilot:/other-session');
		const shownSessionId = Reflect.get(controller, '_shownSessionId') as () => string | undefined;
		const shouldDeferForSession = Reflect.get(controller, '_shouldDeferForSession') as (sessionId: string) => boolean;
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		voiceClientService.fireSessionInit();

		controller.setActiveSessionShown(voiceSession);
		controller.setActiveSessionShown(null);

		assert.deepStrictEqual({
			targetSession: controller.targetSession.get()?.toString(),
			shownSession: shownSessionId.call(controller),
			defersVoiceSession: shouldDeferForSession.call(controller, voiceSession.toString()),
		}, {
			targetSession: voiceSession.toString(),
			shownSession: undefined,
			defersVoiceSession: true,
		});

		voiceClientService.fireAudioResponse({
			audio: 'saved voice-session response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: voiceSession.toString(),
			responseId: 'voice-response',
			transcript: 'Saved voice-session response.',
		});
		voiceClientService.fireAudioResponse({
			audio: 'other-session response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: otherSession.toString(),
			responseId: 'other-response',
			transcript: 'Other-session response.',
		});
		assert.deepStrictEqual(ttsPlaybackService.playedAudio, []);

		controller.setActiveSessionShown(otherSession);

		assert.deepStrictEqual({
			targetSession: controller.targetSession.get()?.toString(),
			shownSession: shownSessionId.call(controller),
			defersVoiceSession: shouldDeferForSession.call(controller, voiceSession.toString()),
		}, {
			targetSession: voiceSession.toString(),
			shownSession: otherSession.toString(),
			defersVoiceSession: true,
		});

		Reflect.set(controller, '_currentNarratable', (resource: URI) => resource.toString() === voiceSession.toString()
			? { kind: 'confirmation', text: 'Approve the saved command.' }
			: { kind: 'confirmation', text: 'Approve the other command.' });
		controller.setActiveSessionShown(voiceSession);

		assert.deepStrictEqual({
			targetSession: controller.targetSession.get()?.toString(),
			shownSession: shownSessionId.call(controller),
			defersVoiceSession: shouldDeferForSession.call(controller, voiceSession.toString()),
			playedAudio: ttsPlaybackService.playedAudio,
			narrations: voiceClientService.requests.map(request => ({ sessionId: request.sessionId, kind: request.kind, text: request.text })),
		}, {
			targetSession: voiceSession.toString(),
			shownSession: voiceSession.toString(),
			defersVoiceSession: false,
			playedAudio: ['saved voice-session response'],
			narrations: [{ sessionId: 'copilot:/voice-session', kind: 'confirmation', text: 'Approve the saved command.' }],
		});
	});

	test('switching away mid-response defers the remaining audio until the voice session returns', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const voiceSession = URI.parse('agent-host-copilot:/voice-session');
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		voiceClientService.fireSessionInit();
		controller.setActiveSessionShown(voiceSession);

		voiceClientService.fireAudioResponse({
			audio: 'response beginning',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: voiceSession.toString(),
			responseId: 'streaming-response',
			transcript: 'Response beginning.',
		});
		controller.setActiveSessionShown(null);
		voiceClientService.fireAudioResponse({
			audio: 'response ending',
			isFirstChunk: false,
			isFinal: true,
			codingSessionId: voiceSession.toString(),
			responseId: 'streaming-response',
			transcript: 'Response beginning response ending.',
		});

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['response beginning']);
		controller.setActiveSessionShown(voiceSession);
		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['response beginning', 'response ending']);
	});

	test('draft voice ownership survives navigation and promotes only when that draft is created', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const otherSession = URI.parse('agent-host-copilot:/other-session');
		const createdDraft = URI.parse('agent-host-copilot:/created-draft');
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;

		controller.setActiveSessionShown(null);
		controller.setActiveSessionShown(otherSession);
		assert.deepStrictEqual({
			hasDraftTarget: controller.hasDraftTarget.get(),
			targetSession: controller.targetSession.get(),
		}, {
			hasDraftTarget: true,
			targetSession: undefined,
		});

		controller.setActiveSessionShown(null);
		controller.promoteDraftTarget(createdDraft);
		controller.setActiveSessionShown(createdDraft);
		assert.deepStrictEqual({
			hasDraftTarget: controller.hasDraftTarget.get(),
			targetSession: controller.targetSession.get()?.toString(),
		}, {
			hasDraftTarget: false,
			targetSession: createdDraft.toString(),
		});
	});

	test('omni surface ownership clears its draft and routed target when released', () => {
		const controller = createController(new TestVoiceClientService());
		const routedSession = URI.parse('agent-host-copilot:/omni-target');

		controller.setOmniInputActive(true);
		controller.setDraftTarget();
		assert.deepStrictEqual({
			omniInputActive: controller.omniInputActive.get(),
			hasDraftTarget: controller.hasDraftTarget.get(),
			targetSession: controller.targetSession.get(),
		}, {
			omniInputActive: true,
			hasDraftTarget: true,
			targetSession: undefined,
		});

		controller.setTargetSession(routedSession, 'existing_session');
		controller.setOmniInputActive(false);
		assert.deepStrictEqual({
			omniInputActive: controller.omniInputActive.get(),
			hasDraftTarget: controller.hasDraftTarget.get(),
			targetSession: controller.targetSession.get(),
		}, {
			omniInputActive: false,
			hasDraftTarget: false,
			targetSession: undefined,
		});
	});

	test('session input atomically takes capture ownership from omni', () => {
		const controller = createController(new TestVoiceClientService());
		const session = URI.parse('agent-host-copilot:/session-owner');

		controller.setOmniInputActive(true);
		controller.setDraftTarget();
		controller.takeSessionInputOwnership(session, mainWindow);

		assert.deepStrictEqual({
			omniInputActive: controller.omniInputActive.get(),
			hasDraftTarget: controller.hasDraftTarget.get(),
			targetSession: controller.targetSession.get()?.toString(),
		}, {
			omniInputActive: false,
			hasDraftTarget: false,
			targetSession: session.toString(),
		});

		controller.setOmniInputActive(true);
		controller.takeDraftInputOwnership(mainWindow);
		assert.deepStrictEqual({
			omniInputActive: controller.omniInputActive.get(),
			hasDraftTarget: controller.hasDraftTarget.get(),
			targetSession: controller.targetSession.get(),
		}, {
			omniInputActive: false,
			hasDraftTarget: true,
			targetSession: undefined,
		});

		controller.takeOmniInputOwnership(mainWindow);
		assert.deepStrictEqual({
			omniInputActive: controller.omniInputActive.get(),
			hasDraftTarget: controller.hasDraftTarget.get(),
			targetSession: controller.targetSession.get(),
		}, {
			omniInputActive: true,
			hasDraftTarget: true,
			targetSession: undefined,
		});
	});

	test('barge-in preserves the Omni route instead of retargeting to panel chat', () => {
		const controller = createController(new TestVoiceClientService());
		const omniSession = URI.parse('agent-host-copilot:/omni-route');

		controller.takeOmniInputOwnership(mainWindow);
		controller.setTargetSession(omniSession, 'existing_session');
		const retained = controller.retainOmniInputOwnershipForBargeIn(mainWindow);

		assert.deepStrictEqual({
			retained,
			omniInputActive: controller.omniInputActive.get(),
			hasDraftTarget: controller.hasDraftTarget.get(),
			targetSession: controller.targetSession.get()?.toString(),
		}, {
			retained: true,
			omniInputActive: true,
			hasDraftTarget: false,
			targetSession: omniSession.toString(),
		});

		Reflect.set(controller, '_window', undefined);
		assert.strictEqual(controller.retainOmniInputOwnershipForBargeIn(mainWindow), false);

		controller.setOmniInputActive(false);
		assert.strictEqual(controller.retainOmniInputOwnershipForBargeIn(mainWindow), false);
	});

	test('omni open state is observable independently of capture ownership', () => {
		const controller = createController(new TestVoiceClientService());
		const states: boolean[] = [];
		const listener = autorun(reader => states.push(controller.omniInputOpen.read(reader)));

		controller.setOmniInputOpen(true);
		controller.setOmniInputOpen(false);
		listener.dispose();

		assert.deepStrictEqual(states, [false, true, false]);
	});

	test('omni blur preserves an in-progress turn until voice returns to idle', async () => {
		const controller = createController(new TestVoiceClientService());
		const voiceState = Reflect.get(controller, '_voiceState') as { set(value: string, tx: undefined): void };

		controller.setOmniInputActive(true);
		controller.setDraftTarget();
		voiceState.set('processing', undefined);
		controller.releaseOmniInputOnBlur();

		assert.strictEqual(controller.omniInputActive.get(), true);
		assert.strictEqual(controller.hasDraftTarget.get(), true);

		voiceState.set('idle', undefined);
		await Promise.resolve();

		assert.strictEqual(controller.omniInputActive.get(), false);
		assert.strictEqual(controller.hasDraftTarget.get(), false);
		assert.strictEqual(controller.targetSession.get(), undefined);
	});

	test('omni focus reacquisition cancels a deferred blur release', async () => {
		const controller = createController(new TestVoiceClientService());
		const voiceState = Reflect.get(controller, '_voiceState') as { set(value: string, tx: undefined): void };

		controller.setOmniInputActive(true);
		controller.setDraftTarget();
		voiceState.set('processing', undefined);
		controller.releaseOmniInputOnBlur();
		controller.setOmniInputActive(true);
		voiceState.set('idle', undefined);
		await Promise.resolve();

		assert.strictEqual(controller.omniInputActive.get(), true);
		assert.strictEqual(controller.hasDraftTarget.get(), true);
	});

	test('untagged solicited narration dropped after retargeting retries when its session returns', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const firstSession = URI.parse('agent-host-copilot:/first-session');
		const secondSession = URI.parse('agent-host-copilot:/second-session');
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: 'response', text: string) => boolean;
		Reflect.set(controller, '_currentNarratable', (resource: URI) => resource.toString() === firstSession.toString()
			? { kind: 'response', text: 'The first task is complete.' }
			: undefined);
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		voiceClientService.fireSessionInit();
		controller.setActiveSessionShown(firstSession);
		assert.strictEqual(narrate.call(controller, firstSession.toString(), 'response', 'The first task is complete.'), true);
		const firstNarrationId = voiceClientService.requests[0].narrationId;

		controller.setTargetSession(secondSession);
		controller.setActiveSessionShown(secondSession);
		voiceClientService.fireAudioResponse({
			audio: 'stale first-session narration',
			isFirstChunk: true,
			isFinal: false,
			responseId: firstNarrationId,
			transcript: 'The first task',
		});
		voiceClientService.fireAudioResponse({
			audio: 'stale first-session continuation',
			isFirstChunk: false,
			isFinal: true,
			responseId: firstNarrationId,
			transcript: 'The first task is complete.',
		});
		assert.deepStrictEqual(ttsPlaybackService.playedAudio, []);

		controller.setTargetSession(firstSession);
		controller.setActiveSessionShown(firstSession);
		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			sessionId: request.sessionId,
			kind: request.kind,
			text: request.text,
		})), [
			{ sessionId: 'copilot:/first-session', kind: 'response', text: 'The first task is complete.' },
			{ sessionId: 'copilot:/first-session', kind: 'response', text: 'The first task is complete.' },
		]);
	});

	test('switching away interrupts active owner playback and defers queued audio', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const voiceSession = URI.parse('agent-host-copilot:/voice-session');
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		voiceClientService.fireSessionInit();
		controller.setActiveSessionShown(voiceSession);

		voiceClientService.fireAudioResponse({
			audio: 'currently playing',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: voiceSession.toString(),
			responseId: 'current-response',
			transcript: 'Currently playing.',
		});
		voiceClientService.fireAudioResponse({
			audio: 'first queued response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: voiceSession.toString(),
			responseId: 'first-queued-response',
			transcript: 'First queued response.',
		});
		voiceClientService.fireAudioResponse({
			audio: 'second queued response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: voiceSession.toString(),
			responseId: 'second-queued-response',
			transcript: 'Second queued response.',
		});
		controller.setActiveSessionShown(null);

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			stopCount: ttsPlaybackService.stopCount,
		}, {
			playedAudio: ['currently playing'],
			stopCount: 1,
		});

		controller.setActiveSessionShown(voiceSession);
		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['currently playing', 'first queued response']);
		ttsPlaybackService.stopPlayback();
		(Reflect.get(controller, '_processQueue') as () => void).call(controller);
		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['currently playing', 'first queued response', 'second queued response']);
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
		assert.ok(info.detail?.includes('Which region?'));
		assert.ok(!info.detail?.includes('Which tier?'));
		assert.deepStrictEqual(buildPendingPayload.call(controller, model)?.questions?.map(question => question.title), ['Which region?']);
	});

	test('a late retired approval does not mask the final response', () => {
		const controller = createController(new TestVoiceClientService());
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => { state: string; last_response_summary?: string };
		const requestId = 'request-late-retired-tool';
		const original = waitingTerminalTool('tool-call-late-retired', 'echo high');
		const pendingId = derivePendingId(requestId, original);

		assert.strictEqual(markPendingIdResolved(pendingId), true);
		original.state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);

		// The authoritative response is complete, but a provider/model refresh has
		// rehydrated the already-handled confirmation as a different object.
		const lateCopy = waitingTerminalTool('tool-call-late-retired', 'echo high');
		const response = {
			isPendingConfirmation: observableValue<{ detail?: string } | undefined>('pending', { detail: 'Needs approval' }),
			isIncomplete: observableValue('incomplete', false),
			response: { value: [lateCopy], getMarkdown: () => 'Done — output was high.' },
		};
		const lastRequest = { id: requestId, response };
		const model = { getRequests: () => [lastRequest] } as unknown as IChatModel;

		const info = getAgentStateInfo.call(controller, model);
		const latePendingId = derivePendingId(requestId, lateCopy);

		assert.deepStrictEqual(info, {
			state: 'idle',
			last_response_summary: 'Done — output was high.',
		});
		assert.strictEqual(latePendingId, pendingId);
		assert.strictEqual(isPendingIdResolved(latePendingId), true);

		lateCopy.state.set({
			type: IChatToolInvocation.StateKind.Cancelled,
			reason: ToolConfirmKind.Skipped,
			parameters: {},
		}, undefined);
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

	test('marks an omni-routed target for backend narration', () => {
		const resource = URI.parse('vscode-chat://a');
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(
			voiceClientService, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
			new TestAgentSessionsService([agentSessionEntry(resource.toString(), 'Auth fix', AgentSessionStatus.InProgress)]),
		);
		const buildSessionContext = Reflect.get(controller, '_buildSessionContext') as () => {
			sessions: { id: string; is_active: boolean; omni_route?: string }[];
		};
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		controller.setTargetSession(resource, 'new_session');
		const [session] = buildSessionContext.call(controller).sessions;
		const synchronized = voiceClientService.wireEvents.at(-1);

		assert.strictEqual(session.is_active, true);
		assert.strictEqual(session.omni_route, 'new_session');
		assert.strictEqual(synchronized?.type, 'session_context');
		assert.strictEqual(synchronized?.type === 'session_context' && synchronized.context.sessions[0].is_active, true);
	});

	test('open omni plays direct audio from a listed background session without a pending indicator', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const voicePlaybackService = new RecordingVoicePlaybackService();
		const controller = createController(
			voiceClientService, ttsPlaybackService, undefined, undefined, undefined, undefined,
			undefined, undefined, undefined, undefined, undefined, voicePlaybackService,
		);
		const resource = URI.parse('vscode-chat://background-direct-audio');
		showSessionsInAgentsList(controller, resource.toString());
		await connectWithOmniOpen(controller, voiceClientService);

		voiceClientService.fireAudioResponse({
			audio: 'The background task is complete.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: resource.toString(),
			responseId: 'background-response',
			transcript: 'The background task is complete.',
		});

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			pendingSessions: [...voicePlaybackService.pendingSessions],
		}, {
			playedAudio: ['The background task is complete.'],
			pendingSessions: [],
		});
	});

	test('open omni claims a coalesced completed session exactly once', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionId = URI.parse('vscode-chat://coalesced-completion').toString();
		showSessionsInAgentsList(controller, sessionId);
		await connectWithOmniOpen(controller, voiceClientService);
		const claim = Reflect.get(controller, '_claimFreshOmniCompletion') as (sessionId: string, endedAt: number) => boolean;

		assert.deepStrictEqual([
			claim.call(controller, sessionId, 1),
			claim.call(controller, sessionId, 1),
		], [true, false]);
	});

	test('open omni claims each completed response id exactly once', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const resource = URI.parse('vscode-chat://completed-response-identity');
		showSessionsInAgentsList(controller, resource.toString());
		await connectWithOmniOpen(controller, voiceClientService);
		const response = { id: 'response-1', isComplete: true, isCanceled: false };
		const model = {
			sessionResource: resource,
			lastRequest: { response },
		} as unknown as IChatModel;
		const claim = Reflect.get(controller, '_claimOmniCompletedResponse') as (model: IChatModel, state: string, summary: string) => boolean;

		const first = claim.call(controller, model, 'idle', 'First completed response.');
		const duplicate = claim.call(controller, model, 'idle', 'First completed response.');
		response.id = 'response-2';
		const next = claim.call(controller, model, 'idle', 'Second completed response.');

		assert.deepStrictEqual([first, duplicate, next], [true, false, true]);
	});

	test('open omni does not claim audio from a session missing from the Agents list', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const voicePlaybackService = new RecordingVoicePlaybackService();
		const controller = createController(
			voiceClientService, ttsPlaybackService, undefined, undefined, undefined, undefined,
			undefined, undefined, undefined, undefined, undefined, voicePlaybackService,
		);
		const resource = URI.parse('vscode-chat://hidden-background-audio');
		await connectWithOmniOpen(controller, voiceClientService);

		voiceClientService.fireAudioResponse({
			audio: 'This hidden task is complete.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: resource.toString(),
			responseId: 'hidden-background-response',
			transcript: 'This hidden task is complete.',
		});

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			pendingSessions: [...voicePlaybackService.pendingSessions],
		}, {
			playedAudio: [],
			pendingSessions: [resource.toString()],
		});
	});

	test('opening omni preserves the panel indicator for a session missing from the Agents list', () => {
		const voiceClientService = new TestVoiceClientService();
		const voicePlaybackService = new RecordingVoicePlaybackService();
		const controller = createController(
			voiceClientService, undefined, undefined, undefined, undefined, undefined,
			undefined, undefined, undefined, undefined, undefined, voicePlaybackService,
		);
		const sessionId = URI.parse('vscode-chat://hidden-pending-response').toString();
		(Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).set(sessionId, 'Hidden response.');
		const markPendingResponse = Reflect.get(controller, '_markPendingResponse') as (sessionId: string, pending: boolean) => void;
		markPendingResponse.call(controller, sessionId, true);

		controller.setOmniInputOpen(true);

		assert.deepStrictEqual([...voicePlaybackService.pendingSessions], [sessionId]);
	});

	test('open omni returns queued narration to panel ownership when its session leaves the Agents list', async () => {
		const voiceClientService = new TestVoiceClientService();
		const voicePlaybackService = new RecordingVoicePlaybackService();
		const controller = createController(
			voiceClientService, undefined, undefined, undefined, undefined, undefined,
			undefined, undefined, undefined, undefined, undefined, voicePlaybackService,
		);
		const sessionId = URI.parse('vscode-chat://archived-queued-response').toString();
		showSessionsInAgentsList(controller, sessionId);
		await connectWithOmniOpen(controller, voiceClientService);
		(Reflect.get(controller, '_omniNarrationQueue') as unknown[]).push({
			sessionId,
			kind: 'response',
			text: 'Queued response.',
			ordinal: 1,
		});
		(Reflect.get(controller, '_omniClaimedResponseSummaries') as Map<string, string>).set(sessionId, 'Queued response.');
		const agentSessionsService = Reflect.get(controller, 'agentSessionsService') as IAgentSessionsService;
		const listedSession = (agentSessionsService.model.sessions as unknown as { resource: URI; isArchived: () => boolean }[])
			.find(session => session.resource.toString() === sessionId)!;
		listedSession.isArchived = () => true;
		const drainOmniInbox = Reflect.get(controller, '_drainOmniInbox') as () => void;

		drainOmniInbox.call(controller);

		assert.deepStrictEqual({
			narrations: voiceClientService.requests,
			pendingSessions: [...voicePlaybackService.pendingSessions],
		}, {
			narrations: [],
			pendingSessions: [sessionId],
		});
	});

	test('open omni claims background audio while the voice session awaits initialization', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const resource = URI.parse('vscode-chat://background-during-connect');
		showSessionsInAgentsList(controller, resource.toString());
		await controller.connect(mainWindow);
		controller.setOmniInputOpen(true);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;

		voiceClientService.fireAudioResponse({
			audio: 'The background task finished while voice mode was connecting.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: resource.toString(),
			responseId: 'background-during-connect-response',
			transcript: 'The background task finished while voice mode was connecting.',
		});

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, [
			'The background task finished while voice mode was connecting.',
		]);
	});

	test('opening omni drops stale panel deferrals before narrating global work', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const staleSession = URI.parse('vscode-chat://stale-panel-deferral').toString();
		const responseSession = URI.parse('vscode-chat://omni-response-after-stale').toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
		) => void;
		showSessionsInAgentsList(controller, responseSession);
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		voiceClientService.fireSessionInit();
		(Reflect.get(controller, '_deferredNarrations') as Map<string, unknown>).set(staleSession, {
			narrationId: 'stale-panel-narration',
			kind: 'confirmation',
			text: 'No longer pending.',
			reuseNarrationId: true,
		});

		controller.setOmniInputOpen(true);
		handleStateChange.call(controller, responseSession, 'idle', undefined, 'Global Omni response.', undefined);

		assert.strictEqual((Reflect.get(controller, '_deferredNarrations') as Map<string, unknown>).size, 0);
		assert.strictEqual(voiceClientService.requests.at(-1)?.text, 'Global Omni response.');
	});

	test('open omni serializes actionable items and responses across background sessions', async () => {
		const voiceClientService = new TestVoiceClientService();
		const voicePlaybackService = new RecordingVoicePlaybackService();
		const controller = createController(
			voiceClientService, undefined, undefined, undefined, undefined, undefined,
			undefined, undefined, undefined, undefined, undefined, voicePlaybackService,
		);
		const confirmationSession = URI.parse('vscode-chat://background-confirmation').toString();
		const responseSession = URI.parse('vscode-chat://background-response').toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		const markNarrationHeard = Reflect.get(controller, '_markNarrationHeard') as (narrationId: string) => void;
		showSessionsInAgentsList(controller, confirmationSession, responseSession);
		await connectWithOmniOpen(controller, voiceClientService);

		handleStateChange.call(controller, confirmationSession, 'waiting_for_confirmation', 'Allow running the tests?', undefined, 'vscode-chat://shown-elsewhere', 'tool');
		handleStateChange.call(controller, responseSession, 'idle', undefined, 'The other task is complete.', 'vscode-chat://shown-elsewhere');

		assert.deepStrictEqual({
			requests: voiceClientService.requests.map(request => ({ sessionId: request.sessionId, kind: request.kind, text: request.text })),
			queued: (Reflect.get(controller, '_omniNarrationQueue') as unknown[]).length,
			pendingSessions: [...voicePlaybackService.pendingSessions],
		}, {
			requests: [{ sessionId: confirmationSession, kind: 'confirmation', text: 'Allow running the tests?' }],
			queued: 1,
			pendingSessions: [],
		});

		markNarrationHeard.call(controller, voiceClientService.requests[0].narrationId);
		await Promise.resolve();

		assert.deepStrictEqual({
			requests: voiceClientService.requests.map(request => ({ sessionId: request.sessionId, kind: request.kind, text: request.text })),
			queued: (Reflect.get(controller, '_omniNarrationQueue') as unknown[]).length,
		}, {
			requests: [
				{ sessionId: confirmationSession, kind: 'confirmation', text: 'Allow running the tests?' },
				{ sessionId: responseSession, kind: 'response', text: 'The other task is complete.' },
			],
			queued: 0,
		});
	});

	test('open omni narrates structured questions from a background session exactly once', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://background-question');
		const carousel = new ChatQuestionCarouselData([{
			id: 'deployment_target',
			type: 'singleSelect',
			title: 'deployment_target',
			message: 'Where should the app deploy?',
			options: [
				{ id: 'staging', label: 'Staging', value: 'staging' },
				{ id: 'production', label: 'Production', value: 'production' },
			],
		}], true, 'resolve-deployment');
		const model = pendingResponsePartModel(resource, carousel, 'questions: deployment_target');
		chatService.setModels([model]);
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => {
			state: string;
			detail?: string;
			confirmation_type?: VoiceConfirmationType;
		};
		const stateInfo = getAgentStateInfo.call(controller, model);
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		const markNarrationHeard = Reflect.get(controller, '_markNarrationHeard') as (narrationId: string) => void;
		showSessionsInAgentsList(controller, resource.toString());
		await connectWithOmniOpen(controller, voiceClientService);

		handleStateChange.call(controller, resource.toString(), stateInfo.state, stateInfo.detail, undefined, 'vscode-chat://different-session', stateInfo.confirmation_type);
		markNarrationHeard.call(controller, voiceClientService.requests[0].narrationId);
		handleStateChange.call(controller, resource.toString(), stateInfo.state, stateInfo.detail, undefined, 'vscode-chat://different-session', stateInfo.confirmation_type);

		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			kind: request.kind,
			text: request.text,
			pendingId: request.pendingId,
		})), [{
			kind: 'question',
			text: 'Where should the app deploy? Options: 1, Staging. 2, Production. You can also give your own answer. Or say skip.',
			pendingId: voiceClientService.requests[0].pendingId,
		}]);
		assert.ok(voiceClientService.requests[0].pendingId);
	});

	test('visible omni question card announces while omni owns the draft target', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://visible-omni-question');
		const carousel = new ChatQuestionCarouselData([{
			id: 'runtime',
			type: 'singleSelect',
			title: 'runtime',
			message: 'Which runtime should be used?',
			options: [
				{ id: 'node', label: 'Node.js', value: 'node' },
				{ id: 'deno', label: 'Deno', value: 'deno' },
			],
		}], true, 'select-runtime');
		chatService.setModels([pendingResponsePartModel(resource, carousel, 'questions: runtime')]);
		showSessionsInAgentsList(controller, resource.toString());
		await connectWithOmniOpen(controller, voiceClientService);
		controller.setDraftTarget();

		controller.announceSessionInOmni(resource);

		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			kind: request.kind,
			text: request.text,
		})), [{
			kind: 'question',
			text: 'Which runtime should be used? Options: 1, Node.js. 2, Deno. You can also give your own answer. Or say skip.',
		}]);
	});

	test('direct omni question answers immediately synchronize voice context', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, ttsPlaybackService, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://direct-omni-question-answer');
		const carousel = new ChatQuestionCarouselData([{
			id: 'runtime',
			type: 'singleSelect',
			title: 'runtime',
			message: 'Which runtime should be used?',
			options: [{ id: 'node', label: 'Node.js', value: 'node' }],
		}], true, 'select-runtime');
		chatService.setModels([pendingResponsePartModel(resource, carousel, 'questions: runtime')]);
		showSessionsInAgentsList(controller, resource.toString());
		await connectWithOmniOpen(controller, voiceClientService);
		controller.announceSessionInOmni(resource);
		const narrationId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'Which runtime should be used?',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: resource.toString(),
			responseId: narrationId,
			transcript: 'Which runtime should be used?',
			narrationKind: 'question',
		});
		const stopCountBeforeAnswer = ttsPlaybackService.stopCount;

		carousel.dismiss({ runtime: { selectedValue: 'node' } });
		controller.notifyPendingItemResolved(resource);

		const context = voiceClientService.wireEvents.at(-1);
		assert.deepStrictEqual({
			type: context?.type,
			pending: context?.type === 'session_context'
				? context.context.sessions.find(session => session.id === resource.toString())?.pending
				: undefined,
			inFlightNarrations: (Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, unknown>).size,
			stoppedActiveQuestion: ttsPlaybackService.stopCount === stopCountBeforeAnswer + 1,
		}, {
			type: 'session_context',
			pending: undefined,
			inFlightNarrations: 0,
			stoppedActiveQuestion: true,
		});
	});

	test('open omni queues background narration while passive listening has detected speech', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const sessionId = URI.parse('vscode-chat://background-while-speaking').toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
		) => void;
		const drainOmniInbox = Reflect.get(controller, '_drainOmniInbox') as () => void;
		showSessionsInAgentsList(controller, sessionId);
		await connectWithOmniOpen(controller, voiceClientService);
		Reflect.set(controller, '_pttHeld', true);
		Reflect.set(controller, '_pttCurrentTurnPassive', true);
		Reflect.set(controller, '_speechDetectedInTurn', true);

		handleStateChange.call(controller, sessionId, 'idle', undefined, 'This arrived while the user was speaking.', undefined);

		assert.deepStrictEqual({
			requests: voiceClientService.requests.length,
			queued: (Reflect.get(controller, '_omniNarrationQueue') as unknown[]).length,
		}, { requests: 0, queued: 1 });

		Reflect.set(controller, '_pttHeld', false);
		Reflect.set(controller, '_speechDetectedInTurn', false);
		drainOmniInbox.call(controller);

		assert.deepStrictEqual(voiceClientService.requests.map(request => ({ kind: request.kind, text: request.text })), [{
			kind: 'response',
			text: 'This arrived while the user was speaking.',
		}]);
	});

	test('open omni preserves arrival order between queued narration and direct response audio', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const confirmationSession = URI.parse('vscode-chat://queued-confirmation').toString();
		const responseSession = URI.parse('vscode-chat://queued-direct-response').toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		const drainOmniInbox = Reflect.get(controller, '_drainOmniInbox') as () => void;
		const markNarrationHeard = Reflect.get(controller, '_markNarrationHeard') as (narrationId: string) => void;
		showSessionsInAgentsList(controller, confirmationSession, responseSession);
		await connectWithOmniOpen(controller, voiceClientService);
		Reflect.set(controller, '_pttHeld', true);
		Reflect.set(controller, '_pttCurrentTurnPassive', true);
		Reflect.set(controller, '_speechDetectedInTurn', true);

		handleStateChange.call(controller, confirmationSession, 'waiting_for_confirmation', 'Allow the queued action?', undefined, undefined, 'tool');
		voiceClientService.fireAudioResponse({
			audio: 'The later response is complete.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: responseSession,
			responseId: 'later-direct-response',
			transcript: 'The later response is complete.',
		});

		assert.deepStrictEqual({
			requests: voiceClientService.requests.length,
			playedAudio: ttsPlaybackService.playedAudio,
			queuedNarrations: (Reflect.get(controller, '_omniNarrationQueue') as unknown[]).length,
			deferredResponses: (Reflect.get(controller, '_deferredResponses') as Map<string, unknown>).size,
		}, {
			requests: 0,
			playedAudio: [],
			queuedNarrations: 1,
			deferredResponses: 1,
		});

		Reflect.set(controller, '_pttHeld', false);
		Reflect.set(controller, '_speechDetectedInTurn', false);
		drainOmniInbox.call(controller);
		assert.deepStrictEqual({
			requests: voiceClientService.requests.map(request => request.text),
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			requests: ['Allow the queued action?'],
			playedAudio: [],
		});

		markNarrationHeard.call(controller, voiceClientService.requests[0].narrationId);
		await Promise.resolve();
		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['The later response is complete.']);
	});

	test('open omni plays a solicited narration whose audio arrives just after the user stops speaking', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = URI.parse('vscode-chat://solicited-after-release').toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		showSessionsInAgentsList(controller, sessionId);
		await connectWithOmniOpen(controller, voiceClientService);

		// The confirmation is narrated (requested) for a background session,
		// creating an in-flight solicited narration.
		handleStateChange.call(controller, sessionId, 'waiting_for_confirmation', 'Allow running the build?', undefined, sessionId, 'tool');
		const [request] = voiceClientService.requests;

		// Its audio arrives AFTER the user has finished speaking. Nothing else
		// will trigger a drain, so the audio must play live now rather than being
		// stranded in the deferred buffer (the reproduced bug: the narration's own
		// pending entry made it defer itself, then no drain ever ran).
		voiceClientService.fireAudioResponse({
			audio: 'Allow running the build?',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: request.narrationId,
			transcript: 'Allow running the build?',
		});

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['Allow running the build?']);
	});

	test('open omni plays a solicited narration whose audio was deferred while the user was speaking', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = URI.parse('vscode-chat://deferred-solicited-narration').toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		const drainOmniInbox = Reflect.get(controller, '_drainOmniInbox') as () => void;
		showSessionsInAgentsList(controller, sessionId);
		await connectWithOmniOpen(controller, voiceClientService);

		// The confirmation is narrated (requested) while the user is not speaking,
		// creating an in-flight solicited narration for this session.
		handleStateChange.call(controller, sessionId, 'waiting_for_confirmation', 'Allow running the tests?', undefined, sessionId, 'tool');
		const [request] = voiceClientService.requests;

		// The user starts speaking; the narration's own audio then arrives. It must
		// be held (queued) rather than played over the user's speech.
		Reflect.set(controller, '_pttHeld', true);
		Reflect.set(controller, '_pttCurrentTurnPassive', false);
		Reflect.set(controller, '_speechDetectedInTurn', true);
		voiceClientService.fireAudioResponse({
			audio: 'Allow running the tests?',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: request.narrationId,
			transcript: 'Allow running the tests?',
		});

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, []);

		// When the user stops speaking, the drain must play the buffered narration
		// instead of deadlocking on it (the pending narration waits for the drain
		// that would otherwise be blocked by that same pending narration).
		Reflect.set(controller, '_pttHeld', false);
		Reflect.set(controller, '_speechDetectedInTurn', false);
		drainOmniInbox.call(controller);

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['Allow running the tests?']);
	});

	test('closing omni transfers unheard items to panel ownership for narration on refocus', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const voicePlaybackService = new RecordingVoicePlaybackService();
		const controller = createController(
			voiceClientService, undefined, undefined, undefined, undefined, undefined,
			chatService, undefined, undefined, undefined, undefined, voicePlaybackService,
		);
		const confirmationResource = URI.parse('vscode-chat://abandoned-confirmation');
		const responseSession = URI.parse('vscode-chat://abandoned-response').toString();
		const tool = waitingTerminalTool('abandoned-tool');
		const model = pendingResponsePartModel(confirmationResource, tool, 'Needs approval');
		chatService.setModels([model]);
		const getAgentStateInfo = Reflect.get(controller, '_getAgentStateInfo') as (model: IChatModel) => {
			state: string;
			detail?: string;
			confirmation_type?: VoiceConfirmationType;
		};
		const stateInfo = getAgentStateInfo.call(controller, model);
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		const reconcileIndicators = Reflect.get(controller, '_reconcileConfirmationIndicators') as (sessionIds: Set<string>) => void;
		await connectWithOmniOpen(controller, voiceClientService);

		handleStateChange.call(controller, confirmationResource.toString(), stateInfo.state, stateInfo.detail, undefined, undefined, stateInfo.confirmation_type);
		reconcileIndicators.call(controller, new Set([confirmationResource.toString()]));
		handleStateChange.call(controller, responseSession, 'idle', undefined, 'This response was queued behind the confirmation.', undefined);
		controller.setOmniInputOpen(false);

		handleStateChange.call(controller, confirmationResource.toString(), stateInfo.state, stateInfo.detail, undefined, undefined, stateInfo.confirmation_type);
		reconcileIndicators.call(controller, new Set([confirmationResource.toString()]));
		handleStateChange.call(controller, responseSession, 'idle', undefined, 'This response was queued behind the confirmation.', undefined);
		controller.activateSession(URI.parse(responseSession));

		assert.strictEqual(voiceClientService.requests.at(-1)?.text, 'This response was queued behind the confirmation.');
		assert.strictEqual((Reflect.get(controller, '_omniNarrationQueue') as unknown[]).length, 0);
		assert.ok(voicePlaybackService.pendingSessions.has(responseSession), 'the response stays pending until its refocus narration is heard');
		assert.ok(voicePlaybackService.pendingSessions.has(confirmationResource.toString()), 'the confirmation returns to normal panel ownership');
	});

	test('without omni, focus transfers voice ownership and narrates a pending background response', async () => {
		const voiceClientService = new TestVoiceClientService();
		const voicePlaybackService = new RecordingVoicePlaybackService();
		const chatWidgetService = new TestChatWidgetService();
		const controller = createController(
			voiceClientService, undefined, undefined, undefined, undefined, undefined,
			undefined, undefined, undefined, undefined, undefined, voicePlaybackService, chatWidgetService,
		);
		const focusedSession = URI.parse('vscode-chat://focused-panel-session');
		const backgroundSession = URI.parse('vscode-chat://background-panel-session');
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
		) => void;
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		voiceClientService.fireSessionInit();
		controller.setTargetSession(focusedSession);

		handleStateChange.call(controller, focusedSession.toString(), 'idle', undefined, 'Focused response.', focusedSession.toString());
		handleStateChange.call(controller, backgroundSession.toString(), 'idle', undefined, 'Background response.', focusedSession.toString());

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.text), ['Focused response.']);
		assert.ok(voicePlaybackService.pendingSessions.has(backgroundSession.toString()));

		chatWidgetService.focus(backgroundSession);
		(Reflect.get(controller, '_onFocusedSessionChanged') as () => void).call(controller);

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.text), ['Focused response.', 'Background response.']);
		assert.strictEqual(controller.targetSession.get()?.toString(), backgroundSession.toString());
	});

	test('materializing an untitled chat preserves Voice Mode ownership', async () => {
		const voiceClientService = new TestVoiceClientService();
		const untitledSession = URI.parse('agent-host-copilotcli:/untitled-voice-session');
		const materializedSession = URI.parse('agent-host-copilotcli:/materialized-voice-session');
		const widget = store.add(new MaterializingChatWidget(untitledSession));
		const chatWidgetService = new TestChatWidgetService([widget]);
		const controller = createController(
			voiceClientService, undefined, undefined, undefined, undefined, undefined,
			undefined, undefined, undefined, undefined, undefined, undefined, chatWidgetService,
		);
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		voiceClientService.fireSessionInit();
		controller.setTargetSession(untitledSession);

		widget.materialize(materializedSession);

		assert.strictEqual(controller.isConnected.get(), true);
		assert.strictEqual(controller.targetSession.get()?.toString(), materializedSession.toString());
	});

	test('stops tracking a removed chat widget', () => {
		const voiceClientService = new TestVoiceClientService();
		const initialSession = URI.parse('agent-host-copilotcli:/initial-session');
		const removedSession = URI.parse('agent-host-copilotcli:/removed-session');
		const widget = store.add(new MaterializingChatWidget(initialSession));
		const widgetRemovals = store.add(new Emitter<IChatWidget>());
		const chatWidgetService = new TestChatWidgetService([widget], widgetRemovals.event);
		const controller = createController(
			voiceClientService, undefined, undefined, undefined, undefined, undefined,
			undefined, undefined, undefined, undefined, undefined, undefined, chatWidgetService,
		);

		widgetRemovals.fire(widget);
		Reflect.set(controller, '_lastShownSessionId', undefined);
		widget.materialize(removedSession);

		assert.strictEqual(Reflect.get(controller, '_lastShownSessionId'), undefined);
	});

	test('plays responses for an omni-routed target without a pending indicator', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const resource = URI.parse('vscode-chat://omni-target');
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		controller.setTargetSession(resource, 'existing_session');

		voiceClientService.fireAudioResponse({
			audio: 'omni response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: resource.toString(),
			responseId: 'omni-response',
			transcript: 'Omni response.',
		});
		(Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).set(resource.toString(), 'Omni response.');
		ttsPlaybackService.stopPlayback();

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			followupSession: controller.getLastSpokenResponseSession()?.toString(),
			deferredResponses: (Reflect.get(controller, '_deferredResponses') as Map<string, unknown>).size,
			pendingResponses: (Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).size,
		}, {
			playedAudio: ['omni response'],
			followupSession: resource.toString(),
			deferredResponses: 0,
			pendingResponses: 0,
		});
	});

	test('queues an omni-routed response while other audio is playing', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const resource = URI.parse('vscode-chat://omni-target');
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		controller.setTargetSession(resource, 'existing_session');

		voiceClientService.fireAudioResponse({
			audio: 'current audio',
			isFirstChunk: true,
			isFinal: true,
			responseId: 'current-response',
			transcript: 'Current audio.',
		});
		voiceClientService.fireAudioResponse({
			audio: 'queued omni response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: resource.toString(),
			responseId: 'omni-response',
			transcript: 'Queued omni response.',
		});

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			queuedResponses: (Reflect.get(controller, '_audioQueue') as unknown[]).length,
			pendingResponses: (Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).size,
		}, {
			playedAudio: ['current audio'],
			queuedResponses: 1,
			pendingResponses: 0,
		});

		ttsPlaybackService.stopPlayback();
		(Reflect.get(controller, '_processQueue') as () => void).call(controller);

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['current audio', 'queued omni response']);
	});

	test('preparing a new route releases the recent target and cancels its stale audio', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const resource = URI.parse('vscode-chat://recent-target');
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		controller.setTargetSession(resource, 'existing_session');

		voiceClientService.fireAudioResponse({
			audio: 'stale response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: resource.toString(),
			responseId: 'stale-response',
			transcript: 'Stale response.',
		});
		controller.prepareForRoutingRequest();

		assert.deepStrictEqual({
			target: (Reflect.get(controller, '_targetSession') as { get(): URI | undefined }).get(),
			stopCount: ttsPlaybackService.stopCount,
			queuedResponses: (Reflect.get(controller, '_audioQueue') as unknown[]).length,
		}, {
			target: undefined,
			stopCount: 1,
			queuedResponses: 0,
		});
	});

	test('narrates a completed omni-routed response when its session is not shown', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const resource = URI.parse('vscode-chat://omni-target');
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined) => void;
		controller.setTargetSession(resource, 'new_session');

		handleStateChange.call(controller, resource.toString(), 'idle', undefined, 'The omni task is complete.', 'vscode-chat://different-session');

		assert.deepStrictEqual({
			narrations: voiceClientService.requests.map(request => ({ sessionId: request.sessionId, kind: request.kind, text: request.text })),
			pendingResponses: (Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).size,
		}, {
			narrations: [{ sessionId: resource.toString(), kind: 'response', text: 'The omni task is complete.' }],
			pendingResponses: 0,
		});
	});

	test('narrates the completion summary for the current omni-routed request', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://omni-target');
		const sessionId = resource.toString();
		const lastRequest = {
			id: 'local-queued-request-id',
			response: {
				onDidChange: Event.None,
				isPendingConfirmation: observableValue('pending', undefined),
				isIncomplete: observableValue('incomplete', true),
				response: { value: [], getMarkdown: () => '' },
			},
		};
		chatService.setModels([{
			sessionResource: resource,
			title: 'Omni target',
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel]);
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined) => void;
		const cacheResponseSummary = Reflect.get(controller, '_cacheResponseSummary') as (sessionId: string, state: string, summary: string | undefined) => void;
		controller.setTargetSession(resource, 'existing_session');
		controller.markRoutedRequestPending(resource, 'local-queued-request-id');

		// Raw state observes thinking, but the settled narration changes collapse
		// idle → thinking → idle and never emit a separate thinking callback.
		cacheResponseSummary.call(controller, sessionId, 'thinking', undefined);
		handleStateChange.call(controller, sessionId, 'idle', undefined, undefined, undefined);
		handleStateChange.call(controller, sessionId, 'idle', undefined, 'The current omni request is complete.', undefined);

		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			sessionId: request.sessionId,
			kind: request.kind,
			text: request.text,
		})), [{
			sessionId,
			kind: 'response',
			text: 'The current omni request is complete.',
		}]);
	});

	test('narrates an omni chat completion with its backend coding-session resource', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const chatResource = URI.parse('agent-host-copilotcli:/chat-1');
		const lastRequest = {
			id: 'routed-request',
			response: {
				onDidChange: Event.None,
				isPendingConfirmation: observableValue('pending', undefined),
				isIncomplete: observableValue('incomplete', true),
				response: { value: [], getMarkdown: () => '' },
			},
		};
		chatService.setModels([{
			sessionResource: chatResource,
			title: 'Omni target',
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel]);
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined) => void;
		controller.setTargetSession(chatResource, 'existing_session');
		controller.markRoutedRequestPending(chatResource, 'routed-request');

		handleStateChange.call(controller, chatResource.toString(), 'idle', undefined, 'The routed task is complete.', undefined);

		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			sessionId: request.sessionId,
			kind: request.kind,
			text: request.text,
		})), [{
			sessionId: 'copilotcli:/chat-1',
			kind: 'response',
			text: 'The routed task is complete.',
		}]);
	});

	test('keeps routed ownership until an omni completion is heard after approvals', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://omni-target');
		const sessionId = resource.toString();
		const lastRequest = {
			id: 'routed-request',
			response: {
				onDidChange: Event.None,
				isPendingConfirmation: observableValue('pending', undefined),
				isIncomplete: observableValue('incomplete', false),
				response: { value: [], getMarkdown: () => 'The routed task is complete.' },
			},
		};
		chatService.setModels([{
			sessionResource: resource,
			title: 'Omni target',
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel]);
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined) => void;
		const markNarrationHeard = Reflect.get(controller, '_markNarrationHeard') as (narrationId: string) => void;

		controller.setTargetSession(resource, 'existing_session');
		controller.markRoutedRequestPending(resource, lastRequest.id);
		// Answering an approval releases the floating input's focus target. The
		// routed request itself must keep voice ownership through the final reply.
		controller.setOmniInputActive(true);
		controller.setOmniInputActive(false);
		handleStateChange.call(controller, sessionId, 'idle', undefined, 'The routed task is complete.', 'vscode-chat://different-session');

		const [narration] = voiceClientService.requests;
		assert.deepStrictEqual({
			narration: narration && { sessionId: narration.sessionId, kind: narration.kind, text: narration.text },
			routeBeforePlayback: Reflect.get(controller, '_routedRequests'),
		}, {
			narration: { sessionId, kind: 'response', text: 'The routed task is complete.' },
			routeBeforePlayback: new Map([[sessionId, { requestId: lastRequest.id, hasMatchedModelRequest: true, phase: 'queued' }]]),
		});

		markNarrationHeard.call(controller, narration.narrationId);
		assert.strictEqual((Reflect.get(controller, '_routedRequests') as Map<string, unknown>).size, 0);
	});

	test('does not mistake an approval acknowledgement for the routed completion', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, ttsPlaybackService, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://omni-target');
		const sessionId = resource.toString();
		const lastRequest = {
			id: 'routed-request',
			response: {
				onDidChange: Event.None,
				isPendingConfirmation: observableValue('pending', undefined),
				isIncomplete: observableValue('incomplete', true),
				response: { value: [], getMarkdown: () => '' },
			},
		};
		chatService.setModels([{
			sessionResource: resource,
			title: 'Omni target',
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel]);
		const cacheResponseSummary = Reflect.get(controller, '_cacheResponseSummary') as (sessionId: string, state: string, summary: string | undefined) => void;
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined) => void;

		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		controller.setTargetSession(resource, 'existing_session');
		controller.markRoutedRequestPending(resource, lastRequest.id);
		cacheResponseSummary.call(controller, sessionId, 'thinking', undefined);

		voiceClientService.fireAudioResponse({
			audio: 'approval accepted',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: 'approval-acknowledgement',
			transcript: 'Approval accepted.',
		});
		handleStateChange.call(controller, sessionId, 'idle', undefined, 'The routed task is complete.', undefined);
		ttsPlaybackService.stopPlayback();

		assert.deepStrictEqual({
			narrations: voiceClientService.requests.map(request => ({ kind: request.kind, text: request.text })),
			routeRetained: (Reflect.get(controller, '_routedRequests') as Map<string, unknown>).has(sessionId),
		}, {
			narrations: [{ kind: 'response', text: 'The routed task is complete.' }],
			routeRetained: true,
		});
	});

	test('narrates an omni-routed confirmation when its session is not shown', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const resource = URI.parse('vscode-chat://omni-target');
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined, confirmationType?: VoiceConfirmationType) => void;
		controller.setTargetSession(resource, 'existing_session');

		handleStateChange.call(controller, resource.toString(), 'waiting_for_confirmation', 'Allow running the tests?', undefined, 'vscode-chat://different-session', 'tool');

		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			sessionId: request.sessionId,
			kind: request.kind,
			text: request.text,
			confirmationType: request.confirmationType,
		})), [{
			sessionId: resource.toString(),
			kind: 'confirmation',
			text: 'Allow running the tests?',
			confirmationType: 'tool',
		}]);
	});

	test('an omni confirmation discards older response audio for its session', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const resource = URI.parse('vscode-chat://omni-target');
		const sessionId = resource.toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined, confirmationType?: VoiceConfirmationType) => void;
		controller.setTargetSession(resource, 'existing_session');
		(Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).set(sessionId, 'The older response.');
		(Reflect.get(controller, '_lastResponseSummaryById') as Map<string, string>).set(sessionId, 'The older response.');
		(Reflect.get(controller, '_audioQueue') as unknown[]).push({
			sessionId,
			responseId: 'older-response',
			finalized: true,
			chunks: [{ audio: 'older audio', isFirstChunk: true, isFinal: true, transcript: 'The older response.' }],
		});
		(Reflect.get(controller, '_deferredResponses') as Map<string, unknown[]>).set(sessionId, [{
			responseId: 'older-deferred-response',
			finalized: true,
			chunks: [{ audio: 'older deferred audio', isFirstChunk: true, isFinal: true, transcript: 'An older deferred response.' }],
		}]);

		handleStateChange.call(controller, sessionId, 'waiting_for_confirmation', 'Allow writing the file?', undefined, undefined, 'tool');

		assert.deepStrictEqual({
			queuedResponses: (Reflect.get(controller, '_audioQueue') as unknown[]).length,
			deferredResponses: (Reflect.get(controller, '_deferredResponses') as Map<string, unknown[]>).size,
			pendingResponses: (Reflect.get(controller, '_pendingResponseSummaries') as Map<string, string>).size,
			cachedSummaries: (Reflect.get(controller, '_lastResponseSummaryById') as Map<string, string>).size,
			narrations: voiceClientService.requests.map(request => ({ kind: request.kind, text: request.text })),
		}, {
			queuedResponses: 0,
			deferredResponses: 0,
			pendingResponses: 0,
			cachedSummaries: 0,
			narrations: [{ kind: 'confirmation', text: 'Allow writing the file?' }],
		});
	});

	test('an omni response summary is not requested while its direct audio is still playing', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const resource = URI.parse('vscode-chat://omni-target');
		const sessionId = resource.toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined) => void;
		controller.setTargetSession(resource, 'existing_session');
		Reflect.set(controller, '_currentPlaybackSessionId', sessionId);
		Reflect.set(controller, '_currentPlaybackNarration', undefined);

		handleStateChange.call(controller, sessionId, 'idle', undefined, 'The completed response.', undefined);

		assert.deepStrictEqual(voiceClientService.requests, []);
	});

	test('open omni narrates a completed response after same-session acknowledgement audio', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const sessionId = URI.parse('vscode-chat://global-omni-response').toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined) => void;
		showSessionsInAgentsList(controller, sessionId);
		await connectWithOmniOpen(controller, voiceClientService);

		voiceClientService.fireAudioResponse({
			audio: 'Okay.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: 'approval-acknowledgement',
			transcript: 'Okay.',
		});
		handleStateChange.call(controller, sessionId, 'idle', undefined, 'The requested work is complete.', undefined);
		const beforePlaybackStopped = voiceClientService.requests.map(request => request.text);

		ttsPlaybackService.stopPlayback();

		assert.deepStrictEqual({
			beforePlaybackStopped,
			afterPlaybackStopped: voiceClientService.requests.map(request => ({
				sessionId: request.sessionId,
				kind: request.kind,
				text: request.text,
			})),
		}, {
			beforePlaybackStopped: [],
			afterPlaybackStopped: [{
				sessionId,
				kind: 'response',
				text: 'The requested work is complete.',
			}],
		});
	});

	test('a queued routed request suppresses the session previous idle response', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, ttsPlaybackService, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://omni-target');
		const sessionId = resource.toString();
		const lastRequest = {
			id: 'previous-request',
			response: {
				onDidChange: Event.None,
				isPendingConfirmation: observableValue('previousPending', undefined),
				isIncomplete: observableValue('previousIncomplete', false),
				response: { value: [], getMarkdown: () => 'The response from before the queued request.' },
			},
		};
		let lastRequestId = lastRequest.id;
		chatService.setModels([{
			sessionResource: resource,
			title: 'Omni target',
			getRequests: () => [{ ...lastRequest, id: lastRequestId }],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel]);
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (sessionId: string, state: string, detail: string | undefined, summary: string | undefined, shown: string | undefined) => void;
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		controller.setTargetSession(resource, 'existing_session');
		controller.markRoutedRequestPending(resource);
		controller.markRoutedRequestPending(resource, 'new-request');

		handleStateChange.call(controller, sessionId, 'idle', undefined, 'The response from before the queued request.', undefined);
		voiceClientService.fireAudioResponse({
			audio: 'old queued response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: 'old-queued-response',
			transcript: 'The response from before the queued request.',
		});
		handleStateChange.call(controller, sessionId, 'waiting_for_confirmation', undefined, undefined, undefined);
		voiceClientService.fireAudioResponse({
			audio: 'old response after prompt',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: 'old-response-after-prompt',
			transcript: 'The response from before the queued request.',
		});
		lastRequestId = 'new-request';
		handleStateChange.call(controller, sessionId, 'thinking', undefined, undefined, undefined);
		voiceClientService.fireAudioResponse({
			audio: 'new queued response',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: 'new-queued-response',
			transcript: 'The new queued request is complete.',
		});
		handleStateChange.call(controller, sessionId, 'idle', undefined, 'The new queued request is complete.', undefined);

		assert.deepStrictEqual({
			playedAudio: ttsPlaybackService.playedAudio,
			narrations: voiceClientService.requests.map(request => request.text),
		}, {
			playedAudio: ['new queued response'],
			narrations: [],
		});
	});

	test('a queued routed request does not inherit the previous request busy state', () => {
		const chatService = new ControllableChatService();
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://busy-omni-target');
		const previousRequest = {
			id: 'previous-request',
			response: {
				onDidChange: Event.None,
				isPendingConfirmation: observableValue('previousPending', undefined),
				isIncomplete: observableValue('previousIncomplete', true),
				response: { value: [], getMarkdown: () => '' },
			},
		};
		chatService.setModels([{
			sessionResource: resource,
			title: 'Busy omni target',
			getRequests: () => [previousRequest],
			lastRequestObs: observableValue('previousLastRequest', previousRequest),
		} as unknown as IChatModel]);

		controller.markRoutedRequestPending(resource);
		controller.markRoutedRequestPending(resource, 'new-request');

		assert.deepStrictEqual(
			Reflect.get(controller, '_routedRequests'),
			new Map([[resource.toString(), { requestId: 'new-request', previousRequestId: 'previous-request', phase: 'queued' }]]),
		);
	});

	test('an older idle response does not clear a newly queued routed request', () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://omni-target');
		const previousResponse = completedResponseModel('The previous request is complete.');
		const lastRequest = previousResponse.getRequests().at(-1)!;
		const model = {
			sessionResource: resource,
			title: 'Omni target',
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel;
		chatService.setModels([model]);

		controller.markRoutedRequestPending(resource);

		assert.deepStrictEqual(
			Reflect.get(controller, '_routedRequests'),
			new Map([[resource.toString(), { requestId: undefined, previousRequestId: null, phase: 'queued' }]]),
		);
	});

	test('adopts the request id when a queued omni route appears in the model', () => {
		const chatService = new ControllableChatService();
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('vscode-chat://omni-target');
		let lastRequestId = 'previous-request';
		chatService.setModels([{
			sessionResource: resource,
			title: 'Omni target',
			getRequests: () => [{ id: lastRequestId }],
			lastRequestObs: observableValue('lastRequest', undefined),
		} as unknown as IChatModel]);

		controller.markRoutedRequestPending(resource);
		lastRequestId = 'new-request';
		const cacheResponseSummary = Reflect.get(controller, '_cacheResponseSummary') as (sessionId: string, state: string, summary: string | undefined) => void;
		cacheResponseSummary.call(controller, resource.toString(), 'thinking', undefined);

		assert.deepStrictEqual(
			Reflect.get(controller, '_routedRequests'),
			new Map([[resource.toString(), { requestId: undefined, modelRequestId: 'new-request', hasMatchedModelRequest: true, phase: 'running' }]]),
		);
	});

	test('keeps confirmations and the final response on a route whose durable model id differs from its transient send id', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new ControllableChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('agent-host-copilotcli://durable-route');
		let lastRequestId = 'previous-request';
		chatService.setModels([{
			sessionResource: resource,
			title: 'Durable route',
			getRequests: () => [{ id: lastRequestId }],
			lastRequestObs: observableValue('lastRequest', undefined),
		} as unknown as IChatModel]);
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
			confirmationType?: VoiceConfirmationType,
		) => void;
		const markNarrationHeard = Reflect.get(controller, '_markNarrationHeard') as (narrationId: string) => void;
		await connectWithOmniOpen(controller, voiceClientService);
		controller.markRoutedRequestPending(resource);
		controller.markRoutedRequestPending(resource, 'request_transient_123');

		lastRequestId = 'b361715a-b9bf-4fe0-b763-d769ad8271a3';
		handleStateChange.call(controller, resource.toString(), 'waiting_for_confirmation', 'Allow the durable request?', undefined, 'vscode-chat://different-session', 'tool');
		const routeAfterConfirmation = (Reflect.get(controller, '_routedRequests') as Map<string, unknown>).get(resource.toString());
		markNarrationHeard.call(controller, voiceClientService.requests[0].narrationId);
		await Promise.resolve();
		handleStateChange.call(controller, resource.toString(), 'idle', undefined, 'The durable request is complete.', 'vscode-chat://different-session');

		assert.deepStrictEqual({
			routeAfterConfirmation,
			requests: voiceClientService.requests.map(request => ({ kind: request.kind, text: request.text })),
		}, {
			routeAfterConfirmation: {
				requestId: 'request_transient_123',
				modelRequestId: 'b361715a-b9bf-4fe0-b763-d769ad8271a3',
				phase: 'waiting',
			},
			requests: [
				{ kind: 'confirmation', text: 'Allow the durable request?' },
				{ kind: 'response', text: 'The durable request is complete.' },
			],
		});
	});

	test('keeps an in-flight omni route live after the floating input releases focus', () => {
		const controller = createController(new TestVoiceClientService());
		const resource = URI.parse('agent-host-copilotcli:/omni-target');
		const shouldDefer = Reflect.get(controller, '_shouldDeferForSession') as (sessionId: string) => boolean;

		controller.setTargetSession(resource, 'new_session');
		controller.markRoutedRequestPending(resource, 'new-request');
		controller.setOmniInputActive(true);
		controller.setOmniInputActive(false);

		assert.strictEqual(shouldDefer.call(controller, resource.toString()), false);
	});

	test('loads an unloaded omni-routed session so its final response is observable', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new TrackingLoadChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('agent-host-copilotcli:/new-omni-target');

		await connectWithOmniOpen(controller, voiceClientService);
		controller.markRoutedRequestPending(resource, 'new-request');
		await Promise.resolve();

		assert.deepStrictEqual(chatService.loaded, [resource.toString()]);
	});

	test('retains a resident omni-routed session until its final response is observable', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new TrackingLoadChatService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, undefined, undefined, chatService);
		const resource = URI.parse('agent-host-copilotcli:/resident-omni-target');
		chatService.setResident(resource);

		await connectWithOmniOpen(controller, voiceClientService);
		controller.markRoutedRequestPending(resource, 'new-request');
		await Promise.resolve();

		assert.deepStrictEqual(chatService.loaded, [resource.toString()]);
	});

	test('retains an eager model reference while an omni-routed request is running', () => {
		const chatService = new ControllableChatService();
		const resource = URI.parse('agent-host-copilotcli:/running-omni-target');
		const lastRequest = {
			id: 'running-request',
			response: {
				onDidChange: Event.None,
				isPendingConfirmation: observableValue('pending', undefined),
				isIncomplete: observableValue('incomplete', true),
				response: { value: [], getMarkdown: () => '' },
			},
		};
		chatService.setModels([{
			sessionResource: resource,
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel]);
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, chatService);
		let disposeCount = 0;
		const eagerRefs = Reflect.get(controller, '_eagerModelRefs') as Map<string, IChatModelReference>;
		const releaseUnused = Reflect.get(controller, '_releaseUnusedEagerModelRefs') as (stillWaiting: ReadonlySet<string>) => void;
		eagerRefs.set(resource.toString(), {
			object: {},
			dispose: () => disposeCount++,
		} as unknown as IChatModelReference);
		controller.markRoutedRequestPending(resource, 'running-request');
		controller.markRoutedRequestPending(resource, 'running-request');
		releaseUnused.call(controller, new Set());

		assert.deepStrictEqual({
			disposeCount,
			route: (Reflect.get(controller, '_routedRequests') as Map<string, { phase: string }>).get(resource.toString()),
		}, {
			disposeCount: 0,
			route: { requestId: 'running-request', hasMatchedModelRequest: true, phase: 'running' },
		});

		controller.clearRoutedRequest(resource);
		assert.strictEqual(disposeCount, 1);
	});

	test('opening omni keeps completed response tracking bounded', () => {
		const chatService = new ControllableChatService();
		const models = Array.from({ length: 300 }, (_, index) => {
			const resource = URI.parse(`vscode-chat://completed-${index}`);
			const response = {
				id: `response-${index}`,
				onDidChange: Event.None,
				isPendingConfirmation: observableValue('pending', undefined),
				isIncomplete: observableValue('incomplete', false),
				isComplete: true,
				isCanceled: false,
				response: { value: [], getMarkdown: () => `Completed ${index}` },
			};
			const lastRequest = { id: `request-${index}`, response };
			return {
				sessionResource: resource,
				title: `Completed ${index}`,
				lastRequest,
				lastRequestObs: observableValue('lastRequest', lastRequest),
				getRequests: () => [lastRequest],
			} as unknown as IChatModel;
		});
		chatService.setModels(models);
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, chatService);

		controller.setOmniInputOpen(true);

		assert.strictEqual((Reflect.get(controller, '_omniCompletedResponseIds') as Set<string>).size, 256);
	});

	test('an omni response is never requested again after it has been heard', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const resource = URI.parse('vscode-chat://omni-target');
		const sessionId = resource.toString();
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string) => boolean;
		controller.setTargetSession(resource, 'existing_session');
		(Reflect.get(controller, '_lastHeardTranscriptById') as Map<string, string>).set(sessionId, 'the completed response with extra detail');

		assert.strictEqual(narrate.call(controller, sessionId, 'response', 'The completed response.'), false);
		assert.deepStrictEqual(voiceClientService.requests, []);
	});

	test('an awaited reply does not replay an already heard omni response', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const controller = createController(voiceClientService, ttsPlaybackService);
		const resource = URI.parse('vscode-chat://omni-target');
		const sessionId = resource.toString();
		await controller.connect(mainWindow);
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		controller.setTargetSession(resource, 'existing_session');
		(Reflect.get(controller, '_lastHeardTranscriptById') as Map<string, string>).set(sessionId, 'the old completed response');
		(Reflect.get(controller, '_setAwaitingReply') as () => void).call(controller);

		voiceClientService.fireAudioResponse({
			audio: 'old response audio',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: 'old-response-rerender',
			transcript: 'The old completed response.',
		});

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, []);
	});

	test('heard omni responses remain deduplicated across voice reconnects', () => {
		const controller = createController(new TestVoiceClientService());
		const sessionId = 'vscode-chat://omni-target';
		(Reflect.get(controller, '_lastHeardTranscriptById') as Map<string, string>).set(sessionId, 'the completed response');

		controller.disconnect('explicit');

		assert.strictEqual((Reflect.get(controller, '_lastHeardTranscriptById') as Map<string, string>).get(sessionId), 'the completed response');
	});

	test('does not mark an omni-routed confirmation as pending in the sessions list', () => {
		const controller = createController(new TestVoiceClientService());
		const resource = URI.parse('vscode-chat://omni-target');
		const reconcileIndicators = Reflect.get(controller, '_reconcileConfirmationIndicators') as (sessionIds: Set<string>) => void;
		controller.setTargetSession(resource, 'existing_session');

		reconcileIndicators.call(controller, new Set([resource.toString()]));

		assert.strictEqual((Reflect.get(controller, '_confirmationPendingSessions') as Set<string>).size, 0);
	});

	test('supersedes stale confirmation narration for an omni-routed session', () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const resource = URI.parse('vscode-chat://omni-target');
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: VoiceNarrationKind, text: string) => boolean;
		controller.setTargetSession(resource, 'existing_session');

		assert.strictEqual(narrate.call(controller, resource.toString(), 'confirmation', 'Allow the old action?'), true);
		const oldNarrationId = voiceClientService.requests[0].narrationId;
		assert.strictEqual(narrate.call(controller, resource.toString(), 'confirmation', 'Allow the updated action?'), true);

		assert.deepStrictEqual({
			requests: voiceClientService.requests.map(request => request.text),
			cancelledOldNarration: (Reflect.get(controller, '_cancelledPendingNarrationIds') as Set<string>).has(oldNarrationId),
			pendingNarrations: [...(Reflect.get(controller, '_pendingSolicitedNarrations') as Map<string, { text: string }>).values()].map(pending => pending.text),
		}, {
			requests: ['Allow the old action?', 'Allow the updated action?'],
			cancelledOldNarration: true,
			pendingNarrations: ['Allow the updated action?'],
		});
	});

	test('grounds the active session with its selected model and attachment names', () => {
		const chatService = new ControllableChatService();
		const resource = URI.parse('vscode-chat://regular/session-aware');
		const lastRequest = {
			id: 'request-1',
			response: {
				isPendingConfirmation: observableValue('pending', undefined),
				isIncomplete: observableValue('incomplete', false),
				response: { value: [], getMarkdown: () => '' },
			},
		};
		const model = {
			sessionResource: resource,
			title: 'Session awareness',
			lastMessageDate: Date.now(),
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
			inputModel: {
				state: observableValue('inputState', {
					selectedModel: {
						identifier: 'copilot/gpt-5',
						metadata: { name: 'GPT-5', vendor: 'copilot' },
					},
					attachments: [{ kind: 'file', name: 'voiceSessionController.ts' }, { kind: 'file', name: 'README.md' }],
				}),
			},
		} as unknown as IChatModel;
		chatService.setModels([model]);
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, chatService);
		controller.setActiveSessionShown(resource);
		const buildSessionContext = Reflect.get(controller, '_buildSessionContext') as () => IVoiceSessionContext;

		const [session] = buildSessionContext.call(controller).sessions;

		assert.deepStrictEqual({
			session_type: session.session_type,
			is_active: session.is_active,
			selected_model: session.selected_model,
			attachment_names: session.attachment_names,
			attachment_count: session.attachment_count,
		}, {
			session_type: 'chat',
			is_active: true,
			selected_model: { identifier: 'copilot/gpt-5', name: 'GPT-5', vendor: 'copilot' },
			attachment_names: ['voiceSessionController.ts', 'README.md'],
			attachment_count: 2,
		});
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
		assert.ok(getAgentStateInfo.call(controller, model).detail?.includes('Run a command'));
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
		assert.ok(getAgentStateInfo.call(controller, model).detail?.includes('Delete the branch?'));
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
		const detail = getAgentStateInfo.call(controller, model).detail;
		assert.ok(detail?.includes('Which region?'));
		assert.ok(!detail?.includes('Which tier?'));
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
			toolResults: [{ callId: 'send-follow-up', result: 'ok', codingSessionId: 'file:///chat-session' }],
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
		voiceClientService.fireConnectionState(true);
		await voiceClientService.sessionCommandSent.p;
		controller.setActiveSessionShown(URI.parse(sessionId));

		assert.strictEqual(narrate.call(controller, sessionId, 'response', 'Done'), true);
		voiceClientService.fireAudioResponse({
			audio: 'narration',
			isFirstChunk: true,
			isFinal: false,
			responseId: 'narration-1',
		});
		voiceClientService.fireSpeechStarted(Reflect.get(controller, '_activePassiveTurnId'));
		voiceClientService.fireNarrationInterrupted({
			narrationId: 'narration-1',
			codingSessionId: sessionId,
		});
		Reflect.set(controller, '_currentNarratable', () => ({ kind: 'response', text: 'Done' }));
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
				sessionId: 'copilot:/session-1',
				kind: 'response',
				text: 'Done',
				narrationId: 'narration-1',
			}, {
				sessionId: 'copilot:/session-1',
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
			sessionId: 'copilot:/session-1',
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

	test('omni waits for the routed response before returning to listening', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService(true);
		const mic = new RecordingMicCaptureService();
		const controller = createController(
			voiceClientService,
			undefined,
			commandService,
			undefined,
			mic,
			new TestConfigurationService({ 'agents.voice.handsFree': true, [VOICE_AGENT_PROGRESS_SETTING]: true }),
		);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);
		controller.setOmniInputActive(true);
		clock.tick(1);

		voiceClientService.fireToolCall({
			callId: 'omni-send',
			name: 'send_to_chat',
			args: { text: 'continue the related task' },
		});
		await voiceClientService.toolResultReceived;

		assert.deepStrictEqual({
			state: controller.voiceState.get(),
			status: controller.statusText.get(),
			micStarts: mic.pttDownCalls.length,
		}, {
			state: 'processing',
			status: 'Waiting for response...',
			micStarts: 0,
		});
	});

	test('omni drops the voice dispatch acknowledgement and plays the completed response narration', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const commandService = new TestCommandService();
		const controller = createController(voiceClientService, ttsPlaybackService, commandService);
		const sessionId = URI.parse('chat-session').toString();
		const handleStateChange = Reflect.get(controller, '_handleNarratableStateChange') as (
			sessionId: string,
			state: string,
			detail: string | undefined,
			summary: string | undefined,
			shown: string | undefined,
		) => void;
		showSessionsInAgentsList(controller, sessionId);
		await connectWithOmniOpen(controller, voiceClientService);

		voiceClientService.fireToolCall({
			callId: 'omni-dispatch-ack',
			name: 'send_to_chat',
			args: { text: 'continue the related task' },
		});
		await voiceClientService.toolResultReceived;
		assert.notStrictEqual(Reflect.get(controller, '_pendingOmniDispatchAcknowledgement'), undefined);
		voiceClientService.fireAudioResponse({
			audio: 'The command is done.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			transcript: 'The command is done.',
		});
		assert.deepStrictEqual({
			pendingAcknowledgement: Reflect.get(controller, '_pendingOmniDispatchAcknowledgement'),
			playedAudio: ttsPlaybackService.playedAudio,
		}, {
			pendingAcknowledgement: undefined,
			playedAudio: [],
		});

		handleStateChange.call(controller, sessionId, 'idle', undefined, 'The actual task is complete.', undefined);
		const narrationId = voiceClientService.requests[0].narrationId;
		voiceClientService.fireAudioResponse({
			audio: 'The actual task is complete.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: sessionId,
			responseId: narrationId,
			transcript: 'The actual task is complete.',
			narrationKind: 'response',
		});

		assert.deepStrictEqual(ttsPlaybackService.playedAudio, ['The actual task is complete.']);
	});

	test('omni waits for the dispatch acknowledgement before narrating a confirmation', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService(true);
		const chatService = new ControllableChatService();
		const resource = URI.parse('agent-host-copilotcli:/omni-confirmation-after-dispatch');
		const backendResource = URI.parse('copilotcli:/omni-confirmation-after-dispatch');
		const response = {
			onDidChange: Event.None,
			isPendingConfirmation: observableValue<{ detail?: string } | undefined>('pending', { detail: 'Needs approval' }),
			isIncomplete: observableValue('incomplete', false),
			response: { value: [] as readonly { kind: string }[], getMarkdown: () => '' },
		};
		const lastRequest = { id: 'confirmation-request', response };
		chatService.setModels([{
			sessionResource: resource,
			title: 'Chat',
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel]);
		const controller = createController(voiceClientService, undefined, commandService, undefined, undefined, undefined, chatService);
		showSessionsInAgentsList(controller, resource.toString());
		await connectWithOmniOpen(controller, voiceClientService);

		voiceClientService.fireToolCall({
			callId: 'omni-confirmation-dispatch',
			name: 'send_to_chat',
			args: { text: 'run the tests' },
		});
		controller.announceSessionInOmni(resource);
		assert.strictEqual(voiceClientService.requests.length, 0);

		voiceClientService.fireAudioResponse({
			audio: 'I sent that request.',
			isFirstChunk: true,
			isFinal: true,
			transcript: 'I sent that request.',
		});
		await Promise.resolve();

		const contextBeforeNarration = voiceClientService.wireEvents
			.filter(event => event.type === 'session_context')
			.at(-1);
		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			sessionId: request.sessionId,
			kind: request.kind,
			text: request.text,
		})), [{
			sessionId: backendResource.toString(),
			kind: 'confirmation',
			text: 'tool approval: GitHub Copilot needs your approval to continue.',
		}]);
		assert.strictEqual(
			contextBeforeNarration?.type === 'session_context'
			&& contextBeforeNarration.context.sessions.some(session => session.id === backendResource.toString()),
			true,
		);

		const firstRequest = voiceClientService.requests[0];
		voiceClientService.fireNarrationAck({
			narrationId: firstRequest.narrationId,
			codingSessionId: backendResource.toString(),
			disposition: 'invalid',
			reason: 'stale_context',
		});
		clock.tick(499);
		assert.strictEqual(voiceClientService.requests.length, 1);
		clock.tick(1);
		assert.deepStrictEqual(voiceClientService.requests.map(request => ({
			sessionId: request.sessionId,
			kind: request.kind,
			text: request.text,
		})), [
			{ sessionId: backendResource.toString(), kind: 'confirmation', text: 'tool approval: GitHub Copilot needs your approval to continue.' },
			{ sessionId: backendResource.toString(), kind: 'confirmation', text: 'tool approval: GitHub Copilot needs your approval to continue.' },
		]);
	});

	test('a solicited response before the dispatch acknowledgement does not strand a confirmation', async () => {
		const voiceClientService = new TestVoiceClientService();
		const ttsPlaybackService = new TestTtsPlaybackService();
		const commandService = new TestCommandService(true);
		const chatService = new ControllableChatService();
		const resource = URI.parse('vscode-chat://omni-response-before-ack');
		const response = {
			onDidChange: Event.None,
			isPendingConfirmation: observableValue<{ detail?: string } | undefined>('pending', { detail: 'Needs approval' }),
			isIncomplete: observableValue('incomplete', false),
			response: { value: [] as readonly { kind: string }[], getMarkdown: () => '' },
		};
		const lastRequest = { id: 'confirmation-request', response };
		chatService.setModels([{
			sessionResource: resource,
			title: 'Chat',
			getRequests: () => [lastRequest],
			lastRequestObs: observableValue('lastRequest', lastRequest),
		} as unknown as IChatModel]);
		const controller = createController(voiceClientService, ttsPlaybackService, commandService, undefined, undefined, undefined, chatService);
		showSessionsInAgentsList(controller, resource.toString());
		await connectWithOmniOpen(controller, voiceClientService);
		controller.setTargetSession(resource, 'existing_session');

		voiceClientService.fireToolCall({
			callId: 'omni-response-before-ack',
			name: 'send_to_chat',
			args: { text: 'run the tests' },
		});
		await voiceClientService.toolResultReceived;
		assert.notStrictEqual(Reflect.get(controller, '_pendingOmniDispatchAcknowledgement'), undefined);
		controller.announceSessionInOmni(resource);
		const narrate = Reflect.get(controller, '_narrate') as (sessionId: string, kind: string, text: string) => boolean;
		narrate.call(controller, resource.toString(), 'response', 'An earlier response.');
		const responseNarration = voiceClientService.requests[0];

		voiceClientService.fireAudioResponse({
			audio: 'An earlier response.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: resource.toString(),
			responseId: responseNarration.narrationId,
			narrationKind: 'response',
			transcript: 'An earlier response.',
		});
		assert.deepStrictEqual({
			requestCount: voiceClientService.requests.length,
			pendingAcknowledgement: Reflect.get(controller, '_pendingOmniDispatchAcknowledgement'),
			deferredConfirmations: [...(Reflect.get(controller, '_pendingAfterOmniDispatchAcknowledgement') as Map<string, unknown>)],
			currentNarratable: (Reflect.get(controller, '_currentNarratable') as (resource: URI) => unknown).call(controller, resource),
		}, {
			requestCount: 1,
			pendingAcknowledgement: { sessionKey: resource.toString() },
			deferredConfirmations: [[resource.toString(), {
				kind: 'confirmation',
				text: 'tool approval: GitHub Copilot needs your approval to continue.',
				confirmationType: 'generic',
			}]],
			currentNarratable: {
				kind: 'confirmation',
				text: 'tool approval: GitHub Copilot needs your approval to continue.',
				confirmationType: 'generic',
			},
		});

		voiceClientService.fireAudioResponse({
			audio: 'I sent that request.',
			isFirstChunk: true,
			isFinal: true,
			codingSessionId: resource.toString(),
			transcript: 'I sent that request.',
		});
		await Promise.resolve();
		ttsPlaybackService.stopPlayback();
		await Promise.resolve();

		assert.deepStrictEqual(voiceClientService.requests.map(request => request.kind), ['response', 'confirmation']);
	});

	test('resolves a backend session id before dispatching a spoken approval', async () => {
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService);
		const resource = URI.parse('agent-host-copilotcli:/spoken-approval');
		controller.setTargetSession(resource, 'existing_session');
		await controller.connect(mainWindow);
		const toolCall: IVoiceToolCall = {
			callId: 'spoken-approval',
			name: 'respond_to_session',
			args: {
				coding_session_id: 'copilotcli:/spoken-approval',
				response: { type: 'approve' },
			},
		};

		voiceClientService.fireToolCall(toolCall);
		await Promise.resolve();

		assert.strictEqual(toolCall.args?.['coding_session_id'], resource.toString());
	});

	test('focused omni chat routes voice input instead of the panel session', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService(true);
		const controller = createController(
			voiceClientService,
			undefined,
			commandService,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		);

		const sendTranscriptionToChat = Reflect.get(controller, '_sendTranscriptionToChat') as (text: string) => Promise<void>;
		await sendTranscriptionToChat.call(controller, 'run the focused omni request');

		assert.deepStrictEqual({
			omniInputs: commandService.acceptedOmniInputs,
			panelInputs: commandService.acceptedInputs,
		}, {
			omniInputs: ['run the focused omni request'],
			panelInputs: [],
		});
	});

	test('rejected omni routing does not fall back to the panel session', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService(false);
		const controller = createController(voiceClientService, undefined, commandService);
		controller.setOmniInputActive(true);

		const sendTranscriptionToChat = Reflect.get(controller, '_sendTranscriptionToChat') as (text: string) => Promise<URI | false | undefined>;
		const result = await sendTranscriptionToChat.call(controller, 'do not reroute this request');

		assert.deepStrictEqual({
			result,
			panelInputs: commandService.acceptedInputs,
		}, {
			result: false,
			panelInputs: [],
		});
	});

	test('send_to_chat with new_session routes the text to the freshly created session', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService();
		const chatService = new NewSessionChatService();
		const controller = createController(voiceClientService, undefined, commandService, undefined, undefined, undefined, chatService);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		voiceClientService.fireToolCall({
			callId: 'new-session-send',
			name: 'send_to_chat',
			args: { text: 'refactor the upload service', new_session: true },
		});
		await voiceClientService.toolResultReceived;

		assert.deepStrictEqual({
			created: chatService.created.length,
			sent: chatService.sent,
			acceptedInputs: commandService.acceptedInputs,
		}, {
			created: 1,
			sent: [{ resource: 'chat-session://new/1', message: 'refactor the upload service' }],
			acceptedInputs: [],
		});
	});

	test('send_to_chat with new_session bypasses a focused omni input', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService(true);
		const chatService = new NewSessionChatService();
		const controller = createController(voiceClientService, undefined, commandService, undefined, undefined, undefined, chatService);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		voiceClientService.fireToolCall({
			callId: 'new-session-omni-focused',
			name: 'send_to_chat',
			args: { text: 'refactor the upload service', new_session: true },
		});
		await voiceClientService.toolResultReceived;

		assert.deepStrictEqual({
			sent: chatService.sent,
			omniInputs: commandService.acceptedOmniInputs,
			panelInputs: commandService.acceptedInputs,
		}, {
			sent: [{ resource: 'chat-session://new/1', message: 'refactor the upload service' }],
			omniInputs: [],
			panelInputs: [],
		});
	});

	test('send_to_chat with new_session and no text creates and targets a session without sending', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService();
		const chatService = new NewSessionChatService();
		const controller = createController(voiceClientService, undefined, commandService, undefined, undefined, undefined, chatService);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		voiceClientService.fireToolCall({
			callId: 'new-session-empty',
			name: 'send_to_chat',
			args: { text: '', new_session: true },
		});
		await voiceClientService.toolResultReceived;

		const target = (Reflect.get(controller, '_targetSession') as { get(): URI | undefined }).get();
		assert.deepStrictEqual({
			created: chatService.created.length,
			sent: chatService.sent,
			acceptedInputs: commandService.acceptedInputs,
			target: target?.toString(),
		}, {
			created: 1,
			sent: [],
			acceptedInputs: [],
			target: 'chat-session://new/1',
		});
	});

	test('send_to_chat without new_session keeps the request in the current session', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService();
		const chatService = new NewSessionChatService();
		const controller = createController(voiceClientService, undefined, commandService, undefined, undefined, undefined, chatService);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		voiceClientService.fireToolCall({
			callId: 'same-session-send',
			name: 'send_to_chat',
			args: { text: 'refactor the upload service' },
		});
		await voiceClientService.toolResultReceived;

		assert.deepStrictEqual({
			created: chatService.created.length,
			sent: chatService.sent,
			acceptedInputs: commandService.acceptedInputs,
		}, {
			created: 0,
			sent: [],
			acceptedInputs: ['refactor the upload service'],
		});
	});

	test('send_to_chat with new_session keeps the created session alive when no pane adopts it', async () => {
		const voiceClientService = new TestVoiceClientService();
		// TestCommandService leaves `_chat.voice.switchToSession` unhandled, so
		// this is the "no chat pane picked it up" case.
		const commandService = new TestCommandService();
		const chatService = new RefCountingChatService();
		const controller = createController(voiceClientService, undefined, commandService, undefined, undefined, undefined, chatService);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		voiceClientService.fireToolCall({
			callId: 'new-session-unadopted',
			name: 'send_to_chat',
			args: { text: '', new_session: true },
		});
		await voiceClientService.toolResultReceived;
		await Promise.resolve();
		await Promise.resolve();

		const target = (Reflect.get(controller, '_targetSession') as { get(): URI | undefined }).get();
		assert.deepStrictEqual({
			target: target?.toString(),
			targetStillExists: target ? chatService.live.has(target.toString()) : false,
			retainedRefs: chatService.refCount('chat-session://new/1'),
		}, {
			target: 'chat-session://new/1',
			targetStillExists: true,
			retainedRefs: 1,
		});
	});

	test('newSessionAsTarget releases an unadopted session on retarget', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new RefCountingChatService();
		const controller = createController(voiceClientService, undefined, new TestCommandService(), undefined, undefined, undefined, chatService);

		controller.newSessionAsTarget();
		await Promise.resolve();
		await Promise.resolve();
		controller.setTargetSession(URI.parse('chat-session://existing/1'));

		assert.deepStrictEqual({
			targetStillExists: chatService.live.has('chat-session://new/1'),
			retainedRefs: chatService.refCount('chat-session://new/1'),
		}, {
			targetStillExists: false,
			retainedRefs: 0,
		});
	});

	test('newSessionAsTarget releases an unadopted session on disconnect', async () => {
		const voiceClientService = new TestVoiceClientService();
		const chatService = new RefCountingChatService();
		const controller = createController(voiceClientService, undefined, new TestCommandService(), undefined, undefined, undefined, chatService);

		controller.newSessionAsTarget();
		await Promise.resolve();
		await Promise.resolve();
		controller.disconnect();

		assert.deepStrictEqual({
			targetStillExists: chatService.live.has('chat-session://new/1'),
			retainedRefs: chatService.refCount('chat-session://new/1'),
		}, {
			targetStillExists: false,
			retainedRefs: 0,
		});
	});

	test('send_to_chat with new_session releases the reference once a pane adopts the session', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new AdoptingCommandService();
		const chatService = new RefCountingChatService();
		const controller = createController(voiceClientService, undefined, commandService, undefined, undefined, undefined, chatService);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		voiceClientService.fireToolCall({
			callId: 'new-session-adopted',
			name: 'send_to_chat',
			args: { text: '', new_session: true },
		});
		await voiceClientService.toolResultReceived;
		await Promise.resolve();
		await Promise.resolve();

		// The pane holds its own reference, so voice must not keep one too.
		assert.strictEqual(chatService.refCount('chat-session://new/1'), 0);
	});

	test('send_to_chat with new_session outranks a pinned submit session', async () => {
		const voiceClientService = new TestVoiceClientService();
		const commandService = new TestCommandService();
		const chatService = new NewSessionChatService();
		const controller = createController(voiceClientService, undefined, commandService, undefined, undefined, undefined, chatService);
		await controller.connect(mainWindow);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);
		// A focus change pinned an earlier session; an explicit "start a new
		// session" has to win over it, or the request lands in the pinned one.
		Reflect.set(controller, '_pinnedSubmitSession', URI.parse('chat-session://pinned/1'));

		voiceClientService.fireToolCall({
			callId: 'new-session-over-pin',
			name: 'send_to_chat',
			args: { text: 'refactor the upload service', new_session: true },
		});
		await voiceClientService.toolResultReceived;

		assert.deepStrictEqual({
			sent: chatService.sent,
			pinned: (Reflect.get(controller, '_pinnedSubmitSession') as URI | undefined)?.toString(),
		}, {
			sent: [{ resource: 'chat-session://new/1', message: 'refactor the upload service' }],
			pinned: undefined,
		});
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

	test('open omni keeps auto-listening when focus moves to another window', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);
		Reflect.set(controller, '_window', { document: { hasFocus: () => false } });
		controller.setOmniInputActive(true);

		const enterAutoListen = Reflect.get(controller, '_enterAutoListen') as () => void;
		enterAutoListen.call(controller);

		assert.strictEqual(mic.pttDownCalls.length, 1);
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

	test('open omni preserves a passive reply turn after window blur', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);
		controller.setOmniInputActive(true);
		Reflect.set(controller, '_pttCurrentTurnId', 'omni-passive-turn');
		Reflect.set(controller, '_pttCurrentTurnPassive', true);
		Reflect.set(controller, '_pttHeld', true);

		(Reflect.get(controller, '_onWindowBlur') as () => void).call(controller);

		assert.deepStrictEqual({
			abortCalls: mic.abortCalls,
			pttHeld: Reflect.get(controller, '_pttHeld'),
		}, {
			abortCalls: 0,
			pttHeld: true,
		});
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

	test('a hands-free open-mic turn is ended on the wire before playback', () => {
		const voiceClientService = new TestVoiceClientService();
		const mic = new RecordingMicCaptureService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, mic);
		(Reflect.get(controller, '_isConnected') as { set(value: boolean, tx: undefined): void }).set(true, undefined);

		Reflect.set(controller, '_pttCurrentTurnId', 'passive-turn');
		Reflect.set(controller, '_pttCurrentTurnPassive', false);
		Reflect.set(controller, '_pttHeld', true);
		Reflect.set(controller, '_pttToggleMode', true);
		Reflect.set(controller, '_speechDetectedInTurn', true);

		(Reflect.get(controller, '_prepareForPlayback') as () => void).call(controller);

		assert.strictEqual(mic.abortCalls, 1);
		assert.strictEqual(voiceClientService.pttEndCalls, 1);
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

	test('names the cause when the account is not permitted', () => {
		const notificationService = new VoiceTestNotificationService();
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, notificationService);
		const handleFatalDisconnect = Reflect.get(controller, '_handleFatalDisconnect') as (event: IVoiceFatalDisconnect) => void;

		handleFatalDisconnect.call(controller, { code: 4003, reason: 'not allowed', kind: 'fatal' });

		assert.ok(controller.statusText.get().includes('access'), controller.statusText.get());
		assert.strictEqual(controller.voiceState.get(), 'error');
		assert.strictEqual(notificationService.prompts.length, 1);
		assert.strictEqual(notificationService.prompts[0].choices.length, 0);
	});

	test('treats an idle timeout as expected rather than an error', () => {
		const notificationService = new VoiceTestNotificationService();
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, notificationService);
		const handleFatalDisconnect = Reflect.get(controller, '_handleFatalDisconnect') as (event: IVoiceFatalDisconnect) => void;

		handleFatalDisconnect.call(controller, { code: 1001, reason: 'Session idle timeout', kind: 'expected' });

		assert.strictEqual(controller.voiceState.get(), 'idle');
		assert.strictEqual(notificationService.prompts.length, 0, 'an expected end of session must not interrupt with a toast');
	});

	test('falls back to the server reason for a code this build does not know', () => {
		const controller = createController(new TestVoiceClientService());
		const handleFatalDisconnect = Reflect.get(controller, '_handleFatalDisconnect') as (event: IVoiceFatalDisconnect) => void;

		handleFatalDisconnect.call(controller, { code: 4002, reason: 'Backend says hello', kind: 'fatal' });

		assert.strictEqual(controller.statusText.get(), 'Backend says hello');
	});

	test('never leaves Reconnecting displayed after a terminal close', () => {
		const controller = createController(new TestVoiceClientService());
		const handleFatalDisconnect = Reflect.get(controller, '_handleFatalDisconnect') as (event: IVoiceFatalDisconnect) => void;

		handleFatalDisconnect.call(controller, { code: 1000, reason: '', kind: 'expected' });

		assert.ok(!controller.statusText.get().startsWith('Reconnecting'), controller.statusText.get());
		assert.strictEqual(controller.isReconnecting.get(), false);
	});

	test('does not offer an action when no configurable backend URL is available', () => {
		const notificationService = new VoiceTestNotificationService();
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, notificationService);
		const handleFatalDisconnect = Reflect.get(controller, '_handleFatalDisconnect') as (event: IVoiceFatalDisconnect) => void;

		handleFatalDisconnect.call(controller, { code: 0, reason: '', kind: 'fatal', clientSide: true });

		assert.strictEqual(notificationService.prompts.length, 1);
		assert.strictEqual(notificationService.prompts[0].choices.length, 0);
	});

	test('an immediate fatal close after open does not activate the microphone', () => {
		// Auto-listen goes through pttDown, so a startCapture counter would pass
		// even if it fired.
		const micCaptureService = new RecordingMicCaptureService();
		const voiceClientService = new TestVoiceClientService();
		const controller = createController(voiceClientService, undefined, undefined, undefined, micCaptureService);
		const handleFatalDisconnect = Reflect.get(controller, '_handleFatalDisconnect') as (event: IVoiceFatalDisconnect) => void;

		handleFatalDisconnect.call(controller, { code: 4001, reason: 'Sign in', kind: 'fatal' });
		clock.tick(2000);

		assert.strictEqual(micCaptureService.pttDownCalls.length, 0, 'auto-listen must not fire after a terminal close');
	});

	test('the connect watchdog does not tear down a scheduled reconnect', () => {
		// A reconnect sleeps between attempts, so a gap longer than the watchdog
		// timeout must not be mistaken for a hung handshake. Before this guard the
		// first slow retry was killed ~10s in and reported as unreachable.
		const notificationService = new VoiceTestNotificationService();
		const controller = createController(new TestVoiceClientService(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, notificationService);
		const armWatchdog = Reflect.get(controller, '_armConnectWatchdog') as () => void;

		Reflect.set(controller, '_isConnecting', observableValue('isConnecting', false));
		Reflect.set(controller, '_isReconnecting', observableValue('isReconnecting', true));
		armWatchdog.call(controller);
		clock.tick(11_000);

		assert.strictEqual(notificationService.notifications.length, 0, 'a reconnect must not raise the unreachable toast');
	});

	test('an open socket is not reported as connected until the backend acks', () => {
		// A rejected connect is accepted before it is closed so the close frame can
		// carry a reason, so `onopen` fires for doomed sockets too. Committing
		// connected on open flashed a live UI on every reconnect attempt.
		const client = new TestVoiceClientService();
		const controller = createController(client);
		const commitConnected = Reflect.get(controller, '_commitConnected') as (viaFallback?: boolean) => void;

		Reflect.set(client, 'connected', false);
		commitConnected.call(controller);
		assert.strictEqual(controller.isConnected.get(), false, 'a closed socket must never commit connected');

		Reflect.set(client, 'connected', true);
		commitConnected.call(controller);
		assert.strictEqual(controller.isConnected.get(), true, 'the ack must promote the socket to a live session');
	});

	test('a known transient code keeps its localized message despite a backend reason', () => {
		// Every transient close carries a reason, so resolving the raw text first
		// meant 4029/4500/4503 never reached the strings the registry defines.
		const controller = createController(new TestVoiceClientService());
		const resolve = Reflect.get(controller, '_reconnectingMessage') as (code: number, reason: string) => string;

		const busy = resolve.call(controller, 4029, 'Voice service is at capacity, try again shortly');
		assert.ok(busy.includes('at capacity'), busy);
		assert.ok(!busy.includes('try again shortly'), 'the localized clause must win over the backend reason');

		const unknown = resolve.call(controller, 4321, 'a code the client has never heard of');
		assert.ok(unknown.includes('a code the client has never heard of'), 'an unknown code still falls back to the reason');
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
			onDidRemoveWidget: Event.None,
			onDidChangeFocusedSession: Event.None,
			onDidChangeWidgetVisibility: Event.None,
			getAllWidgets: () => [],
		});
		const chatEntitlementService = new TestChatEntitlementService();
		chatEntitlementService.entitlement = ChatEntitlement.Pro;
		instantiationService.stub(IChatEntitlementService, chatEntitlementService);
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
