/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isProfileUsingDefaultStorage, IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';

/**
 * Storage keys for customization on/off state. They live in
 * {@link StorageScope.APPLICATION} so every window (including the Agents
 * Window, which always uses its own `agents` profile) reads and writes the
 * same switches. They used to live in {@link StorageScope.PROFILE}; for
 * profiles using the default storage both scopes are the same database.
 */
export const MCP_ENABLEMENT_STORAGE_KEY = 'mcp.enablement';
export const AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY = 'agentPlugins.enablement';
export const AGENT_PLUGIN_ENABLEMENT_IDENTITIES_STORAGE_KEY = 'agentPlugins.enablementIdentities';
export const AGENT_HOST_TOOL_SET_ENABLEMENT_STORAGE_KEY = 'chat.agentHost.toolSetEnablement';

/** Application-scoped list of profile ids whose enablement has been merged into application storage. */
export const CUSTOMIZATION_ENABLEMENT_MIGRATED_PROFILES_KEY = 'chat.enablementMigratedProfiles';

type Merge = (applicationValue: string | undefined, profileValue: string) => string | undefined;

/**
 * Merges the given profile's customization on/off state from profile storage
 * into application storage, once per profile. Conflicts resolve "off wins".
 * Profile values are left in place so older builds still read them.
 *
 * Must run before any owner reads these keys from application storage:
 * observable mementos cache their value and ignore same-window writes.
 */
export function migrateCustomizationEnablementToApplicationStorage(storageService: IStorageService, profile: IUserDataProfile): void {
	if (isProfileUsingDefaultStorage(profile)) {
		return;
	}

	const migratedProfiles = parseStringArray(storageService.get(CUSTOMIZATION_ENABLEMENT_MIGRATED_PROFILES_KEY, StorageScope.APPLICATION));
	if (migratedProfiles.includes(profile.id)) {
		return;
	}

	mergeIntoApplication(storageService, MCP_ENABLEMENT_STORAGE_KEY, mergeBooleanEntries);
	mergeIntoApplication(storageService, AGENT_PLUGIN_ENABLEMENT_STORAGE_KEY, mergeBooleanEntries);
	mergeIntoApplication(storageService, AGENT_PLUGIN_ENABLEMENT_IDENTITIES_STORAGE_KEY, mergeIdentityEntries);
	mergeIntoApplication(storageService, AGENT_HOST_TOOL_SET_ENABLEMENT_STORAGE_KEY, mergeToolSetEnablement);

	// Mark migrated even when a profile value is unreadable. The owners already treat such a
	// value as empty, and retrying later could merge stale choices over newer shared ones.
	storageService.store(CUSTOMIZATION_ENABLEMENT_MIGRATED_PROFILES_KEY, JSON.stringify([...migratedProfiles, profile.id]), StorageScope.APPLICATION, StorageTarget.MACHINE);
}

function mergeIntoApplication(storageService: IStorageService, key: string, merge: Merge): void {
	const profileValue = storageService.get(key, StorageScope.PROFILE);
	if (profileValue === undefined) {
		return;
	}
	const applicationValue = storageService.get(key, StorageScope.APPLICATION);
	const merged = merge(applicationValue, profileValue);
	if (merged !== undefined && merged !== applicationValue) {
		storageService.store(key, merged, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

function tryParse(value: string | undefined): unknown {
	if (value === undefined) {
		return undefined;
	}
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function parseStringArray(value: string | undefined): string[] {
	const parsed = tryParse(value);
	return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
}

function parseEntries<V>(value: string | undefined, isValue: (v: unknown) => v is V): [string, V][] | undefined {
	const parsed = tryParse(value);
	if (!Array.isArray(parsed)) {
		return undefined;
	}
	return parsed.filter((e): e is [string, V] => Array.isArray(e) && typeof e[0] === 'string' && isValue(e[1]));
}

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isString = (v: unknown): v is string => typeof v === 'string';

/** `[key, enabled][]` maps: a key disabled in either storage stays disabled. */
function mergeBooleanEntries(applicationValue: string | undefined, profileValue: string): string | undefined {
	const profileEntries = parseEntries(profileValue, isBoolean);
	if (!profileEntries) {
		return undefined;
	}
	const merged = new Map(parseEntries(applicationValue, isBoolean));
	for (const [key, enabled] of profileEntries) {
		const existing = merged.get(key);
		merged.set(key, existing === undefined ? enabled : existing && enabled);
	}
	return JSON.stringify([...merged]);
}

/** `[installUri, identity][]` aliases: union, keeping existing application entries on conflict. */
function mergeIdentityEntries(applicationValue: string | undefined, profileValue: string): string | undefined {
	const profileEntries = parseEntries(profileValue, isString);
	if (!profileEntries) {
		return undefined;
	}
	const merged = new Map(parseEntries(applicationValue, isString));
	for (const [key, identity] of profileEntries) {
		if (!merged.has(key)) {
			merged.set(key, identity);
		}
	}
	return JSON.stringify([...merged]);
}

type ToolEnablementRecord = Record<string, boolean>;
type ToolSetEnablementShape = Record<string, { toolSets?: ToolEnablementRecord; tools?: ToolEnablementRecord }>;

function asToolSetEnablement(value: unknown): ToolSetEnablementShape | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as ToolSetEnablementShape : undefined;
}

function mergeOffWins(target: ToolEnablementRecord, source: ToolEnablementRecord | undefined): void {
	for (const [id, enabled] of Object.entries(source ?? {})) {
		if (typeof enabled !== 'boolean') {
			continue;
		}
		const existing = target[id];
		target[id] = typeof existing === 'boolean' ? existing && enabled : enabled;
	}
}

/** Per session type: tool sets and tools each merge "off wins". */
function mergeToolSetEnablement(applicationValue: string | undefined, profileValue: string): string | undefined {
	const profileState = asToolSetEnablement(tryParse(profileValue));
	if (!profileState) {
		return undefined;
	}
	const applicationState = asToolSetEnablement(tryParse(applicationValue)) ?? {};
	const merged: Record<string, { toolSets: ToolEnablementRecord; tools: ToolEnablementRecord }> = {};
	for (const state of [applicationState, profileState]) {
		for (const [sessionType, entry] of Object.entries(state)) {
			const target = merged[sessionType] ??= { toolSets: {}, tools: {} };
			mergeOffWins(target.toolSets, entry?.toolSets);
			mergeOffWins(target.tools, entry?.tools);
		}
	}
	return JSON.stringify(merged);
}
