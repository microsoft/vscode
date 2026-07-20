/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import {
	AutomationRunTrigger,
	AutomationTarget,
	AutomationWorkspaceIsolation,
	IAutomation,
	IAutomationRun,
} from '../../../../workbench/contrib/chat/common/automations/automation.js';
import {
	IAutomationService,
	ICreateAutomationOptions,
	IUpdateAutomationOptions,
	IUpdateAutomationRunOptions,
} from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { publishAutomationCreated, publishAutomationDeleted, publishAutomationUpdated } from '../../../../workbench/contrib/chat/common/automations/automationTelemetry.js';
import { computeNextRunAt } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { ChatPermissionLevel, isChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';

// APPLICATION scope, non-roaming.
const STORAGE_KEY = 'chat.automations.ledger';

const LEGACY_SCHEMA_VERSIONS = new Set([1, 2]);
const CURRENT_SCHEMA_VERSION = 3;

const MAX_RUNS_PER_AUTOMATION = 50;

interface ISerializedAutomationBase {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomation['schedule'];
	readonly modelId?: string;
	readonly mode?: string;
	readonly permissionLevel?: string;
	readonly enabled: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly lastRunAt?: string;
	readonly nextRunAt?: string;
}

type ISerializedAutomationTarget =
	| {
		readonly kind: 'workspace';
		readonly folderUri: UriComponents;
		readonly providerId?: string;
		readonly sessionTypeId?: string;
		readonly isolation: AutomationWorkspaceIsolation;
	}
	| {
		readonly kind: 'quickChat';
		readonly providerId: string;
		readonly sessionTypeId: string;
	};

interface ISerializedAutomation extends ISerializedAutomationBase {
	readonly target: ISerializedAutomationTarget;
}

interface ILegacySerializedAutomation extends ISerializedAutomationBase {
	readonly isQuickChat?: boolean;
	readonly folderUri?: UriComponents;
	readonly providerId?: string;
	readonly sessionTypeId?: string;
	readonly isolationMode?: string;
	readonly branch?: string;
}

interface ISerializedLedger {
	readonly schemaVersion: 3;
	// Optimistic-concurrency counter. 0 for legacy blobs without this field.
	readonly revision?: number;
	readonly automations: readonly ISerializedAutomation[];
	readonly runs: readonly IAutomationRun[];
}

interface ILegacySerializedLedger {
	readonly schemaVersion: 1 | 2;
	readonly revision?: number;
	readonly automations: readonly ILegacySerializedAutomation[];
	readonly runs: readonly IAutomationRun[];
}

interface ILedger {
	readonly automations: readonly IAutomation[];
	readonly runs: readonly IAutomationRun[];
}

const EMPTY_LEDGER: ILedger = Object.freeze({ automations: [], runs: [] });

type ReadLedgerResult =
	| { kind: 'ledger'; ledger: ILedger; revision: number }
	| { kind: 'unsupportedSchema' };

export class AutomationService extends Disposable implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	private readonly _automations: ISettableObservable<readonly IAutomation[]>;
	private readonly _runs: ISettableObservable<readonly IAutomationRun[]>;
	private _now: () => Date;
	private readonly _runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();

	// Set when on-disk schema is newer than this build. Prevents writes that would destroy data.
	private _unsupportedSchema = false;

	private _lastSeenRevision = 0;

	readonly automations: IObservable<readonly IAutomation[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._now = () => new Date();

		const result = this.readLedger();
		const initial = result.kind === 'ledger' ? result.ledger : EMPTY_LEDGER;
		if (result.kind === 'ledger') {
			this._lastSeenRevision = result.revision;
		}
		this._automations = observableValue<readonly IAutomation[]>(this, initial.automations);
		this._runs = observableValue<readonly IAutomationRun[]>(this, initial.runs);
		this.automations = this._automations;
		this.runs = this._runs;

		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, STORAGE_KEY, this._store)(() => {
			this.refreshFromStorage();
		}));

		this._register(this.storageService.onWillSaveState(() => {
			this.persist(this._automations.get(), this._runs.get());
		}));
	}

	/** Test-only: swap in a deterministic clock used by create/update. */
	setClockForTesting(now: () => Date): void {
		this._now = now;
	}

	getAutomation(id: string): IAutomation | undefined {
		return this._automations.get().find(a => a.id === id);
	}

	runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		let cached = this._runsForCache.get(automationId);
		if (!cached) {
			cached = derived(this, reader => this._runs.read(reader).filter(r => r.automationId === automationId));
			this._runsForCache.set(automationId, cached);
		}
		return cached;
	}

	async createAutomation(options: ICreateAutomationOptions): Promise<IAutomation> {
		if (this._unsupportedSchema) {
			throw new Error('Cannot modify automations: storage was written by a newer version');
		}
		const now = this._now();
		const nowIso = now.toISOString();
		const nextRun = computeNextRunAt(options.schedule, now);
		const automation: IAutomation = Object.freeze({
			id: generateUuid(),
			name: options.name,
			prompt: options.prompt,
			schedule: options.schedule,
			target: normalizeAutomationTarget(options.target),
			modelId: options.modelId,
			mode: options.mode,
			permissionLevel: isChatPermissionLevel(options.permissionLevel) ? options.permissionLevel : undefined,
			enabled: options.enabled ?? true,
			createdAt: nowIso,
			updatedAt: nowIso,
			lastRunAt: undefined,
			nextRunAt: nextRun?.toISOString(),
		});
		const next = [automation, ...this._automations.get()];
		this.commit(next, this._runs.get());
		publishAutomationCreated(this.telemetryService, automation);
		return automation;
	}

	async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomation> {
		if (this._unsupportedSchema) {
			throw new Error('Cannot modify automations: storage was written by a newer version');
		}
		const current = this.getAutomation(id);
		if (!current) {
			throw new Error(`Automation not found: ${id}`);
		}
		const merged = mergeAutomation(current, patch);
		const scheduleChanged = patch.schedule !== undefined;
		const enabledChanged = patch.enabled !== undefined;
		const updated: IAutomation = Object.freeze({
			...merged,
			updatedAt: this._now().toISOString(),
			nextRunAt: (scheduleChanged || (enabledChanged && merged.enabled))
				? computeNextRunAt(merged.schedule, this._now())?.toISOString()
				: merged.nextRunAt,
		});
		const next = this._automations.get().map(a => a.id === id ? updated : a);
		this.commit(next, this._runs.get());
		publishAutomationUpdated(this.telemetryService, current, updated);
		return updated;
	}

	async deleteAutomation(id: string): Promise<void> {
		if (this._unsupportedSchema) {
			throw new Error('Cannot modify automations: storage was written by a newer version');
		}
		const existing = this.getAutomation(id);
		const next = this._automations.get().filter(a => a.id !== id);
		if (next.length === this._automations.get().length) {
			return;
		}
		this.commit(next, this._runs.get());
		this._runsForCache.delete(id);
		if (existing) {
			publishAutomationDeleted(this.telemetryService, existing);
		}
	}

	async recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRun> {
		if (this._unsupportedSchema) {
			throw new Error('Cannot modify automations: storage was written by a newer version');
		}
		const automation = this.getAutomation(automationId);
		if (!automation) {
			throw new Error(`Automation not found: ${automationId}`);
		}
		const now = this._now();
		const startedAt = now.toISOString();
		const run: IAutomationRun = Object.freeze({
			id: generateUuid(),
			automationId,
			status: 'pending',
			trigger,
			startedAt,
			leaderWindowId,
		});
		let nextAutomations = this._automations.get();
		if (trigger !== 'manual') {
			const updatedAutomation: IAutomation = Object.freeze({
				...automation,
				lastRunAt: startedAt,
				nextRunAt: computeNextRunAt(automation.schedule, now)?.toISOString(),
				updatedAt: startedAt,
			});
			nextAutomations = nextAutomations.map(a => a.id === automationId ? updatedAutomation : a);
		}
		const nextRuns = [run, ...this._runs.get()];
		this.commit(nextAutomations, nextRuns);
		return run;
	}

	async updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		if (this._unsupportedSchema) {
			throw new Error('Cannot modify automations: storage was written by a newer version');
		}
		const current = this._runs.get().find(r => r.id === runId);
		if (!current) {
			return undefined;
		}
		const merged: IAutomationRun = Object.freeze({
			...current,
			status: patch.status ?? current.status,
			sessionResource: patch.sessionResource ?? current.sessionResource,
			completedAt: patch.completedAt ?? current.completedAt,
			errorMessage: patch.errorMessage ?? current.errorMessage,
		});
		const nextRuns = this._runs.get().map(r => r.id === runId ? merged : r);
		this.commit(this._automations.get(), nextRuns);
		return merged;
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this._runs.get().find(r => r.automationId === automationId && (r.status === 'pending' || r.status === 'running'));
	}

	async markStaleRunsFailed(reason: string): Promise<void> {
		if (this._unsupportedSchema) {
			throw new Error('Cannot modify automations: storage was written by a newer version');
		}
		let changed = false;
		const completedAt = this._now().toISOString();
		const nextRuns = this._runs.get().map(r => {
			if (r.status === 'pending' || r.status === 'running') {
				changed = true;
				return Object.freeze({ ...r, status: 'failed' as const, completedAt, errorMessage: reason });
			}
			return r;
		});
		if (changed) {
			this.commit(this._automations.get(), nextRuns);
		}
	}

	//#region Persistence

	private commit(automations: readonly IAutomation[], runs: readonly IAutomationRun[]): void {
		if (this._unsupportedSchema) {
			this.logService.warn('[AutomationService] Skipping commit; ledger has an unsupported (newer) schema version.');
			return;
		}
		const trimmedRuns = trimRunsPerAutomation(runs, MAX_RUNS_PER_AUTOMATION);
		transaction(tx => {
			this._automations.set(automations, tx);
			this._runs.set(trimmedRuns, tx);
		});
		this.persist(automations, trimmedRuns);
	}

	private persist(automations: readonly IAutomation[], runs: readonly IAutomationRun[]): void {
		if (this._unsupportedSchema) {
			return;
		}

		const nextRevision = this._lastSeenRevision + 1;
		const serialized: ISerializedLedger = {
			schemaVersion: CURRENT_SCHEMA_VERSION,
			revision: nextRevision,
			automations: automations.map(serializeAutomation),
			runs: [...runs],
		};
		try {
			this.storageService.store(STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} catch (err) {
			this.logService.warn('[AutomationService] Failed to persist ledger to storage', err);
			return;
		}
		this._lastSeenRevision = nextRevision;
	}

	private refreshFromStorage(): void {
		const result = this.readLedger();
		if (result.kind === 'unsupportedSchema') {
			return;
		}
		this._unsupportedSchema = false;
		this._lastSeenRevision = result.revision;
		transaction(tx => {
			this._automations.set(result.ledger.automations, tx);
			this._runs.set(result.ledger.runs, tx);
		});
	}

	private readLedger(): ReadLedgerResult {
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return { kind: 'ledger', ledger: EMPTY_LEDGER, revision: 0 };
		}
		try {
			const parsed = JSON.parse(raw) as ISerializedLedger | ILegacySerializedLedger;
			if (typeof parsed?.schemaVersion === 'number' && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
				this._unsupportedSchema = true;
				this.logService.warn(`[AutomationService] Ledger has schema v${parsed.schemaVersion}; this build only supports v${CURRENT_SCHEMA_VERSION}. Entering read-only mode.`);
				return { kind: 'unsupportedSchema' };
			}
			if (parsed?.schemaVersion !== CURRENT_SCHEMA_VERSION && !LEGACY_SCHEMA_VERSIONS.has(parsed?.schemaVersion)) {
				this.logService.warn(`[AutomationService] Unsupported ledger schema version ${parsed?.schemaVersion}; ignoring.`);
				return { kind: 'ledger', ledger: EMPTY_LEDGER, revision: 0 };
			}
			const automations: IAutomation[] = [];
			if (parsed.schemaVersion === CURRENT_SCHEMA_VERSION) {
				const entries = Array.isArray(parsed.automations) ? parsed.automations : [];
				for (const entry of entries) {
					try {
						const automation = deserializeAutomation(entry);
						if (automation) {
							automations.push(automation);
						} else {
							this.logService.warn(`[AutomationService] Dropping persisted automation ${entry?.id} with an invalid target.`);
						}
					} catch (err) {
						this.logService.warn(`[AutomationService] Dropping malformed persisted automation ${entry?.id}.`, err);
					}
				}
			} else {
				const entries = Array.isArray(parsed.automations) ? parsed.automations : [];
				for (const entry of entries) {
					try {
						const automation = deserializeLegacyAutomation(entry);
						if (automation) {
							automations.push(automation);
						} else {
							this.logService.warn(`[AutomationService] Dropping persisted automation ${entry?.id} with an invalid legacy target.`);
						}
					} catch (err) {
						this.logService.warn(`[AutomationService] Dropping malformed persisted automation ${entry?.id}.`, err);
					}
				}
			}
			const validIds = new Set(automations.map(a => a.id));
			const serializedRuns = Array.isArray(parsed.runs) ? parsed.runs : [];
			const runs = serializedRuns
				.filter(r => !!r && typeof r === 'object' && validIds.has(r.automationId))
				.map(r => Object.freeze({ ...r }));
			const revision = typeof parsed.revision === 'number' ? parsed.revision : 0;
			return { kind: 'ledger', ledger: { automations, runs: trimRunsPerAutomation(runs, MAX_RUNS_PER_AUTOMATION) }, revision };
		} catch (err) {
			this.logService.error('[AutomationService] Failed to parse automations ledger; resetting.', err);
			return { kind: 'ledger', ledger: EMPTY_LEDGER, revision: 0 };
		}
	}

	//#endregion
}

function serializeAutomation(a: IAutomation): ISerializedAutomation {
	return {
		id: a.id,
		name: a.name,
		prompt: a.prompt,
		schedule: a.schedule,
		target: serializeAutomationTarget(a.target),
		modelId: a.modelId,
		mode: a.mode,
		permissionLevel: a.permissionLevel,
		enabled: a.enabled,
		createdAt: a.createdAt,
		updatedAt: a.updatedAt,
		lastRunAt: a.lastRunAt,
		nextRunAt: a.nextRunAt,
	};
}

function deserializeAutomation(s: ISerializedAutomation): IAutomation | undefined {
	const target = deserializeAutomationTarget(s.target);
	return target ? createAutomationFromSerialized(s, target) : undefined;
}

function deserializeLegacyAutomation(s: ILegacySerializedAutomation): IAutomation | undefined {
	let target: AutomationTarget;
	if (s.isQuickChat === true) {
		if (!s.providerId || !s.sessionTypeId) {
			return undefined;
		}
		target = createQuickChatAutomationTarget(s.providerId, s.sessionTypeId);
	} else {
		if (!s.folderUri) {
			return undefined;
		}
		target = createWorkspaceAutomationTarget(
			URI.revive(s.folderUri),
			s.providerId,
			s.sessionTypeId,
			deserializeLegacyIsolation(s.isolationMode, s.branch),
		);
	}
	return createAutomationFromSerialized(s, target);
}

function createAutomationFromSerialized(s: ISerializedAutomationBase, target: AutomationTarget): IAutomation {
	// Default to most restrictive if the persisted value is invalid.
	const permissionLevel = isChatPermissionLevel(s.permissionLevel)
		? s.permissionLevel
		: ChatPermissionLevel.Default;

	return Object.freeze({
		id: s.id,
		name: s.name,
		prompt: s.prompt,
		schedule: s.schedule,
		target,
		modelId: s.modelId,
		mode: s.mode,
		permissionLevel,
		enabled: s.enabled,
		createdAt: s.createdAt,
		updatedAt: s.updatedAt,
		lastRunAt: s.lastRunAt,
		nextRunAt: s.nextRunAt,
	});
}

function mergeAutomation(current: IAutomation, patch: IUpdateAutomationOptions): IAutomation {
	return {
		...current,
		name: patch.name ?? current.name,
		prompt: patch.prompt ?? current.prompt,
		schedule: patch.schedule ?? current.schedule,
		target: patch.target ? normalizeAutomationTarget(patch.target) : current.target,
		modelId: patch.modelId === null ? undefined : (patch.modelId ?? current.modelId),
		mode: patch.mode === null ? undefined : (patch.mode ?? current.mode),
		permissionLevel: patch.permissionLevel === null ? undefined : (patch.permissionLevel && isChatPermissionLevel(patch.permissionLevel) ? patch.permissionLevel : current.permissionLevel),
		enabled: patch.enabled ?? current.enabled,
	};
}

function normalizeAutomationTarget(target: AutomationTarget): AutomationTarget {
	if (target.kind === 'quickChat') {
		if (!target.providerId || !target.sessionTypeId) {
			throw new Error('Workspace-less automation requires a providerId and sessionTypeId.');
		}
		return createQuickChatAutomationTarget(target.providerId, target.sessionTypeId);
	}
	if (!target.folderUri) {
		throw new Error('Workspace-backed automation requires a folderUri.');
	}
	return createWorkspaceAutomationTarget(
		target.folderUri,
		target.providerId,
		target.sessionTypeId,
		target.isolation,
	);
}

function serializeAutomationTarget(target: AutomationTarget): ISerializedAutomationTarget {
	return target.kind === 'quickChat'
		? { kind: 'quickChat', providerId: target.providerId, sessionTypeId: target.sessionTypeId }
		: {
			kind: 'workspace',
			folderUri: target.folderUri.toJSON(),
			providerId: target.providerId,
			sessionTypeId: target.sessionTypeId,
			isolation: target.isolation,
		};
}

function deserializeAutomationTarget(target: ISerializedAutomationTarget): AutomationTarget | undefined {
	if (target?.kind === 'quickChat') {
		return target.providerId && target.sessionTypeId
			? createQuickChatAutomationTarget(target.providerId, target.sessionTypeId)
			: undefined;
	}
	if (target?.kind !== 'workspace' || !target.folderUri || !isAutomationWorkspaceIsolation(target.isolation)) {
		return undefined;
	}
	return createWorkspaceAutomationTarget(
		URI.revive(target.folderUri),
		target.providerId,
		target.sessionTypeId,
		target.isolation,
	);
}

function deserializeLegacyIsolation(isolationMode: string | undefined, branch: string | undefined): AutomationWorkspaceIsolation {
	if (isolationMode === 'worktree') {
		return branch ? { kind: 'worktree', branch } : { kind: 'default' };
	}
	return isolationMode === 'workspace' ? { kind: 'folder' } : { kind: 'default' };
}

function normalizeAutomationWorkspaceIsolation(isolation: AutomationWorkspaceIsolation): AutomationWorkspaceIsolation {
	if (isolation?.kind === 'default') {
		return Object.freeze({ kind: 'default' });
	}
	if (isolation?.kind === 'folder') {
		return Object.freeze({ kind: 'folder' });
	}
	if (isolation?.kind === 'worktree' && isolation.branch) {
		return Object.freeze({ kind: 'worktree', branch: isolation.branch });
	}
	if (isolation?.kind === 'worktree') {
		throw new Error('Worktree automation requires a branch.');
	}
	throw new Error('Workspace-backed automation requires a valid isolation mode.');
}

function createQuickChatAutomationTarget(providerId: string, sessionTypeId: string): AutomationTarget {
	return Object.freeze({ kind: 'quickChat', providerId, sessionTypeId });
}

function createWorkspaceAutomationTarget(
	folderUri: URI,
	providerId: string | undefined,
	sessionTypeId: string | undefined,
	isolation: AutomationWorkspaceIsolation,
): AutomationTarget {
	return Object.freeze({
		kind: 'workspace',
		folderUri,
		...(providerId !== undefined ? { providerId } : {}),
		...(sessionTypeId !== undefined ? { sessionTypeId } : {}),
		isolation: normalizeAutomationWorkspaceIsolation(isolation),
	});
}

function isAutomationWorkspaceIsolation(value: AutomationWorkspaceIsolation | undefined): value is AutomationWorkspaceIsolation {
	return value?.kind === 'default'
		|| value?.kind === 'folder'
		|| (value?.kind === 'worktree' && typeof value.branch === 'string' && value.branch.length > 0);
}

function trimRunsPerAutomation(runs: readonly IAutomationRun[], max: number): readonly IAutomationRun[] {
	const counts = new Map<string, number>();
	const out: IAutomationRun[] = [];
	for (const run of runs) {
		const count = counts.get(run.automationId) ?? 0;
		if (count >= max) {
			continue;
		}
		counts.set(run.automationId, count + 1);
		out.push(run);
	}
	return out.length === runs.length ? runs : out;
}
