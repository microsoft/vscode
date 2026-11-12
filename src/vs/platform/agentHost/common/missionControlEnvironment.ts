/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { RawContextKey } from '../../contextkey/common/contextkey.js';
import { IMissionControlEnvironment } from './cloudSandboxAgentHost.js';

export const AgentHostRemoteConnectionsSettingId = 'chat.agentHost.remoteConnections';
export const AgentHostDefaultCloneDirectorySettingId = 'chat.agentHost.defaultCloneDirectory';
export const GitHubEnvironmentsEnabledSettingId = 'chat.agentHost.githubEnvironments.enabled';
export const GITHUB_ENVIRONMENTS_DOCS_URL = 'https://aka.ms/vscode-agent-environments';
export const GitHubEnvironmentsAvailabilityTreatment = 'githubEnvironmentsAvailable';
export const GitHubEnvironmentsAvailableContext = new RawContextKey<boolean>('githubEnvironmentsAvailable', false);

export const IMissionControlAvailabilityService = createDecorator<IMissionControlAvailabilityService>('missionControlAvailabilityService');

/** Experiment availability is independent of, and takes precedence over, user configuration. */
export interface IMissionControlAvailabilityService {
	readonly _serviceBrand: undefined;
	readonly available: IObservable<boolean | undefined>;
}
export const MissionControlUseLocalCredentialsSettingId = 'chat.agentHost.experimentalMissionControl.useLocalCredentials';
export const MissionControlUseLocalCredentialsConfigKey = 'missionControlUseLocalCredentials';
/** Logical identity for host-side Mission Control wire logs, including failed handshakes. */
export const MISSION_CONTROL_AHP_LOG_ID = 'mission-control';
export const MissionControlOwnerMismatchErrorCode = 'MissionControlOwnerMismatch';
export type AgentHostRemoteConnectionsBackend = 'devTunnel' | 'githubEnvironment' | 'missionControl';

export class MissionControlOwnerMismatchError extends Error {
	readonly code = MissionControlOwnerMismatchErrorCode;
}

export function isGitHubEnvironmentBackend(backend: AgentHostRemoteConnectionsBackend): boolean {
	return backend === 'githubEnvironment' || backend === 'missionControl';
}

export const IMissionControlSharingService = createDecorator<IMissionControlSharingService>('missionControlSharingService');

/** Owns the local environment's explicit Mission Control sharing opt-in. */
export interface IMissionControlSharingService {
	readonly _serviceBrand: undefined;
	readonly state: IObservable<'disabled' | 'connecting' | 'enabled'>;
	/** Machine-local name override used when registering this environment. */
	readonly environmentName: IObservable<string | undefined>;
	setEnvironmentName(name: string): Promise<void>;
	/** Enabling waits for the latest configuration and bounded transient retries; disabling cancels pending enablement. */
	setEnabled(enabled: boolean): Promise<void>;
	/** Supplies the local folder catalogue from the window's workspace-selection surface. */
	setProjectFolders(folders: readonly URI[]): void;
}

export const IRemoteGitHubEnvironmentSharingService = createDecorator<IRemoteGitHubEnvironmentSharingService>('remoteGitHubEnvironmentSharingService');

export interface IRemoteGitHubEnvironmentShare {
	/**
	 * `enabled` is also reported while the remote is disconnected, because its agent host keeps the registration.
	 * `unavailable` means another GitHub account or the agent host itself registered it, so this window cannot change it.
	 */
	readonly state: 'connecting' | 'enabled' | 'error' | 'unavailable';
	readonly environmentId?: string;
	readonly error?: string;
	readonly unavailableReason?: 'account' | 'host';
}

/**
 * Shares directly connected remote agent hosts (SSH, WSL, tunnels) as GitHub
 * environments with this window's GitHub account, so other applications that
 * support GitHub environments can use them.
 */
export interface IRemoteGitHubEnvironmentSharingService {
	readonly _serviceBrand: undefined;
	/** Addresses of connected remote agent hosts that can be shared now. */
	readonly shareable: IObservable<ReadonlySet<string>>;
	/** Remote agent hosts the user chose to share, keyed by address. */
	readonly shares: IObservable<ReadonlyMap<string, IRemoteGitHubEnvironmentShare>>;
	/** GitHub environment IDs of shared remote agent hosts, which are already listed by their direct connections. */
	readonly environmentIds: IObservable<ReadonlySet<string>>;
	setShared(address: string, shared: boolean): Promise<void>;
}

export interface IMissionControlHost extends IMissionControlEnvironment {
	readonly displayName?: string;
}

export const IMissionControlEnvironmentService = createDecorator<IMissionControlEnvironmentService>('missionControlEnvironmentService');

/** Account/profile-local inventory; discovery and local preferences never provision or attach compute. */
export interface IMissionControlEnvironmentService {
	readonly _serviceBrand: undefined;
	readonly hosts: IObservable<readonly IMissionControlHost[]>;
	/** Hosts confirmed online by this window's discovery in the current account and inventory lifetime; peer-window storage updates do not count. */
	readonly discoveredOnlineHostIds: IObservable<ReadonlySet<string>>;
	/** The registration of the computer running this window, if known; it is included in {@link hosts}. */
	readonly ownEnvironmentId: IObservable<string | undefined>;
	readonly accountKey: string | undefined;
	readonly enabled: boolean;
	initialize(): Promise<void>;
	refresh(token: CancellationToken): Promise<void>;
	connect(id: string, token: CancellationToken): Promise<void>;
	disconnect(id: string): Promise<void>;
	/** Delete a user-local registration and withdraw its connection without deleting the machine's files. */
	delete(id: string, token: CancellationToken): Promise<void>;
	setDisplayName(id: string, name: string | undefined): void;
}
