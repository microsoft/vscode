/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRelayChannel } from './relayTransport.js';
import { IDevContainerRepository, IDevContainerSampleSource } from './devContainerSamples.js';

export const DEV_CONTAINER_AGENT_HOST_CHANNEL = 'devContainerAgentHost';
export const VSCODE_REMOTE_CONTAINERS_SESSION_ENV = 'VSCODE_REMOTE_CONTAINERS_SESSION';
export const DevContainerAgentHostEnabledSettingId = 'chat.agentHost.devContainer.enabled';
export const DevContainerSamplesEnabledSettingId = 'chat.agentHost.devContainer.samples.enabled';

/** Inputs required to start or reuse a workspace's Dev Container Agent Host. */
export interface IDevContainerAgentHostWorkspaceConfig {
	readonly connectionId: string;
	/** Native workspace path; the remote protocol facade also accepts a host URI's path. */
	readonly workspaceFolder: string;
	readonly name: string;
	/** Whether this explicit connection may restart a container stopped after its sessions became idle. */
	readonly resume?: boolean;
}

export type IDevContainerAgentHostConfig = IDevContainerAgentHostWorkspaceConfig | (Omit<IDevContainerAgentHostWorkspaceConfig, 'workspaceFolder'> & IDevContainerSampleSource);

/** Serializable connection metadata returned to the renderer. */
export interface IDevContainerAgentHostConnectResult {
	readonly connectionId: string;
	readonly address: string;
	readonly name: string;
	readonly remoteWorkspaceFolder: string;
	/** Native source workspace path on the parent host, when reported by the launcher. */
	readonly hostWorkspaceFolder?: string;
	readonly repository?: IDevContainerRepository;
}

/** One chunk of output from a Dev Container CLI process. */
export interface IDevContainerAgentHostOutput {
	readonly connectionId: string;
	readonly data: string;
}

export const IDevContainerAgentHostMainService = createDecorator<IDevContainerAgentHostMainService>('devContainerAgentHostMainService');

export type DevContainerDockerStatus = 'notInstalled' | 'notRunning' | 'running';

/** Read-only local diagnostics exposed on the shared-process channel, not the Agent Host Protocol. */
export interface IDevContainerAgentHostDiagnostics {
	getDockerStatus(): Promise<DevContainerDockerStatus>;
}

/** Host-side service that owns Dev Container CLI processes and protocol relays. */
export interface IDevContainerAgentHostMainService extends IRelayChannel {
	readonly _serviceBrand: undefined;

	readonly onDidCloseConnection: Event<string>;
	/** Streaming stdout and stderr from Dev Container CLI processes. */
	readonly onDidOutput: Event<IDevContainerAgentHostOutput>;

	/** Whether Docker can be resolved from the user's shell environment. */
	isDockerAvailable(): Promise<boolean>;
	connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult>;
	disconnect(connectionId: string): Promise<void>;
	stopContainer(source: string | IDevContainerSampleSource): Promise<boolean>;
	removeContainer(source: string | IDevContainerSampleSource): Promise<boolean>;
}
