/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedFunction } from '../../../base/common/cache.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { Mutable } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { IGitHubAccountClient } from '../../github/common/account/account.js';
import { ApiRequestOptions } from '../../github/common/client/request.js';
import { isRetryableMissionControlError } from '../../github/common/missionControl/missionControlError.js';
import { MAX_TASK_BATCH_SIZE, type GetTaskResponse, type ListTasksOptions, type Task } from '../../github/common/missionControl/tasks.js';
import { ILogService } from '../../log/common/log.js';
import { CLOUD_SANDBOX_AGENT_SLUG, CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, CloudSandboxRequestError, type CloudSandboxDiscoveryTrigger, type ICloudSandboxDiscoveredSession, type ICloudSandboxDiscoveryDiagnostics, type ICloudSandboxDiscoveryOptions, type ICloudSandboxDiscoveryResult, type ICloudSandboxTask } from './cloudSandboxAgentHost.js';
import { SessionStatus } from './state/sessionState.js';

/**
 * A credential-bound executor whose identity scopes authorization-refusal backoff.
 * Resolvers must reuse the instance while credentials and authorization scope are unchanged, and replace it when either changes.
 */
export interface ICloudSandboxDiscoverySource {
	withClient<T>(token: CancellationToken, options: ApiRequestOptions, execute: (client: IGitHubAccountClient, token: CancellationToken, options: ApiRequestOptions) => Promise<T>): Promise<T>;
}


export interface ICloudSandboxDiscoveryTelemetryData extends Mutable<ICloudSandboxDiscoveryDiagnostics> {
	trigger: CloudSandboxDiscoveryTrigger | 'unknown';
	requestedMode: 'full' | 'incremental' | 'targeted';
	mode: 'full' | 'incremental' | 'targeted';
	outcome: ICloudSandboxDiscoveryResult['kind'] | 'cancelled';
	durationMs: number;
	pageCount?: number;
	listRequestCount?: number;
	listOperationCount?: number;
	listOperationFailureCount?: number;
	taskBatchOperationCount?: number;
	taskBatchOperationFailureCount?: number;
	taskCount: number;
	sandboxTaskCount: number;
	changedSandboxTaskCount: number;
	checkpointAdvanced: boolean;
	checkpointAvailable?: boolean;
	checkpointSource?: 'serverDate' | 'taskUpdate' | 'unavailable';
	listPageFailureCount?: number;
	taskDetailFailureCount?: number;
	repositoryEnrichmentMissCount?: number;
	unresolvedTaskCount?: number;
	unreadPageScopeCount?: number;
	generationInvalidated?: boolean;
}


interface IScannedTask extends Task {
	readonly hasRepository: boolean;
}


interface ICachedSandboxTask {
	readonly summary: IScannedTask;
	readonly session?: ICloudSandboxTask;
	readonly repositoryId?: number;
	readonly needsRefresh?: boolean;
}


/** How many recent tasks to scan for sandbox sessions during discovery, per page. */
const DISCOVERY_TASK_SCAN_LIMIT = 100;


/** Maximum pages to read per repository/archive task scope during discovery. */
const DISCOVERY_TASK_SCAN_MAX_PAGES = 3;


const DISCOVERY_OVERLAP_MS = 60_000;


/** Minimum automatic inventory retry interval after an authorization refusal. */
const DISCOVERY_AUTHORIZATION_RETRY_INTERVAL_MS = 15 * 60_000;

const LOG_PREFIX = '[CloudSandboxApi]';

/** Portable bounded task inventory; authentication and presentation belong to its owner. */
export class CloudSandboxDiscovery extends Disposable {

	private readonly _repositoryNames = new Map<number, string>();

	private readonly _discoveredTasks = new Map<string, ICachedSandboxTask>();

	private readonly _activeDiscoveryReads = new Set<Map<string, ICachedSandboxTask | undefined>>();

	private _discoverySince: string | undefined;

	private _archivedDiscoverySince: string | undefined;

	private _discoveryGeneration = 0;
	private _discoveryAuthorizationFailure: { readonly source: ICloudSandboxDiscoverySource; readonly retryAt: number; readonly error: CloudSandboxRequestError } | undefined;

	constructor(
		private readonly _resolveSource: (token: CancellationToken) => Promise<ICloudSandboxDiscoverySource>,
		private readonly _getRepositoryName: (repositoryId: number, token: CancellationToken) => Promise<string>,
		private readonly _reportDiscovery: (data: ICloudSandboxDiscoveryTelemetryData) => void,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	get generation(): number { return this._discoveryGeneration; }

	invalidate(): void {
		this._discoveryGeneration++;
	}

	clearAuthorizationFailure(): void {
		this._discoveryAuthorizationFailure = undefined;
	}

	clear(): void {
		this.clearAuthorizationFailure();
		this._discoverySince = undefined;
		this._archivedDiscoverySince = undefined;
		this._discoveredTasks.clear();
		this._repositoryNames.clear();
		for (const updates of this._activeDiscoveryReads) {
			updates.clear();
		}
	}

	getTask(taskId: string): ICloudSandboxTask | undefined {
		return this._discoveredTasks.get(taskId)?.session;
	}

	removeTask(taskId: string): void {
		this._discoveredTasks.delete(taskId);
		this.invalidate();
	}

	renameTask(taskId: string, title: string): void {
		const cached = this._discoveredTasks.get(taskId);
		if (cached) {
			this._discoveredTasks.set(taskId, {
				...cached,
				summary: { ...cached.summary, name: title },
				session: cached.session ? { ...cached.session, name: title } : undefined,
				needsRefresh: true,
			});
		}
		this.invalidate();
	}

	async recordResolvedTask(taskId: string, full: GetTaskResponse, token: CancellationToken): Promise<ICloudSandboxDiscoveredSession> {
		if (!isCloudSandboxTask(full)) {
			throw new Error(localize('cloudSandbox.invalidTask', "The cloud task is no longer available."));
		}
		const binding = getTaskEnvironmentBinding(full);
		if (!binding) {
			throw new Error(localize('cloudSandbox.taskNotReady', "The cloud task does not have a session and environment yet."));
		}
		const previous = this._discoveredTasks.get(taskId);
		const summary = previous?.summary ?? { ...full, hasRepository: (full.repository?.id ?? 0) > 0 };
		const fallback = previous?.session ? undefined : await this._taskSummary(summary, previous, repositoryId => this._resolveRepositoryName(repositoryId, token));
		if (token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		const current = this._discoveredTasks.get(taskId);
		const session: ICloudSandboxDiscoveredSession = {
			...fallback?.session,
			...current?.session,
			taskId,
			name: current?.session?.name ?? fallback?.session.name ?? full.name ?? `Sandbox ${taskId}`,
			...binding,
		};
		const entry: ICachedSandboxTask = {
			...current,
			summary: current?.summary ?? summary,
			repositoryId: current?.repositoryId ?? fallback?.repositoryId,
			session,
		};
		this._discoveredTasks.set(taskId, entry);
		for (const read of this._activeDiscoveryReads) {
			read.set(taskId, entry);
		}
		return session;
	}


	/** Full scans replace recent inventory; automatic retries of authorization refusals are paced without blocking manual or targeted reads. */
	async listSessions(token: CancellationToken, options?: ICloudSandboxDiscoveryOptions): Promise<ICloudSandboxDiscoveryResult> {
		const stopwatch = StopWatch.create();
		const requestedMode = options?.taskIds !== undefined ? 'targeted' : options?.incremental ? 'incremental' : 'full';
		const telemetry: ICloudSandboxDiscoveryTelemetryData = {
			trigger: options?.trigger ?? 'unknown', requestedMode, mode: requestedMode, outcome: 'failed',
			durationMs: 0, listOperationCount: 0, taskBatchOperationCount: 0, taskBatchOperationFailureCount: 0, taskCount: 0,
			sandboxTaskCount: 0, changedSandboxTaskCount: 0, checkpointAdvanced: false,
			checkpointAvailable: false, checkpointSource: 'unavailable',
			listOperationFailureCount: 0, taskDetailFailureCount: 0, repositoryEnrichmentMissCount: 0,
			unresolvedTaskCount: 0, unreadPageScopeCount: 0, generationInvalidated: false,
		};
		const updates = new Map<string, ICachedSandboxTask | undefined>();
		this._activeDiscoveryReads.add(updates);
		try {
			const result = await this._listSessions(token, options, updates, telemetry);
			telemetry.outcome = result.kind;
			return result;
		} catch (error) {
			telemetry.outcome = isCancellationError(error) || token.isCancellationRequested ? 'cancelled' : 'failed';
			throw error;
		} finally {
			this._activeDiscoveryReads.delete(updates);
			telemetry.durationMs = stopwatch.elapsed();
			telemetry.intentMode = options?.diagnostics?.intentMode;
			telemetry.previousInventoryAgeMs = options?.diagnostics?.previousInventoryAgeMs;
			telemetry.lastFullAgeMs = options?.diagnostics?.lastFullAgeMs;
			telemetry.queued = options?.diagnostics?.queued;
			telemetry.coalescedRequestCount = options?.diagnostics?.coalescedRequestCount;
			telemetry.coalescedTrigger = options?.diagnostics?.coalescedTrigger;
			this._logService.info(`${LOG_PREFIX} Discovery diagnostics ${JSON.stringify(telemetry)}`);
			this._reportDiscovery(telemetry);
		}
	}


	private async _listSessions(token: CancellationToken, options: ICloudSandboxDiscoveryOptions | undefined, updates: ReadonlyMap<string, ICachedSandboxTask | undefined>, telemetry: ICloudSandboxDiscoveryTelemetryData): Promise<ICloudSandboxDiscoveryResult> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		let source: ICloudSandboxDiscoverySource;
		try {
			source = await this._resolveSource(token);
		} catch (error) {
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._logService.warn(`${LOG_PREFIX} Resolving discovery authorization failed: ${toErrorMessage(error)}`);
			return { kind: 'failed', reason: toErrorMessage(error) };
		}
		const generation = this._discoveryGeneration;
		const targeted = options?.taskIds !== undefined;
		const includeArchived = options?.includeArchived !== false;
		const checkpointSince = includeArchived
			? this._discoverySince && this._archivedDiscoverySince && (this._discoverySince < this._archivedDiscoverySince ? this._discoverySince : this._archivedDiscoverySince)
			: this._discoverySince;
		const since = !targeted && options?.incremental ? checkpointSince : undefined;
		telemetry.mode = targeted ? 'targeted' : since ? 'incremental' : 'full';
		telemetry.checkpointAvailable = checkpointSince !== undefined;
		telemetry.fullScanReason = targeted || since ? 'notFull'
			: options?.incremental ? this._discoverySince && includeArchived && !this._archivedDiscoverySince ? 'scopeInitialization' : 'noCheckpoint'
				: options?.diagnostics?.fullScanReason ?? 'requestedFull';
		const authorizationFailure = this._discoveryAuthorizationFailure;
		if (!targeted && options?.trigger !== undefined && options.trigger !== 'manual' && authorizationFailure
			&& authorizationFailure.source === source
			&& Date.now() < authorizationFailure.retryAt) {
			this._logService.debug(`${LOG_PREFIX} Deferring automatic inventory retry after an authorization refusal.`);
			return { kind: 'failed', reason: authorizationFailure.error.message };
		}
		const tasks = new Map<string, IScannedTask>();
		const cache = new Map(this._discoveredTasks);
		const returnedSandboxTasks = new Set<string>();
		const changedSandboxTasks = new Set<string>();
		const recordTask = (task: IScannedTask) => {
			tasks.set(task.id, task);
			if (isCloudSandboxTask(task)) {
				returnedSandboxTasks.add(task.id);
				if (!equals(task, cache.get(task.id)?.summary)) {
					changedSandboxTasks.add(task.id);
				} else {
					changedSandboxTasks.delete(task.id);
				}
			} else {
				returnedSandboxTasks.delete(task.id);
				changedSandboxTasks.delete(task.id);
			}
			telemetry.taskCount = tasks.size;
			telemetry.sandboxTaskCount = returnedSandboxTasks.size;
			telemetry.changedSandboxTaskCount = changedSandboxTasks.size;
		};
		const removedTaskIds: string[] = [];
		const failedTaskIds = new Set<string>();
		let truncated = false;
		let hasUnreadPages = false;
		let checkpoint: number | undefined;
		let latestUpdate: number | undefined;
		if (targeted) {
			const ids = [...new Set(options.taskIds)];
			for (let offset = 0; offset < ids.length; offset += MAX_TASK_BATCH_SIZE) {
				const batch = ids.slice(offset, offset + MAX_TASK_BATCH_SIZE);
				telemetry.taskBatchOperationCount = (telemetry.taskBatchOperationCount ?? 0) + 1;
				try {
					const returned = await source.withClient(token, { caller: 'mc.taskClient.getBatch', priority: 'background' },
						(client, cancellationToken, options) => client.tasks.getBatch(batch, cancellationToken, options));
					const returnedIds = new Set(returned.map(task => task.id));
					for (const task of returned) {
						recordTask({ ...task, hasRepository: (task.repository?.id ?? 0) > 0 });
					}
					// Successful omissions end discoverability, not the remote task or its running session.
					for (const id of batch) {
						if (!returnedIds.has(id)) {
							cache.delete(id);
							removedTaskIds.push(id);
						}
					}
				} catch (error) {
					if (isCancellationError(error) || token.isCancellationRequested) {
						throw new CancellationError();
					}
					telemetry.taskBatchOperationFailureCount = (telemetry.taskBatchOperationFailureCount ?? 0) + 1;
					telemetry.unresolvedTaskCount = (telemetry.unresolvedTaskCount ?? 0) + batch.length;
					truncated = true;
					for (const id of batch) {
						failedTaskIds.add(id);
					}
					this._logService.warn(`${LOG_PREFIX} Feed task batch refresh failed: ${toErrorMessage(error)}`);
				}
			}
		}
		// Separate repository scopes include workspace-less sandboxes as well as repository sessions.
		for (const { withRepository, archived } of targeted ? [] : [
			{ withRepository: true, archived: false }, { withRepository: false, archived: false },
			...(includeArchived ? [{ withRepository: true, archived: true }, { withRepository: false, archived: true }] : []),
		]) {
			const query: NonNullable<ListTasksOptions['query']> = {
				per_page: DISCOVERY_TASK_SCAN_LIMIT,
				page: 1,
				sort: 'updated_at',
				direction: 'desc',
				with_repo: withRepository,
				is_archived: archived,
				include_counts: false,
				...(since ? { since, include_environment_kinds: 'managed-sandbox' } : {}),
			};
			try {
				telemetry.listOperationCount = (telemetry.listOperationCount ?? 0) + 1;
				const response = await source.withClient(token, {
					caller: 'mc.taskClient.list', priority: options?.trigger === 'manual' ? undefined : 'background',
				}, (client, cancellationToken, requestOptions) => client.tasks.list(cancellationToken, {
					...requestOptions, query, maxPages: DISCOVERY_TASK_SCAN_MAX_PAGES, pageLimitBehavior: 'returnPartial',
				}));
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				if (generation === this._discoveryGeneration) {
					this._discoveryAuthorizationFailure = undefined;
				}
				if (response.serverDate !== undefined) {
					const serverTime = Date.parse(response.serverDate);
					checkpoint = Math.min(checkpoint ?? serverTime, serverTime);
					telemetry.checkpointSource = 'serverDate';
				}
				for (const task of response.data.tasks) {
					recordTask({ ...task, hasRepository: withRepository });
					if (task.updated_at !== undefined) {
						const updatedAt = Date.parse(task.updated_at);
						latestUpdate = Math.max(latestUpdate ?? updatedAt, updatedAt);
						if (checkpoint === undefined) {
							telemetry.checkpointSource = 'taskUpdate';
						}
					}
				}
				if (response.nextLink) {
					hasUnreadPages = true;
					telemetry.unreadPageScopeCount = (telemetry.unreadPageScopeCount ?? 0) + 1;
				}
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested) {
					throw new CancellationError();
				}
				telemetry.listOperationFailureCount = (telemetry.listOperationFailureCount ?? 0) + 1;
				if (telemetry.listOperationCount === 1 && generation === this._discoveryGeneration && error instanceof CloudSandboxRequestError
					&& (error.statusCode === 401 || error.statusCode === 403) && !isRetryableMissionControlError(error.statusCode, error.code)) {
					this._discoveryAuthorizationFailure = {
						source,
						retryAt: Date.now() + Math.max(DISCOVERY_AUTHORIZATION_RETRY_INTERVAL_MS, (error.retryAfterSeconds ?? 0) * 1000),
						error,
					};
				}
				this._logService.warn(`${LOG_PREFIX} Discovery task list failed: ${toErrorMessage(error)}`);
				return { kind: 'failed', reason: `listTasks failed: ${toErrorMessage(error)}` };
			}
		}

		const scannedTaskIds = new Set(tasks.keys());
		if (since) {
			for (const [id, cached] of cache) {
				if ((includeArchived || !cached.summary.archived_at) && !tasks.has(id) && (cached.needsRefresh || !cached.session || (cached.repositoryId !== undefined && !cached.session.repoName))) {
					tasks.set(id, cached.summary);
				}
			}
		}
		const sandboxTasks: IScannedTask[] = [];
		const exclusions = { notSandboxCompute: 0, missingSessionBinding: 0, stalledQueuedSession: 0, detailFetchFailed: 0 };
		const logExcludedTask = (taskId: string, reason: keyof typeof exclusions) => {
			exclusions[reason]++;
			this._logService.debug(`${LOG_PREFIX} Excluded task ${JSON.stringify({ taskId, reason })}`);
		};
		let acceptedWithOtherAgent = 0;
		for (const task of tasks.values()) {
			if (isCloudSandboxTask(task)) {
				sandboxTasks.push(task);
				if (!task.agent_collaborators?.some(c => c.slug === CLOUD_SANDBOX_AGENT_SLUG)) {
					acceptedWithOtherAgent++;
					this._logService.debug(`${LOG_PREFIX} Accepted task previously excluded by agent slug ${JSON.stringify({ taskId: task.id })}`);
				}
			} else {
				logExcludedTask(task.id, 'notSandboxCompute');
				if (cache.has(task.id)) {
					removedTaskIds.push(task.id);
				}
				cache.delete(task.id);
			}
		}
		let unresolved = 0;
		// A large repository group must occupy only one transport waiter per discovery pass.
		const repositoryLookups = new CachedFunction((repositoryId: number) => this._resolveRepositoryName(repositoryId, token));
		const discovered = await Promise.all(sandboxTasks.map(async (task): Promise<ICloudSandboxTask | undefined> => {
			try {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				const previous = cache.get(task.id);
				const binding = previous?.session;
				const { repositoryId, session: summary } = await this._taskSummary(task, previous, repositoryId => repositoryLookups.get(repositoryId));
				const session: ICloudSandboxTask = {
					...summary,
					...(binding?.environmentId && binding.sessionId ? { environmentId: binding.environmentId, sessionId: binding.sessionId } : {}),
				};
				const cached: ICachedSandboxTask = { summary: task, repositoryId, session };
				if (repositoryId !== undefined && !session.repoName) {
					telemetry.repositoryEnrichmentMissCount = (telemetry.repositoryEnrichmentMissCount ?? 0) + 1;
				}
				cache.set(task.id, cached);
				return session;
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested) {
					throw new CancellationError();
				}
				this._logService.warn(`${LOG_PREFIX} Discovery task ${task.id} processing failed: ${toErrorMessage(error)}`);
				logExcludedTask(task.id, 'detailFetchFailed');
				telemetry.taskDetailFailureCount = (telemetry.taskDetailFailureCount ?? 0) + 1;
				cache.set(task.id, { ...cache.get(task.id), summary: task, needsRefresh: true });
				unresolved++;
				failedTaskIds.add(task.id);
				return undefined;
			}
		}));

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		telemetry.unresolvedTaskCount = (telemetry.unresolvedTaskCount ?? 0) + unresolved;
		if (generation !== this._discoveryGeneration) {
			telemetry.generationInvalidated = true;
			return { kind: 'failed', reason: 'Sandbox discovery was invalidated while listing sessions' };
		}
		const partial = unresolved > 0 || truncated;
		if (!truncated && !targeted) {
			// Failed details are retained by task ID and retried independently of the inventory checkpoint.
			const nextCheckpoint = checkpoint ?? latestUpdate;
			if (nextCheckpoint === undefined && checkpointSince === undefined) {
				this._logService.warn(`${LOG_PREFIX} Discovery has no server timestamp; using an epoch checkpoint to retain all subsequent changes.`);
			}
			const nextSince = nextCheckpoint !== undefined
				? new Date(nextCheckpoint - DISCOVERY_OVERLAP_MS).toISOString()
				: checkpointSince ?? new Date(0).toISOString();
			telemetry.checkpointAdvanced = this._discoverySince === undefined || Date.parse(nextSince) > Date.parse(this._discoverySince);
			this._discoverySince = nextSince;
			if (includeArchived) {
				this._archivedDiscoverySince = nextSince;
			}
			if (!partial && !since) {
				for (const [id, cached] of cache) {
					if (!scannedTaskIds.has(id) && (includeArchived || !cached.summary.archived_at)) {
						cache.delete(id);
					}
				}
			}
		}
		const published = new Map<string, ICloudSandboxTask>();
		for (const session of discovered) {
			if (session) {
				published.set(session.taskId, session);
			}
		}
		const removed = new Set(removedTaskIds);
		// Reads in either lane must preserve newer task commits and intervening removals.
		for (const [id, updated] of updates) {
			if (targeted && !options.taskIds.includes(id)) {
				continue;
			}
			const scanned = cache.get(id);
			if (updated && scanned
				&& Date.parse(scanned.session?.updatedAt ?? scanned.summary.updated_at ?? '') > Date.parse(updated.session?.updatedAt ?? updated.summary.updated_at ?? '')) {
				continue;
			}
			published.delete(id);
			removed.delete(id);
			if (updated) {
				cache.set(id, updated);
				if (updated.session) {
					published.set(id, updated.session);
				} else {
					removed.add(id);
				}
			} else {
				cache.delete(id);
				removed.add(id);
			}
		}
		const committedIds = targeted
			? new Set([...tasks.keys(), ...removed])
			: new Set([...this._discoveredTasks.keys(), ...cache.keys()]);
		for (const id of committedIds) {
			const cached = cache.get(id);
			if (cached) {
				this._discoveredTasks.set(id, cached);
			} else {
				if (this._discoveredTasks.delete(id) && !hasUnreadPages && includeArchived) {
					removed.add(id);
				}
			}
			const observed = scannedTaskIds.has(id) || updates.has(id);
			// Window eviction and unobserved cached state cannot invalidate an overlapping read.
			if (!removed.has(id) && (!cached || !observed)) {
				continue;
			}
			for (const read of this._activeDiscoveryReads) {
				if (read !== updates) {
					read.set(id, cached);
				}
			}
		}
		const sessions = [...published.values()];
		const unnamed = sessions.filter(session => !session.repoName).length;
		this._logService.info(`${LOG_PREFIX} ${targeted ? 'Feed discovery' : since ? 'Incremental discovery' : 'Discovery'} found ${sessions.length} sandbox session(s) from ${sandboxTasks.length} sandbox task(s) out of ${scannedTaskIds.size} scanned${truncated ? ' (scan truncated)' : ''}${unresolved > 0 ? `; ${unresolved} unresolved` : ''}${unnamed > 0 ? `; ${unnamed} without a repository name (they group under "Unknown")` : ''}.`);
		this._logService.info(`${LOG_PREFIX} Discovery filtering ${JSON.stringify({ ...exclusions, acceptedWithOtherAgent })}`);
		for (const session of sessions) {
			this._logService.debug(`${LOG_PREFIX} Discovered sandbox session ${JSON.stringify({
				taskId: session.taskId, sessionId: session.sessionId, environmentId: session.environmentId,
				name: session.name, repoName: session.repoName, updatedAt: session.updatedAt, status: session.status,
			})}`);
		}
		if (partial) {
			return { kind: 'partial', sessions, removedTaskIds: [...removed], ...(!targeted && !truncated ? { inventoryComplete: true } : {}), ...(targeted ? { failedTaskIds: [...failedTaskIds] } : {}) };
		}
		return targeted || since
			? { kind: 'incremental', sessions, removedTaskIds: [...removed] }
			: includeArchived
				? { kind: 'complete', sessions, ...(removed.size ? { removedTaskIds: [...removed] } : {}) }
				: { kind: 'scoped', sessions, removedTaskIds: [...removed] };
	}


	private async _taskSummary(task: IScannedTask, previous: ICachedSandboxTask | undefined, resolveRepositoryName: (repositoryId: number) => Promise<string | undefined>): Promise<{ repositoryId: number | undefined; session: ICloudSandboxTask }> {
		const application = task.clients?.find(client => client.creator === true)?.slug;
		const repositoryId = [task.repository?.id, previous?.repositoryId].find(id => id !== undefined && id > 0);
		const status = taskSessionStatus(task.state);
		const eventType = task.event_type || previous?.session?.eventType;
		const creatingApplication = application ?? previous?.session?.application;
		const repoName = previous?.repositoryId === repositoryId ? previous?.session?.repoName : undefined;
		const repositoryName = task.repository?.full_name || repoName
			|| (repositoryId !== undefined ? await resolveRepositoryName(repositoryId) : undefined);
		return {
			repositoryId,
			session: {
				taskId: task.id,
				name: task.name ?? previous?.session?.name ?? `Sandbox ${task.id}`,
				...(eventType ? { eventType } : {}),
				...(creatingApplication ? { application: creatingApplication } : {}),
				hasRepository: task.hasRepository || repositoryId !== undefined,
				...(repositoryName !== undefined ? { repoName: repositoryName } : {}),
				updatedAt: task.updated_at,
				...(task.state === 'queued' ? { isQueued: true } : {}),
				status,
				...(task.archived_at ? { isArchived: true } : {}),
			},
		};
	}


	private async _resolveRepositoryName(repositoryId: number, token: CancellationToken): Promise<string | undefined> {
		const cached = this._repositoryNames.get(repositoryId);
		if (cached) {
			return cached;
		}
		const generation = this._discoveryGeneration;
		try {
			const repositoryName = await this._getRepositoryName(repositoryId, token);
			if (generation === this._discoveryGeneration) {
				this._repositoryNames.set(repositoryId, repositoryName);
			}
			return repositoryName;
		} catch (error) {
			if (isCancellationError(error) || token.isCancellationRequested) {
				throw new CancellationError();
			}
			this._logService.warn(`${LOG_PREFIX} Repository ${repositoryId} lookup failed: ${toErrorMessage(error)}`);
			return undefined;
		}
	}
}


function taskSessionStatus(state: Task['state']): SessionStatus {
	switch (state) {
		case 'queued':
		case 'in_progress':
			return SessionStatus.InProgress;
		case 'waiting_for_user':
			return SessionStatus.InputNeeded;
		case 'idle':
		case 'completed':
			return SessionStatus.Idle;
		case 'failed':
		case 'timed_out':
		case 'cancelled':
			return SessionStatus.Error;
	}
}


/** Provisioning tasks can advertise an empty provider before their runtime is ready. */
function isCloudSandboxTask(task: Task): boolean {
	const provider = task.compute?.provider;
	return provider === 'sandboxes' || ((provider === undefined || provider === '') && task.current_environment?.kind === 'managed-sandbox');
}


export function isConcreteEnvironmentId(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value !== CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID;
}


/** Finds a session bound to a concrete environment rather than the provisioning placeholder. */
export function getTaskEnvironmentBinding(task: GetTaskResponse): { environmentId: string; sessionId: string } | undefined {
	for (const session of task.sessions ?? []) {
		if (isConcreteEnvironmentId(session.environment_id)) {
			return { environmentId: session.environment_id, sessionId: session.id };
		}
	}
	return undefined;
}
