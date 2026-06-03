/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
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
import { computeNextRunAt } from '../../common/automations/schedule.js';

/**
 * Storage key under which the entire automations ledger (definitions + run
 * history) is persisted. Lives at `StorageScope.APPLICATION` so it is
 * shared across all windows on the machine but does not roam with the user.
 */
const STORAGE_KEY = 'chat.automations.ledger';

const CURRENT_SCHEMA_VERSION = 1;

interface ISerializedAutomation {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomation['schedule'];
	readonly folderUri: UriComponents;
	readonly modelId?: string;
	readonly mode?: string;
	readonly enabled: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly lastRunAt?: string;
	readonly nextRunAt?: string;
}

interface ISerializedLedger {
	readonly schemaVersion: number;
	readonly automations: readonly ISerializedAutomation[];
	readonly runs: readonly IAutomationRun[];
}

interface ILedger {
	readonly automations: readonly IAutomation[];
	readonly runs: readonly IAutomationRun[];
}

const EMPTY_LEDGER: ILedger = Object.freeze({ automations: [], runs: [] });

export class AutomationService extends Disposable implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	private readonly _automations: ISettableObservable<readonly IAutomation[]>;
	private readonly _runs: ISettableObservable<readonly IAutomationRun[]>;
	private readonly _now: () => Date;

	readonly automations: IObservable<readonly IAutomation[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Test seam: production always uses the system clock. Tests can
		// override after construction via `setClockForTesting`.
		this._now = () => new Date();

		const initial = this.readLedger();
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
			modelId: options.modelId,
			mode: options.mode,
			enabled: options.enabled ?? true,
			createdAt: nowIso,
			updatedAt: nowIso,
			lastRunAt: undefined,
			nextRunAt: nextRun?.toISOString(),
		});
		const next = [automation, ...this._automations.get()];
		this.commit(next, this._runs.get());
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
		return updated;
	}

	async deleteAutomation(id: string): Promise<void> {
		const next = this._automations.get().filter(a => a.id !== id);
		if (next.length === this._automations.get().length) {
			return;
		}
		this.commit(next, this._runs.get());
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
		this._automations.set(automations, undefined);
		this._runs.set(runs, undefined);
		this.persist(automations, runs);
	}

	private persist(automations: readonly IAutomation[], runs: readonly IAutomationRun[]): void {
		const serialized: ISerializedLedger = {
			schemaVersion: CURRENT_SCHEMA_VERSION,
			automations: automations.map(serializeAutomation),
			runs: [...runs],
		};
		this.storageService.store(STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private refreshFromStorage(): void {
		const ledger = this.readLedger();
		this._automations.set(ledger.automations, undefined);
		this._runs.set(ledger.runs, undefined);
	}

	private readLedger(): ILedger {
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return EMPTY_LEDGER;
		}
		try {
			const parsed = JSON.parse(raw) as ISerializedLedger;
			if (parsed?.schemaVersion !== CURRENT_SCHEMA_VERSION) {
				this.logService.warn(`[AutomationService] Unsupported ledger schema version ${parsed?.schemaVersion}; ignoring.`);
				return EMPTY_LEDGER;
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
			return { automations, runs };
		} catch (err) {
			this.logService.error('[AutomationService] Failed to parse automations ledger; resetting.', err);
			return EMPTY_LEDGER;
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
		modelId: a.modelId,
		mode: a.mode,
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
		modelId: s.modelId,
		mode: s.mode,
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
		modelId: patch.modelId === null ? undefined : (patch.modelId ?? current.modelId),
		mode: patch.mode === null ? undefined : (patch.mode ?? current.mode),
		enabled: patch.enabled ?? current.enabled,
	};
}
