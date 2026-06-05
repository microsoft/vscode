/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import {
	AutomationRunTrigger,
	IAutomation,
	IAutomationRun,
} from '../../common/automations/automation.js';
import {
	IAutomationService,
	ICreateAutomationOptions,
	IUpdateAutomationOptions,
	IUpdateAutomationRunOptions,
} from '../../common/automations/automationService.js';
import { publishAutomationCreated, publishAutomationDeleted, publishAutomationUpdated } from '../../common/automations/automationTelemetry.js';
import { computeNextRunAt } from '../../common/automations/schedule.js';

/**
 * Storage key under which the entire automations ledger (definitions + run
 * history) is persisted. Lives at `StorageScope.APPLICATION` so it is
 * shared across all windows on the machine but does not roam with the user.
 */
const STORAGE_KEY = 'chat.automations.ledger';

const CURRENT_SCHEMA_VERSION = 1;

/**
 * Maximum number of run-history records retained per automation. Older runs
 * are evicted when this cap is exceeded so the single-blob ledger does not
 * grow unbounded (e.g. an hourly schedule running for a year would otherwise
 * produce 8,760+ records). The UI also clamps the displayed history.
 */
const MAX_RUNS_PER_AUTOMATION = 50;

interface ISerializedAutomation {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomation['schedule'];
	readonly folderUri: UriComponents;
	readonly providerId?: string;
	readonly sessionTypeId?: string;
	readonly modelId?: string;
	readonly mode?: string;
	readonly permissionLevel?: string;
	readonly enabled: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly lastRunAt?: string;
	readonly nextRunAt?: string;
}

interface ISerializedLedger {
	readonly schemaVersion: number;
	/**
	 * Monotonic counter incremented on every write. Used for optimistic
	 * concurrency: `persist()` re-reads storage before writing and warns
	 * (and bumps from the on-disk revision) when another window has written
	 * since this window's last `readLedger`. Defaults to 0 for forward-
	 * compatibility with older serialized blobs that pre-date this field.
	 */
	readonly revision?: number;
	readonly automations: readonly ISerializedAutomation[];
	readonly runs: readonly IAutomationRun[];
}

interface ILedger {
	readonly automations: readonly IAutomation[];
	readonly runs: readonly IAutomationRun[];
}

const EMPTY_LEDGER: ILedger = Object.freeze({ automations: [], runs: [] });

/**
 * Outcome of attempting to read the persisted ledger.
 *
 * - `{ kind: 'ledger', ... }`: parse succeeded and the schema is compatible.
 * - `{ kind: 'unsupportedSchema' }`: the on-disk ledger has a `schemaVersion`
 *   greater than what this build understands. The service must NOT write
 *   under this state — a newer build wrote the data and we would silently
 *   destroy it. The in-memory observables are also frozen at their last
 *   known state to avoid clearing the UI to empty.
 */
type ReadLedgerResult =
	| { kind: 'ledger'; ledger: ILedger; revision: number }
	| { kind: 'unsupportedSchema' };

export class AutomationService extends Disposable implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	private readonly _automations: ISettableObservable<readonly IAutomation[]>;
	private readonly _runs: ISettableObservable<readonly IAutomationRun[]>;
	private readonly _now: () => Date;

	/**
	 * Set to `true` when {@link readLedger} encounters a newer
	 * `schemaVersion` than this build knows. Once set, the service refuses
	 * to write to storage and stops mutating observables in
	 * {@link refreshFromStorage}, so an older window cannot destroy data
	 * written by a newer build.
	 */
	private _unsupportedSchema = false;

	/**
	 * Monotonic revision of the last ledger this window observed (either
	 * read from storage or written by this window). Used by {@link persist}
	 * for optimistic-concurrency detection across windows.
	 */
	private _lastSeenRevision = 0;

	readonly automations: IObservable<readonly IAutomation[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		// Test seam: production always uses the system clock. Tests can
		// override after construction via `setClockForTesting`.
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
			// Force a synchronous flush so an immediate window-close persists
			// the latest in-memory ledger.
			this.persist(this._automations.get(), this._runs.get());
		}));
	}

	/** Test-only: swap in a deterministic clock used by create/update. */
	setClockForTesting(now: () => Date): void {
		(this as unknown as { _now: () => Date })._now = now;
	}

	getAutomation(id: string): IAutomation | undefined {
		return this._automations.get().find(a => a.id === id);
	}

	runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		return derived(this, reader => this._runs.read(reader).filter(r => r.automationId === automationId));
	}

	async createAutomation(options: ICreateAutomationOptions): Promise<IAutomation> {
		if (!options.folderUri) {
			throw new Error('Automation requires a folderUri.');
		}
		const now = this._now();
		const nowIso = now.toISOString();
		const nextRun = computeNextRunAt(options.schedule, now);
		const automation: IAutomation = Object.freeze({
			id: generateUuid(),
			name: options.name,
			prompt: options.prompt,
			schedule: options.schedule,
			folderUri: options.folderUri,
			providerId: options.providerId,
			sessionTypeId: options.sessionTypeId,
			modelId: options.modelId,
			mode: options.mode,
			permissionLevel: options.permissionLevel,
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
			// Recompute next-run whenever the schedule changes, or when an
			// automation is re-enabled (so we don't sit on a stale value).
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
		const existing = this.getAutomation(id);
		const next = this._automations.get().filter(a => a.id !== id);
		if (next.length === this._automations.get().length) {
			return;
		}
		this.commit(next, this._runs.get());
		if (existing) {
			publishAutomationDeleted(this.telemetryService, existing);
		}
	}

	async recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRun> {
		if (!this.getAutomation(automationId)) {
			throw new Error(`Automation not found: ${automationId}`);
		}
		const run: IAutomationRun = Object.freeze({
			id: generateUuid(),
			automationId,
			status: 'pending',
			trigger,
			startedAt: this._now().toISOString(),
			leaderWindowId,
		});
		const nextRuns = [run, ...this._runs.get()];
		this.commit(this._automations.get(), nextRuns);
		return run;
	}

	async updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		const current = this._runs.get().find(r => r.id === runId);
		if (!current) {
			return undefined;
		}
		const merged: IAutomationRun = Object.freeze({
			...current,
			status: patch.status ?? current.status,
			sessionId: patch.sessionId ?? current.sessionId,
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

	async advanceNextRunAt(id: string, now: Date = this._now()): Promise<IAutomation | undefined> {
		const current = this.getAutomation(id);
		if (!current) {
			return undefined;
		}
		const updated: IAutomation = Object.freeze({
			...current,
			lastRunAt: now.toISOString(),
			nextRunAt: computeNextRunAt(current.schedule, now)?.toISOString(),
			updatedAt: now.toISOString(),
		});
		const next = this._automations.get().map(a => a.id === id ? updated : a);
		this.commit(next, this._runs.get());
		return updated;
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
			// A newer build wrote this storage key; refuse to overwrite.
			return;
		}

		// Re-read on-disk state immediately before writing to detect (a) a
		// schema upgrade that happened while we were running and (b) a
		// concurrent write from another window. This is a best-effort
		// mitigation, not a true CAS: another window could still write
		// between our `get` and our `store`. The `revision` field is
		// persisted so a future change can build full retry-on-conflict
		// semantics on top without a storage migration.
		let baseRevision = this._lastSeenRevision;
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as ISerializedLedger;
				if (typeof parsed?.schemaVersion === 'number' && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
					this._unsupportedSchema = true;
					this.logService.warn(`[AutomationService] On-disk ledger upgraded to schema v${parsed.schemaVersion}; entering read-only mode and skipping write.`);
					return;
				}
				const onDiskRevision = typeof parsed?.revision === 'number' ? parsed.revision : 0;
				if (onDiskRevision > this._lastSeenRevision) {
					this.logService.warn(`[AutomationService] Concurrent write detected (on-disk revision ${onDiskRevision} > local ${this._lastSeenRevision}); overwriting. Recent changes from another window may be lost.`);
				}
				baseRevision = Math.max(onDiskRevision, this._lastSeenRevision);
			} catch {
				// Unparseable existing blob — treat as if absent.
			}
		}

		const nextRevision = baseRevision + 1;
		const serialized: ISerializedLedger = {
			schemaVersion: CURRENT_SCHEMA_VERSION,
			revision: nextRevision,
			automations: automations.map(serializeAutomation),
			runs: [...runs],
		};
		this.storageService.store(STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._lastSeenRevision = nextRevision;
	}

	private refreshFromStorage(): void {
		const result = this.readLedger();
		if (result.kind === 'unsupportedSchema') {
			// Freeze observables at their last-known-good state so the UI
			// keeps showing the user's automations and we don't write
			// anything that would clobber the newer schema.
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
			const parsed = JSON.parse(raw) as ISerializedLedger;
			if (typeof parsed?.schemaVersion === 'number' && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
				this._unsupportedSchema = true;
				this.logService.warn(`[AutomationService] Ledger has schema v${parsed.schemaVersion}; this build only supports v${CURRENT_SCHEMA_VERSION}. Entering read-only mode.`);
				return { kind: 'unsupportedSchema' };
			}
			if (parsed?.schemaVersion !== CURRENT_SCHEMA_VERSION) {
				// Older schema with no migration available — treat as empty.
				this.logService.warn(`[AutomationService] Unsupported ledger schema version ${parsed?.schemaVersion}; ignoring.`);
				return { kind: 'ledger', ledger: EMPTY_LEDGER, revision: 0 };
			}
			const automations: IAutomation[] = [];
			for (const entry of parsed.automations ?? []) {
				if (!entry?.folderUri) {
					this.logService.warn(`[AutomationService] Dropping persisted automation ${entry?.id} without a folderUri.`);
					continue;
				}
				automations.push(deserializeAutomation(entry));
			}
			const validIds = new Set(automations.map(a => a.id));
			const runs = (parsed.runs ?? [])
				.filter(r => validIds.has(r.automationId))
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
		folderUri: a.folderUri.toJSON() as UriComponents,
		providerId: a.providerId,
		sessionTypeId: a.sessionTypeId,
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

function deserializeAutomation(s: ISerializedAutomation): IAutomation {
	return Object.freeze({
		id: s.id,
		name: s.name,
		prompt: s.prompt,
		schedule: s.schedule,
		folderUri: URI.revive(s.folderUri),
		providerId: s.providerId,
		sessionTypeId: s.sessionTypeId,
		modelId: s.modelId,
		mode: s.mode,
		permissionLevel: s.permissionLevel,
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
		folderUri: patch.folderUri ?? current.folderUri,
		providerId: patch.providerId === null ? undefined : (patch.providerId ?? current.providerId),
		sessionTypeId: patch.sessionTypeId === null ? undefined : (patch.sessionTypeId ?? current.sessionTypeId),
		modelId: patch.modelId === null ? undefined : (patch.modelId ?? current.modelId),
		mode: patch.mode === null ? undefined : (patch.mode ?? current.mode),
		permissionLevel: patch.permissionLevel === null ? undefined : (patch.permissionLevel ?? current.permissionLevel),
		enabled: patch.enabled ?? current.enabled,
	};
}

/**
 * Caps the number of runs retained per `automationId` at `max`, preserving
 * input order (which the service maintains as newest-first via prepend in
 * `recordRunStart`). Older runs beyond the cap are dropped.
 */
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
