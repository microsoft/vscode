/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, RunOnceScheduler, Sequencer, SequencerByKey } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { deepClone } from '../../../../base/common/objects.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../files/common/files.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { registerBuiltinWorkflowChecks } from '../../../workflow/common/builtinWorkflowChecks.js';
import type { IWorkflowExecutionAdapter, IWorkflowStore, WorkflowAssignment, WorkflowControl, WorkflowDispatchReadiness, WorkflowInvocation, WorkflowObject, WorkflowProgress, WorkflowProofResult, WorkflowRun, WorkflowSource } from '../../../workflow/common/workflow.js';
import { WorkflowConflictError, WorkflowDispatchBusyError, WorkflowRunner } from '../../../workflow/common/workflowRunner.js';
import { getWorkflowProgress } from '../../../workflow/common/workflowProgress.js';
import { WorkflowCheckRegistry } from '../../../workflow/common/workflowCheckRegistry.js';
import { validateWorkflowValue, WorkflowValidationError } from '../../../workflow/common/workflowValidation.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import type { IIncomingRequest, IncomingRequestDisposition, IDispatchedAction, ITurnEnd } from '../../common/agentHostChatContributionsService.js';
import type { IAgentCreateSessionConfig, IAgentSessionMetadata } from '../../common/agent.js';
import { isWorkflowExtensionSources, type IAgentHostWorkflowStartContext, type IAgentHostWorkflowStartOptions } from '../../common/agentHostWorkflow.js';
import { AgentHostWorkflowsEnabledConfigKey, platformRootSchema } from '../../common/agentHostSchema.js';
import { isAgentMergeMessage } from '../../common/meta/agentMergeMessageMeta.js';
import { IAgentWorkflowRunChange, isWorkflowMessage, toWorkflowMessageMeta, withAgentWorkflowProgress } from '../../common/meta/agentWorkflowMeta.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { omitTransientSessionConfigValues } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { createErrorResponsePart, isChatReadOnly, isSessionStatusArchived, MessageKind, parseChatUri, readSessionGitState, SessionLifecycle, SessionStatus, TurnState, type Message, type MessageAttachment, type Turn } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { createAgentChatContext } from '../agentChatContext.js';
import { IAgentHostDatabase } from '../agentHostDatabase.js';
import { IAgentHostProviderService } from '../agentHostProviderService.js';
import { IAgentHostLocalTurns } from '../agentHostLocalTurns.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../agentHostStateManager.js';
import { IAgentHostStorageService } from '../agentHostStorageService.js';
import { IAgentHostTurnService } from '../agentHostTurnService.js';
import { IAgentHostWorkingDirectoryService } from '../agentHostWorkingDirectoryService.js';
import type { IServerToolExecutionContext } from '../shared/agentServerToolHost.js';
import type { IWorkflowInitialSession } from './workflowStore.js';

export const IAgentHostWorkflowService = createDecorator<IAgentHostWorkflowService>('agentHostWorkflowService');

export interface IWorkflowSessionHost {
	restore(session: URI, chat: URI): Promise<void>;
	cancel(chat: string, turnId: string): void;
}

export interface IAgentHostWorkflowService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeWorkflowRun: Event<IAgentWorkflowRunChange>;
	readonly onDidChangeOwnership: Event<string | undefined>;
	getWorkflowRun(session: URI): Promise<WorkflowRun | undefined>;
	projectSessions(sessions: readonly IAgentSessionMetadata[]): Promise<readonly IAgentSessionMetadata[]>;
	getSessionBootstrap(session: URI): Promise<{ readonly config: IAgentCreateSessionConfig; readonly metadata: IAgentSessionMetadata } | undefined>;
	startWorkflow(options: IAgentHostWorkflowStartOptions): Promise<WorkflowRun>;
	controlWorkflow(control: WorkflowControl): Promise<WorkflowRun>;
	setWorkflowSourceEnabled(sourceId: string, enabled: boolean): Promise<void>;
	setWorkflowExtensionSources(sources: Readonly<Record<string, boolean>>): Promise<void>;
	ownsContinuation(session: string): boolean;
	isQuietTurn(turn: ITurnEnd): boolean;
	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined;
	onTurnEnd(turn: ITurnEnd): void;
	onDidDispatchAction(action: IDispatchedAction): void;
	getCheckpoint(context: IServerToolExecutionContext): Promise<string>;
	prove(context: IServerToolExecutionContext, proof: WorkflowObject): Promise<WorkflowProofResult>;
	reportBlocked(context: IServerToolExecutionContext, reason: string): Promise<WorkflowProofResult>;
	activate(host: IWorkflowSessionHost): IDisposable;
}

interface IIssuedTurn {
	readonly session: string;
	readonly chat: string;
	readonly invocation: WorkflowInvocation;
	readonly message: Message;
	readonly sources: readonly WorkflowSource[];
	ended?: boolean;
}

const sourceEnablementKey = 'workflowSourceEnablement';
const extensionSourceEnablementKey = 'workflowExtensionSources';
const retryDelay = 5000;
const maximumRetryDelay = 5 * 60_000;
const providerStartupGrace = 60_000;

/** One host-owned runner; idle runs retain only a lightweight projection, never an SDK session. */
export class AgentHostWorkflowService extends Disposable implements IAgentHostWorkflowService, IWorkflowExecutionAdapter {
	declare readonly _serviceBrand: undefined;
	private readonly _owners = new Set<string>();
	private readonly _progress = new Map<string, WorkflowProgress>();
	private readonly _issuedTurns = new Map<string, IIssuedTurn>();
	private readonly _pendingUserActivity = new Map<string, { readonly session: string; readonly at: number }>();
	private readonly _chats = new Map<string, string>();
	private readonly _startingSessions = new Set<string>();
	private readonly _startContexts = new Map<string, IAgentHostWorkflowStartContext>();
	private readonly _initialSessions = new Map<string, IWorkflowInitialSession>();
	private readonly _revokedSessions = new Set<string>();
	private readonly _controls = new SequencerByKey<string>();
	private readonly _sourceChanges = new Sequencer();
	private readonly _enablingSources = new Set<string>();
	private readonly _enablingExtensionSources = new Set<string>();
	private readonly _onDidChangeWorkflowRun = this._register(new Emitter<IAgentWorkflowRunChange>());
	readonly onDidChangeWorkflowRun = this._onDidChangeWorkflowRun.event;
	private readonly _onDidChangeOwnership = this._register(new Emitter<string | undefined>());
	readonly onDidChangeOwnership = this._onDidChangeOwnership.event;
	private readonly _runner: WorkflowRunner;
	private readonly _scheduler = this._register(new RunOnceScheduler(() => void this._wake(), retryDelay));
	private _sessionHost: IWorkflowSessionHost | undefined;
	private _initialization: Promise<void> | undefined;
	private _loaded = false;
	private _active = false;
	private _waking = false;
	private _wakeAgain = false;
	private _backoff = retryDelay;
	private _failure: Error | undefined;
	private _activationTime = 0;
	private _recovered = false;
	private _enabled = false;
	private _revokingEnablement = false;
	private _enablementReady: Promise<void> = Promise.resolve();

	constructor(
		@IAgentHostDatabase private readonly _database: IAgentHostDatabase,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providers: IAgentHostProviderService,
		@IAgentConfigurationService private readonly _configuration: IAgentConfigurationService,
		@IAgentHostTurnService private readonly _turnService: IAgentHostTurnService,
		@IAgentHostLocalTurns private readonly _localTurns: IAgentHostLocalTurns,
		@IAgentHostWorkingDirectoryService private readonly _workingDirectoryService: IAgentHostWorkingDirectoryService,
		@IAgentHostStorageService private readonly _storage: IAgentHostStorageService,
		@ISessionDataService sessionData: ISessionDataService,
		@IFileService fileService: IFileService,
		@IGitHubService githubService: IGitHubService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		const registry = this._register(new WorkflowCheckRegistry());
		this._register(registerBuiltinWorkflowChecks(registry, {
			fileService, githubService,
			allowedResourceRoots: run => (this._configuration.getEffectiveWorkingDirectories(run.session)
				?? this._initialSessions.get(run.session)?.summary.workingDirectories ?? []).map(resource => URI.parse(resource)),
		}));
		const store: IWorkflowStore = {
			getRun: id => this._database.workflows.getRun(id),
			getSessionRun: session => this._database.workflows.getSessionRun(session),
			listRuns: () => this._database.workflows.listRuns(),
			listDueRuns: (now, limit) => this._database.workflows.listDueRuns(now, limit),
			createRun: async run => {
				const context = this._startContexts.get(run.session);
				const state = this._stateManager.getSessionState(run.session);
				const summary = this._stateManager.getSessionSummary(run.session);
				const chat = this._stateManager.getChatState(run.chat);
				const initial = state?.lifecycle === SessionLifecycle.Creating && summary && !chat?.activeTurn && !chat?.turns.length
					? deepClone({ summary, config: state.config && omitTransientSessionConfigValues(state.config.values), model: context?.model, agent: context?.agent })
					: undefined;
				await this._database.workflows.createRun(run, context, initial);
				if (initial) {
					this._initialSessions.set(run.session, initial);
				}
				this._publish(run);
				if (chat && !chat.activeTurn && chat.turns.length === 0) {
					await this._recordInitialRequest(run, context);
				}
			},
			updateRun: (run, revision) => this._database.workflows.updateRun(run, revision),
			deleteSession: session => this._database.workflows.deleteSession(session),
		};
		this._runner = this._register(new WorkflowRunner(store, this, registry));
		this._register(this._runner.onDidChangeRun(run => {
			if (this._progress.get(run.session)?.revision !== run.revision) {
				this._publish(run);
			}
		}));
		this._register(this._providers.onDidRegisterProvider(() => {
			if (this._active && this._isEnabled() && !this._recovered) {
				this._scheduler.schedule(0);
			}
		}));
		this._register(sessionData.onWillDeleteSessionData(event => {
			const session = event.session.toString();
			if (this._loaded && !this._owners.has(session)) {
				return;
			}
			this._revokedSessions.add(session);
			event.waitUntil(this._forgetDeletedSession(session));
		}));
		this._register(this._stateManager.onDidRemoveSession(session => {
			for (const [id, turn] of this._issuedTurns) {
				if (turn.session === session) {
					this._issuedTurns.delete(id);
				}
			}
			for (const [key, activity] of this._pendingUserActivity) {
				if (activity.session === session) {
					this._pendingUserActivity.delete(key);
				}
			}
			if (!this._owners.has(session) && this._revokedSessions.delete(session)) {
				this._onDidChangeOwnership.fire(session);
			}
		}));
	}

	activate(host: IWorkflowSessionHost): IDisposable {
		if (this._active || this._initialization) {
			throw new Error('Workflows have already been activated');
		}
		this._active = true;
		this._activationTime = Date.now();
		this._sessionHost = host;
		this._initialization = this._recover();
		if (this._requestedEnabled()) {
			this._synchronizeEnablement();
		}
		void this._initialization.then(() => this._wake()).catch(error => {
			if (this._active) {
				this._recordFailure(error);
				this._scheduler.schedule(this._backoff);
			}
		});
		return toDisposable(() => {
			this._active = false;
			this._enabled = false;
			this._scheduler.cancel();
			this._sessionHost = undefined;
			this._issuedTurns.clear();
			this._pendingUserActivity.clear();
		});
	}

	private async _recover(): Promise<void> {
		for (const initial of await this._database.workflows.listInitialSessions()) {
			this._initialSessions.set(initial.summary.resource, initial);
		}
		for (const run of await this._database.workflows.listRuns()) {
			this._publish(run);
			if (run.status !== 'completed' && run.status !== 'cancelled' && this._runSourceDisabled(run)) {
				this._revokedSessions.add(run.session);
				await this._pause(run.session);
			}
		}
		this._loaded = true;
		this._onDidChangeOwnership.fire(undefined);
	}

	async getWorkflowRun(session: URI): Promise<WorkflowRun | undefined> {
		await this._ready();
		return this._database.workflows.getSessionRun(session.toString());
	}

	async projectSessions(sessions: readonly IAgentSessionMetadata[]): Promise<readonly IAgentSessionMetadata[]> {
		try {
			await this._ready();
		} catch {
			// A workflow-store failure must not hide unrelated ordinary sessions.
			return sessions;
		}
		const known = new Set(sessions.map(session => session.session.toString()));
		const result = sessions.map(session => {
			const progress = this._progress.get(session.session.toString());
			return progress ? { ...session, _meta: withAgentWorkflowProgress(session._meta, progress) } : session;
		});
		for (const [session, initial] of this._initialSessions) {
			if (!known.has(session) && this._owners.has(session)) {
				result.push(this._initialSessionMetadata(initial));
			}
		}
		return result;
	}

	async getSessionBootstrap(session: URI): Promise<{ readonly config: IAgentCreateSessionConfig; readonly metadata: IAgentSessionMetadata } | undefined> {
		if (this._loaded && !this._owners.has(session.toString())) {
			return undefined;
		}
		const initial = await this._database.workflows.getInitialSession(session.toString());
		if (!initial) {
			return undefined;
		}
		return {
			config: {
				session, provider: initial.summary.provider,
				workingDirectories: initial.summary.workingDirectories?.map(directory => URI.parse(directory)),
				config: initial.config, model: initial.model, agent: initial.agent, _meta: initial.summary._meta,
			},
			metadata: this._initialSessionMetadata(initial),
		};
	}

	private _initialSessionMetadata(initial: IWorkflowInitialSession): IAgentSessionMetadata {
		const summary = initial.summary;
		return {
			session: URI.parse(summary.resource), startTime: Date.parse(summary.createdAt), modifiedTime: Date.parse(summary.modifiedAt),
			summary: summary.title, status: summary.status, activity: summary.activity, changes: summary.changes,
			workingDirectories: summary.workingDirectories?.map(directory => URI.parse(directory)),
			project: summary.project && { uri: URI.parse(summary.project.uri), displayName: summary.project.displayName },
			model: initial.model,
			_meta: withAgentWorkflowProgress(summary._meta, this._progress.get(summary.resource)),
		};
	}

	async startWorkflow(options: IAgentHostWorkflowStartOptions): Promise<WorkflowRun> {
		await this._ready();
		await this._requireEnabled();
		if (this._startingSessions.has(options.session)) {
			throw new Error(localize('workflow.alreadyStarting', "A workflow is already starting in this session."));
		}
		this._startingSessions.add(options.session);
		try {
			const { model, agent, attachments, ...workflowOptions } = options;
			this._startContexts.set(options.session, deepClone({ model, agent, attachments }));
			return await this._startWorkflow(workflowOptions);
		} finally {
			this._startingSessions.delete(options.session);
			this._startContexts.delete(options.session);
		}
	}

	private async _startWorkflow(options: IAgentHostWorkflowStartOptions): Promise<WorkflowRun> {
		const chat = parseChatUri(options.chat);
		if (!chat || chat.session !== options.session) {
			throw new Error(localize('workflow.chatOwner', "The workflow chat must belong to its session."));
		}
		if (await this._database.workflows.getSessionRun(options.session)) {
			throw new Error(localize('workflow.sessionAlreadyOwned', "This session already has a workflow."));
		}
		const readiness = await this._canDispatchSession(options.session, options.chat);
		if (readiness.kind === 'blocked') {
			throw new Error(readiness.reason);
		}
		if (this._runSourceDisabled(options)) {
			throw new Error(localize('workflow.sourceDisabled', "The workflow source is disabled."));
		}
		// Claim synchronously before the first runner await; Agent Merge cannot race a new run.
		this._owners.add(options.session);
		this._onDidChangeOwnership.fire(options.session);
		try {
			return await this._runner.start({ ...options, inputs: await this._inferInputs(options) });
		} catch (error) {
			if (!await this._database.workflows.getSessionRun(options.session)) {
				this._owners.delete(options.session);
				this._onDidChangeOwnership.fire(options.session);
			}
			throw error;
		}
	}

	private async _inferInputs(options: IAgentHostWorkflowStartOptions): Promise<WorkflowObject> {
		const inputs = options.inputs ?? {};
		const schema = options.snapshot.inputSchema?.properties?.repository;
		if (Object.hasOwn(inputs, 'repository') || schema?.type !== 'string' || schema.format !== 'uri') {
			return inputs;
		}
		const directories = this._configuration.getEffectiveWorkingDirectories(options.session) ?? [];
		const directory = directories.find(directory => directory === options.workspace) ?? (directories.length === 1 ? directories[0] : undefined);
		if (!directory) {
			return inputs;
		}
		const knownGit = directory === directories[0] ? readSessionGitState(this._stateManager.getSessionSummary(options.session)?._meta) : undefined;
		const git = knownGit?.githubOwner && knownGit.githubRepo ? knownGit : await this._gitService.getSessionGitState(URI.parse(directory));
		if (!git?.githubOwner || !git.githubRepo) {
			return inputs;
		}
		const repository = `https://github.com/${git.githubOwner}/${git.githubRepo}`;
		try {
			validateWorkflowValue(repository, schema);
		} catch (error) {
			if (!(error instanceof WorkflowValidationError)) {
				throw error;
			}
			this._logService.debug('[workflow] Session repository does not match the workflow input schema; it will be requested at its checkpoint.');
			return inputs;
		}
		return { ...inputs, repository };
	}

	private async _recordInitialRequest(run: WorkflowRun, context: IAgentHostWorkflowStartContext | undefined): Promise<void> {
		const chat = this._stateManager.getChatState(run.chat);
		if (!chat || chat.activeTurn || chat.turns.length) {
			return;
		}
		const startedAt = new Date(run.createdAt).toISOString();
		const turn: Turn = {
			id: generateUuid(),
			startedAt,
			message: {
				text: run.task,
				origin: { kind: MessageKind.User },
				model: context?.model,
				agent: context?.agent,
				attachments: context?.attachments ? deepClone([...context.attachments]) : undefined,
			},
			responseParts: [],
			state: TurnState.Complete,
			usage: undefined,
		};
		const persisted = this._localTurns.recordAndWait(run.session, run.chat, turn, undefined);
		this._stateManager.dispatchServerAction(run.chat, {
			type: ActionType.ChatTurnStarted, turnId: turn.id, startedAt, message: turn.message,
		});
		let preparingWorkspace = false;
		try {
			await persisted;
			preparingWorkspace = true;
			await this._workingDirectoryService.resolve({ session: run.session, chat: run.chat, turnId: turn.id, prompt: run.task });
			preparingWorkspace = false;
			if (this._stateManager.getActiveTurnId(run.chat) === turn.id) {
				this._stateManager.dispatchServerAction(run.chat, { type: ActionType.ChatTurnComplete, turnId: turn.id, duration: 0 });
			} else {
				await this._pause(run.session);
			}
			const completed = this._stateManager.getChatState(run.chat)?.turns.find(completed => completed.id === turn.id);
			if (completed) {
				await this._localTurns.recordAndWait(run.session, run.chat, completed, undefined);
			}
		} catch (error) {
			this._logService.error('[Workflow] Could not prepare the initial request.', error);
			this._stateManager.dispatchServerAction(run.chat, {
				type: ActionType.ChatError, turnId: turn.id, duration: 0,
				part: createErrorResponsePart({ errorType: 'internalError', message: toErrorMessage(error) }),
			});
			await this._pause(run.session);
			const failed = preparingWorkspace ? this._stateManager.getChatState(run.chat)?.turns.find(completed => completed.id === turn.id) : undefined;
			if (failed) {
				await this._localTurns.recordAndWait(run.session, run.chat, failed, undefined);
			}
			throw error;
		}
	}

	async controlWorkflow(control: WorkflowControl): Promise<WorkflowRun> {
		await this._ready();
		if (control.kind === 'resume' || control.kind === 'setStopAfter' || control.kind === 'provideInputs') {
			await this._requireEnabled();
		}
		const run = await this._database.workflows.getRun(control.runId);
		if (!run) {
			throw new Error(localize('workflow.runMissing', "The workflow no longer exists."));
		}
		if (control.kind === 'resume' || control.kind === 'provideInputs') {
			const readiness = await this._canDispatchSession(run.session, run.chat);
			if (readiness.kind === 'blocked' || this._runSourceDisabled(run)) {
				throw new Error(readiness.kind === 'blocked' ? readiness.reason : localize('workflow.sourceDisabled', "The workflow source is disabled."));
			}
		}
		return this._runner.control(control);
	}

	async setWorkflowSourceEnabled(sourceId: string, enabled: boolean): Promise<void> {
		await this._ready();
		if (!sourceId || sourceId.length > 1024) {
			throw new Error('Invalid workflow source identity');
		}
		await this._sourceChanges.queue(async () => {
			const enablement = { ...this._sourceEnablement(), [sourceId]: enabled };
			if (enabled) {
				if (this._sourceEnablement()[sourceId] === false) {
					this._enablingSources.add(sourceId);
				}
				try {
					await this._storage.setAndFlush(sourceEnablementKey, enablement);
				} finally {
					this._enablingSources.delete(sourceId);
				}
				return;
			}
			// Revocation is immediate and must not roll back on a storage failure.
			this._storage.set(sourceEnablementKey, enablement);
			const pauseRuns = async () => {
				for (const run of await this._database.workflows.listRuns()) {
					if (run.status !== 'completed' && run.status !== 'cancelled' && this._sources(run).some(source => source.id === sourceId)) {
						this._revokedSessions.add(run.session);
						await this._pause(run.session);
					}
				}
			};
			await Promises.settled([this._storage.whenIdle(), pauseRuns()]);
		});
	}

	async setWorkflowExtensionSources(sources: Readonly<Record<string, boolean>>): Promise<void> {
		await this._ready();
		if (!isWorkflowExtensionSources(sources)) {
			throw new Error('Invalid workflow extension source snapshot');
		}
		const next = { ...sources };
		await this._sourceChanges.queue(async () => {
			const previous = this._sourceEnablement(extensionSourceEnablementKey);
			const revoked = Object.fromEntries(Object.entries(next).map(([id, enabled]) => [id, enabled && previous[id] === true]));
			// Persist revocations before attempting any newly enabled sources, whose write may fail.
			this._storage.set(extensionSourceEnablementKey, revoked);
			const pauseRuns = async () => {
				for (const run of await this._database.workflows.listRuns()) {
					if (run.status !== 'completed' && run.status !== 'cancelled' && this._runSourceDisabled(run)) {
						this._revokedSessions.add(run.session);
						await this._pause(run.session);
					}
				}
			};
			await Promises.settled([this._storage.whenIdle(), pauseRuns()]);
			for (const [id, enabled] of Object.entries(next)) {
				if (enabled && !revoked[id]) {
					this._enablingExtensionSources.add(id);
				}
			}
			if (this._enablingExtensionSources.size) {
				try {
					await this._storage.setAndFlush(extensionSourceEnablementKey, next);
				} finally {
					this._enablingExtensionSources.clear();
				}
			}
		});
	}

	ownsContinuation(session: string): boolean {
		return !this._loaded || this._owners.has(session) || this._revokedSessions.has(session);
	}

	isQuietTurn(turn: ITurnEnd): boolean {
		return !!turn.turnId && this._issuedTurns.has(turn.turnId) && this._progress.get(turn.session)?.needsAttention !== true;
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		const issued = this._issuedTurns.get(request.turnId);
		if (isAgentMergeMessage(request.message) && this.ownsContinuation(request.session)) {
			return this._reject(localize('workflow.continuationOwner', "This session is owned by a workflow, not Agent Merge."));
		}
		if (isWorkflowMessage(request.message) && (!this._isEnabled() || !issued || issued.message !== request.message || issued.chat !== request.chat || this._revokedSessions.has(request.session) || issued.sources.some(source => this._sourceDisabled(source)))) {
			return this._reject(localize('workflow.assignmentRevoked', "The workflow assignment is no longer current."));
		}
		return undefined;
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.turnId) {
			const key = this._userActivityKey(turn.channel, turn.turnId);
			const activity = this._pendingUserActivity.get(key);
			this._pendingUserActivity.delete(key);
			if (activity && turn.reason.kind !== 'rejected') {
				void this._recordUserActivity(activity.session, activity.at);
			}
		}
		if (turn.reason.kind === 'localCommand') {
			return;
		}
		const issued = turn.turnId ? this._issuedTurns.get(turn.turnId) : undefined;
		if (issued && issued.chat === turn.channel) {
			if (issued.ended) {
				return;
			}
			issued.ended = true;
			const outcome = turn.reason.kind === 'success' ? 'completed' : turn.reason.kind === 'cancelled' ? 'cancelled' : 'error';
			void this._runner.onTurnEnd(issued.invocation, outcome).catch(error => this._recordFailure(error)).finally(() => {
				this._issuedTurns.delete(issued.invocation.turnId);
				this._scheduleWake();
			});
		} else if (this._owners.has(turn.session)) {
			this._scheduleWake();
		}
	}

	onDidDispatchAction(observed: IDispatchedAction): void {
		if (observed.rejectionReason) {
			return;
		}
		const action = observed.action;
		if (this._initialSessions.has(observed.session) && (
			action.type === ActionType.SessionConfigChanged || action.type === ActionType.SessionTitleChanged
			|| action.type === ActionType.SessionIsArchivedChanged || action.type === ActionType.SessionIsReadChanged
			|| action.type === ActionType.SessionWorkingDirectoryReplaced || action.type === ActionType.SessionWorkingDirectorySet
			|| action.type === ActionType.SessionWorkingDirectoryRemoved)) {
			void this._refreshInitialSession(observed.session).catch(error => this._recordFailure(error));
		}
		if (action.type === ActionType.RootConfigChanged && (action.replace || Object.hasOwn(action.config, AgentHostWorkflowsEnabledConfigKey))) {
			this._synchronizeEnablement();
		} else if (action.type === ActionType.ChatTurnStarted && action.message.origin.kind === MessageKind.User && !isWorkflowMessage(action.message) && !this._issuedTurns.has(action.turnId) && !this._localTurns.isLocal(observed.channel, action.turnId)
			&& this._active && (!this._loaded || this._owners.has(observed.session))) {
			const { channel, session } = observed;
			const turnId = action.turnId;
			const key = this._userActivityKey(channel, turnId);
			const activity = { session, at: Date.now() };
			this._pendingUserActivity.set(key, activity);
			// Admission is synchronous after this action. Wait for any rejection to
			// reduce before recording a send, including provider-promoted user turns.
			queueMicrotask(() => {
				if (this._pendingUserActivity.get(key) !== activity) {
					return;
				}
				this._pendingUserActivity.delete(key);
				if (this._stateManager.getActiveTurnId(channel) === turnId) {
					void this._recordUserActivity(session, activity.at);
				}
			});
		} else if (action.type === ActionType.SessionReady) {
			void this._database.workflows.getSessionRun(observed.session).then(async run => {
				if (run) {
					this._initialSessions.delete(observed.session);
					await this._database.workflows.discardInitialSession(observed.session);
					this._publish(run);
				} else {
					this._clearProjection(observed.session);
				}
			}).catch(error => this._recordFailure(error));
		} else if (action.type === ActionType.SessionIsArchivedChanged && action.isArchived && this._owners.has(observed.session)) {
			this._revokedSessions.add(observed.session);
			void this._pause(observed.session).catch(error => this._recordFailure(error));
		} else if (action.type === ActionType.ChatTruncated && observed.channel === this._chats.get(observed.session)
			|| action.type === ActionType.SessionChatRemoved && action.chat === this._chats.get(observed.session)) {
			this._revokedSessions.add(observed.session);
			void this._pause(observed.session).catch(error => this._recordFailure(error));
		}
	}

	private async _refreshInitialSession(session: string): Promise<void> {
		const initial = this._initialSessions.get(session);
		const state = this._stateManager.getSessionState(session);
		const summary = this._stateManager.getSessionSummary(session);
		if (!initial || !state || !summary) {
			return;
		}
		const snapshot = deepClone({ ...initial, summary, config: state.config && omitTransientSessionConfigValues(state.config.values) });
		this._initialSessions.set(session, snapshot);
		if (!await this._database.workflows.updateInitialSession(snapshot) && this._initialSessions.get(session) === snapshot) {
			this._initialSessions.delete(session);
		}
	}

	private _userActivityKey(channel: string, turnId: string): string {
		return JSON.stringify([channel, turnId]);
	}

	private async _recordUserActivity(session: string, at: number): Promise<void> {
		try {
			await this._ready();
			const run = await this._database.workflows.getSessionRun(session);
			if (run) {
				this._initialSessions.delete(session);
				await this._database.workflows.discardInitialSession(session);
				await this._runner.recordUserActivity(run.id, at);
			}
		} catch (error) {
			if (this._active && this._owners.has(session)) {
				this._logService.warn('[AgentHostWorkflowService] Failed to persist user activity', error);
			}
		}
	}

	async getCheckpoint(context: IServerToolExecutionContext): Promise<string> {
		const issued = this._invocation(context);
		if (!issued) {
			return JSON.stringify(this._stale());
		}
		const [run, checkpoint] = await Promise.all([
			this._database.workflows.getRun(issued.runId),
			this._runner.getCheckpoint(issued),
		]);
		const assignment = run?.assignment;
		if (!run || !checkpoint || assignment?.id !== issued.assignmentId || assignment.turnId !== issued.turnId
			|| assignment.revoked || assignment.delivery === 'ended' || !this._invocation(context)) {
			return JSON.stringify(this._stale());
		}
		return JSON.stringify({ task: run.task, checkpoint, assignment, stopAfter: run.stopAfter });
	}

	async prove(context: IServerToolExecutionContext, proof: WorkflowObject): Promise<WorkflowProofResult> {
		const invocation = this._invocation(context);
		return invocation ? this._runner.prove(invocation, proof) : this._stale();
	}

	async reportBlocked(context: IServerToolExecutionContext, reason: string): Promise<WorkflowProofResult> {
		const invocation = this._invocation(context);
		return invocation ? this._runner.reportBlocked(invocation, reason) : this._stale();
	}

	async canDispatch(run: WorkflowRun): Promise<WorkflowDispatchReadiness> {
		if (!this._active || !this._isEnabled() || this._failure || this._revokedSessions.has(run.session) || this._runSourceDisabled(run)) {
			return { kind: 'blocked', reason: localize('workflow.revoked', "The workflow is paused, disabled, or its host is shutting down.") };
		}
		return this._canDispatchSession(run.session, run.chat, true);
	}

	private async _canDispatchSession(session: string, chat: string, recovering = false): Promise<WorkflowDispatchReadiness> {
		const provider = this._providers.getProviderForSession(session);
		if (recovering && !provider && Date.now() - this._activationTime < providerStartupGrace) {
			return { kind: 'busy' };
		}
		if (!provider?.agentHostCapabilities?.workflows) {
			return { kind: 'blocked', reason: localize('workflow.providerUnavailable', "This workflow's agent provider is unavailable or does not support workflows.") };
		}
		if (await this._database.isSessionTombstoned(session)) {
			return { kind: 'blocked', reason: localize('workflow.deleted', "This session has been deleted.") };
		}
		if (!this._stateManager.getChatState(chat)) {
			if (!this._sessionHost) {
				return { kind: 'blocked', reason: localize('workflow.hostUnavailable', "Workflow turn routing is unavailable.") };
			}
			await this._sessionHost.restore(URI.parse(session), URI.parse(chat));
		}
		return this._readiness(session, chat);
	}

	private _readiness(session: string, chat: string): WorkflowDispatchReadiness {
		const state = this._stateManager.getSessionState(session);
		const chatState = this._stateManager.getChatState(chat);
		if (!state || !chatState || isSessionStatusArchived(state.status) || isChatReadOnly(chatState.interactivity, false)) {
			return { kind: 'blocked', reason: localize('workflow.readOnly', "The workflow chat is unavailable, archived, or read-only.") };
		}
		if (this._stateManager.isIdleProvisionalSession(session) || this._stateManager.hasActiveTurn(session) || chatState.queuedMessages?.length || chatState.steeringMessage) {
			return { kind: 'busy' };
		}
		return { kind: 'ready' };
	}

	async dispatch(run: WorkflowRun, assignment: WorkflowAssignment, text: string): Promise<void> {
		const readiness = await this.canDispatch(run);
		if (readiness.kind !== 'ready') {
			if (readiness.kind === 'busy') {
				throw new WorkflowDispatchBusyError();
			}
			throw new Error('Workflow assignment could not be admitted; reconciliation is required');
		}
		const context = await this._database.workflows.claimStartContext(run.id, assignment.turnId);
		this._initialSessions.delete(run.session);
		let sendAttempted = false;
		try {
			const provider = this._providers.getProviderForSession(run.session);
			const agent = context ? context.agent : provider?.chats.getAgent
				? await provider.chats.getAgent(URI.parse(run.chat), createAgentChatContext(this._stateManager, run.session, run.chat))
				: this._stateManager.getChatState(run.chat)?.turns.at(-1)?.message.agent;
			const current = await this._database.workflows.getRun(run.id);
			const prepared = current?.assignment;
			if (!this._isEnabled()
				|| !current || current.status !== 'running' || this._revokedSessions.has(run.session) || this._runSourceDisabled(current)
				|| current.session !== run.session || current.chat !== run.chat
				|| prepared?.id !== assignment.id || prepared.turnId !== assignment.turnId || prepared.checkpointId !== assignment.checkpointId
				|| prepared.revoked || prepared.delivery !== 'dispatching') {
				throw new Error('Workflow assignment could not be admitted; reconciliation is required');
			}
			const readiness = this._readiness(run.session, run.chat);
			if (readiness.kind !== 'ready') {
				throw readiness.kind === 'busy' ? new WorkflowDispatchBusyError() : new Error(readiness.reason);
			}
			const invocation = { runId: run.id, assignmentId: assignment.id, turnId: assignment.turnId };
			const message: Message = {
				text, origin: { kind: MessageKind.SystemNotification },
				_meta: toWorkflowMessageMeta(invocation, {
					kind: 'workflow',
					workflowLabel: run.snapshot.label,
					checkpointLabel: run.snapshot.checkpoints.find(checkpoint => checkpoint.id === assignment.checkpointId)!.label,
					reason: assignment.reason,
				}),
				model: context?.model, agent, attachments: this._initialAttachments(context),
			};
			this._issuedTurns.set(assignment.turnId, { session: run.session, chat: run.chat, invocation, message, sources: this._sources(run) });
			const action = { type: ActionType.ChatTurnStarted, turnId: assignment.turnId, startedAt: new Date().toISOString(), message } as const;
			this._stateManager.dispatchServerAction(run.chat, action);
			sendAttempted = true;
			this._turnService.handleTurnStarted(run.chat, action);
			if (this._stateManager.getActiveTurnId(run.chat) !== assignment.turnId) {
				sendAttempted = false;
				throw new Error('Workflow assignment was rejected by normal turn admission');
			}
		} catch (error) {
			if (context && !sendAttempted) {
				await this._database.workflows.releaseStartContext(run.id, assignment.turnId);
				const initial = await this._database.workflows.getInitialSession(run.session);
				if (initial && this._active) {
					this._initialSessions.set(run.session, initial);
				}
			}
			throw error;
		}
	}

	private _initialAttachments(context: IAgentHostWorkflowStartContext | undefined): MessageAttachment[] | undefined {
		return context?.attachments?.map(attachment => {
			const result = deepClone(attachment);
			delete result.range;
			return result;
		});
	}

	async cancel(run: WorkflowRun, assignment: WorkflowAssignment): Promise<void> {
		if (this._stateManager.getActiveTurnId(run.chat) !== assignment.turnId) {
			return;
		}
		if (!this._sessionHost) {
			throw new Error('Workflow cancellation routing is unavailable');
		}
		this._sessionHost.cancel(run.chat, assignment.turnId);
	}

	async reconcile(run: WorkflowRun, assignment: WorkflowAssignment): Promise<'running' | 'ended' | 'notStarted' | 'unknown'> {
		if (assignment.delivery === 'pending') {
			return 'notStarted';
		}
		const readiness = await this._canDispatchSession(run.session, run.chat);
		if (readiness.kind === 'blocked') {
			return 'unknown';
		}
		const state = this._stateManager.getChatState(run.chat);
		if (state?.activeTurn?.id === assignment.turnId) {
			this._issuedTurns.set(assignment.turnId, {
				session: run.session, chat: run.chat, message: state.activeTurn.message,
				invocation: { runId: run.id, assignmentId: assignment.id, turnId: assignment.turnId },
				sources: this._sources(run),
			});
			return 'running';
		}
		const turn = state?.turns.find(turn => turn.id === assignment.turnId);
		return turn ? 'ended' : 'unknown';
	}

	private _invocation(context: IServerToolExecutionContext): WorkflowInvocation | undefined {
		if (!this._active || !this._isEnabled() || this._failure) {
			return undefined;
		}
		const original = context.invocation;
		const issued = original?.toolCallId && !original.isSubagent ? this._issuedTurns.get(original.turnId) : undefined;
		return issued && !issued.ended && issued.chat === context.chatUri && issued.session === context.sessionUri && !this._revokedSessions.has(issued.session)
			&& !issued.sources.some(source => this._sourceDisabled(source))
			&& this._providers.getProviderForSession(issued.session)?.agentHostCapabilities?.workflows ? issued.invocation : undefined;
	}

	private _publish(run: WorkflowRun): void {
		const previous = this._progress.get(run.session);
		if (previous && previous.revision > run.revision) {
			return;
		}
		this._stateManager.markSessionUsed(run.session);
		const progress = getWorkflowProgress(run);
		if (this._revokingEnablement || run.status === 'paused' || run.status === 'cancelled') {
			this._revokedSessions.add(run.session);
		} else if (previous && previous.status !== 'running' && previous.status !== 'waiting'
			&& (run.status === 'running' || run.status === 'waiting')) {
			this._revokedSessions.delete(run.session);
		}
		this._owners.add(run.session);
		this._chats.set(run.session, run.chat);
		this._progress.set(run.session, progress);
		const state = this._stateManager.getSessionState(run.session);
		if (state) {
			this._stateManager.setSessionMeta(run.session, withAgentWorkflowProgress(state._meta, progress));
			if (progress.needsAttention && !previous?.needsAttention && (state.status & SessionStatus.IsRead)) {
				this._stateManager.dispatchServerAction(run.session, { type: ActionType.SessionIsReadChanged, isRead: false });
			}
			// Durable host work commits the draft even when its first condition
			// waits. SDK materialization and SessionReady still belong to first send.
			const summary = this._stateManager.getSessionSummary(run.session);
			if (summary) {
				this._stateManager.markSessionPersisted(run.session, summary);
			}
		}
		this._onDidChangeWorkflowRun.fire({ session: run.session, progress });
		this._onDidChangeOwnership.fire(run.session);
		this._scheduleWake();
	}

	private async _pause(session: string): Promise<void> {
		await this._controls.queue(session, async () => {
			for (let attempt = 0; attempt < 3; attempt++) {
				const run = await this._database.workflows.getSessionRun(session);
				if (!run) {
					return;
				}
				if (run.status !== 'running' && run.status !== 'waiting') {
					// A stopped or blocked run can still have a provider turn finishing.
					if (run.assignment) {
						await this.cancel(run, run.assignment);
					}
					return;
				}
				try {
					await this._runner.control({ kind: 'pause', runId: run.id, revision: run.revision });
					return;
				} catch (error) {
					if (!(error instanceof WorkflowConflictError) || attempt === 2) {
						throw error;
					}
				}
			}
		});
	}

	private async _forgetDeletedSession(session: string): Promise<void> {
		await this._database.workflows.deleteSession(session);
		this._owners.delete(session);
		this._progress.delete(session);
		this._chats.delete(session);
		this._initialSessions.delete(session);
		for (const [id, turn] of this._issuedTurns) {
			if (turn.session === session) {
				this._issuedTurns.delete(id);
			}
		}
		// Keep Agent Merge excluded while deleted session state is still visible.
		if (!this._stateManager.getSessionState(session)) {
			this._revokedSessions.delete(session);
		}
		this._onDidChangeWorkflowRun.fire({ session });
		this._onDidChangeOwnership.fire(session);
	}

	private _clearProjection(session: string): void {
		const state = this._stateManager.getSessionState(session);
		if (state) {
			this._stateManager.setSessionMeta(session, withAgentWorkflowProgress(state._meta, undefined));
		}
	}

	private _requestedEnabled(): boolean {
		return this._configuration.getRootValue(platformRootSchema, AgentHostWorkflowsEnabledConfigKey) === true;
	}

	private _isEnabled(): boolean {
		return this._enabled && !this._revokingEnablement && this._requestedEnabled();
	}

	private async _requireEnabled(): Promise<void> {
		if (this._requestedEnabled()) {
			await this._enablementReady;
		}
		if (!this._isEnabled()) {
			throw new Error(localize('workflow.disabled', "Workflows are disabled."));
		}
	}

	private _synchronizeEnablement(): void {
		const enabled = this._requestedEnabled();
		if (!enabled) {
			this._enabled = false;
			this._revokingEnablement = true;
			this._scheduler.cancel();
			for (const session of this._owners) {
				this._revokedSessions.add(session);
			}
		}
		this._enablementReady = this._enablementReady.catch(() => undefined).then(async () => {
			await this._initialization;
			if (!this._active) {
				return;
			}
			if (this._revokingEnablement) {
				for (const run of await this._database.workflows.listRuns()) {
					if (run.status !== 'completed' && run.status !== 'cancelled') {
						this._revokedSessions.add(run.session);
						await this._pause(run.session);
					}
				}
				this._revokingEnablement = false;
			}
			if (enabled && this._requestedEnabled()) {
				this._enabled = true;
				this._scheduleWake();
			}
		});
		void this._enablementReady.catch(error => this._recordFailure(error));
	}

	private _sourceEnablement(key = sourceEnablementKey): Record<string, boolean> {
		if (this._storage.loadError) {
			throw this._storage.loadError;
		}
		const value = this._storage.get<unknown>(key);
		if (value === undefined) {
			return {};
		}
		if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every(entry => typeof entry === 'boolean')) {
			throw new Error('Workflow source enablement is corrupt');
		}
		return value as Record<string, boolean>;
	}

	private _sourceDisabled(source: WorkflowSource): boolean {
		return this._enablingSources.has(source.id) || this._sourceEnablement()[source.id] === false
			|| (source.kind === 'extension' && (this._enablingExtensionSources.has(source.id.toLowerCase()) || this._sourceEnablement(extensionSourceEnablementKey)[source.id.toLowerCase()] !== true));
	}

	private _sources(run: Pick<WorkflowRun, 'snapshot'>): readonly WorkflowSource[] {
		return [run.snapshot.source, ...run.snapshot.checkpoints.map(checkpoint => checkpoint.type.source)].flatMap(source => source ? [source] : []);
	}

	private _runSourceDisabled(run: Pick<WorkflowRun, 'snapshot'>): boolean {
		return this._sources(run).some(source => this._sourceDisabled(source));
	}

	private _scheduleWake(): void {
		if (!this._active || !this._isEnabled()) {
			return;
		}
		if (this._waking) {
			this._wakeAgain = true;
			return;
		}
		this._scheduler.schedule(0);
	}

	private async _wake(): Promise<void> {
		if (!this._active) {
			return;
		}
		if (this._waking) {
			this._wakeAgain = true;
			return;
		}
		this._waking = true;
		try {
			if (!this._loaded) {
				await this._initialization?.catch(() => undefined);
				if (!this._loaded) {
					this._initialization = this._recover();
				}
			}
			await this._initialization;
			this._failure = undefined;
			if (!this._isEnabled()) {
				return;
			}
			if (!this._recovered && Date.now() - this._activationTime < providerStartupGrace
				&& [...this._progress].some(([session, progress]) => (progress.status === 'running' || progress.status === 'waiting') && !this._providers.getProviderForSession(session))) {
				this._scheduler.schedule(retryDelay);
				return;
			}
			await (this._recovered ? this._runner.wakeDue() : this._runner.recover());
			this._recovered = true;
			this._backoff = retryDelay;
			await this._scheduleNextWake();
		} catch (error) {
			this._recordFailure(error);
			this._backoff = Math.min(this._backoff * 2, maximumRetryDelay);
			if (this._active) {
				this._scheduler.schedule(this._backoff);
			}
		} finally {
			this._waking = false;
			if (this._wakeAgain) {
				this._wakeAgain = false;
				this._scheduleWake();
			}
		}
	}

	private async _scheduleNextWake(): Promise<void> {
		const next = (await this._database.workflows.listDueRuns(Number.MAX_SAFE_INTEGER, 1))[0];
		if (this._active && this._isEnabled() && next?.nextWakeAt !== undefined) {
			this._scheduler.schedule(Math.min(maximumRetryDelay, Math.max(1000, next.nextWakeAt - Date.now())));
		}
	}

	private async _ready(): Promise<void> {
		if (!this._active || !this._initialization) {
			throw new Error('Workflow runtime is not active');
		}
		await this._initialization;
		if (this._failure) {
			throw this._failure;
		}
	}

	private _recordFailure(error: unknown): void {
		if (!this._active) {
			return;
		}
		this._failure = error instanceof Error ? error : new Error(String(error));
		this._logService.error('[Workflows] Workflow runtime failed closed', error);
	}

	private _reject(message: string): IncomingRequestDisposition {
		return { kind: 'reject', stage: 'validation', error: { errorType: 'workflow', message } };
	}

	private _stale(): WorkflowProofResult {
		return { kind: 'stale_assignment', reason: localize('workflow.stale', "This tool call does not belong to the current workflow assignment. End the turn.") };
	}
}
