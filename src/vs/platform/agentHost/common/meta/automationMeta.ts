/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_META_KEY, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY, AGENT_HOST_LEGACY_AUTOMATION_META_KEY } from '../automationMigration.js';

interface IHasAutomationMeta {
	readonly _meta?: Record<string, unknown>;
}

export interface IAgentHostLegacyAutomationProjectionMeta {
	readonly schedule: {
		readonly interval: 'manual' | 'hourly' | 'daily' | 'weekly';
		readonly scheduleHour: number;
		readonly scheduleMinute: number;
		readonly scheduleDay: number;
	};
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly nextRunAt?: string;
	/** VS Code language-model identifier used by the editor-facing projection. */
	readonly modelId?: string;
}

/** Whether the Automation catalogue records durable legacy migration completion. */
export function isAgentHostAutomationCatalogMigrated(source: IHasAutomationMeta): boolean {
	return readAutomationMetaSlot(source, AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY) === true;
}

/** Whether an Automation definition was imported from VS Code's legacy store. */
export function isAgentHostLegacyAutomationImport(source: IHasAutomationMeta | undefined): boolean {
	return source !== undefined && readAutomationMetaSlot(source, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_META_KEY) === true;
}

/**
 * Whether a legacy-imported Automation definition is still waiting for its
 * originating legacy source row to be durably removed. Pending items must not
 * be granted host `Run` (or `Remove`) authority because the browser-side
 * legacy scheduler still owns the row until the removal succeeds.
 */
export function isAgentHostLegacyAutomationImportPending(source: IHasAutomationMeta | undefined): boolean {
	return source !== undefined && readAutomationMetaSlot(source, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY) === true;
}

/** Reads the validated projection needed to preserve VS Code's legacy Automation representation. */
export function readAgentHostLegacyAutomationProjectionMeta(source: IHasAutomationMeta): IAgentHostLegacyAutomationProjectionMeta | undefined {
	const value = readAutomationMetaSlot(source, AGENT_HOST_LEGACY_AUTOMATION_META_KEY);
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const meta = value as Record<string, unknown>;
	const schedule = meta['schedule'];
	if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
		return undefined;
	}
	const candidate = schedule as Record<string, unknown>;
	if ((candidate['interval'] !== 'manual' && candidate['interval'] !== 'hourly' && candidate['interval'] !== 'daily' && candidate['interval'] !== 'weekly')
		|| typeof candidate['scheduleHour'] !== 'number'
		|| typeof candidate['scheduleMinute'] !== 'number'
		|| typeof candidate['scheduleDay'] !== 'number'
		|| typeof meta['createdAt'] !== 'string'
		|| typeof meta['updatedAt'] !== 'string'
		|| (meta['nextRunAt'] !== undefined && typeof meta['nextRunAt'] !== 'string')
		|| (meta['modelId'] !== undefined && typeof meta['modelId'] !== 'string')) {
		return undefined;
	}
	return {
		schedule: {
			interval: candidate['interval'],
			scheduleHour: candidate['scheduleHour'],
			scheduleMinute: candidate['scheduleMinute'],
			scheduleDay: candidate['scheduleDay'],
		},
		createdAt: meta['createdAt'],
		updatedAt: meta['updatedAt'],
		nextRunAt: meta['nextRunAt'],
		modelId: meta['modelId'],
	};
}

function readAutomationMetaSlot(source: IHasAutomationMeta, key: string): unknown {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned reader for validated Automation metadata slots.
	return source._meta?.[key];
}
