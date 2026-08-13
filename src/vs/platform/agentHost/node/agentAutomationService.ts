/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import type { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { dirname } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../common/state/protocol/common/errors.js';
import type { ActionEnvelope } from '../common/state/protocol/common/actions.js';
import {
	AutomationExecutionLifetime,
	AutomationMisfirePolicy,
	AutomationOperation,
	AutomationTriggerKind,
	type AutomationDefinition,
	type AutomationSchedule,
	type AutomationState,
} from '../common/state/protocol/channels-automation/state.js';
import type { ProtectedResourceMetadata } from '../common/state/protocol/common/state.js';
import {
	AutomationRunBlockerKind,
	AutomationRunCauseKind,
	AutomationRunOperation,
	AutomationRunStatus,
	type AutomationRunCause,
	type AutomationRunLifecycle,
	type AutomationRunState,
	type AutomationRunSummary,
} from '../common/state/protocol/channels-automation-run/state.js';
import {
	SessionInputRequestKind,
	SessionOriginKind,
	type SessionOrigin,
} from '../common/state/protocol/channels-session/state.js';
import type {
	AutomationCapabilities,
	AutomationImportTriggerNextRun,
	CreateAutomationParams,
	DisposeAutomationParams,
	FetchAutomationRunsParams,
	FetchAutomationRunsResult,
	ListAutomationsParams,
	ListAutomationsResult,
	ListAutomationTriggerDefinitionsParams,
	ListAutomationTriggerDefinitionsResult,
	PreviewAutomationScheduleParams,
	PreviewAutomationScheduleResult,
	RunAutomationParams,
	RunAutomationResult,
	UpdateAutomationParams,
} from '../common/state/protocol/commands.js';
import { ActionType } from '../common/state/sessionActions.js';
import { MessageKind, parseRequiredSessionUriFromChatUri } from '../common/state/sessionState.js';
import { ProtocolError } from '../common/state/sessionProtocol.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

const STORE_VERSION = 2;
const TICK_INTERVAL = 60_000;
const MAX_SCHEDULE_LOOKAHEAD_MINUTES = 366 * 24 * 60;
const RUN_HISTORY_LIMIT = 50;

interface IPersistedAutomationStore {
	readonly version: number;
	readonly automations: AutomationState[];
	readonly runs: AutomationRunState[];
	readonly requestRuns: Record<string, string>;
	readonly triggerNextRuns: Record<string, Record<string, string>>;
	readonly initialTurnIds: Record<string, string>;
	readonly pendingImports?: string[];
}

export interface IAutomationSessionExecutor {
	readonly onDidAuthenticate: Event<void>;
	getMissingAuthentication(definition: AutomationDefinition): readonly ProtectedResourceMetadata[];
	createSession(definition: AutomationDefinition, automation: string, run: string): Promise<{ session: string; chat: string }>;
	startSession(session: string, chat: string, definition: AutomationDefinition, turnId: string): Promise<void>;
	cancelSession(session: string, turnId: string): Promise<void>;
	disposeSession(session: string): Promise<void>;
}

export class AgentAutomationService extends Disposable {

	readonly capabilities: AutomationCapabilities = {
		execution: { lifetime: AutomationExecutionLifetime.HostLifetime },
		create: {},
		schedules: {
			minIntervalMinutes: 1,
		},
		runCancellation: {},
		schedulePreview: {},
		runHistoryLimit: RUN_HISTORY_LIMIT,
	};

	private readonly _requestRuns = new Map<string, string>();
	private readonly _triggerNextRuns = new Map<string, Map<string, string>>();
	private readonly _initialTurnIds = new Map<string, string>();
	private readonly _pendingImports = new Set<string>();
	private readonly _persistSequencer = new Sequencer();
	private readonly _tickSequencer = new Sequencer();
	private readonly _ready: Promise<void>;
	private readonly _scheduler = this._register(new RunOnceScheduler(() => {
		void this._queueTick().finally(() => this._scheduler.schedule(TICK_INTERVAL));
	}, TICK_INTERVAL));

	constructor(
		private readonly _resource: URI | undefined,
		private readonly _fileService: IFileService,
		private readonly _stateManager: AgentHostStateManager,
		private readonly _executor: IAutomationSessionExecutor,
		private readonly _logService: ILogService,
	) {
		super();
		this._ready = this._load();
		this._register(this._stateManager.onDidEmitEnvelope(envelope => this._onEnvelope(envelope)));
		this._register(this._executor.onDidAuthenticate(() => {
			if (this._resource) {
				this._scheduler.schedule(0);
			}
		}));
		if (this._resource) {
			void this._ready.then(() => {
				void this._queueTick();
				this._scheduler.schedule(TICK_INTERVAL);
			});
		}
	}

	async list(params: ListAutomationsParams): Promise<ListAutomationsResult> {
		await this._ready;
		const items = this._stateManager.listAutomationSummaries()
			.filter(item => params.enabled === undefined || item.enabled === params.enabled);
		const offset = decodeCursor(params.cursor);
		const limit = Math.max(1, params.limit ?? (items.length || 1));
		const page = items.slice(offset, offset + limit);
		return {
			items: page,
			...(offset + page.length < items.length ? { nextCursor: encodeCursor(offset + page.length) } : {}),
		};
	}

	async listTriggerDefinitions(_params: ListAutomationTriggerDefinitionsParams): Promise<ListAutomationTriggerDefinitionsResult> {
		return { items: [] };
	}

	async create(params: CreateAutomationParams): Promise<void> {
		await this._ready;
		if (this._stateManager.getAutomationState(params.channel)) {
			throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Automation already exists: ${params.channel}`);
		}
		validateDefinition(params.definition);
		validateImport(params);
		const now = new Date().toISOString();
		const state: AutomationState = {
			resource: params.channel,
			definition: params.definition,
			revision: 1,
			runs: [],
			operations: [AutomationOperation.Update, AutomationOperation.Dispose, AutomationOperation.Run],
			createdAt: now,
			modifiedAt: now,
		};
		this._initializeSchedule(state, new Date(), params.import?.triggerNextRuns);
		if (params.import?.triggerNextRuns?.length) {
			this._pendingImports.add(state.resource);
		}
		this._stateManager.addAutomation(state);
		await this._persist();
	}

	async update(params: UpdateAutomationParams): Promise<void> {
		await this._ready;
		const state = this._requireAutomation(params.channel);
		if (state.revision !== params.expectedRevision) {
			throw new ProtocolError(AhpErrorCodes.Conflict, `Automation revision conflict: ${params.channel}`);
		}
		const wasEnabled = state.definition.enabled;
		const pendingImport = this._pendingImports.has(state.resource);
		const definition: AutomationDefinition = {
			...state.definition,
			...params.changes,
			session: params.changes.session ?? state.definition.session,
			triggers: params.changes.triggers ?? state.definition.triggers,
			message: params.changes.message ?? state.definition.message,
		};
		validateDefinition(definition);
		const modifiedAt = new Date().toISOString();
		this._stateManager.dispatchServerAction(params.channel, {
			type: ActionType.AutomationDefinitionChanged,
			definition,
			revision: state.revision + 1,
			modifiedAt,
			nextRunAt: undefined,
		});
		const updated = this._requireAutomation(params.channel);
		if (pendingImport && params.changes.triggers === undefined) {
			this._updateNextRunAt(updated);
		} else {
			this._recomputeSchedule(updated, new Date());
		}
		if (pendingImport && (params.changes.enabled !== undefined || params.changes.triggers !== undefined)) {
			this._pendingImports.delete(updated.resource);
		}
		this._stateManager.dispatchServerAction(params.channel, {
			type: ActionType.AutomationDefinitionChanged,
			definition: updated.definition,
			revision: updated.revision,
			modifiedAt: updated.modifiedAt,
			nextRunAt: updated.nextRunAt,
		});
		await this._persist();
		if (!wasEnabled && definition.enabled) {
			this._scheduler.schedule(0);
		}
	}

	async disposeAutomation(params: DisposeAutomationParams): Promise<void> {
		await this._ready;
		const state = this._requireAutomation(params.channel);
		if (state.runs.some(run => !isTerminal(run.lifecycle))) {
			throw new ProtocolError(AhpErrorCodes.Conflict, `Automation has an active run: ${params.channel}`);
		}
		for (const run of state.runs) {
			this._forgetRun(run.resource);
			this._stateManager.removeAutomationRun(run.resource);
		}
		this._triggerNextRuns.delete(params.channel);
		this._pendingImports.delete(params.channel);
		this._stateManager.removeAutomation(params.channel);
		await this._persist();
	}

	async run(params: RunAutomationParams): Promise<RunAutomationResult> {
		await this._ready;
		const requestKey = `${params.channel}\0${params.requestId}`;
		const existing = this._requestRuns.get(requestKey);
		if (existing) {
			return { run: existing };
		}
		const automation = this._requireAutomation(params.channel);
		if (this._hasActiveRun(automation.resource)) {
			throw new ProtocolError(AhpErrorCodes.Conflict, `Automation already has an active run: ${params.channel}`);
		}
		const missingAuthentication = this._executor.getMissingAuthentication(automation.definition);
		if (missingAuthentication.length > 0) {
			throw new ProtocolError(
				AhpErrorCodes.AuthRequired,
				`Authentication is required to run automation: ${params.channel}`,
				{ resources: missingAuthentication },
			);
		}
		const run = await this._createRun(automation, { kind: AutomationRunCauseKind.Manual }, requestKey);
		return { run };
	}

	async fetchRuns(params: FetchAutomationRunsParams): Promise<FetchAutomationRunsResult> {
		await this._ready;
		const state = this._requireAutomation(params.channel);
		const offset = decodeCursor(params.cursor ?? state.runsNextCursor);
		const allRuns = state.runs;
		const runs = allRuns.slice(offset, offset + 20);
		this._stateManager.dispatchServerAction(params.channel, {
			type: ActionType.AutomationRunsLoaded,
			runs,
			...(offset + runs.length < allRuns.length ? { nextCursor: encodeCursor(offset + runs.length) } : {}),
		});
		return {};
	}

	async preview(params: PreviewAutomationScheduleParams): Promise<PreviewAutomationScheduleResult> {
		const items: string[] = [];
		let after = new Date();
		for (let i = 0; i < Math.max(1, Math.min(params.count ?? 3, 20)); i++) {
			const next = computeNextSchedule(params.schedule, after);
			if (!next) {
				break;
			}
			items.push(next.toISOString());
			after = next;
		}
		return { items };
	}

	async getSessionOrigin(session: string): Promise<SessionOrigin | undefined> {
		await this._ready;
		for (const automation of this._stateManager.listAutomationSummaries()) {
			const run = this._stateManager.getAutomationState(automation.resource)?.runs
				.map(summary => this._stateManager.getAutomationRunState(summary.resource))
				.find(candidate => candidate?.sessions.includes(session));
			if (run) {
				return { kind: SessionOriginKind.Automation, automation: automation.resource, run: run.resource };
			}
		}
		return undefined;
	}

	async cancel(runResource: string): Promise<void> {
		await this._ready;
		const run = this._stateManager.getAutomationRunState(runResource);
		if (!run) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Automation run not found: ${runResource}`);
		}
		if (isTerminal(run.lifecycle) || !run.operations.includes(AutomationRunOperation.Cancel)) {
			throw new ProtocolError(AhpErrorCodes.Conflict, `Automation run cannot be cancelled: ${runResource}`);
		}
		const turnId = this._initialTurnIds.get(runResource);
		if (run.primarySession && turnId) {
			await this._executor.cancelSession(run.primarySession, turnId);
		}
		await this._setRunLifecycle(runResource, {
			status: AutomationRunStatus.Cancelled,
			createdAt: run.lifecycle.createdAt,
			...(runStartedAt(run.lifecycle) ? { startedAt: runStartedAt(run.lifecycle) } : {}),
			completedAt: new Date().toISOString(),
		}, []);
	}

	private async _createRun(automation: AutomationState, cause: AutomationRunCause, requestKey?: string): Promise<string> {
		const runResource = `ahp-automation-run:/${generateUuid()}`;
		const createdAt = new Date().toISOString();
		const run: AutomationRunState = {
			resource: runResource,
			automation: automation.resource,
			cause,
			lifecycle: { status: AutomationRunStatus.Pending, createdAt },
			sessions: [],
			artifacts: [],
			operations: [AutomationRunOperation.Cancel],
		};
		const turnId = generateUuid();
		this._initialTurnIds.set(runResource, turnId);
		if (requestKey) {
			this._requestRuns.set(requestKey, runResource);
		}
		this._stateManager.restoreAutomationRun(run);
		this._setRunSummary(automation.resource, run);
		await this._persist();
		if (this._isRunTerminal(runResource)) {
			return runResource;
		}

		try {
			const created = await this._executor.createSession(automation.definition, automation.resource, runResource);
			if (this._isRunTerminal(runResource)) {
				await this._disposeSessionAfterCancellation(created.session, runResource);
				return runResource;
			}
			this._stateManager.dispatchServerAction(runResource, { type: ActionType.AutomationRunSessionSet, session: created.session });
			this._stateManager.dispatchServerAction(runResource, { type: ActionType.AutomationRunPrimarySessionChanged, primarySession: created.session });
			await this._setRunLifecycle(runResource, {
				status: AutomationRunStatus.Running,
				createdAt,
				startedAt: new Date().toISOString(),
			}, [AutomationRunOperation.Cancel]);
			await this._persist();
			if (this._isRunTerminal(runResource)) {
				await this._disposeSessionAfterCancellation(created.session, runResource);
				return runResource;
			}
			await this._executor.startSession(created.session, created.chat, automation.definition, turnId);
		} catch (error) {
			if (this._isRunTerminal(runResource)) {
				return runResource;
			}
			await this._setRunLifecycle(runResource, {
				status: AutomationRunStatus.Failed,
				createdAt,
				completedAt: new Date().toISOString(),
				error: {
					errorType: error instanceof Error ? error.name : 'Error',
					message: error instanceof Error ? error.message : String(error),
					...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
				},
			}, []);
		}
		return runResource;
	}

	private _isRunTerminal(runResource: string): boolean {
		const run = this._stateManager.getAutomationRunState(runResource);
		return !run || isTerminal(run.lifecycle);
	}

	/** Whether the automation currently holds its single active-run slot. */
	private _hasActiveRun(automationResource: string): boolean {
		const automation = this._stateManager.getAutomationState(automationResource);
		return !!automation?.runs.some(run => !isTerminal(run.lifecycle));
	}

	private async _disposeSessionAfterCancellation(session: string, runResource: string): Promise<void> {
		try {
			await this._executor.disposeSession(session);
		} catch (error) {
			this._logService.error(`[AgentAutomationService] Failed to dispose session created after run cancellation: ${runResource}`, error);
			return;
		}
		try {
			const run = this._stateManager.getAutomationRunState(runResource);
			if (!run) {
				return;
			}
			if (run.primarySession === session) {
				this._stateManager.dispatchServerAction(runResource, { type: ActionType.AutomationRunPrimarySessionChanged, primarySession: undefined });
			}
			if (run.sessions.includes(session)) {
				this._stateManager.dispatchServerAction(runResource, { type: ActionType.AutomationRunSessionRemoved, session });
			}
			const updated = this._stateManager.getAutomationRunState(runResource);
			if (updated) {
				this._setRunSummary(updated.automation, updated);
				await this._persist();
			}
		} catch (error) {
			this._logService.error(`[AgentAutomationService] Failed to remove a disposed session from automation run: ${runResource}`, error);
		}
	}

	private async _setRunLifecycle(runResource: string, lifecycle: AutomationRunLifecycle, operations: AutomationRunOperation[]): Promise<void> {
		this._stateManager.dispatchServerAction(runResource, {
			type: ActionType.AutomationRunLifecycleChanged,
			lifecycle,
			operations,
		});
		const run = this._stateManager.getAutomationRunState(runResource);
		if (run) {
			this._setRunSummary(run.automation, run);
		}
		await this._persist();
	}

	private _setRunSummary(automationResource: string, run: AutomationRunState): void {
		const summary: AutomationRunSummary = {
			resource: run.resource,
			automation: run.automation,
			cause: run.cause,
			lifecycle: run.lifecycle,
			primarySession: run.primarySession,
			sessionCount: run.sessions.length,
			artifactCount: run.artifacts.length,
			operations: run.operations,
			_meta: run._meta,
		};
		this._stateManager.dispatchServerAction(automationResource, {
			type: ActionType.AutomationRunSummarySet,
			run: summary,
		});
		this._pruneRunHistory(automationResource);
	}

	/**
	 * Drops the oldest terminal runs once the retention limit advertised through
	 * {@link capabilities} is exceeded, together with the run state and the
	 * bookkeeping that belongs to those runs.
	 */
	private _pruneRunHistory(automationResource: string): void {
		const automation = this._stateManager.getAutomationState(automationResource);
		if (!automation || automation.runs.length <= RUN_HISTORY_LIMIT) {
			return;
		}
		// Summaries are ordered newest first, so anything past the limit is the oldest history.
		for (const summary of automation.runs.slice(RUN_HISTORY_LIMIT)) {
			if (!isTerminal(summary.lifecycle)) {
				continue;
			}
			this._forgetRun(summary.resource);
			this._stateManager.dispatchServerAction(automationResource, {
				type: ActionType.AutomationRunSummaryRemoved,
				run: summary.resource,
			});
			this._stateManager.removeAutomationRun(summary.resource);
		}
	}

	/** Releases the idempotency and turn bookkeeping held for a run that no longer exists. */
	private _forgetRun(runResource: string): void {
		this._initialTurnIds.delete(runResource);
		for (const [key, value] of this._requestRuns) {
			if (value === runResource) {
				this._requestRuns.delete(key);
			}
		}
	}

	private _onEnvelope(envelope: ActionEnvelope): void {
		const session = envelope.channel.startsWith('ahp-chat:')
			? parseRequiredSessionUriFromChatUri(envelope.channel) ?? envelope.channel
			: envelope.channel;
		const run = [...this._stateManager.listAutomationSummaries()]
			.flatMap(summary => this._stateManager.getAutomationState(summary.resource)?.runs ?? [])
			.map(summary => this._stateManager.getAutomationRunState(summary.resource))
			.find(candidate => candidate?.sessions.includes(session));
		if (!run || isTerminal(run.lifecycle)) {
			return;
		}
		const turnId = this._initialTurnIds.get(run.resource);
		if (envelope.action.type === ActionType.ChatTurnComplete && envelope.action.turnId === turnId) {
			void this._setRunLifecycle(run.resource, {
				status: AutomationRunStatus.Completed,
				createdAt: run.lifecycle.createdAt,
				startedAt: runStartedAt(run.lifecycle) ?? new Date().toISOString(),
				completedAt: new Date().toISOString(),
			}, []);
		} else if (envelope.action.type === ActionType.ChatTurnCancelled && envelope.action.turnId === turnId) {
			void this._setRunLifecycle(run.resource, {
				status: AutomationRunStatus.Cancelled,
				createdAt: run.lifecycle.createdAt,
				...(runStartedAt(run.lifecycle) ? { startedAt: runStartedAt(run.lifecycle) } : {}),
				completedAt: new Date().toISOString(),
			}, []);
		} else if (envelope.action.type === ActionType.ChatError && envelope.action.turnId === turnId) {
			void this._setRunLifecycle(run.resource, {
				status: AutomationRunStatus.Failed,
				createdAt: run.lifecycle.createdAt,
				...(runStartedAt(run.lifecycle) ? { startedAt: runStartedAt(run.lifecycle) } : {}),
				completedAt: new Date().toISOString(),
				error: envelope.action.error,
			}, []);
		} else if (envelope.action.type === ActionType.SessionInputNeededSet) {
			const blocker = envelope.action.request.kind === SessionInputRequestKind.ChatInput
				? AutomationRunBlockerKind.UserInput
				: envelope.action.request.kind === SessionInputRequestKind.ToolConfirmation
					? AutomationRunBlockerKind.ToolConfirmation
					: envelope.action.request.kind === SessionInputRequestKind.ToolAuthentication
						? AutomationRunBlockerKind.Authentication
						: AutomationRunBlockerKind.ClientExecution;
			void this._setRunLifecycle(run.resource, {
				status: AutomationRunStatus.Blocked,
				createdAt: run.lifecycle.createdAt,
				startedAt: runStartedAt(run.lifecycle) ?? new Date().toISOString(),
				blocker: { kind: blocker },
			}, [AutomationRunOperation.Cancel]);
		} else if (envelope.action.type === ActionType.SessionInputNeededRemoved) {
			const session = this._stateManager.getSessionState(envelope.channel);
			if (session && (!session.inputNeeded || session.inputNeeded.length === 0)) {
				void this._setRunLifecycle(run.resource, {
					status: AutomationRunStatus.Running,
					createdAt: run.lifecycle.createdAt,
					startedAt: runStartedAt(run.lifecycle) ?? new Date().toISOString(),
				}, [AutomationRunOperation.Cancel]);
			}
		}
	}

	private _queueTick(): Promise<void> {
		return this._tickSequencer.queue(() => this._tick());
	}

	private async _tick(): Promise<void> {
		await this._ready;
		const now = new Date();
		for (const summary of this._stateManager.listAutomationSummaries()) {
			const automation = this._stateManager.getAutomationState(summary.resource);
			if (!automation?.definition.enabled || this._hasActiveRun(automation.resource)) {
				continue;
			}
			if (this._executor.getMissingAuthentication(automation.definition).length > 0) {
				continue;
			}
			const nextByTrigger = this._triggerNextRuns.get(automation.resource) ?? new Map<string, string>();
			let runCause: AutomationRunCause | undefined;
			for (const trigger of automation.definition.triggers) {
				if (trigger.kind !== AutomationTriggerKind.Schedule) {
					continue;
				}
				const due = nextByTrigger.get(trigger.id);
				if (!due || new Date(due).getTime() > now.getTime()) {
					continue;
				}
				const next = computeNextSchedule(trigger.schedule, now);
				if (!next) {
					nextByTrigger.delete(trigger.id);
					continue;
				}
				nextByTrigger.set(trigger.id, next.toISOString());
				if (!runCause && trigger.misfirePolicy !== AutomationMisfirePolicy.Skip) {
					runCause = {
						kind: AutomationRunCauseKind.Trigger,
						triggerId: trigger.id,
						scheduledFor: due,
						catchUp: new Date(due).getTime() + TICK_INTERVAL < now.getTime(),
					};
				}
			}
			this._triggerNextRuns.set(automation.resource, nextByTrigger);
			const current = this._requireAutomation(automation.resource);
			this._stateManager.dispatchServerAction(current.resource, {
				type: ActionType.AutomationDefinitionChanged,
				definition: current.definition,
				revision: current.revision,
				modifiedAt: current.modifiedAt,
				nextRunAt: this._computeNextRunAt(current),
			});
			if (runCause) {
				await this._createRun(current, runCause);
			}
		}
		await this._persist();
	}

	private _initializeSchedule(state: AutomationState, after: Date, importedNextRuns: readonly AutomationImportTriggerNextRun[] | undefined): void {
		this._recomputeSchedule(state, after);
		if (!importedNextRuns?.length) {
			return;
		}
		const nextByTrigger = this._triggerNextRuns.get(state.resource)!;
		for (const nextRun of importedNextRuns) {
			nextByTrigger.set(nextRun.triggerId, nextRun.nextRunAt);
		}
		this._updateNextRunAt(state);
	}

	private _recomputeSchedule(state: AutomationState, after: Date): void {
		const nextByTrigger = new Map<string, string>();
		for (const trigger of state.definition.triggers) {
			if (trigger.kind !== AutomationTriggerKind.Schedule) {
				continue;
			}
			const next = computeNextSchedule(trigger.schedule, after);
			if (next) {
				nextByTrigger.set(trigger.id, next.toISOString());
			}
		}
		this._triggerNextRuns.set(state.resource, nextByTrigger);
		this._updateNextRunAt(state);
	}

	private _updateNextRunAt(state: AutomationState): void {
		state.nextRunAt = this._computeNextRunAt(state);
	}

	private _computeNextRunAt(state: AutomationState): string | undefined {
		const values = [...(this._triggerNextRuns.get(state.resource)?.values() ?? [])].sort();
		return state.definition.enabled ? values[0] : undefined;
	}

	private _requireAutomation(resource: string): AutomationState {
		const state = this._stateManager.getAutomationState(resource);
		if (!state) {
			throw new ProtocolError(AhpErrorCodes.NotFound, `Automation not found: ${resource}`);
		}
		return state;
	}

	private async _load(): Promise<void> {
		if (!this._resource) {
			return;
		}
		try {
			const raw = await this._fileService.readFile(this._resource);
			const data = JSON.parse(raw.value.toString()) as IPersistedAutomationStore;
			if (data.version !== STORE_VERSION) {
				throw new Error(`Unsupported automation store version: ${data.version}`);
			}
			for (const automation of data.automations) {
				this._stateManager.restoreAutomation(automation);
			}
			for (const run of data.runs) {
				this._stateManager.restoreAutomationRun(run);
			}
			for (const [key, value] of Object.entries(data.requestRuns)) {
				this._requestRuns.set(key, value);
			}
			for (const [automation, nextRuns] of Object.entries(data.triggerNextRuns)) {
				this._triggerNextRuns.set(automation, new Map(Object.entries(nextRuns)));
			}
			for (const [run, turnId] of Object.entries(data.initialTurnIds)) {
				this._initialTurnIds.set(run, turnId);
			}
			for (const automation of data.pendingImports ?? []) {
				this._pendingImports.add(automation);
			}
			let recoveredRun = false;
			for (const run of data.runs) {
				if (isTerminal(run.lifecycle)) {
					continue;
				}
				recoveredRun = true;
				const lifecycle: AutomationRunLifecycle = {
					status: AutomationRunStatus.Failed,
					createdAt: run.lifecycle.createdAt,
					...(runStartedAt(run.lifecycle) ? { startedAt: runStartedAt(run.lifecycle) } : {}),
					completedAt: new Date().toISOString(),
					error: {
						errorType: 'HostRestarted',
						message: 'The agent host restarted before the automation run completed.',
					},
				};
				this._stateManager.dispatchServerAction(run.resource, {
					type: ActionType.AutomationRunLifecycleChanged,
					lifecycle,
					operations: [],
				});
				const restored = this._stateManager.getAutomationRunState(run.resource);
				if (restored) {
					this._setRunSummary(restored.automation, restored);
				}
			}
			if (recoveredRun) {
				await this._persist();
			}
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this._logService.error('[AgentAutomationService] Failed to load automation store', error);
			}
		}
	}

	private _persist(): Promise<void> {
		if (!this._resource) {
			return Promise.resolve();
		}
		return this._persistSequencer.queue(async () => {
			const automations = this._stateManager.listAutomationSummaries()
				.map(summary => this._stateManager.getAutomationState(summary.resource))
				.filter((state): state is AutomationState => !!state);
			const runs = automations.flatMap(automation => automation.runs)
				.map(summary => this._stateManager.getAutomationRunState(summary.resource))
				.filter((state): state is AutomationRunState => !!state);
			const data: IPersistedAutomationStore = {
				version: STORE_VERSION,
				automations,
				runs,
				requestRuns: Object.fromEntries(this._requestRuns),
				triggerNextRuns: Object.fromEntries([...this._triggerNextRuns].map(([key, value]) => [key, Object.fromEntries(value)])),
				initialTurnIds: Object.fromEntries(this._initialTurnIds),
				pendingImports: [...this._pendingImports],
			};
			await this._fileService.createFolder(dirname(this._resource!));
			await this._fileService.writeFile(this._resource!, VSBuffer.fromString(JSON.stringify(data)));
		});
	}
}

function validateDefinition(definition: AutomationDefinition): void {
	if (!definition.title.trim() || !definition.message.text.trim()) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Automation title and message are required');
	}
	if (definition.message.origin.kind !== MessageKind.User) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Automation message must originate from the user');
	}
	const ids = new Set<string>();
	for (const trigger of definition.triggers) {
		if (!trigger.id || ids.has(trigger.id)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Automation trigger id must be unique: ${trigger.id}`);
		}
		ids.add(trigger.id);
		// This authority advertises no event-trigger definitions and its scheduler only
		// fires schedules, so accepting an event trigger would silently never run.
		if (trigger.kind === AutomationTriggerKind.Event) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Automation event triggers are not supported: ${trigger.id}`);
		}
		if (trigger.kind === AutomationTriggerKind.Schedule && !computeNextSchedule(trigger.schedule, new Date())) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Invalid automation schedule: ${trigger.id}`);
		}
	}
}

function validateImport(params: CreateAutomationParams): void {
	if (!params.import) {
		return;
	}
	if (params.definition.enabled) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Imported automation definitions must be disabled');
	}
	const scheduleTriggers = new Set(params.definition.triggers
		.filter(trigger => trigger.kind === AutomationTriggerKind.Schedule)
		.map(trigger => trigger.id));
	const importedTriggers = new Set<string>();
	for (const nextRun of params.import.triggerNextRuns ?? []) {
		if (!scheduleTriggers.has(nextRun.triggerId)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Imported next run references an unknown schedule trigger: ${nextRun.triggerId}`);
		}
		if (importedTriggers.has(nextRun.triggerId)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Imported next run is duplicated for trigger: ${nextRun.triggerId}`);
		}
		if (!Number.isFinite(Date.parse(nextRun.nextRunAt))) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Imported next run is not an ISO 8601 timestamp: ${nextRun.triggerId}`);
		}
		importedTriggers.add(nextRun.triggerId);
	}
}

function isTerminal(lifecycle: AutomationRunLifecycle): boolean {
	return lifecycle.status === AutomationRunStatus.Completed
		|| lifecycle.status === AutomationRunStatus.Failed
		|| lifecycle.status === AutomationRunStatus.Cancelled;
}

function runStartedAt(lifecycle: AutomationRunLifecycle): string | undefined {
	switch (lifecycle.status) {
		case AutomationRunStatus.Pending:
			return undefined;
		case AutomationRunStatus.Running:
		case AutomationRunStatus.Blocked:
		case AutomationRunStatus.Completed:
		case AutomationRunStatus.Failed:
		case AutomationRunStatus.Cancelled:
			return lifecycle.startedAt;
	}
}

function computeNextSchedule(schedule: AutomationSchedule, after: Date): Date | undefined {
	if (typeof schedule.expression !== 'string' || typeof schedule.timeZone !== 'string') {
		return undefined;
	}
	const matcher = parseCron(schedule.expression);
	if (!matcher) {
		return undefined;
	}
	for (let minute = 1; minute <= MAX_SCHEDULE_LOOKAHEAD_MINUTES; minute++) {
		const candidate = new Date(Math.floor(after.getTime() / 60_000) * 60_000 + minute * 60_000);
		const parts = getZonedParts(candidate, schedule.timeZone);
		if (!parts) {
			return undefined;
		}
		if (matcher.minutes.has(parts.minute)
			&& matcher.hours.has(parts.hour)
			&& matcher.months.has(parts.month)
			&& cronDayMatches(matcher, parts.day, parts.weekdayNumber)) {
			return candidate;
		}
	}
	return undefined;
}

function getZonedParts(date: Date, timeZone: string): { minute: number; hour: number; day: number; month: number; weekday: string; weekdayNumber: number } | undefined {
	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			minute: '2-digit',
			hour: '2-digit',
			hourCycle: 'h23',
			day: '2-digit',
			month: '2-digit',
			weekday: 'long',
		});
		const values = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
		const weekday = values.weekday.toLowerCase();
		return {
			minute: Number(values.minute),
			hour: Number(values.hour),
			day: Number(values.day),
			month: Number(values.month),
			weekday,
			weekdayNumber: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday),
		};
	} catch {
		return undefined;
	}
}

interface ICronMatcher {
	readonly minutes: Set<number>;
	readonly hours: Set<number>;
	readonly days: Set<number>;
	readonly months: Set<number>;
	readonly weekdays: Set<number>;
	readonly daysWildcard: boolean;
	readonly weekdaysWildcard: boolean;
}

function parseCron(expression: string): ICronMatcher | undefined {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		return undefined;
	}
	const minutes = parseCronField(fields[0], 0, 59);
	const hours = parseCronField(fields[1], 0, 23);
	const days = parseCronField(fields[2], 1, 31);
	const months = parseCronField(fields[3], 1, 12, cronMonths);
	const weekdays = parseCronField(fields[4], 0, 7, cronWeekdays, value => value === 7 ? 0 : value);
	return minutes && hours && days && months && weekdays
		? {
			minutes,
			hours,
			days,
			months,
			weekdays,
			daysWildcard: fields[2].startsWith('*'),
			weekdaysWildcard: fields[4].startsWith('*'),
		}
		: undefined;
}

function cronDayMatches(matcher: ICronMatcher, day: number, weekday: number): boolean {
	const dayMatches = matcher.days.has(day);
	const weekdayMatches = matcher.weekdays.has(weekday);
	return !matcher.daysWildcard && !matcher.weekdaysWildcard
		? dayMatches || weekdayMatches
		: dayMatches && weekdayMatches;
}

const cronMonths = new Map([
	['jan', 1],
	['feb', 2],
	['mar', 3],
	['apr', 4],
	['may', 5],
	['jun', 6],
	['jul', 7],
	['aug', 8],
	['sep', 9],
	['oct', 10],
	['nov', 11],
	['dec', 12],
]);

const cronWeekdays = new Map([
	['sun', 0],
	['mon', 1],
	['tue', 2],
	['wed', 3],
	['thu', 4],
	['fri', 5],
	['sat', 6],
]);

function parseCronField(
	value: string,
	min: number,
	max: number,
	names?: ReadonlyMap<string, number>,
	normalize: (value: number) => number = value => value,
): Set<number> | undefined {
	const result = new Set<number>();
	for (const term of value.split(',')) {
		const stepParts = term.split('/');
		if (stepParts.length > 2) {
			return undefined;
		}
		const [rangePart, stepPart] = stepParts;
		if (stepPart !== undefined && rangePart !== '*' && !rangePart.includes('-')) {
			return undefined;
		}
		const step = stepPart === undefined ? 1 : parseCronValue(stepPart, undefined);
		if (!Number.isInteger(step) || step < 1) {
			return undefined;
		}
		let start: number;
		let end: number;
		if (rangePart === '*') {
			start = min;
			end = max;
		} else if (rangePart.includes('-')) {
			const range = rangePart.split('-');
			if (range.length !== 2) {
				return undefined;
			}
			start = parseCronValue(range[0], names);
			end = parseCronValue(range[1], names);
		} else {
			start = parseCronValue(rangePart, names);
			end = start;
		}
		if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
			return undefined;
		}
		for (let current = start; current <= end; current += step) {
			result.add(normalize(current));
		}
	}
	return result;
}

function parseCronValue(value: string, names: ReadonlyMap<string, number> | undefined): number {
	const named = names?.get(value.toLowerCase());
	if (named !== undefined) {
		return named;
	}
	return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

function encodeCursor(offset: number): string {
	return String(offset);
}

function decodeCursor(cursor: string | undefined): number {
	const value = Number(cursor ?? 0);
	return Number.isInteger(value) && value >= 0 ? value : 0;
}
