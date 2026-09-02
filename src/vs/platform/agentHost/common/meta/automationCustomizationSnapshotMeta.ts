/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stringHash } from '../../../../base/common/hash.js';
import type { AutomationSessionTemplate } from '../state/protocol/channels-automation/state.js';
import { CustomizationType, type ClientPluginCustomization } from '../state/protocol/state.js';

export const AUTOMATION_VIRTUAL_CLIENT_ID = 'vscode-automations';

const AUTOMATION_CUSTOMIZATION_SNAPSHOT_META_KEY = 'vscode.automationCustomizationSnapshot';
const LEGACY_AUTOMATION_ACTIVE_CLIENT_META_KEY = 'vscode.automationActiveClient';

export interface IAutomationCustomizationSnapshotPublication {
	readonly captureId: string;
	readonly clientId: string;
	readonly revision: string;
	readonly customizations: readonly ClientPluginCustomization[];
}

export interface IAutomationCustomizationSnapshotReference {
	readonly captureId: string;
	readonly sourceRevision: string;
	readonly snapshotRevision: string;
}

export interface IAutomationCustomizationScopeSnapshot {
	readonly revision: string;
	readonly capturedAt: string;
	readonly customizations: readonly ClientPluginCustomization[];
}

export function automationCustomizationScopeKey(session: AutomationSessionTemplate): string {
	return JSON.stringify([session.provider ?? '', session.workingDirectories ?? []]);
}

export function automationCustomizationSnapshotRevision(customizations: readonly ClientPluginCustomization[]): string {
	const serialized = JSON.stringify(removeUndefinedValue(customizations));
	return `${serialized.length}:${stringHash(serialized, 0)}:${stringHash(serialized, 5381)}`;
}

export function readAutomationCustomizationSnapshotPublication(meta: Record<string, unknown> | undefined): IAutomationCustomizationSnapshotPublication | undefined {
	const value = meta?.[AUTOMATION_CUSTOMIZATION_SNAPSHOT_META_KEY];
	if (value !== undefined) {
		if (isRecord(value) && value.version === 1 && value.kind === 'reference') {
			return undefined;
		}
		if (!isRecord(value)
			|| value.version !== 1
			|| value.kind !== 'publication'
			|| typeof value.captureId !== 'string'
			|| typeof value.clientId !== 'string'
			|| typeof value.revision !== 'string'
			|| !Array.isArray(value.customizations)) {
			throw new Error('Invalid Automation customization snapshot publication.');
		}
		const customizations = value.customizations.map(readClientPluginCustomization);
		if (automationCustomizationSnapshotRevision(customizations) !== value.revision) {
			throw new Error('Invalid Automation customization snapshot revision.');
		}
		return {
			captureId: value.captureId,
			clientId: value.clientId,
			revision: value.revision,
			customizations,
		};
	}

	const legacy = meta?.[LEGACY_AUTOMATION_ACTIVE_CLIENT_META_KEY];
	if (legacy === undefined) {
		return undefined;
	}
	if (!isRecord(legacy)
		|| legacy.version !== 1
		|| !isRecord(legacy.activeClient)
		|| typeof legacy.activeClient.clientId !== 'string'
		|| (legacy.activeClient.customizations !== undefined && !Array.isArray(legacy.activeClient.customizations))) {
		throw new Error('Invalid legacy Automation active client metadata.');
	}
	const customizations = legacy.activeClient.customizations?.map(readClientPluginCustomization) ?? [];
	return {
		captureId: 'legacy',
		clientId: legacy.activeClient.clientId,
		revision: automationCustomizationSnapshotRevision(customizations),
		customizations,
	};
}

export function readAutomationCustomizationSnapshotReference(meta: Record<string, unknown> | undefined): IAutomationCustomizationSnapshotReference | undefined {
	const value = meta?.[AUTOMATION_CUSTOMIZATION_SNAPSHOT_META_KEY];
	if (!isRecord(value) || value.version !== 1 || typeof value.captureId !== 'string') {
		return undefined;
	}
	if (value.kind === 'publication' && typeof value.revision === 'string') {
		return {
			captureId: value.captureId,
			sourceRevision: value.revision,
			snapshotRevision: value.revision,
		};
	}
	if (value.kind === 'reference'
		&& typeof value.sourceRevision === 'string'
		&& typeof value.snapshotRevision === 'string') {
		return {
			captureId: value.captureId,
			sourceRevision: value.sourceRevision,
			snapshotRevision: value.snapshotRevision,
		};
	}
	return undefined;
}

export function withAutomationCustomizationSnapshotPublication(
	meta: Record<string, unknown> | undefined,
	captureId: string,
	clientId: string,
	customizations: readonly ClientPluginCustomization[],
): Record<string, unknown> {
	const normalized = removeUndefinedValue(customizations) as ClientPluginCustomization[];
	return {
		...withoutAutomationCustomizationSnapshot(meta),
		[AUTOMATION_CUSTOMIZATION_SNAPSHOT_META_KEY]: {
			version: 1,
			kind: 'publication',
			captureId,
			clientId,
			revision: automationCustomizationSnapshotRevision(normalized),
			customizations: normalized,
		},
	};
}

export function withAutomationCustomizationSnapshotReference(
	meta: Record<string, unknown> | undefined,
	reference: IAutomationCustomizationSnapshotReference | undefined,
): Record<string, unknown> | undefined {
	const result = withoutAutomationCustomizationSnapshot(meta);
	if (reference) {
		result[AUTOMATION_CUSTOMIZATION_SNAPSHOT_META_KEY] = {
			version: 1,
			kind: 'reference',
			...reference,
		};
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

export function isAutomationCustomizationScopeSnapshot(value: unknown): value is IAutomationCustomizationScopeSnapshot {
	if (!isRecord(value)
		|| typeof value.revision !== 'string'
		|| typeof value.capturedAt !== 'string'
		|| !Array.isArray(value.customizations)) {
		return false;
	}
	try {
		const customizations = value.customizations.map(readClientPluginCustomization);
		return automationCustomizationSnapshotRevision(customizations) === value.revision;
	} catch {
		return false;
	}
}

function withoutAutomationCustomizationSnapshot(meta: Record<string, unknown> | undefined): Record<string, unknown> {
	const result = { ...meta };
	delete result[AUTOMATION_CUSTOMIZATION_SNAPSHOT_META_KEY];
	delete result[LEGACY_AUTOMATION_ACTIVE_CLIENT_META_KEY];
	return result;
}

function readClientPluginCustomization(value: unknown): ClientPluginCustomization {
	if (!isRecord(value)
		|| value.type !== CustomizationType.Plugin
		|| typeof value.id !== 'string'
		|| typeof value.uri !== 'string'
		|| typeof value.name !== 'string'
		|| (value.nonce !== undefined && typeof value.nonce !== 'string')) {
		throw new Error('Invalid Automation client customization metadata.');
	}
	return {
		...value,
		type: CustomizationType.Plugin,
		id: value.id,
		uri: value.uri,
		name: value.name,
		...(value.nonce !== undefined ? { nonce: value.nonce } : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function removeUndefinedValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(item => item === undefined ? null : removeUndefinedValue(item));
	}
	if (!isRecord(value)) {
		return value;
	}
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (child !== undefined) {
			result[key] = removeUndefinedValue(child);
		}
	}
	return result;
}
