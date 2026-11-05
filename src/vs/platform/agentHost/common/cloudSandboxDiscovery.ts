/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { equals } from '../../../base/common/objects.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { ILogService } from '../../log/common/log.js';
import { deriveGitHubEndpoints } from '../../github/common/githubEndpoints.js';
import { nextLink } from '../../github/common/githubResponse.js';
import { TaskClient } from '../../github/common/missionControl/tasks.js';
import { AgentSession } from './agent.js';
import { CLOUD_SANDBOX_AGENT_SLUG, CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID, CLOUD_SANDBOX_SESSION_SCHEME, CloudSandboxRequestError, ICloudSandboxDiscoveredSession, ICloudSandboxDiscoveryOptions, ICloudSandboxDiscoveryResult } from './cloudSandboxAgentHost.js';
import { SessionStatus } from './state/sessionState.js';
import { IReplayedTaskHistory } from './taskEventReplay.js';
import { ICloudSandboxDiscoveryTelemetryData } from './cloudSandboxDiscoveryTelemetry.js';

/** The subset of a Mission Control task the sandbox discovery path reads. */
export interface ITaskSummary {
	readonly id: string;
	readonly event_type?: string;
	readonly clients?: readonly TaskClient[];
	readonly name?: string;
	readonly archived_at?: string | null;
	readonly updated_at?: string;
	readonly state?: string;
	readonly agent_collaborators?: readonly { readonly slug?: string }[];
	readonly compute?: { readonly provider?: string } | null;
	readonly current_environment?: { readonly kind?: string } | null;
	/**
	 * The owning repository, identified by numeric id only — the payload carries no name. See
	 * {@link CloudSandboxApiService._resolveRepositoryName}.
	 */
	readonly repository?: { readonly id?: number };
}

/** A full task, which additionally carries the sessions bound to sandbox environments. */
export interface ITaskDetail extends ITaskSummary {
	readonly reserved?: boolean;
	readonly claimed?: boolean;
	readonly reservation_expires_at?: string;
	readonly sessions?: readonly {
		readonly id: string;
		readonly environment_id?: string;
		readonly state?: string;
		readonly created_at?: string;
		readonly updated_at?: string;
		readonly ahp_resource_uri?: string | null;
	}[];
}

interface IScannedTask extends ITaskSummary {
	readonly hasRepository: boolean;
}

interface ICachedSandboxTask {
	readonly summary: IScannedTask;
	readonly session?: ICloudSandboxDiscoveredSession;
	readonly repositoryId?: number;
	readonly needsRefresh?: boolean;
	/** An unchanged, default-titled queued session with no AHP resource; recheck its age on every scan. */
	readonly unstartedSince?: number;
	/** An unattributed default-titled task whose recorded conversation may be an abandoned draft. */
	readonly emptySessionSince?: number;
	readonly hasEmptyHistory?: boolean;
}

const LOG_PREFIX = '[CloudSandboxApi]';
const GITHUB_DOT_COM_API_BASE_URI = deriveGitHubEndpoints(undefined).apiBaseUri;
const DISCOVERY_TASK_SCAN_LIMIT = 100;
const DISCOVERY_TASK_SCAN_MAX_PAGES = 3;
const DISCOVERY_TASK_FETCH_CONCURRENCY = 5;
const DISCOVERY_OVERLAP_MS = 60_000;
const STALLED_SESSION_GRACE_MS = 60 * 60_000;

export interface ICloudSandboxDiscoverySource {
	readonly apiBaseUri: string;
	listTasks(url: string, token: CancellationToken, onRequest: () => void): Promise<{ readonly tasks: readonly ITaskSummary[]; readonly serverDate?: string; readonly link?: string }>;
	getTask(id: string, token: CancellationToken): Promise<ITaskDetail>;
	resolveRepositoryName(id: number, token: CancellationToken): Promise<string | undefined>;
	getSessionHistory(id: string, token: CancellationToken): Promise<IReplayedTaskHistory | undefined>;
	reportDiscovery(data: ICloudSandboxDiscoveryTelemetryData): void;
	onDidObserveBinding?(session: ICloudSandboxDiscoveredSession): void;
}

export class CloudSandboxDiscovery {
	private readonly _discoveredTasks = new Map<string, ICachedSandboxTask>();
	private readonly _activeDiscoveryReads = new Set<Map<string, ICachedSandboxTask | undefined>>();
	private _discoverySince: string | undefined;
	private _archivedDiscoverySince: string | undefined;
	private _discoveryGeneration = 0;

	constructor(private readonly _source: ICloudSandboxDiscoverySource, private readonly _logService: ILogService) { }

	getSession(taskId: string): ICloudSandboxDiscoveredSession | undefined {
		return this._discoveredTasks.get(taskId)?.session;
	}

	reset(): void {
		this._discoveryGeneration++;
		this._discoverySince = this._archivedDiscoverySince = undefined;
		this._discoveredTasks.clear();
	}

	invalidate(taskId: string): void {
		this._discoveryGeneration++;
		const cached = this._discoveredTasks.get(taskId);
		if (cached) {
			this._discoveredTasks.set(taskId, { ...cached, hasEmptyHistory: undefined, needsRefresh: true });
		}
	}

	remove(taskId: string): void {
		this._discoveryGeneration++;
		this._discoveredTasks.delete(taskId);
	}

	seed(session: ICloudSandboxDiscoveredSession): void {
		this._discoveryGeneration++;
		this._discoveredTasks.set(session.taskId, {
			session, needsRefresh: true,
			summary: { id: session.taskId, name: session.name, updated_at: session.updatedAt, hasRepository: session.hasRepository === true, compute: { provider: 'sandboxes' } },
		});
	}

	rename(taskId: string, title: string): void {
		this.invalidate(taskId);
		const cached = this._discoveredTasks.get(taskId);
		if (cached) {
			this._discoveredTasks.set(taskId, { ...cached, summary: { ...cached.summary, name: title }, session: cached.session ? { ...cached.session, name: title } : undefined });
		}
	}

	/** Full scans replace the recent task window; incremental scans preserve absent tasks. */
	async listSessions(token: CancellationToken, options?: ICloudSandboxDiscoveryOptions): Promise<ICloudSandboxDiscoveryResult> {
		const stopwatch = StopWatch.create();
		const requestedMode = options?.taskIds !== undefined ? 'targeted' : options?.incremental ? 'incremental' : 'full';
		const telemetry: ICloudSandboxDiscoveryTelemetryData = {
			trigger: options?.trigger ?? 'unknown', requestedMode, mode: requestedMode, outcome: 'failed',
			durationMs: 0, pageCount: 0, listRequestCount: 0, taskCount: 0,
			sandboxTaskCount: 0, changedSandboxTaskCount: 0, checkpointAdvanced: false,
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
			this._source.reportDiscovery(telemetry);
		}
	}

	private async _listSessions(token: CancellationToken, options: ICloudSandboxDiscoveryOptions | undefined, updates: ReadonlyMap<string, ICachedSandboxTask | undefined>, telemetry: ICloudSandboxDiscoveryTelemetryData): Promise<ICloudSandboxDiscoveryResult> {
		const generation = this._discoveryGeneration;
		const targeted = options?.taskIds !== undefined;
		const includeArchived = options?.includeArchived !== false;
		const checkpointSince = includeArchived
			? this._discoverySince && this._archivedDiscoverySince && (this._discoverySince < this._archivedDiscoverySince ? this._discoverySince : this._archivedDiscoverySince)
			: this._discoverySince;
		const since = !targeted && options?.incremental ? checkpointSince : undefined;
		telemetry.mode = targeted ? 'targeted' : since ? 'incremental' : 'full';
		const tasks = new Map<string, IScannedTask>();
		const details = new Map<string, ITaskDetail>();
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
			const limiter = new Limiter<void>(DISCOVERY_TASK_FETCH_CONCURRENCY);
			try {
				await Promise.all([...new Set(options.taskIds)].map(id => limiter.queue(async () => {
					try {
						const task = await this._source.getTask(id, token);
						if (!task || task.id !== id) {
							throw new Error('getTask returned an invalid task');
						}
						recordTask({ ...task, hasRepository: (task.repository?.id ?? 0) > 0 });
						details.set(id, task);
					} catch (error) {
						if (isCancellationError(error) || token.isCancellationRequested) {
							throw new CancellationError();
						}
						if (error instanceof CloudSandboxRequestError && (error.statusCode === 403 || error.statusCode === 404)) {
							cache.delete(id);
							removedTaskIds.push(id);
						} else {
							truncated = true;
							failedTaskIds.add(id);
							this._logService.warn(`${LOG_PREFIX} Feed task refresh failed: ${toErrorMessage(error)}`);
						}
					}
				})));
			} finally {
				limiter.dispose();
			}
		}
		// Separate repository scopes include workspace-less sandboxes as well as repository sessions.
		for (const { withRepository, archived } of targeted ? [] : [
			{ withRepository: true, archived: false }, { withRepository: false, archived: false },
			...(includeArchived ? [{ withRepository: true, archived: true }, { withRepository: false, archived: true }] : []),
		]) {
			const query: Record<string, string> = {
				per_page: String(DISCOVERY_TASK_SCAN_LIMIT),
				sort: 'updated_at',
				direction: 'desc',
				with_repo: String(withRepository),
				is_archived: String(archived),
				...(since ? { since, include_environment_kinds: 'managed-sandbox' } : {}),
			};
			const requestedUrls = new Set<string>();
			let url: string | undefined = `${this._source.apiBaseUri}/tasks${toQuery({ ...query, page: '1' })}`;
			for (let page = 1; url && page <= DISCOVERY_TASK_SCAN_MAX_PAGES; page++) {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				try {
					if (requestedUrls.has(url)) {
						throw new Error('Task list repeated a pagination URL');
					}
					requestedUrls.add(url);
					const response = await this._source.listTasks(url, token, () => telemetry.listRequestCount++);
					if (!Array.isArray(response?.tasks)) {
						throw new Error('listTasks returned no tasks array');
					}
					telemetry.pageCount++;
					const date = response.serverDate;
					const serverTime = typeof date === 'string' ? Date.parse(date) : Number.NaN;
					if (!Number.isNaN(serverTime)) {
						checkpoint = Math.min(checkpoint ?? serverTime, serverTime);
					}
					for (const task of response.tasks) {
						recordTask({ ...task, hasRepository: withRepository });
						const updatedAt = task.updated_at ? Date.parse(task.updated_at) : Number.NaN;
						if (!Number.isNaN(updatedAt)) {
							latestUpdate = Math.max(latestUpdate ?? updatedAt, updatedAt);
						}
					}
					url = nextTaskPageUrl(response.link, url, query);
					if (page === DISCOVERY_TASK_SCAN_MAX_PAGES && url) {
						hasUnreadPages = true;
					}
				} catch (error) {
					if (isCancellationError(error) || token.isCancellationRequested) {
						throw new CancellationError();
					}
					if (tasks.size === 0) {
						return { kind: 'failed', reason: `listTasks failed: ${toErrorMessage(error)}` };
					}
					this._logService.warn(`${LOG_PREFIX} Discovery page ${page} (with_repo=${withRepository}) failed: ${toErrorMessage(error)}`);
					truncated = true;
					break;
				}
			}
		}

		const scannedTaskIds = new Set(tasks.keys());
		if (since) {
			for (const [id, cached] of cache) {
				if ((includeArchived || !cached.summary.archived_at) && !tasks.has(id) && (cached.needsRefresh || !cached.session || cached.unstartedSince !== undefined || cached.emptySessionSince !== undefined || (cached.repositoryId !== undefined && !cached.session.repoName))) {
					tasks.set(id, cached.summary);
				}
			}
		}
		const discoveryTime = checkpoint ?? Date.now();
		const sandboxTasks: IScannedTask[] = [];
		const exclusions = { notSandboxCompute: 0, missingSessionBinding: 0, stalledQueuedSession: 0, emptySession: 0, detailFetchFailed: 0 };
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
		const limiter = new Limiter<ICloudSandboxDiscoveredSession | undefined>(DISCOVERY_TASK_FETCH_CONCURRENCY);
		let discovered: (ICloudSandboxDiscoveredSession | undefined)[];
		try {
			discovered = await Promise.all(sandboxTasks.map(task => limiter.queue(async (): Promise<ICloudSandboxDiscoveredSession | undefined> => {
				try {
					if (token.isCancellationRequested) {
						throw new CancellationError();
					}
					let cached = cache.get(task.id);
					const previousBinding = cached?.session;
					const application = task.clients?.find(client => client.creator === true)?.slug;
					// Missing creator evidence does not revoke previously learned creation provenance.
					const applicationChanged = application !== undefined && application !== cached?.session?.application;
					if (targeted || cached?.needsRefresh || !cached?.session || !task.updated_at
						|| task.updated_at !== cached.summary.updated_at
						|| task.archived_at !== cached.summary.archived_at
						|| task.hasRepository !== cached.summary.hasRepository
						|| applicationChanged) {
						const full = details.get(task.id) ?? await this._source.getTask(task.id, token);
						if (!full) {
							throw new Error('getTask returned no task');
						}
						details.set(task.id, full);
						const binding = getTaskEnvironmentBinding(full);
						if (!binding) {
							removedTaskIds.push(task.id);
						}
						const status = binding ? taskSessionStatus(full.sessions?.find(session => session.id === binding.sessionId)?.state ?? full.state ?? task.state, this._logService) : undefined;
						const eventType = full.event_type || task.event_type;
						const creatingApplication = full.clients?.find(client => client.creator === true)?.slug ?? application ?? cached?.session?.application;
						const repositoryId = [full.repository?.id, task.repository?.id].find(id => id !== undefined && id > 0);
						const session: ICloudSandboxDiscoveredSession | undefined = binding ? {
							...binding,
							taskId: task.id,
							...(eventType ? { eventType } : {}),
							...(creatingApplication ? { application: creatingApplication } : {}),
							name: full.name ?? task.name ?? `Sandbox ${task.id}`,
							hasRepository: task.hasRepository || repositoryId !== undefined,
							updatedAt: full.updated_at ?? task.updated_at,
							...(status !== undefined ? { status } : {}),
							...(full.archived_at ? { isArchived: true } : {}),
						} : undefined;
						cached = {
							summary: task,
							repositoryId,
							unstartedSince: getUnstartedSessionCreatedAt(full),
							emptySessionSince: session && full.sessions?.length === 1 ? getEmptySessionUpdatedAt(session) : undefined,
							session,
						};
					}
					if (cached.unstartedSince !== undefined && discoveryTime - cached.unstartedSince >= STALLED_SESSION_GRACE_MS) {
						cache.set(task.id, cached);
						logExcludedTask(task.id, 'stalledQueuedSession');
						// An unread page may contain this candidate's recovery update.
						if ((!truncated && !hasUnreadPages) || scannedTaskIds.has(task.id) || details.has(task.id)) {
							removedTaskIds.push(task.id);
							this._logService.trace(`${LOG_PREFIX} Hiding stalled queued sandbox task ${task.id} with no AHP resource.`);
						}
						return undefined;
					}
					if (cached.session && cached.emptySessionSince !== undefined && discoveryTime - cached.emptySessionSince >= STALLED_SESSION_GRACE_MS) {
						if (cached.hasEmptyHistory === undefined) {
							try {
								const history = await this._source.getSessionHistory(task.id, token);
								cached = { ...cached, hasEmptyHistory: isEmptySessionHistory(history, cached.session.sessionId) };
							} catch (error) {
								if (isCancellationError(error) || token.isCancellationRequested) {
									throw new CancellationError();
								}
								this._logService.warn(`${LOG_PREFIX} Could not verify empty sandbox task ${task.id}; keeping it visible: ${toErrorMessage(error)}`);
								unresolved++;
							}
						}
						if (cached.hasEmptyHistory) {
							cache.set(task.id, cached);
							logExcludedTask(task.id, 'emptySession');
							if ((!truncated && !hasUnreadPages) || scannedTaskIds.has(task.id) || details.has(task.id)) {
								removedTaskIds.push(task.id);
								this._logService.trace(`${LOG_PREFIX} Hiding abandoned sandbox task ${task.id} with empty recorded history.`);
							}
							return undefined;
						}
					}
					if (cached.session && cached.repositoryId !== undefined && !cached.session.repoName) {
						const repoName = await this._source.resolveRepositoryName(cached.repositoryId, token);
						cached = { ...cached, session: { ...cached.session, repoName } };
					}
					cache.set(task.id, cached);
					if (!cached.session) {
						logExcludedTask(task.id, 'missingSessionBinding');
					} else if (cached.session.environmentId !== previousBinding?.environmentId || cached.session.sessionId !== previousBinding?.sessionId) {
						this._source.onDidObserveBinding?.(cached.session);
					}
					return cached.session;
				} catch (error) {
					if (isCancellationError(error) || token.isCancellationRequested) {
						throw new CancellationError();
					}
					this._logService.warn(`${LOG_PREFIX} Discovery getTask ${task.id} failed: ${toErrorMessage(error)}`);
					logExcludedTask(task.id, 'detailFetchFailed');
					cache.set(task.id, { ...cache.get(task.id), summary: task, needsRefresh: true });
					unresolved++;
					failedTaskIds.add(task.id);
					return undefined;
				}
			})));
		} finally {
			limiter.dispose();
		}

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (generation !== this._discoveryGeneration) {
			return { kind: 'failed', reason: 'Sandbox discovery was invalidated while listing sessions' };
		}
		const partial = unresolved > 0 || truncated;
		if (!partial && !targeted) {
			// Browsers may not expose Date through CORS; task timestamps also use the server's clock.
			const nextCheckpoint = checkpoint ?? latestUpdate;
			if (nextCheckpoint !== undefined) {
				const nextSince = new Date(nextCheckpoint - DISCOVERY_OVERLAP_MS).toISOString();
				telemetry.checkpointAdvanced = this._discoverySince === undefined || Date.parse(nextSince) > Date.parse(this._discoverySince);
				this._discoverySince = nextSince;
				if (includeArchived) {
					this._archivedDiscoverySince = nextSince;
				}
			}
			if (!since) {
				for (const [id, cached] of cache) {
					if (!scannedTaskIds.has(id) && (includeArchived || !cached.summary.archived_at)) {
						cache.delete(id);
					}
				}
			}
		}
		const published = new Map<string, ICloudSandboxDiscoveredSession>();
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
				if (updated.session && updated.hasEmptyHistory !== true
					&& (updated.unstartedSince === undefined || discoveryTime - updated.unstartedSince < STALLED_SESSION_GRACE_MS)) {
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
			const observed = scannedTaskIds.has(id) || details.has(id) || updates.has(id);
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
			return { kind: 'partial', sessions, removedTaskIds: [...removed], ...(targeted ? { failedTaskIds: [...failedTaskIds] } : {}) };
		}
		return targeted || since
			? { kind: 'incremental', sessions, removedTaskIds: [...removed] }
			: includeArchived
				? { kind: 'complete', sessions, ...(removed.size ? { removedTaskIds: [...removed] } : {}) }
				: { kind: 'scoped', sessions, removedTaskIds: [...removed] };
	}

}

function taskSessionStatus(state: string | undefined, logService: ILogService): SessionStatus | undefined {
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
		case undefined:
			return undefined;
		default:
			logService.warn(`${LOG_PREFIX} Unrecognized session activity state; leaving its status unknown.`);
			return undefined;
	}
}

/** Provisioning tasks can advertise an empty provider before their runtime is ready. */
function isCloudSandboxTask(task: ITaskSummary): boolean {
	const provider = task.compute?.provider;
	return provider === 'sandboxes' || ((provider === undefined || provider === '') && task.current_environment?.kind === 'managed-sandbox');
}

/**
 * The next task-list page advertised by a `Link` header, or `undefined` on the last page.
 * Only the query is adopted: discovery stays on the CORS-enabled endpoint and keeps the
 * scope filters a numbered link may omit.
 */
function nextTaskPageUrl(value: string | string[] | undefined, requestUrl: string, query: Record<string, string>): string | undefined {
	const raw = Array.isArray(value) ? value.join(',') : value;
	const link = nextLink(raw);
	if (!link) {
		if (raw && /\brel\s*=\s*["']?[^;,]*\bnext\b/i.test(raw)) {
			throw new Error('Task list returned an unsupported pagination link');
		}
		return undefined;
	}
	const current = new URL(requestUrl);
	const next = new URL(link, current);
	if ((next.origin !== current.origin && next.origin !== GITHUB_DOT_COM_API_BASE_URI) || next.pathname !== current.pathname) {
		throw new Error('Task list returned an invalid pagination URL');
	}
	for (const [key, value] of Object.entries(query)) {
		if (!next.searchParams.has(key)) {
			next.searchParams.set(key, value);
		}
	}
	current.search = next.search;
	return current.href;
}

export function isConcreteEnvironmentId(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value !== CLOUD_SANDBOX_ON_DEMAND_ENVIRONMENT_ID;
}

function toQuery(query: Record<string, string>): string {
	return `?${new URLSearchParams(query)}`;
}

/**
 * The Mission Control environment a sandbox task runs in, read from the full task's nested
 * `sessions[]`. Undefined when no session is bound to an environment yet.
 */
export function getTaskEnvironmentBinding(task: ITaskDetail): { environmentId: string; sessionId: string } | undefined {
	if (!Array.isArray(task.sessions)) {
		return undefined;
	}
	for (const session of task.sessions) {
		if (isConcreteEnvironmentId(session?.environment_id) && typeof session.id === 'string' && session.id.trim().length > 0) {
			return { environmentId: session.environment_id, sessionId: session.id };
		}
	}
	return undefined;
}

function getUnstartedSessionCreatedAt(task: ITaskDetail): number | undefined {
	if (task.name !== 'New remote session' || task.state !== 'queued' || task.sessions?.length !== 1) {
		return undefined;
	}
	const session = task.sessions[0];
	if (session.state !== 'queued' || session.ahp_resource_uri || !session.created_at || session.updated_at !== session.created_at) {
		return undefined;
	}
	const createdAt = Date.parse(session.created_at);
	return Number.isFinite(createdAt) ? createdAt : undefined;
}

function getEmptySessionUpdatedAt(session: ICloudSandboxDiscoveredSession): number | undefined {
	if ((session.name !== 'New task' && session.name !== 'New Task') || session.eventType !== 'unknown'
		|| session.isArchived || (session.status !== undefined && session.status !== SessionStatus.Idle)) {
		return undefined;
	}
	const updatedAt = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
	return Number.isFinite(updatedAt) ? updatedAt : undefined;
}

function isEmptySessionHistory(history: IReplayedTaskHistory | undefined, sessionId: string): boolean | undefined {
	if (!history || history.truncated) {
		return undefined;
	}
	if (history.sessions.length !== 1) {
		return false;
	}
	const session = history.sessions[0];
	if (session.session !== AgentSession.uri(CLOUD_SANDBOX_SESSION_SCHEME, sessionId).toString()) {
		return undefined;
	}
	if (!session.hasRecordedDefaultChat || session.chats.size !== 1 || session.state.chats.length > 1
		|| (session.state.status & (SessionStatus.InProgress | SessionStatus.Error))
		|| session.state.chats.some(chat => chat.changes?.files
			|| (chat.status & (SessionStatus.InProgress | SessionStatus.Error))
			|| (chat.title && chat.title !== 'New task' && chat.title !== 'New Task'))
		|| (session.state.title && session.state.title !== 'New task' && session.state.title !== 'New Task')) {
		return false;
	}
	const chat = session.chats.get(session.defaultChat);
	return !!chat && chat.turns.length === 0 && !chat.activeTurn && !chat.turnsNextCursor
		&& !(chat.status & (SessionStatus.InProgress | SessionStatus.Error))
		&& !chat.changes?.files && !chat.backgroundWork?.length && !chat.queuedMessages?.length && !chat.steeringMessage && !chat.draft;
}
