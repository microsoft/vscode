/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import type { ISandboxProfile } from '../../sandbox/common/sandboxProfiles.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import type { IAgentConnection } from './agentService.js';
import { AgentHostSandboxConfigKey, getSandboxProfileAssignment, sandboxConfigSchema, sandboxSettingIdToAgentHostKey, type ISandboxConfigValue, type ISandboxProfileAssignment } from './sandboxConfigSchema.js';
import { ActionType } from './state/protocol/actions.js';
import { ROOT_STATE_URI } from './state/sessionState.js';

/**
 * Reads the sandbox profile assigned to a connected agent host:
 * - `undefined` while the root state is unavailable or when the host does not advertise sandbox profiles;
 * - `null` when the host uses its default sandbox values;
 * - otherwise the host's copy of the assigned profile.
 */
export function readHostSandboxProfile(connection: IAgentConnection): ISandboxProfileAssignment | null | undefined {
	const rootState = connection.rootState.value;
	if (!rootState || rootState instanceof Error || !rootState.config?.schema.properties[AgentHostSandboxConfigKey.SandboxProfile]) {
		return undefined;
	}
	const value = rootState.config.values[AgentHostSandboxConfigKey.SandboxProfile];
	return (sandboxConfigSchema.validate(AgentHostSandboxConfigKey.SandboxProfile, value) && getSandboxProfileAssignment(value)) || null;
}

/**
 * Assigns a copy of `profile` to an agent host, or clears the assignment so
 * new sessions use the host's default sandbox values. The last write from any client wins.
 */
export function assignHostSandboxProfile(connection: IAgentConnection, profile: ISandboxProfile | undefined): void {
	connection.dispatch(ROOT_STATE_URI, {
		type: ActionType.RootConfigChanged,
		// Root config changes merge, so `{}`, not an absent key, clears the assignment.
		config: { [AgentHostSandboxConfigKey.SandboxProfile]: profile ? toHostSandboxProfile(profile) : {} },
	});
}

/** Calls `onChange` whenever the host's root state, and therefore possibly its assignment, changes. */
export function watchHostSandboxProfile(connection: IAgentConnection, store: DisposableStore, onChange: () => void): void {
	store.add(connection.rootState.onDidChange(() => onChange()));
}

/** A host's assigned profile as this machine last saw it. */
export interface IKnownSandboxProfileAssignment {
	readonly address: string;
	readonly name: string;
	readonly profile: ISandboxProfileAssignment;
}

// Per machine and not synced, like the profile library: it records what this machine last saw on each host.
const assignmentsKey = 'chat.sandboxProfileAssignments.v1';

/** Reads the last-known assignments, which remain available while hosts are disconnected and after a restart. */
export function readSandboxProfileAssignments(storage: IStorageService): readonly IKnownSandboxProfileAssignment[] {
	return storage.getObject<IKnownSandboxProfileAssignment[]>(assignmentsKey, StorageScope.APPLICATION_SHARED, []);
}

/** Reads the last-known assignment of the host at `address`. */
export function readKnownHostSandboxProfile(storage: IStorageService, address: string): ISandboxProfileAssignment | undefined {
	return readSandboxProfileAssignments(storage).find(assignment => assignment.address === address)?.profile;
}

/**
 * Records a host's assignment as read by {@link readHostSandboxProfile}. `null` (Default) clears it;
 * `undefined` (state unavailable) keeps the previous value so a disconnect never forgets an assignment.
 */
export function rememberSandboxProfileAssignment(storage: IStorageService, address: string, name: string, profile: ISandboxProfileAssignment | null | undefined): void {
	if (profile === undefined) {
		return;
	}
	const assignments = readSandboxProfileAssignments(storage);
	const previous = assignments.find(assignment => assignment.address === address);
	const next = profile ? { address, name, profile } : undefined;
	if (equals(previous, next)) {
		return;
	}
	const remaining = assignments.filter(assignment => assignment.address !== address);
	storage.store(assignmentsKey, next ? [...remaining, next] : remaining, StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
}

/** Calls `onChange` whenever the last-known assignments change, including from another window. */
export function watchSandboxProfileAssignments(storage: IStorageService, store: DisposableStore, onChange: () => void): void {
	store.add(storage.onDidChangeValue(StorageScope.APPLICATION_SHARED, assignmentsKey, store)(() => onChange()));
}

/** Converts a profile from VS Code setting IDs to the host's sandbox keys. */
export function toHostSandboxProfile(profile: ISandboxProfile): ISandboxProfileAssignment {
	const sandbox: Record<string, unknown> = {};
	for (const [setting, value] of Object.entries(profile.settings)) {
		const key = sandboxSettingIdToAgentHostKey[setting];
		if (key && value !== undefined) {
			sandbox[key] = value;
		}
	}
	return { id: profile.id, name: profile.name, sandbox: sandbox as ISandboxConfigValue };
}

/** Converts a host's assigned profile back to VS Code setting IDs, for saving it to the library. */
export function fromHostSandboxProfile(assignment: ISandboxProfileAssignment): ISandboxProfile {
	const settings: ISandboxProfile['settings'] = {};
	const sandbox = assignment.sandbox as Record<string, ISandboxProfile['settings'][string] | undefined>;
	for (const [setting, key] of Object.entries(sandboxSettingIdToAgentHostKey)) {
		const value = sandbox[key];
		if (value !== undefined) {
			settings[setting] = value;
		}
	}
	return { id: assignment.id, name: assignment.name, settings };
}
