/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/objects.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AutomationTarget, AutomationWorkspaceIsolation, IAutomation, IAutomationRun } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { serializeAutomationEditableState } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ChatPermissionLevel, isChatPermissionLevel } from '../../../../workbench/contrib/chat/common/constants.js';
import { AUTOMATION_STORAGE_KEY, ILegacyAutomationMigrationStorageService } from '../common/legacyAutomationMigrationStorage.js';

const CURRENT_LEGACY_SCHEMA_VERSION = 3;
type LegacyAutomationMutationResult = 'updated' | 'unchanged' | 'missing';

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
	readonly schemaVersion: number;
	readonly revision?: number;
	readonly automations: readonly (ISerializedAutomation | ILegacySerializedAutomation)[];
	readonly runs: readonly IAutomationRun[];
}

export interface ILegacyAutomationMigrationSnapshot {
	readonly automations: readonly IAutomation[];
	readonly runs: readonly IAutomationRun[];
	readonly unsupportedSchema: boolean;
}

const EMPTY_SNAPSHOT: ILegacyAutomationMigrationSnapshot = Object.freeze({
	automations: [],
	runs: [],
	unsupportedSchema: false,
});

export class LegacyAutomationMigration {

	constructor(
		private readonly storageService: ILegacyAutomationMigrationStorageService,
		private readonly logService: ILogService,
		readonly storageKey = AUTOMATION_STORAGE_KEY,
	) { }

	readCached(raw: string | undefined): ILegacyAutomationMigrationSnapshot {
		if (!raw) {
			return EMPTY_SNAPSHOT;
		}
		try {
			const ledger = this._parseLedger(raw);
			if (ledger.schemaVersion > CURRENT_LEGACY_SCHEMA_VERSION) {
				this.logService.warn(`[LegacyAutomationMigration] Cannot migrate automation ledger schema v${ledger.schemaVersion}.`);
				return { ...EMPTY_SNAPSHOT, unsupportedSchema: true };
			}
			const automations: IAutomation[] = [];
			for (const entry of ledger.automations) {
				try {
					const automation = ledger.schemaVersion === CURRENT_LEGACY_SCHEMA_VERSION
						? deserializeAutomation(entry as ISerializedAutomation)
						: deserializeLegacyAutomation(entry as ILegacySerializedAutomation);
					if (automation) {
						automations.push(automation);
					}
				} catch (error) {
					this.logService.warn(`[LegacyAutomationMigration] Skipping malformed automation ${entry.id}.`, error);
				}
			}
			const validIds = new Set(automations.map(automation => automation.id));
			return {
				automations,
				runs: ledger.runs.filter(run => validIds.has(run.automationId)).map(run => Object.freeze({ ...run })),
				unsupportedSchema: false,
			};
		} catch (error) {
			this.logService.error('[LegacyAutomationMigration] Failed to read the legacy automation ledger.', error);
			return EMPTY_SNAPSHOT;
		}
	}

	async read(): Promise<ILegacyAutomationMigrationSnapshot> {
		return this.readCached(await this.storageService.read(this.storageKey));
	}

	async disable(expected: IAutomation): Promise<LegacyAutomationMutationResult> {
		return this._mutate(expected, (ledger, current) => {
			const disabledExpected = { ...expected, enabled: false };
			if (serializeLegacyAutomationState(current) === serializeLegacyAutomationState(disabledExpected)) {
				return undefined;
			}
			this._throwIfChanged(current, expected);
			return {
				...ledger,
				automations: ledger.automations.map(automation => automation.id === expected.id ? { ...automation, enabled: false } : automation),
			};
		});
	}

	async remove(expected: IAutomation, expectedRuns: readonly IAutomationRun[]): Promise<LegacyAutomationMutationResult> {
		return this._mutate(expected, (ledger, current, currentRuns) => {
			this._throwIfChanged(current, { ...expected, enabled: false });
			if (!equals(currentRuns, expectedRuns)) {
				throw new Error(`Automation '${expected.name}' run history changed while it was being migrated.`);
			}
			return {
				...ledger,
				automations: ledger.automations.filter(automation => automation.id !== expected.id),
				runs: ledger.runs.filter(run => run.automationId !== expected.id),
			};
		});
	}

	private async _mutate(expected: IAutomation, mutate: (ledger: ISerializedLedger, current: IAutomation, currentRuns: readonly IAutomationRun[]) => ISerializedLedger | undefined): Promise<LegacyAutomationMutationResult> {
		let raw = await this.storageService.read(this.storageKey);
		while (true) {
			if (!raw) {
				return 'missing';
			}
			const ledger = this._parseLedger(raw);
			if (ledger.schemaVersion > CURRENT_LEGACY_SCHEMA_VERSION) {
				throw new Error(`Cannot migrate automation ledger schema v${ledger.schemaVersion}.`);
			}
			const serialized = ledger.automations.find(automation => automation.id === expected.id);
			if (!serialized) {
				return 'missing';
			}
			const current = ledger.schemaVersion === CURRENT_LEGACY_SCHEMA_VERSION
				? deserializeAutomation(serialized as ISerializedAutomation)
				: deserializeLegacyAutomation(serialized as ILegacySerializedAutomation);
			if (!current) {
				throw new Error(`Cannot migrate malformed automation '${expected.id}'.`);
			}
			const next = mutate({
				...ledger,
				revision: (ledger.revision ?? 0) + 1,
			}, current, ledger.runs.filter(run => run.automationId === expected.id));
			if (!next) {
				return 'unchanged';
			}
			const result = await this.storageService.compareAndSwap(this.storageKey, raw, JSON.stringify(next));
			if (result.swapped) {
				return 'updated';
			}
			if (result.currentValue === raw) {
				throw new Error('Legacy automation storage rejected an unchanged compare-and-swap value.');
			}
			raw = result.currentValue;
		}
	}

	private _throwIfChanged(current: IAutomation, expected: IAutomation): void {
		if (serializeLegacyAutomationState(current) !== serializeLegacyAutomationState(expected)) {
			throw new Error(`Automation '${expected.name}' changed while it was being migrated.`);
		}
	}

	private _parseLedger(raw: string): ISerializedLedger {
		const ledger = JSON.parse(raw) as ISerializedLedger;
		if (![1, 2, 3].includes(ledger.schemaVersion)) {
			if (typeof ledger.schemaVersion === 'number' && ledger.schemaVersion > CURRENT_LEGACY_SCHEMA_VERSION) {
				return ledger;
			}
			throw new Error(`Unsupported legacy automation schema version: ${ledger.schemaVersion}`);
		}
		return {
			...ledger,
			automations: Array.isArray(ledger.automations) ? ledger.automations : [],
			runs: Array.isArray(ledger.runs) ? ledger.runs : [],
		};
	}
}

function deserializeAutomation(serialized: ISerializedAutomation): IAutomation | undefined {
	const target = deserializeAutomationTarget(serialized.target);
	return target ? createAutomationFromSerialized(serialized, target) : undefined;
}

function deserializeLegacyAutomation(serialized: ILegacySerializedAutomation): IAutomation | undefined {
	let target: AutomationTarget;
	if (serialized.isQuickChat === true) {
		if (!serialized.providerId || !serialized.sessionTypeId) {
			return undefined;
		}
		target = {
			kind: 'quickChat',
			providerId: serialized.providerId,
			sessionTypeId: serialized.sessionTypeId,
		};
	} else {
		if (!serialized.folderUri) {
			return undefined;
		}
		target = {
			kind: 'workspace',
			folderUri: URI.revive(serialized.folderUri),
			providerId: serialized.providerId,
			sessionTypeId: serialized.sessionTypeId,
			isolation: deserializeLegacyIsolation(serialized.isolationMode, serialized.branch),
		};
	}
	return createAutomationFromSerialized(serialized, target);
}

function createAutomationFromSerialized(serialized: ISerializedAutomationBase, target: AutomationTarget): IAutomation {
	return Object.freeze({
		id: serialized.id,
		name: serialized.name,
		prompt: serialized.prompt,
		schedule: serialized.schedule,
		target,
		modelId: serialized.modelId,
		mode: serialized.mode,
		permissionLevel: isChatPermissionLevel(serialized.permissionLevel) ? serialized.permissionLevel : ChatPermissionLevel.Default,
		enabled: serialized.enabled,
		createdAt: serialized.createdAt,
		updatedAt: serialized.updatedAt,
		lastRunAt: serialized.lastRunAt,
		nextRunAt: serialized.nextRunAt,
	});
}

function serializeLegacyAutomationState(automation: IAutomation): string {
	return JSON.stringify({
		id: automation.id,
		editable: serializeAutomationEditableState(automation),
		createdAt: automation.createdAt,
		updatedAt: automation.updatedAt,
		lastRunAt: automation.lastRunAt ?? null,
		nextRunAt: automation.nextRunAt ?? null,
	});
}

function deserializeAutomationTarget(target: ISerializedAutomationTarget): AutomationTarget | undefined {
	if (target?.kind === 'quickChat') {
		return target.providerId && target.sessionTypeId
			? { kind: 'quickChat', providerId: target.providerId, sessionTypeId: target.sessionTypeId }
			: undefined;
	}
	if (target?.kind !== 'workspace' || !target.folderUri || !isAutomationWorkspaceIsolation(target.isolation)) {
		return undefined;
	}
	return {
		kind: 'workspace',
		folderUri: URI.revive(target.folderUri),
		providerId: target.providerId,
		sessionTypeId: target.sessionTypeId,
		isolation: target.isolation,
	};
}

function deserializeLegacyIsolation(isolationMode: string | undefined, branch: string | undefined): AutomationWorkspaceIsolation {
	if (isolationMode === 'worktree') {
		return branch ? { kind: 'worktree', branch } : { kind: 'default' };
	}
	return isolationMode === 'workspace' ? { kind: 'folder' } : { kind: 'default' };
}

function isAutomationWorkspaceIsolation(value: AutomationWorkspaceIsolation | undefined): value is AutomationWorkspaceIsolation {
	return value?.kind === 'default'
		|| value?.kind === 'folder'
		|| (value?.kind === 'worktree' && typeof value.branch === 'string' && value.branch.length > 0);
}
