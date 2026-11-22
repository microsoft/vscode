/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import type { ISandboxProfile } from '../../sandbox/common/sandboxProfiles.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import type { IAgentConnection } from './agentService.js';
import { IAgentHostConnectionsService } from './agentHostConnectionsService.js';
import { AgentHostSandboxConfigKey, getSandboxProfileAssignment, sandboxConfigSchema, sandboxSettingIdToAgentHostKey, type ISandboxConfigValue, type ISandboxProfileAssignment } from './sandboxConfigSchema.js';
import { ActionType } from './state/protocol/actions.js';
import { ROOT_STATE_URI } from './state/sessionState.js';

interface IKnownSandboxProfileAssignment {
	address: string;
	name: string;
	profile: ISandboxProfileAssignment;
}

const assignmentsKey = 'chat.sandboxProfileAssignments.v1';

/** Last-known assignments remain available after disconnecting or restarting the client. */
export function readSandboxProfileAssignments(storage: IStorageService): readonly IKnownSandboxProfileAssignment[] {
	return storage.getObject<IKnownSandboxProfileAssignment[]>(assignmentsKey, StorageScope.APPLICATION_SHARED, []);
}

/** Only known host state replaces the cache; unavailable state never clears an assignment. */
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

export function watchSandboxProfileAssignments(storage: IStorageService, store: DisposableStore, onChange: () => void): void {
	store.add(storage.onDidChangeValue(StorageScope.APPLICATION_SHARED, assignmentsKey, store)(() => onChange()));
}

/** Tracks host assignments independently of the editor and the visible remote rows. */
export class SandboxProfileAssignmentsTracker extends Disposable {
	static readonly ID = 'sandbox.profileAssignments';
	private readonly _listeners = this._register(new DisposableMap<IAgentConnection, DisposableStore>());

	constructor(
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
		@IStorageService private readonly _storage: IStorageService,
	) {
		super();
		this._register(this._connections.onDidChangeConnections(() => this._watchConnections()));
		this._watchConnections();
	}

	private _watchConnections(): void {
		const live = new Set<IAgentConnection>();
		for (const { address, connection, isAmbient } of this._connections.connections) {
			if (!address || !connection || isAmbient) {
				continue;
			}
			live.add(connection);
			const remember = () => {
				const current = this._connections.connections.find(info => info.address === address);
				if (current?.connection === connection) {
					rememberSandboxProfileAssignment(this._storage, address, current.name, readHostSandboxProfile(connection));
				}
			};
			remember();
			if (!this._listeners.has(connection)) {
				const store = new DisposableStore();
				this._listeners.set(connection, store);
				watchHostSandboxProfile(connection, store, remember);
			}
		}
		for (const connection of this._listeners.keys()) {
			if (!live.has(connection)) {
				this._listeners.deleteAndDispose(connection);
			}
		}
	}
}

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
