/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
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
	IGuardedAutomationUpdateResult,
	serializeAutomationEditableState,
	IUpdateAutomationOptions,
	IUpdateAutomationRunOptions,
} from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { publishAutomationCreated, publishAutomationDeleted, publishAutomationUpdated } from '../../../../workbench/contrib/chat/common/automations/automationTelemetry.js';
import { computeNextRunAt } from '../../../../workbench/contrib/chat/common/automations/schedule.js';
import { ChatPermissionLevel, isChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { AUTOMATION_STORAGE_KEY, IAutomationStorageService } from '../common/automationStorageService.js';

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

type ILedgerMutation<T> =
	| { readonly kind: 'commit'; readonly ledger: ILedger; readonly result: T }
	| { readonly kind: 'noChange'; readonly result: T };

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

	private _lastSeenRevision = 0;

	readonly automations: IObservable<readonly IAutomation[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAutomationStorageService private readonly automationStorageService: IAutomationStorageService,
	) {
		super();

		this._now = () => new Date();

		const result = this.readLedger(this.storageService.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
		const initial = result.kind === 'ledger' ? result.ledger : EMPTY_LEDGER;
		if (result.kind === 'ledger') {
			this._lastSeenRevision = result.revision;
		}
		this._automations = observableValue<readonly IAutomation[]>(this, initial.automations);
		this._runs = observableValue<readonly IAutomationRun[]>(this, initial.runs);
		this.automations = this._automations;
		this.runs = this._runs;

		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, AUTOMATION_STORAGE_KEY, this._store)(() => {
			this.refreshFromStorage();
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
		await this.mutateLedger(ledger => ({
			kind: 'commit',
			ledger: { automations: [automation, ...ledger.automations], runs: ledger.runs },
			result: undefined,
		}));
		publishAutomationCreated(this.telemetryService, automation);
		return automation;
	}

	async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomation> {
		const now = this._now();
		const result = await this.mutateLedger(ledger => {
			const current = ledger.automations.find(automation => automation.id === id);
			if (!current) {
				throw new Error(`Automation not found: ${id}`);
			}
			const updated = updateAutomation(current, patch, now);
			return {
				kind: 'commit',
				ledger: {
					automations: ledger.automations.map(automation => automation.id === id ? updated : automation),
					runs: ledger.runs,
				},
				result: { current, updated },
			};
		});
		publishAutomationUpdated(this.telemetryService, result.current, result.updated);
		return result.updated;
	}

	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomation): Promise<IGuardedAutomationUpdateResult> {
		const now = this._now();
		let previous: IAutomation | undefined;
		const result = await this.mutateLedger<IGuardedAutomationUpdateResult>(ledger => {
			const current = ledger.automations.find(automation => automation.id === id);
			if (!current || serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
				return {
					kind: 'noChange',
					result: { kind: 'conflict', current } as const,
				};
			}

			const updated = updateAutomation(current, patch, now);
			previous = current;
			return {
				kind: 'commit',
				ledger: {
					automations: ledger.automations.map(automation => automation.id === id ? updated : automation),
					runs: ledger.runs,
				},
				result: { kind: 'updated', automation: updated } as const,
			};
		});
		if (result.kind === 'conflict' || !previous) {
			return result;
		}

		publishAutomationUpdated(this.telemetryService, previous, result.automation);
		return result;
	}

	async deleteAutomation(id: string): Promise<void> {
		const existing = await this.mutateLedger(ledger => {
			const automation = ledger.automations.find(automation => automation.id === id);
			if (!automation) {
				return { kind: 'noChange', result: undefined };
			}
			return {
				kind: 'commit',
				ledger: {
					automations: ledger.automations.filter(automation => automation.id !== id),
					runs: ledger.runs.filter(run => run.automationId !== id),
				},
				result: automation,
			};
		});
		if (!existing) {
			return;
		}

		this._runsForCache.delete(id);
		publishAutomationDeleted(this.telemetryService, existing);
	}

	async recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRun> {
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
		await this.mutateLedger(ledger => {
			const automation = ledger.automations.find(automation => automation.id === automationId);
			if (!automation) {
				throw new Error(`Automation not found: ${automationId}`);
			}
			let automations = ledger.automations;
			if (trigger !== 'manual') {
				const updatedAutomation: IAutomation = Object.freeze({
					...automation,
					lastRunAt: startedAt,
					nextRunAt: computeNextRunAt(automation.schedule, now)?.toISOString(),
					updatedAt: startedAt,
				});
				automations = automations.map(automation => automation.id === automationId ? updatedAutomation : automation);
			}
			return {
				kind: 'commit',
				ledger: { automations, runs: [run, ...ledger.runs] },
				result: undefined,
			};
		});
		return run;
	}

	async updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		return this.mutateLedger(ledger => {
			const current = ledger.runs.find(run => run.id === runId);
			if (!current) {
				return { kind: 'noChange', result: undefined };
			}
			const updated: IAutomationRun = Object.freeze({
				...current,
				status: patch.status ?? current.status,
				sessionResource: patch.sessionResource ?? current.sessionResource,
				completedAt: patch.completedAt ?? current.completedAt,
				errorMessage: patch.errorMessage ?? current.errorMessage,
			});
			return {
				kind: 'commit',
				ledger: {
					automations: ledger.automations,
					runs: ledger.runs.map(run => run.id === runId ? updated : run),
				},
				result: updated,
			};
		});
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this._runs.get().find(r => r.automationId === automationId && (r.status === 'pending' || r.status === 'running'));
	}

	async markStaleRunsFailed(reason: string): Promise<void> {
		const completedAt = this._now().toISOString();
		await this.mutateLedger(ledger => {
			let changed = false;
			const runs = ledger.runs.map(run => {
				if (run.status === 'pending' || run.status === 'running') {
					changed = true;
					return Object.freeze({ ...run, status: 'failed' as const, completedAt, errorMessage: reason });
				}
				return run;
			});
			if (!changed) {
				return { kind: 'noChange', result: undefined };
			}
			return {
				kind: 'commit',
				ledger: { automations: ledger.automations, runs },
				result: undefined,
			};
		});
	}

	//#region Persistence

	private async mutateLedger<T>(mutate: (ledger: ILedger) => ILedgerMutation<T>): Promise<T> {
		let raw = await this.automationStorageService.read();
		while (true) {
			const readResult = this.readLedger(raw);
			if (readResult.kind === 'unsupportedSchema') {
				throw new Error('Cannot modify automations: storage was written by a newer version');
			}

			this.acceptLedger(readResult.ledger, readResult.revision);
			const mutation = mutate(readResult.ledger);
			if (mutation.kind === 'noChange') {
				return mutation.result;
			}

			const ledger: ILedger = {
				automations: mutation.ledger.automations,
				runs: trimRunsPerAutomation(mutation.ledger.runs, MAX_RUNS_PER_AUTOMATION),
			};
			const revision = readResult.revision + 1;
			const serialized: ISerializedLedger = {
				schemaVersion: CURRENT_SCHEMA_VERSION,
				revision,
				automations: ledger.automations.map(serializeAutomation),
				runs: [...ledger.runs],
			};
			const newValue = JSON.stringify(serialized);
			const writeResult = await this.automationStorageService.compareAndSwap(raw, newValue);
			if (writeResult.swapped) {
				this.acceptLedger(ledger, revision);
				return mutation.result;
			}
			if (writeResult.currentValue === raw) {
				throw new Error('Automation storage rejected an unchanged compare-and-swap value.');
			}
			raw = writeResult.currentValue;
		}
	}

	private acceptLedger(ledger: ILedger, revision: number): void {
		if (revision < this._lastSeenRevision) {
			return;
		}
		this._lastSeenRevision = revision;
		transaction(tx => {
			this._automations.set(ledger.automations, tx);
			this._runs.set(ledger.runs, tx);
		});
	}

	private refreshFromStorage(): void {
		const result = this.readLedger(this.storageService.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
		if (result.kind === 'unsupportedSchema') {
			return;
		}
		this.acceptLedger(result.ledger, result.revision);
	}

	private readLedger(raw: string | undefined): ReadLedgerResult {
		if (!raw) {
			return { kind: 'ledger', ledger: EMPTY_LEDGER, revision: 0 };
		}
		try {
			const parsed = JSON.parse(raw) as ISerializedLedger | ILegacySerializedLedger;
			if (typeof parsed?.schemaVersion === 'number' && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
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

function updateAutomation(current: IAutomation, patch: IUpdateAutomationOptions, now: Date): IAutomation {
	const merged = mergeAutomation(current, patch);
	const scheduleChanged = patch.schedule !== undefined;
	const enabledChanged = patch.enabled !== undefined;
	return Object.freeze({
		...merged,
		updatedAt: now.toISOString(),
		nextRunAt: (scheduleChanged || (enabledChanged && merged.enabled))
			? computeNextRunAt(merged.schedule, now)?.toISOString()
			: merged.nextRunAt,
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
