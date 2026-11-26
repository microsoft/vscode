/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRelayChannel } from './relayTransport.js';
import { IDevContainerRepository, IDevContainerSampleSource } from './devContainerSamples.js';
import { IDevContainerEnvironmentReference, IDevContainerEnvironmentSource } from './devContainerEnvironments.js';

export const DEV_CONTAINER_AGENT_HOST_CHANNEL = 'devContainerAgentHost';
export const VSCODE_REMOTE_CONTAINERS_SESSION_ENV = 'VSCODE_REMOTE_CONTAINERS_SESSION';

/** Inputs required to start or reuse a workspace's Dev Container Agent Host. */
export interface IDevContainerAgentHostWorkspaceConfig {
	readonly connectionId: string;
	/** Native workspace path; the remote protocol facade also accepts a host URI's path. */
	readonly workspaceFolder: string;
	readonly name: string;
	/** Whether this explicit connection may restart a container stopped after its sessions became idle. */
	readonly resume?: boolean;
	/** Configure the container to permit nested terminal sandboxing. */
	readonly sandboxEnabled?: boolean;
	/** Mount a per-container volume that keeps user and agent state across rebuilds. */
	readonly persistUserState?: boolean;
}

export type IDevContainerAgentHostConfig = IDevContainerAgentHostWorkspaceConfig
	| (Omit<IDevContainerAgentHostWorkspaceConfig, 'workspaceFolder'> & IDevContainerSampleSource)
	| (Omit<IDevContainerAgentHostWorkspaceConfig, 'workspaceFolder'> & IDevContainerEnvironmentSource);

/** Identifies the container of a native workspace folder, a sample, or an environment. */
export type DevContainerAgentHostSource = string | IDevContainerSampleSource | IDevContainerEnvironmentReference;

/** Serializable connection metadata returned to the renderer. */
export interface IDevContainerAgentHostConnectResult {
	readonly connectionId: string;
	readonly address: string;
	readonly name: string;
	readonly remoteWorkspaceFolder: string;
	/** Native source workspace path on the parent host, when reported by the launcher. */
	readonly hostWorkspaceFolder?: string;
	readonly repository?: IDevContainerRepository;
	/** Whether the actual container has the Docker options needed for nested sandboxing. */
	readonly sandboxSupported?: boolean;
	/** Only desktop-local containers share the connecting client's network and may use its trust roots, proxy configuration, and Kerberos tickets. */
	readonly sharesClientNetwork?: boolean;
}

/** One chunk of output from a Dev Container CLI process. */
export interface IDevContainerAgentHostOutput {
	readonly connectionId: string;
	readonly data: string;
}

/** Docker sandbox prerequisites observed during an attempted connection, including failed startup. */
export interface IDevContainerAgentHostSandboxSupport {
	readonly connectionId: string;
	readonly supported: boolean;
}

/** Outcome of one stage of keeping user state on a volume, reported for telemetry. */
export interface IDevContainerAgentHostUserStateReport {
	readonly connectionId: string;
	readonly stage: 'mount' | 'up' | 'link' | 'userCommands';
	/**
	 * `mount`: added, existingContainer, skipped, failed. `link`: linked, noMount, homeNotFound, missingCapabilities, readOnlyRootfs,
	 * homeInaccessible, stateNotRootOwned, untrustedState, failed. `up`, `userCommands`: succeeded, failed.
	 */
	readonly outcome: string;
	/** Fixed identifier of what failed or why the stage was skipped. */
	readonly reason?: string;
	/** Cause of a failed `up` or `userCommands` that its failed command doesn't identify, see `getDevContainerUpErrorCause`. */
	readonly errorCause?: string;
	/** `up`: Whether it ran the lifecycle commands; otherwise, e.g., when user state persists, they run in `userCommands`. */
	readonly lifecycleInUp?: boolean;
	/** The link command's failed step, or the step that skipped linking. */
	readonly step?: string;
	readonly exitCode?: number;
	/** Where the state volume is mounted: `workspaces` or `volume`. */
	readonly target?: string;
	readonly restoredFolders?: number;
	readonly movedFolders?: number;
	readonly createdFolders?: number;
	readonly existingFolders?: number;
	readonly skippedFolders?: number;
	readonly skipReasons?: string;
	/** Whether the link command ran as `root` or as an `other` user. */
	readonly scriptUser?: string;
	/** The link command's effective capabilities. */
	readonly capChown?: boolean;
	readonly capDacOverride?: boolean;
	readonly capDacReadSearch?: boolean;
	readonly capFowner?: boolean;
	/** Who owns the state folder: `root`, `user` (the container user) or `other`. */
	readonly stateOwner?: string;
	/** Who owns the volume's root folder: `root`, `user` (the container user) or `other`. */
	readonly volumeOwner?: string;
	/** The container's security settings, for link failures, see `getDevContainerSecurityOptions`. */
	readonly capDropChown?: boolean;
	readonly privileged?: boolean;
	readonly usernsMode?: boolean;
	readonly readonlyRootfs?: boolean;
	readonly runtime?: string;
	/** Sanitized error message of a failed stage, see `sanitizeDevContainerStateErrorMessage`. */
	readonly errorMessage?: string;
}

/** What a connection attempt was doing when it failed; `timeout` when waiting for the Agent Host timed out. */
export type DevContainerConnectStage = 'readConfig' | 'prepare' | 'mount' | 'up' | 'link' | 'userCommands' | 'agentHostStart' | 'connect' | 'timeout';

/** A connection attempt failed, for telemetry. Not reported for cancelled attempts. */
export interface IDevContainerAgentHostConnectFailure {
	readonly connectionId: string;
	readonly stage: DevContainerConnectStage;
}

export const IDevContainerAgentHostMainService = createDecorator<IDevContainerAgentHostMainService>('devContainerAgentHostMainService');

/** Host-side service that owns Dev Container CLI processes and protocol relays. */
export interface IDevContainerAgentHostMainService extends IRelayChannel {
	readonly _serviceBrand: undefined;

	readonly onDidCloseConnection: Event<string>;
	/** Streaming stdout and stderr from Dev Container CLI processes. */
	readonly onDidOutput: Event<IDevContainerAgentHostOutput>;
	readonly onDidChangeSandboxSupport?: Event<IDevContainerAgentHostSandboxSupport>;
	/** Reports how keeping user state on a volume went, including for failed startup. */
	readonly onDidReportUserState?: Event<IDevContainerAgentHostUserStateReport>;
	/** Reports the stage a connection attempt failed in, before `connect` rejects. */
	readonly onDidFailConnect?: Event<IDevContainerAgentHostConnectFailure>;

	/** Whether Docker can be resolved from the user's shell environment. */
	isDockerAvailable(): Promise<boolean>;
	connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult>;
	disconnect(connectionId: string): Promise<void>;
	stopContainer(source: DevContainerAgentHostSource): Promise<boolean>;
	/** Removes the container; an environment's Docker volume is removed with it. */
	removeContainer(source: DevContainerAgentHostSource): Promise<boolean>;
	/**
	 * Whether this service's Docker engine has a volume of the Dev Container environment, false without Docker. Clients ask
	 * the service on their own computer, so it is optional for the services of remote hosts.
	 */
	hasEnvironmentVolume?(environmentId: string): Promise<boolean>;
}

/** How long {@link IDevContainerAgentHostMainService.hasEnvironmentVolume} may take before a stalled Docker engine counts as not having the volume. */
export const DevContainerEnvironmentVolumeLookupTimeoutMs = 10_000;

/** Whether a host accepts the name of a Dev Container connection, which its messages and log show. */
export function isValidDevContainerConnectionName(name: string): boolean {
	return !!name.trim() && !name.includes('\0');
}
