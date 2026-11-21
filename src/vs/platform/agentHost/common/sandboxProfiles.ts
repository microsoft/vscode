/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import type { IAgentConnection } from './agentService.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema, type ISandboxProfileValue } from './sandboxConfigSchema.js';
import { ActionType } from './state/protocol/actions.js';
import { ROOT_STATE_URI } from './state/sessionState.js';

/** The sandbox profiles an agent host stores, shared by every client connected to it. */
export interface IHostSandboxProfiles {
	readonly profiles: Readonly<Record<string, ISandboxProfileValue>>;
	/** The profile new sessions use, or `undefined` for the host's default sandbox values. */
	readonly active: string | undefined;
}

/**
 * Reads the sandbox profiles of a connected agent host. Returns `undefined`
 * while the host's root state is unavailable or when the host does not
 * advertise sandbox profiles, so callers can disable profile management.
 */
export function readHostSandboxProfiles(connection: IAgentConnection): IHostSandboxProfiles | undefined {
	const rootState = connection.rootState.value;
	if (!rootState || rootState instanceof Error || !rootState.config) {
		return undefined;
	}
	const advertised = rootState.config.schema.properties;
	if (!advertised[AgentHostSandboxConfigKey.SandboxProfiles] || !advertised[AgentHostSandboxConfigKey.ActiveSandboxProfile]) {
		return undefined;
	}
	const profiles = rootState.config.values[AgentHostSandboxConfigKey.SandboxProfiles];
	const active = rootState.config.values[AgentHostSandboxConfigKey.ActiveSandboxProfile];
	const validProfiles = sandboxConfigSchema.validate(AgentHostSandboxConfigKey.SandboxProfiles, profiles) ? profiles : {};
	return {
		profiles: validProfiles,
		active: typeof active === 'string' && Object.hasOwn(validProfiles, active) ? active : undefined,
	};
}

/**
 * Writes sandbox profile changes to an agent host. Omitted fields are left
 * unchanged; `active: undefined` makes new sessions use the host's default
 * sandbox values. The last write from any client wins.
 */
export function updateHostSandboxProfiles(connection: IAgentConnection, changes: { readonly profiles?: Readonly<Record<string, ISandboxProfileValue>>; readonly active?: string | undefined }): void {
	connection.dispatch(ROOT_STATE_URI, {
		type: ActionType.RootConfigChanged,
		config: {
			...(changes.profiles ? { [AgentHostSandboxConfigKey.SandboxProfiles]: changes.profiles } : {}),
			// Root config changes merge, so an empty string, not an absent key, clears the active profile.
			...(Object.hasOwn(changes, 'active') ? { [AgentHostSandboxConfigKey.ActiveSandboxProfile]: changes.active ?? '' } : {}),
		},
	});
}

/** Calls `onChange` whenever the host's root state, and therefore possibly its sandbox profiles, changes. */
export function watchHostSandboxProfiles(connection: IAgentConnection, store: DisposableStore, onChange: () => void): void {
	store.add(connection.rootState.onDidChange(() => onChange()));
}
