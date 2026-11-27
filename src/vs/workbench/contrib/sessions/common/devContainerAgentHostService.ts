/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import type { IAgentHostClientCertificatesProvider } from '../../../../platform/agentHost/common/clientCertificatesProtocol.js';
import type { IAgentHostClientProxyProvider } from '../../../../platform/agentHost/common/clientProxyProtocol.js';
import { URI } from '../../../../base/common/uri.js';
import { IProtocolTransport } from '../../../../platform/agentHost/common/state/sessionTransport.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { findDevContainerSample, IDevContainerRepository } from '../../../../platform/agentHost/common/devContainerSamples.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

/** Experimental setting that enables Dev Container Agent Host sessions. */
export const DevContainerAgentHostEnabledSettingId = 'chat.agentHost.devContainer.enabled';

export const DevContainerSamplesEnabledSettingId = 'chat.agentHost.devContainer.samples.enabled';

export const DevContainerIdleTimeoutSettingId = 'chat.agentHost.devContainer.idleTimeout';

/** Hidden experimental setting that enables combining Dev Container execution with a new worktree. */
export const DevContainerWorktreeEnabledSettingId = 'chat.agentHost.devContainer.worktree.enabled';

/** Experimental setting that keeps user and agent state of new Dev Containers on a volume across rebuilds. */
export const DevContainerStateVolumeEnabledSettingId = 'chat.agentHost.devContainer.stateVolume.enabled';

/** Experimental setting that enables Dev Container environments created from a base image on this computer and on SSH, Tunnel, and WSL hosts. */
export const DevContainerEnvironmentsEnabledSettingId = 'chat.agentHost.devContainer.environments.enabled';

/** Experimental setting that lets agents create Dev Container environments and continue work in them. */
export const DevContainerHandoffEnabledSettingId = 'chat.agentHost.devContainer.handoff.enabled';

/** {@link IDevContainerEnvironment.sourceAddress} of Dev Container environments on this computer. No SSH, Tunnel, or WSL host address equals it. */
export const LocalDevContainerEnvironmentHost = 'local';

/** Whether Dev Container environments are available, apart from their experiment-controlled setting. */
export function canUseDevContainerEnvironments(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId) === true
		&& configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) === true
		&& configurationService.getValue<boolean>('chat.disableAIFeatures') !== true;
}

/** Whether Dev Container environments can be created and are offered as remote environments. */
export function areDevContainerEnvironmentsEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(DevContainerEnvironmentsEnabledSettingId) === true && canUseDevContainerEnvironments(configurationService);
}

/** Whether agents can create Dev Container environments, which also requires the environments themselves to be enabled. */
export function isDevContainerHandoffEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(DevContainerHandoffEnabledSettingId) === true && areDevContainerEnvironmentsEnabled(configurationService);
}

/** Whether new sample workspaces can be selected, independently of already-created sessions. */
export function areDevContainerSamplesEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(DevContainerSamplesEnabledSettingId) === true
		&& configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId) === true
		&& configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) === true
		&& configurationService.getValue<boolean>('chat.disableAIFeatures') !== true;
}

/** Whether a session in `workspaceUri` that runs on a Dev Container can also use New Worktree isolation. */
export function isDevContainerWorktreeEnabled(workspaceUri: URI | undefined, configurationService: IConfigurationService): boolean {
	return !(workspaceUri && findDevContainerSample(workspaceUri)) && configurationService.getValue<boolean>(DevContainerWorktreeEnabledSettingId) === true;
}

/** Agent Host transport and workspace mapping produced by a Dev Container connector. */
export interface IDevContainerAgentHostConnection {
	/**
	 * Stable address that uniquely identifies this source workspace's running
	 * container while the connection is active.
	 */
	readonly address: string;
	readonly name: string;
	readonly transportFactory: () => IProtocolTransport;
	readonly transportDisposable?: IDisposable;
	readonly workspaceUri: URI;
	/** Native source path reported by the host that launched the container. */
	readonly hostWorkspaceFolder?: string;
	readonly repository?: IDevContainerRepository;
	/**
	 * Whether this computer's Docker engine has the volume of a Dev Container environment on a WSL host, so the Dev
	 * Containers extension, which cannot address the distribution for a volume, opens it there.
	 */
	readonly volumeOnLocalDockerEngine?: boolean;
	readonly sandboxSupported?: boolean;
	readonly defaultDirectory?: string;
	readonly clientCertificates?: IAgentHostClientCertificatesProvider;
	readonly clientProxy?: IAgentHostClientProxyProvider;
}

/** Options for {@link IDevContainerAgentHostConnector.createConnection}. */
export interface IDevContainerAgentHostConnectionOptions {
	readonly resume: boolean;
	readonly sandboxEnabled?: boolean;
	/** Names the connection of a Dev Container environment, which otherwise gets a name for its host. */
	readonly name?: string;
}

/** Creates a Dev Container and connects to its Agent Host. */
export interface IDevContainerAgentHostConnector {
	readonly onDidChangeSandboxSupport?: Event<{ readonly workspaceUri: URI; readonly supported: boolean }>;
	/** Whether the workspace has a supported configuration and Docker is available on its host. */
	isAvailable(workspaceUri: URI): Promise<boolean>;
	/** Whether Docker is available on this computer, regardless of settings. */
	isLocalDockerAvailable?(): Promise<boolean>;
	createConnection(workspaceUri: URI, address: string, token: CancellationToken, options?: IDevContainerAgentHostConnectionOptions): Promise<IDevContainerAgentHostConnection>;
	stopContainer?(workspaceUri: URI): Promise<boolean>;
	removeContainer?(workspaceUri: URI): Promise<boolean>;
	showLog(workspaceUri: URI): Promise<void>;
}

/** Sessions provider and workspace selected after connecting a Dev Container. */
export interface IDevContainerAgentHostTarget {
	readonly providerId: string;
	readonly workspaceUri: URI;
	/** Release this caller's ownership of the shared workspace connection. */
	release(): Promise<void>;
}

/**
 * A standalone Dev Container created from an image on this computer or on an SSH, Tunnel, or WSL host, offered as its own remote environment.
 * One on a remote host connects and disconnects with that host; one on this computer connects on first use.
 */
export interface IDevContainerEnvironment {
	/** Address of the container's Agent Host connection, which also identifies the environment. */
	readonly address: string;
	/** Address of the SSH, Tunnel, or WSL host that runs the container, or {@link LocalDevContainerEnvironmentHost}. */
	readonly sourceAddress: string;
	readonly providerId: string;
}

/** A Dev Container environment that was just created and connected. */
export interface ICreatedDevContainerEnvironment extends IDevContainerEnvironment {
	/** The container's workspace folder on its Agent Host connection, if the connection reported it. */
	readonly workspaceUri: URI | undefined;
}

export const IDevContainerAgentHostService = createDecorator<IDevContainerAgentHostService>('devContainerAgentHostService');

/** Coordinates local, SSH, Tunnel, and WSL source workspaces with persistent container-backed Sessions providers. */
export interface IDevContainerAgentHostService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeAvailability: Event<void>;
	registerConnector(connector: IDevContainerAgentHostConnector): IDisposable;
	/** Whether the registered connector can launch this workspace. */
	isAvailable(workspaceUri: URI): Promise<boolean>;
	connect(workspaceUri: URI, token: CancellationToken, options?: { readonly sandboxEnabled: boolean }): Promise<IDevContainerAgentHostTarget>;
	/** Known Docker support for a workspace's current container, if already connected. */
	getSandboxSupported?(workspaceUri: URI): boolean | undefined;
	/**
	 * The label of the workspace's Dev Container sessions, e.g. `foo [Dev Container on Ubuntu]`, assuming the container
	 * opens the workspace in a folder of the same name, as the default `/workspaces/<folder>` does.
	 */
	getWorkspaceLabel?(workspaceUri: URI): string;
	showLog(workspaceUri: URI): Promise<void>;
	disconnect(workspaceUri: URI): Promise<void>;

	/** Dev Container environments, empty while {@link areDevContainerEnvironmentsEnabled} is false. */
	readonly environments: IObservable<readonly IDevContainerEnvironment[]>;
	/**
	 * {@link LocalDevContainerEnvironmentHost} while Docker is available on this computer, and the addresses of connected
	 * SSH, Tunnel, and WSL hosts that support Dev Container environments and have Docker. Computed while
	 * {@link canUseDevContainerEnvironments} is true, regardless of the experiment-controlled setting.
	 */
	readonly environmentHosts: IObservable<ReadonlySet<string>>;
	/**
	 * Creates a Dev Container environment on a host from {@link environmentHosts} and connects to it.
	 * `onWillConnect` receives the environment once it is listed, before its container starts, e.g. to show its log.
	 */
	createEnvironment(sourceAddress: string, options?: { readonly onWillConnect?: (environment: IDevContainerEnvironment) => void }): Promise<ICreatedDevContainerEnvironment>;
	/** Removes an environment's container and workspace volume, or only forgets it when its host is no longer configured. */
	deleteEnvironment(address: string): Promise<void>;
}
