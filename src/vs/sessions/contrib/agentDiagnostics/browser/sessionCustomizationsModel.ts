/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { type IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { isCustomizationEnabled } from '../../../../platform/agentHost/common/customizationEnablement.js';
import { ActionType, type StateAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { McpServerStatus, type McpServerState } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { CustomizationLoadStatus, CustomizationType, DEFAULT_CHAT_ID, getSessionChatResource, ResponsePartKind, StateComponents, ToolCallContributorKind, type ChatState, type ChildCustomization, type Customization, type DirectoryCustomization, type McpServerCustomization, type PluginCustomization, type ResponsePart, type SessionState, type StringOrMarkdown } from '../../../../platform/agentHost/common/state/sessionState.js';
import { type IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { type IOTelDiagnosticsMcpLifecycleEvent, IOTelDiagnosticsService, parseOTelMcpLifecycleEvent } from '../../../../platform/otel/common/otelDiagnosticsService.js';
import { ChatDebugHookResult, type IChatDebugEvent, type IChatDebugEventHookContent, IChatDebugService } from '../../../../workbench/contrib/chat/common/chatDebugService.js';
import { isAgentHostProvider, type IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { type ISession } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';

export const enum SessionCustomizationSection {
	Plugins = 'plugins',
	Agents = 'agents',
	Skills = 'skills',
	Instructions = 'instructions',
	Hooks = 'hooks',
	McpServers = 'mcpServers',
}

export type SessionCustomizationStatus = 'used' | 'invoked' | 'loaded' | 'disabled' | 'loading' | 'authenticationRequired' | 'degraded' | 'failed';

export interface ISessionCustomizationEvidence {
	readonly chatResource: URI;
	readonly chatTitle: string;
	readonly turnId: string;
	readonly kind: 'agent' | 'skill' | 'mcp';
}

export type SessionCustomizationLifecycleKind =
	| 'loaded'
	| 'startRequested'
	| 'starting'
	| 'ready'
	| 'authRequired'
	| 'failed'
	| 'stopRequested'
	| 'stopped'
	| 'hookRunning'
	| 'hookSucceeded'
	| 'hookWarning'
	| 'hookFailed';

export interface ISessionCustomizationLifecycleEntry {
	readonly id: string;
	readonly timestamp: number;
	readonly kind: SessionCustomizationLifecycleKind;
	readonly title: string | undefined;
	readonly detail: string | undefined;
	readonly duration: number | undefined;
	readonly command: string | undefined;
	readonly exitCode: number | undefined;
	readonly input: string | undefined;
	readonly output: string | undefined;
	readonly scopes: readonly string[];
	readonly resource: string | undefined;
	readonly chatResource: URI | undefined;
	readonly debugEventId: string | undefined;
	readonly parentDebugEventId: string | undefined;
	readonly sourceUri: URI | undefined;
	readonly traceId: string | undefined;
	readonly spanId: string | undefined;
}

export interface ISessionMcpLifecycleAttempt {
	readonly id: string;
	readonly events: readonly ISessionCustomizationLifecycleEntry[];
	readonly state: SessionCustomizationLifecycleKind;
	readonly duration: number | undefined;
	readonly problem: ISessionCustomizationLifecycleEntry | undefined;
}

export interface ISessionMcpLifecycleSummary {
	readonly currentState: SessionCustomizationLifecycleKind;
	readonly attempts: readonly ISessionMcpLifecycleAttempt[];
	readonly successfulAttempts: number;
	readonly failedAttempts: number;
	readonly lastStartupDuration: number | undefined;
	readonly readySince: number | undefined;
	readonly currentProblem: ISessionCustomizationLifecycleEntry | undefined;
}

export interface ISessionHookInvocationSummary {
	readonly status: 'invoked' | 'notInvoked' | 'noToolCalls' | 'unknown';
	readonly toolCallCount: number;
	readonly invocationCount: number;
	readonly lastInvocationAt: number | undefined;
}

export const enum SessionCustomizationMetadataKind {
	Version = 'version',
	Model = 'model',
	Tools = 'tools',
	ModelInvocation = 'modelInvocation',
	UserInvocation = 'userInvocation',
	AlwaysApply = 'alwaysApply',
	Globs = 'globs',
	McpState = 'mcpState',
}

export interface ISessionCustomizationMetadata {
	readonly kind: SessionCustomizationMetadataKind;
	readonly value: string | boolean | readonly string[];
}

export interface ISessionCustomizationItem {
	readonly id: string;
	readonly section: SessionCustomizationSection;
	readonly type: CustomizationType;
	readonly name: string;
	readonly uri: string;
	readonly openUri: string | undefined;
	readonly parentName: string | undefined;
	readonly parentUri: string | undefined;
	readonly description: string | undefined;
	readonly status: SessionCustomizationStatus;
	readonly detail: string | undefined;
	readonly evidence: readonly ISessionCustomizationEvidence[];
	readonly metadata: readonly ISessionCustomizationMetadata[];
	readonly lifecycle: readonly ISessionCustomizationLifecycleEntry[];
}

export interface ISessionCustomizationGroup {
	readonly section: SessionCustomizationSection;
	readonly items: readonly ISessionCustomizationItem[];
	readonly lifecycle: readonly ISessionCustomizationLifecycleEntry[];
	readonly hookSummary: ISessionHookInvocationSummary | undefined;
}

export interface ISessionCustomizationsState {
	readonly sessionResource: URI;
	readonly supported: boolean;
	readonly groups: readonly ISessionCustomizationGroup[];
}

const sectionOrder = [
	SessionCustomizationSection.Plugins,
	SessionCustomizationSection.Agents,
	SessionCustomizationSection.Skills,
	SessionCustomizationSection.Instructions,
	SessionCustomizationSection.Hooks,
	SessionCustomizationSection.McpServers,
] as const;

export class SessionCustomizationsModel extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => this.refresh(), 100));
	private readonly hookDebugRefreshScheduler = this._register(new RunOnceScheduler(() => this.refreshHookDebugEvents(), 750));
	private readonly mcpLifecycleRefreshScheduler = this._register(new RunOnceScheduler(() => this.refreshMcpLifecycleEvents(), 750));
	private readonly providerListener = this._register(new MutableDisposable());
	private readonly sessionSubscription = this._register(new MutableDisposable<DisposableStore>());
	private readonly focusedChatSubscription = this._register(new MutableDisposable<DisposableStore>());
	private readonly usageBySession = new Map<string, Map<string, ISessionCustomizationEvidence[]>>();
	private readonly lifecycleBySession = new Map<string, Map<string, ISessionCustomizationLifecycleEntry[]>>();
	private readonly hookLifecycleBySession = new Map<string, ISessionCustomizationLifecycleEntry[]>();
	private readonly resolvingHookEvents = new Set<string>();
	private readonly hookResolutionSequencer = new Sequencer();
	private session: ISession | undefined;
	private provider: IAgentHostSessionsProvider | undefined;
	private focusedChatResource: URI | undefined;
	private active = false;
	private backendSessionResource: URI | undefined;
	private sessionConnection: IAgentConnection | undefined;
	private sessionSubscriptionValue: IAgentSubscription<SessionState> | undefined;
	private focusedBackendChatResource: URI | undefined;
	private focusedChatSubscriptionValue: IAgentSubscription<ChatState> | undefined;
	private refreshingMcpLifecycle = false;
	private _state: ISessionCustomizationsState | undefined;

	get state(): ISessionCustomizationsState | undefined {
		return this._state;
	}

	constructor(
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IChatDebugService private readonly chatDebugService: IChatDebugService,
		@ILogService private readonly logService: ILogService,
		@IOTelDiagnosticsService private readonly otelDiagnosticsService: IOTelDiagnosticsService,
	) {
		super();
		this._register(this.chatDebugService.onDidAddEvent(event => {
			if (this.active && isEqual(event.sessionResource, this.focusedChatResource)) {
				this.captureHookEvent(event);
			}
		}));
		this._register(otelDiagnosticsService.onDidChange(() => {
			if (this.active) {
				this.hookDebugRefreshScheduler.schedule();
				this.mcpLifecycleRefreshScheduler.schedule();
			}
		}));
	}

	setActive(active: boolean): void {
		if (this.active === active) {
			return;
		}
		this.active = active;
		if (active) {
			this.updateSessionSubscription();
			this.updateFocusedChatSubscription();
			this.captureExistingHookEvents();
			this.mcpLifecycleRefreshScheduler.schedule();
		} else {
			this.hookDebugRefreshScheduler.cancel();
			this.mcpLifecycleRefreshScheduler.cancel();
			this.clearSessionSubscription();
		}
		this.refresh();
	}

	setSession(session: ISession | undefined, focusedChatResource: URI | undefined): void {
		if (this.session?.sessionId === session?.sessionId
			&& this.session?.providerId === session?.providerId
			&& isEqual(this.focusedChatResource, focusedChatResource)) {
			return;
		}
		this.session = session;
		this.focusedChatResource = focusedChatResource;
		this.provider = undefined;
		this.providerListener.clear();
		this.clearSessionSubscription();

		if (!session) {
			this._state = undefined;
			this._onDidChange.fire();
			return;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			this._state = {
				sessionResource: session.resource,
				supported: false,
				groups: createEmptyGroups(),
			};
			this._onDidChange.fire();
			return;
		}

		this.provider = provider;
		this.providerListener.value = provider.onDidChangeCustomizations(() => {
			if (this.active) {
				this.updateSessionSubscription();
				this.updateFocusedChatSubscription();
				this.mcpLifecycleRefreshScheduler.schedule();
			}
			this.scheduleRefresh();
		});
		if (this.active) {
			this.updateSessionSubscription();
			this.updateFocusedChatSubscription();
		}
		this.refresh();
	}

	private updateSessionSubscription(): void {
		const session = this.session;
		const provider = this.provider;
		if (!this.active || !session || !provider) {
			return;
		}
		const connection = provider.getDiagnosticsConnection();
		const backendSessionResource = provider.mapAgentHostResource(session.resource);
		if (!connection) {
			return;
		}
		if (isEqual(this.backendSessionResource, backendSessionResource) && this.sessionConnection === connection) {
			return;
		}
		this.clearSessionSubscription();
		const store = new DisposableStore();
		const reference = store.add(connection.getSubscription(StateComponents.Session, backendSessionResource, 'SessionCustomizationsModel.session'));
		store.add(reference.object.onDidApplyAction(envelope => {
			this.captureMcpLifecycleAction(session.sessionId, envelope.serverSeq, envelope.action);
		}));
		store.add(reference.object.onDidChange(() => {
			this.updateFocusedChatSubscription();
			this.scheduleRefresh();
		}));
		if (reference.object.onDidError) {
			store.add(reference.object.onDidError(() => this.scheduleRefresh()));
		}
		this.backendSessionResource = backendSessionResource;
		this.sessionConnection = connection;
		this.sessionSubscriptionValue = reference.object;
		this.sessionSubscription.value = store;
	}

	private updateFocusedChatSubscription(): void {
		const focusedChatResource = this.focusedChatResource;
		const sessionState = this.sessionSubscriptionValue?.value;
		const connection = this.sessionConnection;
		if (!focusedChatResource || !sessionState || sessionState instanceof Error || !connection) {
			return;
		}
		const backendChatResource = getSessionChatResource(sessionState, focusedChatResource.fragment || DEFAULT_CHAT_ID);
		if (!backendChatResource) {
			return;
		}
		const resource = URI.parse(backendChatResource.toString());
		if (isEqual(this.focusedBackendChatResource, resource)) {
			return;
		}
		this.clearFocusedChatSubscription();
		const subscription = connection.getSubscriptionUnmanaged(StateComponents.Chat, resource);
		if (!subscription) {
			return;
		}
		const store = new DisposableStore();
		store.add(subscription.onDidChange(() => this.scheduleRefresh()));
		if (subscription.onDidError) {
			store.add(subscription.onDidError(() => this.scheduleRefresh()));
		}
		this.focusedBackendChatResource = resource;
		this.focusedChatSubscriptionValue = subscription;
		this.focusedChatSubscription.value = store;
	}

	private clearSessionSubscription(): void {
		this.clearFocusedChatSubscription();
		this.sessionSubscription.clear();
		this.backendSessionResource = undefined;
		this.sessionConnection = undefined;
		this.sessionSubscriptionValue = undefined;
	}

	private clearFocusedChatSubscription(): void {
		this.focusedChatSubscription.clear();
		this.focusedBackendChatResource = undefined;
		this.focusedChatSubscriptionValue = undefined;
	}

	private scheduleRefresh(): void {
		if (!this.refreshScheduler.isScheduled()) {
			this.refreshScheduler.schedule();
		}
	}

	private refreshHookDebugEvents(): void {
		const focusedChatResource = this.focusedChatResource;
		if (!this.active || !focusedChatResource) {
			return;
		}
		void this.chatDebugService.invokeProviders(focusedChatResource).catch(error => {
			this.logService.error('[SessionCustomizationsModel] Failed to refresh hook debug events', error);
		});
	}

	private refreshMcpLifecycleEvents(): void {
		const session = this.session;
		const focusedChatResource = this.focusedChatResource;
		if (!this.active || !session || !focusedChatResource) {
			return;
		}
		if (this.refreshingMcpLifecycle) {
			this.mcpLifecycleRefreshScheduler.schedule();
			return;
		}
		this.refreshingMcpLifecycle = true;
		void this.otelDiagnosticsService.getSessionLogs(session.resource.toString()).then(logs => {
			if (this.session?.sessionId !== session.sessionId || !isEqual(this.focusedChatResource, focusedChatResource)) {
				return;
			}
			const sessionState = this.sessionSubscriptionValue?.value;
			const customizations = sessionState && !(sessionState instanceof Error)
				? sessionState.customizations ?? []
				: this.provider?.getCustomizations(session.sessionId) ?? [];
			const mcpServersByName = new Map(collectMcpServers(customizations).map(server => [server.name, server]));
			const lifecycleEvents = logs.flatMap(log => {
				const event = parseOTelMcpLifecycleEvent(log);
				return event ? [event] : [];
			});
			let changed = false;
			const clearedFallbacks = new Set<string>();
			for (const event of lifecycleEvents) {
				const server = mcpServersByName.get(event.serverName);
				const kind = mcpLifecycleKindFromOTel(event.state);
				if (!server || !kind) {
					continue;
				}
				if (!clearedFallbacks.has(server.id)) {
					changed = this.removeFallbackMcpLifecycle(session.sessionId, server.id) || changed;
					clearedFallbacks.add(server.id);
				}
				changed = this.recordCustomizationLifecycle(
					session.sessionId,
					server.id,
					mcpLifecycleEntryFromOTel(event, kind, focusedChatResource)
				) || changed;
			}
			if (changed) {
				this.scheduleRefresh();
			}
		}).catch(error => {
			this.logService.error('[SessionCustomizationsModel] Failed to refresh MCP lifecycle events', error);
		}).finally(() => {
			this.refreshingMcpLifecycle = false;
		});
	}

	private refresh(): void {
		const session = this.session;
		const provider = this.provider;
		if (!session || !provider) {
			return;
		}
		const sessionState = this.sessionSubscriptionValue?.value;
		const customizations = sessionState && !(sessionState instanceof Error)
			? sessionState.customizations ?? []
			: provider.getCustomizations(session.sessionId);
		const observedUsage = collectUsage(customizations, this.getChatStates());
		const usage = mergeUsage(this.usageBySession.get(session.sessionId), observedUsage);
		this.usageBySession.set(session.sessionId, usage);
		this.captureCurrentLifecycle(session.sessionId, customizations);
		const lifecycle = this.lifecycleBySession.get(session.sessionId) ?? new Map();
		const hookLifecycle = this.hookLifecycleBySession.get(session.sessionId) ?? [];
		this._state = {
			sessionResource: session.resource,
			supported: true,
			groups: groupCustomizations(
				customizations,
				usage,
				lifecycle,
				hookLifecycle,
				summarizeLatestTurnHooks(this.chatDebugService.getEvents(this.focusedChatResource), hookLifecycle)
			),
		};
		this._onDidChange.fire();
	}

	private getChatStates(): readonly ChatState[] {
		const state = this.focusedChatSubscriptionValue?.value;
		return state && !(state instanceof Error) ? [state] : [];
	}

	private captureCurrentLifecycle(sessionId: string, customizations: readonly Customization[]): void {
		for (const customization of customizations) {
			if (customization.type === CustomizationType.Plugin || customization.type === CustomizationType.Directory) {
				for (const child of customization.children ?? []) {
					if (child.type === CustomizationType.McpServer) {
						this.recordCustomizationLifecycle(sessionId, child.id, lifecycleEntry(`loaded:${child.id}`, 'loaded'));
						this.recordMcpState(sessionId, child.id, child.state, `snapshot:${child.id}:${child.state.kind}:${Date.now()}`);
					} else if (child.type === CustomizationType.Hook) {
						this.recordCustomizationLifecycle(sessionId, child.id, lifecycleEntry(`loaded:${child.id}`, 'loaded'));
					}
				}
			} else {
				this.recordCustomizationLifecycle(sessionId, customization.id, lifecycleEntry(`loaded:${customization.id}`, 'loaded'));
				this.recordMcpState(sessionId, customization.id, customization.state, `snapshot:${customization.id}:${customization.state.kind}:${Date.now()}`);
			}
		}
	}

	private captureMcpLifecycleAction(sessionId: string, serverSequence: number, action: StateAction): void {
		switch (action.type) {
			case ActionType.SessionMcpServerStartRequested:
				this.recordCustomizationLifecycle(sessionId, action.id, lifecycleEntry(`action:${serverSequence}`, 'startRequested'));
				this.scheduleRefresh();
				break;
			case ActionType.SessionMcpServerStopRequested:
				this.recordCustomizationLifecycle(sessionId, action.id, lifecycleEntry(`action:${serverSequence}`, 'stopRequested'));
				this.scheduleRefresh();
				break;
			case ActionType.SessionMcpServerStateChanged:
				this.recordMcpState(sessionId, action.id, action.state, `action:${serverSequence}`);
				this.scheduleRefresh();
				break;
		}
	}

	private recordMcpState(sessionId: string, customizationId: string, state: McpServerState, id: string): void {
		const lifecycle = mcpLifecycleEntry(id, state);
		const current = this.lifecycleBySession.get(sessionId)?.get(customizationId);
		const last = current?.at(-1);
		if (id.startsWith('snapshot:') && last && last.kind === lifecycle.kind && last.detail === lifecycle.detail) {
			return;
		}
		this.recordCustomizationLifecycle(sessionId, customizationId, lifecycle);
	}

	private recordCustomizationLifecycle(sessionId: string, customizationId: string, entry: ISessionCustomizationLifecycleEntry): boolean {
		let lifecycleByCustomization = this.lifecycleBySession.get(sessionId);
		if (!lifecycleByCustomization) {
			lifecycleByCustomization = new Map();
			this.lifecycleBySession.set(sessionId, lifecycleByCustomization);
		}
		const lifecycle = lifecycleByCustomization.get(customizationId) ?? [];
		if (entry.kind === 'loaded' && lifecycle.some(candidate => candidate.kind === 'loaded')) {
			return false;
		}
		if (!lifecycle.some(candidate => candidate.id === entry.id)) {
			lifecycle.push(entry);
			lifecycle.sort((a, b) => a.timestamp - b.timestamp);
			lifecycleByCustomization.set(customizationId, lifecycle);
			return true;
		}
		return false;
	}

	private removeFallbackMcpLifecycle(sessionId: string, customizationId: string): boolean {
		const lifecycleByCustomization = this.lifecycleBySession.get(sessionId);
		const lifecycle = lifecycleByCustomization?.get(customizationId);
		if (!lifecycle) {
			return false;
		}
		const filtered = lifecycle.filter(entry => !entry.id.startsWith('loaded:') && !entry.id.startsWith('snapshot:'));
		if (filtered.length === lifecycle.length) {
			return false;
		}
		lifecycleByCustomization?.set(customizationId, filtered);
		return true;
	}

	private captureExistingHookEvents(): void {
		const focusedChatResource = this.focusedChatResource;
		if (!focusedChatResource) {
			return;
		}
		for (const event of this.chatDebugService.getEvents(focusedChatResource)
			.filter(event => event.kind === 'generic' && event.category === 'hook')
			.slice(-30)) {
			this.captureHookEvent(event);
		}
	}

	private captureHookEvent(event: IChatDebugEvent): void {
		const session = this.session;
		const eventId = event.id;
		if (!session || event.kind !== 'generic' || event.category !== 'hook' || !eventId) {
			return;
		}
		const key = `${event.sessionResource.toString()}:${eventId}`;
		const lifecycle = this.hookLifecycleBySession.get(session.sessionId) ?? [];
		if (this.resolvingHookEvents.has(key) || lifecycle.some(candidate => candidate.id === key)) {
			return;
		}
		this.resolvingHookEvents.add(key);
		void this.hookResolutionSequencer.queue(() => this.chatDebugService.resolveEvent(eventId)).then(content => {
			if (content?.kind !== 'hook') {
				return;
			}
			lifecycle.push(hookLifecycleEntry(key, event, content));
			this.hookLifecycleBySession.set(session.sessionId, lifecycle);
			if (this.session?.sessionId === session.sessionId) {
				this.scheduleRefresh();
			}
		}).catch(error => {
			this.logService.error('[SessionCustomizationsModel] Failed to resolve hook lifecycle event', error);
		}).finally(() => {
			this.resolvingHookEvents.delete(key);
		});
	}
}

function lifecycleEntry(
	id: string,
	kind: SessionCustomizationLifecycleKind,
	options?: Partial<Omit<ISessionCustomizationLifecycleEntry, 'id' | 'kind' | 'timestamp'>>,
): ISessionCustomizationLifecycleEntry {
	return {
		id,
		timestamp: Date.now(),
		kind,
		title: options?.title,
		detail: options?.detail,
		duration: options?.duration,
		command: options?.command,
		exitCode: options?.exitCode,
		input: options?.input,
		output: options?.output,
		scopes: options?.scopes ?? [],
		resource: options?.resource,
		chatResource: options?.chatResource,
		debugEventId: options?.debugEventId,
		parentDebugEventId: options?.parentDebugEventId,
		sourceUri: options?.sourceUri,
		traceId: options?.traceId,
		spanId: options?.spanId,
	};
}

function mcpLifecycleEntry(id: string, state: McpServerState): ISessionCustomizationLifecycleEntry {
	switch (state.kind) {
		case McpServerStatus.Starting:
			return lifecycleEntry(id, 'starting');
		case McpServerStatus.Ready:
			return lifecycleEntry(id, 'ready');
		case McpServerStatus.AuthRequired:
			return lifecycleEntry(id, 'authRequired', {
				detail: state.description,
				scopes: state.requiredScopes ?? [],
				resource: state.resource.resource,
			});
		case McpServerStatus.Error:
			return lifecycleEntry(id, 'failed', { detail: state.error.message });
		case McpServerStatus.Stopped:
			return lifecycleEntry(id, 'stopped');
	}
}

function collectMcpServers(customizations: readonly Customization[]): McpServerCustomization[] {
	const result: McpServerCustomization[] = [];
	for (const customization of customizations) {
		if (customization.type === CustomizationType.McpServer) {
			result.push(customization);
		} else if (customization.type === CustomizationType.Plugin || customization.type === CustomizationType.Directory) {
			result.push(...(customization.children ?? []).filter(child => child.type === CustomizationType.McpServer));
		}
	}
	return result;
}

function mcpLifecycleKindFromOTel(state: string): SessionCustomizationLifecycleKind | undefined {
	switch (state) {
		case 'discovered':
			return 'loaded';
		case 'starting':
		case 'pending':
			return 'starting';
		case 'initialized':
		case 'connected':
		case 'ready':
			return 'ready';
		case 'authRequired':
		case 'auth_required':
			return 'authRequired';
		case 'error':
			return 'failed';
		case 'stopped':
		case 'disabled':
			return 'stopped';
		default:
			return undefined;
	}
}

function mcpLifecycleEntryFromOTel(
	event: IOTelDiagnosticsMcpLifecycleEvent,
	kind: SessionCustomizationLifecycleKind,
	chatResource: URI,
): ISessionCustomizationLifecycleEntry {
	const entry = lifecycleEntry(event.id, kind, {
		detail: event.error,
		chatResource,
		debugEventId: event.id,
		traceId: event.traceId,
		spanId: event.spanId,
	});
	return { ...entry, timestamp: event.timestamp };
}

function hookLifecycleEntry(id: string, event: IChatDebugEvent, content: IChatDebugEventHookContent): ISessionCustomizationLifecycleEntry {
	const entry = lifecycleEntry(id, hookLifecycleKind(content.result), {
		title: content.hookType,
		detail: content.errorMessage,
		duration: content.durationInMillis,
		command: content.command,
		exitCode: content.exitCode,
		input: content.input,
		output: content.output,
		chatResource: event.sessionResource,
		debugEventId: event.id,
		parentDebugEventId: event.parentEventId,
		sourceUri: content.sourceUri,
	});
	return { ...entry, timestamp: event.created.getTime() };
}

function hookLifecycleKind(result: ChatDebugHookResult | undefined): SessionCustomizationLifecycleKind {
	switch (result) {
		case ChatDebugHookResult.Success:
			return 'hookSucceeded';
		case ChatDebugHookResult.NonBlockingError:
			return 'hookWarning';
		case ChatDebugHookResult.Error:
			return 'hookFailed';
		case undefined:
			return 'hookRunning';
		default:
			return 'hookRunning';
	}
}

export function summarizeMcpLifecycle(entries: readonly ISessionCustomizationLifecycleEntry[]): ISessionMcpLifecycleSummary {
	const attempts: { id: string; events: ISessionCustomizationLifecycleEntry[] }[] = [];
	let current: { id: string; events: ISessionCustomizationLifecycleEntry[] } | undefined;
	for (const entry of entries) {
		const previousState = current?.events.at(-1)?.kind;
		const previousAttemptComplete = previousState === 'ready' || previousState === 'failed' || previousState === 'stopped';
		const startsAttempt = entry.kind === 'loaded'
			? !current || previousAttemptComplete
			: entry.kind === 'startRequested'
				? !current || (previousState !== 'loaded' && previousState !== 'startRequested' && previousState !== 'starting' && previousState !== 'authRequired')
				: entry.kind === 'starting'
					? !current || previousAttemptComplete
					: !current;
		if (startsAttempt) {
			current = { id: entry.id, events: [] };
			attempts.push(current);
		}
		current?.events.push(entry);
	}
	const summarizedAttempts = attempts.map((attempt): ISessionMcpLifecycleAttempt => {
		const state = attempt.events.at(-1)?.kind ?? 'loaded';
		const startedAt = attempt.events.find(entry => entry.kind === 'starting' || entry.kind === 'startRequested' || entry.kind === 'loaded')?.timestamp;
		const completedAt = attempt.events.find(entry =>
			entry.kind === 'ready' || entry.kind === 'authRequired' || entry.kind === 'failed' || entry.kind === 'stopped'
		)?.timestamp;
		return {
			id: attempt.id,
			events: attempt.events,
			state,
			duration: startedAt !== undefined && completedAt !== undefined ? Math.max(0, completedAt - startedAt) : undefined,
			problem: [...attempt.events].reverse().find(entry => entry.kind === 'failed' || entry.kind === 'authRequired'),
		};
	});
	const currentAttempt = summarizedAttempts.at(-1);
	const currentState = currentAttempt?.state ?? 'loaded';
	return {
		currentState,
		attempts: summarizedAttempts,
		successfulAttempts: summarizedAttempts.filter(attempt => attempt.events.some(entry => entry.kind === 'ready')).length,
		failedAttempts: summarizedAttempts.filter(attempt => attempt.events.some(entry => entry.kind === 'failed')).length,
		lastStartupDuration: [...summarizedAttempts].reverse().find(attempt => attempt.duration !== undefined)?.duration,
		readySince: currentState === 'ready'
			? [...(currentAttempt?.events ?? [])].reverse().find(entry => entry.kind === 'ready')?.timestamp
			: undefined,
		currentProblem: currentState === 'failed' || currentState === 'authRequired' ? currentAttempt?.problem : undefined,
	};
}

function summarizeLatestTurnHooks(events: readonly IChatDebugEvent[], lifecycle: readonly ISessionCustomizationLifecycleEntry[]): ISessionHookInvocationSummary {
	const latestUserMessage = events.filter(event => event.kind === 'userMessage').at(-1);
	const lastInvocationAt = lifecycle.reduce<number | undefined>((latest, entry) =>
		entry.kind.startsWith('hook') && (latest === undefined || entry.timestamp > latest) ? entry.timestamp : latest
		, undefined);
	if (!latestUserMessage) {
		return { status: 'unknown', toolCallCount: 0, invocationCount: 0, lastInvocationAt };
	}
	const turnStart = latestUserMessage.created.getTime();
	const toolCallCount = events.filter(event => event.kind === 'toolCall' && event.created.getTime() >= turnStart).length;
	const invocationCount = lifecycle.filter(entry => entry.kind.startsWith('hook') && entry.timestamp >= turnStart).length;
	return {
		status: invocationCount > 0 ? 'invoked' : toolCallCount > 0 ? 'notInvoked' : 'noToolCalls',
		toolCallCount,
		invocationCount,
		lastInvocationAt,
	};
}

function mergeUsage(
	current: ReadonlyMap<string, readonly ISessionCustomizationEvidence[]> | undefined,
	observed: ReadonlyMap<string, readonly ISessionCustomizationEvidence[]>,
): Map<string, ISessionCustomizationEvidence[]> {
	const result = new Map<string, ISessionCustomizationEvidence[]>();
	for (const [id, evidence] of current ?? []) {
		result.set(id, [...evidence]);
	}
	for (const [id, evidence] of observed) {
		const merged = result.get(id) ?? [];
		for (const entry of evidence) {
			if (!merged.some(candidate => candidate.chatResource.toString() === entry.chatResource.toString() && candidate.turnId === entry.turnId && candidate.kind === entry.kind)) {
				merged.push(entry);
			}
		}
		result.set(id, merged);
	}
	return result;
}

function createEmptyGroups(): ISessionCustomizationGroup[] {
	return sectionOrder.map(section => ({ section, items: [], lifecycle: [], hookSummary: undefined }));
}

function groupCustomizations(
	customizations: readonly Customization[],
	usage: ReadonlyMap<string, readonly ISessionCustomizationEvidence[]>,
	lifecycle: ReadonlyMap<string, readonly ISessionCustomizationLifecycleEntry[]>,
	hookLifecycle: readonly ISessionCustomizationLifecycleEntry[],
	hookSummary: ISessionHookInvocationSummary,
): ISessionCustomizationGroup[] {
	const groups = new Map<SessionCustomizationSection, ISessionCustomizationItem[]>(
		sectionOrder.map(section => [section, []])
	);
	const hookCount = customizations.reduce((count, customization) => {
		if (customization.type === CustomizationType.Plugin || customization.type === CustomizationType.Directory) {
			return count + (customization.children ?? []).filter(child => child.type === CustomizationType.Hook).length;
		}
		return count;
	}, 0);
	for (const customization of customizations) {
		if (customization.type === CustomizationType.Plugin) {
			const childEvidence = (customization.children ?? []).flatMap(child => usage.get(child.id) ?? []);
			groups.get(SessionCustomizationSection.Plugins)?.push(toPluginItem(customization, childEvidence, lifecycle.get(customization.id) ?? []));
			for (const child of customization.children ?? []) {
				const childLifecycle = lifecycleForChild(child, lifecycle.get(child.id) ?? [], hookLifecycle, hookCount);
				groups.get(sectionForChild(child))?.push(toChildItem(child, customization, usage.get(child.id) ?? [], childLifecycle));
			}
		} else if (customization.type === CustomizationType.Directory) {
			for (const child of customization.children ?? []) {
				const childLifecycle = lifecycleForChild(child, lifecycle.get(child.id) ?? [], hookLifecycle, hookCount);
				groups.get(sectionForChild(child))?.push(toChildItem(child, customization, usage.get(child.id) ?? [], childLifecycle));
			}
		} else {
			groups.get(SessionCustomizationSection.McpServers)?.push(toMcpServerItem(customization, usage.get(customization.id) ?? [], lifecycle.get(customization.id) ?? []));
		}
	}
	return sectionOrder.map(section => ({
		section,
		items: groups.get(section)?.sort((a, b) => a.name.localeCompare(b.name) || a.uri.localeCompare(b.uri)) ?? [],
		lifecycle: section === SessionCustomizationSection.Hooks ? hookLifecycle : [],
		hookSummary: section === SessionCustomizationSection.Hooks ? hookSummary : undefined,
	}));
}

function lifecycleForChild(
	child: ChildCustomization,
	lifecycle: readonly ISessionCustomizationLifecycleEntry[],
	hookLifecycle: readonly ISessionCustomizationLifecycleEntry[],
	hookCount: number,
): readonly ISessionCustomizationLifecycleEntry[] {
	if (child.type !== CustomizationType.Hook) {
		return lifecycle;
	}
	const childResource = URI.parse(child.uri);
	const invocations = hookLifecycle.filter(entry => entry.sourceUri
		? isEqual(entry.sourceUri, childResource)
		: hookCount === 1
	);
	return [...lifecycle, ...invocations];
}

function toPluginItem(plugin: PluginCustomization, evidence: readonly ISessionCustomizationEvidence[], lifecycle: readonly ISessionCustomizationLifecycleEntry[]): ISessionCustomizationItem {
	const loadStatus = containerLoadStatus(plugin);
	return {
		id: plugin.id,
		section: SessionCustomizationSection.Plugins,
		type: plugin.type,
		name: plugin.name,
		uri: plugin.uri,
		openUri: pluginOpenUri(plugin),
		parentName: undefined,
		parentUri: undefined,
		description: undefined,
		status: isCustomizationEnabled(plugin) ? withUsageStatus(loadStatus.status, evidence) : 'disabled',
		detail: loadStatus.detail,
		evidence,
		metadata: customizationMetadata(plugin),
		lifecycle,
	};
}

function toChildItem(child: ChildCustomization, parent: PluginCustomization | DirectoryCustomization, evidence: readonly ISessionCustomizationEvidence[], lifecycle: readonly ISessionCustomizationLifecycleEntry[]): ISessionCustomizationItem {
	const parentEnabled = parent.type === CustomizationType.Plugin ? isCustomizationEnabled(parent) : parent.enabled;
	const childEnabled = child.type === CustomizationType.McpServer ? isCustomizationEnabled(child) : child.enabled !== false;
	const loadStatus = containerLoadStatus(parent);
	const invoked = child.type === CustomizationType.Hook && lifecycle.some(entry => entry.kind !== 'loaded');
	const status = !parentEnabled || !childEnabled
		? 'disabled'
		: invoked
			? 'invoked'
			: withUsageStatus(loadStatus.status, evidence);
	const detail = child.type === CustomizationType.McpServer ? mcpServerDetail(child) : loadStatus.detail;
	return {
		id: child.id,
		section: sectionForChild(child),
		type: child.type,
		name: child.name,
		uri: child.uri,
		openUri: child.uri,
		parentName: parent.name,
		parentUri: parent.uri,
		description: readDescription(child),
		status,
		detail,
		evidence,
		metadata: customizationMetadata(child),
		lifecycle,
	};
}

function toMcpServerItem(server: McpServerCustomization, evidence: readonly ISessionCustomizationEvidence[], lifecycle: readonly ISessionCustomizationLifecycleEntry[]): ISessionCustomizationItem {
	return {
		id: server.id,
		section: SessionCustomizationSection.McpServers,
		type: server.type,
		name: server.name,
		uri: server.uri,
		openUri: server.uri,
		parentName: undefined,
		parentUri: undefined,
		description: undefined,
		status: isCustomizationEnabled(server) ? withUsageStatus(mcpServerStatus(server), evidence) : 'disabled',
		detail: mcpServerDetail(server),
		evidence,
		metadata: customizationMetadata(server),
		lifecycle,
	};
}

function withUsageStatus(status: SessionCustomizationStatus, evidence: readonly ISessionCustomizationEvidence[]): SessionCustomizationStatus {
	return status === 'loaded' && evidence.length > 0 ? 'used' : status;
}

function sectionForChild(child: ChildCustomization): SessionCustomizationSection {
	switch (child.type) {
		case CustomizationType.Agent:
			return SessionCustomizationSection.Agents;
		case CustomizationType.Skill:
			return SessionCustomizationSection.Skills;
		case CustomizationType.Prompt:
		case CustomizationType.Rule:
			return SessionCustomizationSection.Instructions;
		case CustomizationType.Hook:
			return SessionCustomizationSection.Hooks;
		case CustomizationType.McpServer:
			return SessionCustomizationSection.McpServers;
	}
}

function containerLoadStatus(container: PluginCustomization | DirectoryCustomization): { status: SessionCustomizationStatus; detail: string | undefined } {
	switch (container.load?.kind) {
		case CustomizationLoadStatus.Loading:
			return { status: 'loading', detail: undefined };
		case CustomizationLoadStatus.Degraded:
			return { status: 'degraded', detail: container.load.message };
		case CustomizationLoadStatus.Error:
			return { status: 'failed', detail: container.load.message };
		default:
			return { status: 'loaded', detail: undefined };
	}
}

function mcpServerStatus(server: McpServerCustomization): SessionCustomizationStatus {
	switch (server.state.kind) {
		case 'starting':
			return 'loading';
		case 'authRequired':
			return 'authenticationRequired';
		case 'error':
			return 'failed';
		case 'stopped':
			return 'disabled';
		default:
			return 'loaded';
	}
}

function mcpServerDetail(server: McpServerCustomization): string | undefined {
	switch (server.state.kind) {
		case 'authRequired':
			return server.state.description;
		case 'error':
			return server.state.error.message;
		default:
			return server.state.kind;
	}
}

function readDescription(customization: ChildCustomization): string | undefined {
	switch (customization.type) {
		case CustomizationType.Agent:
		case CustomizationType.Skill:
		case CustomizationType.Prompt:
		case CustomizationType.Rule:
			return customization.description;
		case CustomizationType.Hook:
		case CustomizationType.McpServer:
			return undefined;
	}
}

function customizationMetadata(customization: PluginCustomization | ChildCustomization): readonly ISessionCustomizationMetadata[] {
	switch (customization.type) {
		case CustomizationType.Plugin:
			return customization.version
				? [{ kind: SessionCustomizationMetadataKind.Version, value: customization.version }]
				: [];
		case CustomizationType.Agent:
			return [
				...(customization.model ? [{ kind: SessionCustomizationMetadataKind.Model, value: customization.model } as const] : []),
				...(customization.tools?.length ? [{ kind: SessionCustomizationMetadataKind.Tools, value: customization.tools } as const] : []),
				{ kind: SessionCustomizationMetadataKind.ModelInvocation, value: customization.disableModelInvocation !== true },
				{ kind: SessionCustomizationMetadataKind.UserInvocation, value: customization.disableUserInvocation !== true },
			];
		case CustomizationType.Skill:
			return [
				{ kind: SessionCustomizationMetadataKind.ModelInvocation, value: customization.disableModelInvocation !== true },
				{ kind: SessionCustomizationMetadataKind.UserInvocation, value: customization.disableUserInvocation !== true },
			];
		case CustomizationType.Rule:
			return [
				{ kind: SessionCustomizationMetadataKind.AlwaysApply, value: customization.alwaysApply === true },
				...(customization.globs?.length ? [{ kind: SessionCustomizationMetadataKind.Globs, value: customization.globs } as const] : []),
			];
		case CustomizationType.McpServer:
			return [{ kind: SessionCustomizationMetadataKind.McpState, value: customization.state.kind }];
		case CustomizationType.Prompt:
		case CustomizationType.Hook:
			return [];
	}
}

function pluginOpenUri(plugin: PluginCustomization): string | undefined {
	const pluginResource = URI.parse(plugin.uri);
	if (pluginResource.scheme === Schemas.file) {
		return plugin.uri;
	}
	const sourceDirectories = ['skills', 'agents', 'rules', 'prompts', 'hooks'];
	for (const child of plugin.children ?? []) {
		const childResource = URI.parse(child.uri);
		if (childResource.scheme !== Schemas.file) {
			continue;
		}
		for (const directory of sourceDirectories) {
			const marker = `/${directory}/`;
			const index = childResource.path.lastIndexOf(marker);
			if (index >= 0) {
				return childResource.with({ path: childResource.path.slice(0, index) }).toString();
			}
		}
	}
	return undefined;
}

function collectUsage(customizations: readonly Customization[], chatStates: readonly ChatState[]): ReadonlyMap<string, readonly ISessionCustomizationEvidence[]> {
	const byId = new Map<string, ISessionCustomizationEvidence[]>();
	const customizationByUri = new Map<string, string>();
	for (const customization of customizations) {
		if (customization.type === CustomizationType.Plugin || customization.type === CustomizationType.Directory) {
			for (const child of customization.children ?? []) {
				customizationByUri.set(URI.parse(child.uri).toString(), child.id);
			}
		} else {
			customizationByUri.set(URI.parse(customization.uri).toString(), customization.id);
		}
	}
	const addEvidence = (id: string | undefined, evidence: ISessionCustomizationEvidence) => {
		if (!id) {
			return;
		}
		const current = byId.get(id) ?? [];
		if (!current.some(candidate => candidate.chatResource.toString() === evidence.chatResource.toString() && candidate.turnId === evidence.turnId && candidate.kind === evidence.kind)) {
			current.push(evidence);
			byId.set(id, current);
		}
	};
	for (const chatState of chatStates) {
		for (const turn of [...chatState.turns, ...(chatState.activeTurn ? [chatState.activeTurn] : [])]) {
			const baseEvidence = {
				chatResource: URI.parse(chatState.resource.toString()),
				chatTitle: chatState.title,
				turnId: turn.id,
			};
			if (turn.message.agent) {
				addEvidence(customizationByUri.get(URI.parse(turn.message.agent.uri.toString()).toString()), { ...baseEvidence, kind: 'agent' });
			}
			for (const part of turn.responseParts) {
				collectResponsePartUsage(part, customizationByUri, baseEvidence, addEvidence);
			}
		}
	}
	return byId;
}

function collectResponsePartUsage(
	part: ResponsePart,
	customizationByUri: ReadonlyMap<string, string>,
	evidence: Omit<ISessionCustomizationEvidence, 'kind'>,
	addEvidence: (id: string | undefined, evidence: ISessionCustomizationEvidence) => void,
): void {
	if (part.kind !== ResponsePartKind.ToolCall) {
		return;
	}
	if (part.toolCall.contributor?.kind === ToolCallContributorKind.MCP) {
		addEvidence(part.toolCall.contributor.customizationId, { ...evidence, kind: 'mcp' });
	}
	if (part.toolCall.toolName !== 'skill') {
		return;
	}
	const skillUri = readSkillUri(part.toolCall.invocationMessage);
	if (skillUri) {
		addEvidence(customizationByUri.get(skillUri.toString()), { ...evidence, kind: 'skill' });
	}
}

function readSkillUri(message: StringOrMarkdown | undefined): URI | undefined {
	const value = typeof message === 'string' ? message : message?.markdown;
	const match = value ? /\]\((?<uri>[^)]+)\)/.exec(value) : undefined;
	if (!match?.groups?.uri) {
		return undefined;
	}
	return URI.parse(match.groups.uri);
}
