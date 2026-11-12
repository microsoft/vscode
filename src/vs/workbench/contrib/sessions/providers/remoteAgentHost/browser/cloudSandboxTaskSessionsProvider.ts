/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agent.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { getAgentHostSessionResource } from '../../../../../../platform/agentHost/common/agentHostSessionIdentity.js';
import { DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { autorun, constObservable, derived, IObservable, IReader, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, CLOUD_SANDBOX_SESSION_SCHEME, CLOUD_SANDBOX_TASK_SCHEME, cloudSandboxAddress, cloudSandboxTaskResource, ICloudSandboxTask } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { SessionStatus as ProtocolSessionStatus } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { discoveredSessionProject } from '../../../../chat/browser/remoteAgentHost/cloudSandboxSessionContribution.js';
import { getSessionApplication } from '../../../../../services/sessions/common/sessionApplication.js';
import { ChatInteractivity, DEFAULT_CHAT_CAPABILITIES, IChat, ISession, ISessionCapabilities, ISessionWorkspace, SessionRemoteConnectionFailureReason, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ISendRequestOptions } from '../../../common/sessionsManagement.js';
import { IChatMovedEvent, ISessionChangeEvent } from '../../../common/sessionsProvider.js';
import { BaseAgentHostSessionsProvider } from '../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { CloudSandboxSessionsProvider } from './cloudSandboxSessionsProvider.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';

export const CLOUD_SANDBOX_TASK_PROVIDER_ID = 'agenthost-cloud-tasks';

interface ITaskActions {
	readonly accountKey: () => string | undefined;
	resolve(taskId: string, token: CancellationToken): Promise<CloudSandboxSessionsProvider>;
	rename(taskId: string, title: string): Promise<void>;
	archive(taskId: string, archived: boolean): Promise<void>;
	delete(taskId: string): Promise<void>;
}

export function createCloudSandboxTaskSession(task: ICloudSandboxTask) {
	const summary = observableValue('cloudTaskSummary', task);
	const runtime = observableValue<ISession | undefined>('cloudTaskRuntime', undefined);
	const read = observableValue('cloudTaskRead', false);
	const pendingRead: { value: boolean | undefined } = { value: undefined };
	const resource = cloudSandboxTaskResource(task.taskId);
	const property = <T>(select: (session: ISession) => IObservable<T> | undefined, fallback: (reader: IReader) => T): IObservable<T> =>
		derived(reader => {
			const session = runtime.read(reader);
			const value = session && select(session);
			return value ? value.read(reader) : fallback(reader);
		});
	const title = property(session => session.title, reader => summary.read(reader).name);
	const updatedAt = property(session => session.updatedAt, reader => new Date(summary.read(reader).updatedAt ?? 0));
	const status = property(session => session.status, reader => {
		const status = summary.read(reader).status;
		return status === ProtocolSessionStatus.InProgress ? SessionStatus.InProgress
			: status === ProtocolSessionStatus.InputNeeded ? SessionStatus.NeedsInput
				: status === ProtocolSessionStatus.Error ? SessionStatus.Error : SessionStatus.Completed;
	});
	const workspace = property(session => session.workspace, reader =>
		RemoteAgentHostSessionsProvider.buildWorkspace(discoveredSessionProject(summary.read(reader).repoName), undefined, undefined, constObservable(undefined), undefined, undefined, undefined, Codicon.cloudCompact));
	const isRead = property(session => session.isRead, reader => read.read(reader));
	const isArchived = derived(reader => summary.read(reader).isArchived === true);
	const modelId = property(session => session.modelId, () => undefined);
	const mode = property(session => session.mode, () => undefined);
	const description = property(session => session.description, () => undefined);
	const lastTurnEnd = property(session => session.lastTurnEnd, () => undefined);
	const chatProperty = <T>(select: (chat: IChat) => IObservable<T> | undefined, fallback: (reader: IReader) => T): IObservable<T> =>
		derived(reader => {
			const chat = runtime.read(reader)?.mainChat.read(reader);
			const value = chat && select(chat);
			return value ? value.read(reader) : fallback(reader);
		});
	const mainChat: IChat = {
		resource, createdAt: new Date(task.updatedAt ?? 0),
		title: chatProperty(chat => chat.title, reader => title.read(reader)),
		updatedAt: chatProperty(chat => chat.updatedAt, reader => updatedAt.read(reader)),
		status: chatProperty(chat => chat.status, reader => status.read(reader)),
		workspace: chatProperty(chat => chat.workspace, reader => workspace.read(reader)),
		isRead: chatProperty(chat => chat.isRead, reader => read.read(reader)),
		isArchived: chatProperty(chat => chat.isArchived, reader => isArchived.read(reader)),
		modelId: chatProperty(chat => chat.modelId, () => undefined),
		modelSource: chatProperty(chat => chat.modelSource, () => undefined),
		mode: chatProperty(chat => chat.mode, () => undefined),
		description: chatProperty(chat => chat.description, () => undefined),
		lastTurnEnd: chatProperty(chat => chat.lastTurnEnd, () => undefined),
		changes: chatProperty(chat => chat.changes, () => []),
		changesets: chatProperty(chat => chat.changesets, () => undefined),
		changesSummary: chatProperty(chat => chat.changesSummary, () => undefined),
		lastTurnChanges: chatProperty(chat => chat.lastTurnChanges, () => []),
		customizations: chatProperty(chat => chat.customizations, () => []),
		canvases: chatProperty(chat => chat.canvases, () => undefined),
		backgroundShells: chatProperty(chat => chat.backgroundShells, () => []),
		checkpoints: chatProperty(chat => chat.checkpoints, () => undefined),
		completedStateIcon: chatProperty(chat => chat.completedStateIcon, () => undefined),
		capabilities: chatProperty(chat => chat.capabilities, () => DEFAULT_CHAT_CAPABILITIES),
		interactivity: chatProperty(chat => chat.interactivity, () => ChatInteractivity.DraftOnly),
		observeCanvases: () => autorun(reader => {
			const disposable = runtime.read(reader)?.mainChat.read(reader).observeCanvases?.();
			if (disposable) {
				reader.store.add(disposable);
			}
		}),
		observeChanges: () => autorun(reader => {
			const disposable = runtime.read(reader)?.mainChat.read(reader).observeChanges?.();
			if (disposable) {
				reader.store.add(disposable);
			}
		}),
	};
	const session: ISession = {
		sessionId: `${CLOUD_SANDBOX_TASK_PROVIDER_ID}:${resource.toString()}`,
		get previousIdentities() {
			const task = summary.get();
			if (!task.environmentId || !task.sessionId) {
				return undefined;
			}
			const authority = agentHostAuthority(cloudSandboxAddress(task.environmentId));
			const previous = URI.from({ scheme: remoteAgentHostSessionTypeId(authority, CLOUD_SANDBOX_AGENT_PROVIDER), path: `/${task.sessionId}` });
			return [{ resource: previous, sessionId: `agenthost-${authority}:${previous.toString()}` }];
		},
		resource, providerId: CLOUD_SANDBOX_TASK_PROVIDER_ID, sessionType: CLOUD_SANDBOX_AGENT_PROVIDER, harness: 'copilot', environment: 'cloud',
		icon: Codicon.cloud, createdAt: new Date(task.updatedAt ?? 0),
		title, updatedAt, status, workspace, isRead, isArchived, modelId, mode, description, lastTurnEnd,
		mainChat: constObservable(mainChat),
		application: property(session => session.application, reader => {
			const task = summary.read(reader);
			return getSessionApplication(task.application ?? task.eventType ?? 'unknown');
		}),
		isQuickChat: property(session => session.isQuickChat, reader => summary.read(reader).hasRepository === false),
		loading: property(session => session.loading, () => false),
		chats: derived(reader => runtime.read(reader)?.chats.read(reader).map(chat => isEqual(chat.resource, resource) ? mainChat : chat) ?? [mainChat]),
		capabilities: property<ISessionCapabilities>(session => session.capabilities, () => ({ supportsMultipleChats: false, supportsRename: true, supportsDelete: true })),
		remoteConnectionStatus: property(session => session.remoteConnectionStatus, () => ({ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown })),
		changesSummary: property(session => session.changesSummary, () => undefined),
		artifacts: property(session => session.artifacts, () => []),
		completedStateIcon: property(session => session.completedStateIcon, () => undefined),
	};
	return { summary, runtime, read, pendingRead, session };
}

/** Publishes cloud work independently of the environment providers acquired on open. */
export class CloudSandboxTaskSessionsProvider extends BaseAgentHostSessionsProvider {
	readonly id = CLOUD_SANDBOX_TASK_PROVIDER_ID;
	readonly label = localize('cloudTask.label', "Cloud");
	readonly environment = { id: 'cloud', label: this.label };
	readonly icon = Codicon.cloud;
	readonly browseActions = [];
	readonly supportsWorkspaceSelection = false;
	private readonly _tasks = new Map<string, ReturnType<typeof createCloudSandboxTaskSession>>();
	private readonly _providers = new Map<string, CloudSandboxSessionsProvider>();
	private readonly _providerListeners = this._register(new DisposableMap<CloudSandboxSessionsProvider, DisposableStore>());
	private readonly _runtimeSessions = new Map<string, ISession>();
	private readonly _runtimeOwners = new Map<string, CloudSandboxSessionsProvider>();
	private readonly _pendingTasks = new Map<string, ICloudSandboxTask>();
	private readonly _runtimeChatMoves = this._register(new Emitter<IChatMovedEvent>());
	override readonly onDidMoveChat = this._runtimeChatMoves.event;
	private _actions: ITaskActions | undefined;

	initialize(actions: ITaskActions): void {
		this._actions = actions;
	}

	protected get connection() { return undefined; }
	protected get authenticationPending() { return constObservable(false); }
	protected registerBackendSession(): void { }
	protected resourceSchemeForProvider(): string { return CLOUD_SANDBOX_TASK_SCHEME; }
	protected _formatSessionTypeLabel(label: string): string { return label; }
	protected _adapterOptions() {
		return { buildWorkspace: () => undefined };
	}
	resolveWorkspace(): ISessionWorkspace | undefined { return undefined; }

	override getSessions(): ISession[] {
		return [
			...[...this._tasks.values()].map(entry => entry.session),
			...[...this._runtimeSessions.values()].filter(session => session.resource.scheme !== CLOUD_SANDBOX_TASK_SCHEME),
		];
	}

	override getSessionByResource(resource: URI): ISession | undefined {
		return this.getSessions().find(session => isEqual(session.resource, resource) || session.previousIdentities?.some(previous => isEqual(previous.resource, resource)));
	}

	async resolveSessionResource(resource: URI): Promise<URI | undefined> {
		const session = this.getSessionByResource(getAgentHostSessionResource(resource));
		return session?.resource.with({ fragment: resource.fragment, query: resource.query });
	}

	getSessionProvider(sessionId: string): CloudSandboxSessionsProvider | undefined {
		return this._providers.get(this._taskId(sessionId))
			?? [...this._providerListeners.keys()].find(provider => provider.getSessions().some(session => session.sessionId === sessionId));
	}

	getNewSessionTarget(resource: URI) {
		const task = this._tasks.get(resource.path.slice(1))?.summary.get();
		return task?.repoName ? CloudSandboxSessionsProvider.creationTarget(task.repoName, isWeb) : undefined;
	}

	setTasks(tasks: readonly ICloudSandboxTask[], announce = true): void {
		const added: ISession[] = [];
		const changed: ISession[] = [];
		const legacyReadStates = new Map<string, ResourceMap<boolean>>();
		transaction(tx => {
			for (const task of tasks) {
				if (this._providers.get(task.taskId)?.isSessionWithheld(cloudSandboxTaskResource(task.taskId))) {
					this._pendingTasks.set(task.taskId, task);
					continue;
				}
				const entry = this._tasks.get(task.taskId);
				if (entry) {
					entry.summary.set(task, tx);
					changed.push(entry.session);
				} else {
					const entry = createCloudSandboxTaskSession(task);
					const savedRead = this._storageService.getBoolean(this._readStateKey(task.taskId), StorageScope.PROFILE);
					let isRead = savedRead;
					if (isRead === undefined && task.environmentId && task.sessionId) {
						const address = cloudSandboxAddress(task.environmentId);
						let cachedRead = legacyReadStates.get(address);
						if (!cachedRead) {
							cachedRead = RemoteAgentHostSessionsProvider.getCachedSessionReadStates(this._storageService, address);
							legacyReadStates.set(address, cachedRead);
						}
						isRead = cachedRead.get(AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, task.sessionId));
					}
					entry.read.set(isRead ?? false, tx);
					entry.pendingRead.value = savedRead;
					this._tasks.set(task.taskId, entry);
					added.push(entry.session);
				}
			}
		});
		if (announce && (added.length || changed.length)) {
			this._onDidChangeSessions.fire({ added, changed, removed: [] });
		}
	}

	removeTasks(taskIds: readonly string[]): void {
		const removed: ISession[] = [];
		for (const taskId of taskIds) {
			const entry = this._tasks.get(taskId);
			if (entry) {
				removed.push(entry.session);
				this._tasks.delete(taskId);
				const provider = this._providers.get(taskId);
				this._providers.delete(taskId);
				this._pendingTasks.delete(taskId);
				if (provider && ![...this._providers.values()].includes(provider)
					&& !provider.getSessions().some(session => session.resource.scheme !== CLOUD_SANDBOX_TASK_SCHEME)) {
					this._providerListeners.deleteAndDispose(provider);
				}
			}
		}
		if (removed.length) {
			this._onDidChangeSessions.fire({ added: [], changed: [], removed });
		}
	}

	attach(taskId: string, provider: CloudSandboxSessionsProvider, task?: ICloudSandboxTask): void {
		const alreadyAttached = this._providers.get(taskId) === provider;
		this._providers.set(taskId, provider);
		if (task && !this._tasks.has(taskId)) {
			this._pendingTasks.set(taskId, task);
		}
		if (!this._providerListeners.has(provider)) {
			const store = new DisposableStore();
			this._providerListeners.set(provider, store);
			store.add(provider.onDidChangeSessions(event => this._acceptRuntimeSessions(provider, event)));
			store.add(provider.onDidPublishSessionSilently(session => this._acceptRuntimeSessions(provider, { added: [session], changed: [], removed: [] }, false)));
			store.add(provider.onDidMoveChat(event => this._runtimeChatMoves.fire({
				from: { ...event.from, session: this._publicSession(event.from.session) },
				to: { ...event.to, session: this._publicSession(event.to.session) },
			})));
			store.add(provider.onDidReplaceSession(event => {
				const from = this._publicSession(event.from);
				const to = this._publicSession(event.to);
				if (from !== to) {
					this._onDidReplaceSession.fire({ from, to });
				}
			}));
			store.add(provider.onDidInvokeChangesetOperation(event => this._onDidInvokeChangesetOperation.fire({
				...event, session: this._publicSession(event.session),
			})));
			store.add(provider.onDidChangeSessionConfig(id => this._onDidChangeSessionConfig.fire(id)));
			store.add(provider.onDidChangeRootConfig(() => this._onDidChangeRootConfig.fire()));
			store.add(provider.onDidChangeCustomAgents(() => this._onDidChangeCustomAgents.fire()));
			store.add(provider.onDidChangeCustomizations(() => this._onDidChangeCustomizations.fire()));
			store.add(provider.onDidChangeSessionTypes(() => this._onDidChangeSessionTypes.fire()));
			store.add(provider.onDidChangeModels(() => this._onDidChangeProviderModels.fire()));
			this._acceptRuntimeSessions(provider, { added: provider.getSessions(), changed: [], removed: [] });
		} else if (!alreadyAttached && task?.sessionId) {
			const runtime = provider.getCachedSession(task.sessionId);
			if (runtime) {
				this._acceptRuntimeSessions(provider, { added: [], changed: [runtime], removed: [] });
			}
		}
		const entry = this._tasks.get(taskId);
		if (!alreadyAttached && entry) {
			this._onDidChangeSessionConfig.fire(entry.session.sessionId);
		}
	}

	private _publicSession(session: ISession): ISession {
		return session.resource.scheme === CLOUD_SANDBOX_TASK_SCHEME
			? this._tasks.get(session.resource.path.slice(1))?.session ?? session : session;
	}

	private _acceptRuntimeSessions(provider: CloudSandboxSessionsProvider, event: ISessionChangeEvent, announce = true): void {
		const added: ISession[] = [];
		const removed: ISession[] = [];
		const changed = new Set<ISession>();
		transaction(tx => {
			for (const session of event.removed) {
				this._runtimeSessions.delete(session.sessionId);
				this._runtimeOwners.delete(session.sessionId);
				const taskId = session.resource.scheme === CLOUD_SANDBOX_TASK_SCHEME ? session.resource.path.slice(1) : undefined;
				const entry = taskId ? this._tasks.get(taskId) : undefined;
				if (entry) {
					if (entry.runtime.get() === session) {
						entry.runtime.set(undefined, tx);
						changed.add(entry.session);
					}
				} else {
					removed.push(session);
				}
			}
			for (const session of [...event.added, ...event.changed]) {
				if (provider.isSessionWithheld(session.resource)) {
					continue;
				}
				const wasKnown = this._runtimeSessions.has(session.sessionId);
				this._runtimeSessions.set(session.sessionId, session);
				this._runtimeOwners.set(session.sessionId, provider);
				if (session.resource.scheme !== CLOUD_SANDBOX_TASK_SCHEME) {
					if (wasKnown) {
						changed.add(session);
					} else {
						added.push(session);
					}
					continue;
				}
				const taskId = session.resource.path.slice(1);
				const pending = this._pendingTasks.get(taskId);
				if (!this._tasks.has(taskId) && pending) {
					this.setTasks([pending], false);
					this._pendingTasks.delete(taskId);
					added.push(this._tasks.get(taskId)!.session);
				}
				const entry = this._tasks.get(taskId);
				if (entry) {
					this._providers.set(taskId, provider);
					if (entry.pendingRead.value !== undefined) {
						provider.restoreSessionReadState(session.sessionId, entry.pendingRead.value);
						entry.pendingRead.value = undefined;
					}
					entry.read.set(session.isRead.get(), tx);
					entry.runtime.set(session, tx);
					this._storageService.store(this._readStateKey(taskId), session.isRead.get(), StorageScope.PROFILE, StorageTarget.MACHINE);
					if (!added.includes(entry.session)) {
						changed.add(entry.session);
					}
				}
			}
		});
		if (announce && (added.length || removed.length || changed.size)) {
			this._onDidChangeSessions.fire({ added, removed, changed: [...changed] });
		}
	}

	detach(provider: CloudSandboxSessionsProvider): void {
		const removed = [...this._runtimeOwners].flatMap(([id, owner]) => owner === provider ? [this._runtimeSessions.get(id)!] : []);
		this._acceptRuntimeSessions(provider, { added: [], changed: [], removed });
		for (const [taskId, owner] of this._providers) {
			if (owner === provider) {
				this._providers.delete(taskId);
			}
		}
		this._providerListeners.deleteAndDispose(provider);
	}

	clear(): void {
		const removed = this.getSessions();
		this._tasks.clear();
		this._providers.clear();
		this._runtimeSessions.clear();
		this._runtimeOwners.clear();
		this._pendingTasks.clear();
		this._providerListeners.clearAndDisposeAll();
		if (removed.length) {
			this._onDidChangeSessions.fire({ added: [], changed: [], removed });
		}
	}

	private _taskId(sessionId: string): string {
		const prefix = `${this.id}:`;
		const resource = URI.parse(sessionId.startsWith(prefix) ? sessionId.slice(prefix.length) : sessionId);
		return resource.scheme === CLOUD_SANDBOX_TASK_SCHEME ? resource.path.slice(1) : '';
	}

	private get actions(): ITaskActions {
		if (!this._actions) {
			throw new Error('Cloud task catalog has not been initialized.');
		}
		return this._actions;
	}

	private _readStateKey(taskId: string): string {
		return `sessions.cloudSandbox.taskRead.${JSON.stringify([this.actions.accountKey(), taskId])}`;
	}

	async prepareSessionForOpen(session: ISession): Promise<void> {
		const provider = await this.actions.resolve(this._taskId(session.sessionId), CancellationToken.None);
		await provider.prepareSessionForOpen();
	}

	override async sendRequest(sessionId: string, resource: URI, options: ISendRequestOptions): Promise<ISession> {
		const provider = await this.actions.resolve(this._taskId(sessionId), CancellationToken.None);
		await provider.sendRequest(sessionId, resource, options);
		const session = this.getSessionByResource(resource.with({ fragment: '' }));
		if (!session) {
			throw new Error('Cloud task was removed while sending a request.');
		}
		return session;
	}

	override renameSession(sessionId: string, title: string): Promise<void> { return this.actions.rename(this._taskId(sessionId), title); }
	override archiveSession(sessionId: string): Promise<void> { return this.actions.archive(this._taskId(sessionId), true); }
	override unarchiveSession(sessionId: string): Promise<void> { return this.actions.archive(this._taskId(sessionId), false); }
	override deleteSession(sessionId: string): Promise<void> { return this.actions.delete(this._taskId(sessionId)); }
	override async deleteSessions(sessionIds: readonly string[]): Promise<void> {
		for (const sessionId of sessionIds) {
			await this.deleteSession(sessionId);
		}
	}
	override async setSessionReadState(sessionId: string, isRead: boolean): Promise<void> {
		const entry = this._tasks.get(this._taskId(sessionId));
		if (!entry) {
			throw new Error('Cloud task not found.');
		}
		entry.pendingRead.value = isRead;
		const provider = this.getSessionProvider(sessionId);
		if (provider) {
			await provider.setSessionReadState(sessionId, isRead);
			if (entry.runtime.get()?.isRead.get() === isRead) {
				entry.pendingRead.value = undefined;
			}
		}
		entry.read.set(isRead, undefined);
		this._storageService.store(this._readStateKey(this._taskId(sessionId)), isRead, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [entry.session] });
	}

	override async setChatReadState(sessionId: string, resource: URI, isRead: boolean): Promise<boolean> {
		const entry = this._tasks.get(this._taskId(sessionId));
		if (entry && isEqual(resource, entry.session.resource) && !entry.runtime.get()) {
			await this.setSessionReadState(sessionId, isRead);
			return true;
		}
		return await this.getSessionProvider(sessionId)?.setChatReadState(sessionId, resource, isRead) ?? false;
	}

	override async setChatReadStates(sessionId: string, resources: readonly URI[], isRead: boolean): Promise<void> {
		this._onDidChangeSessions.pause();
		try {
			for (const resource of resources) {
				await this.setChatReadState(sessionId, resource, isRead);
			}
		} finally {
			this._onDidChangeSessions.resume();
		}
	}
}
