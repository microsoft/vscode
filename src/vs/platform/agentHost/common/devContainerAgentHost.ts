/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IRelayChannel } from './relayTransport.js';

export const DEV_CONTAINER_AGENT_HOST_CHANNEL = 'devContainerAgentHost';

/** Inputs required to start or reuse a workspace's Dev Container Agent Host. */
export interface IDevContainerAgentHostConfig {
	readonly connectionId: string;
	/** Native workspace path; the remote protocol facade also accepts a host URI's path. */
	readonly workspaceFolder: string;
	readonly name: string;
}

/** Serializable connection metadata returned to the renderer. */
export interface IDevContainerAgentHostConnectResult {
	readonly connectionId: string;
	readonly address: string;
	readonly name: string;
	readonly remoteWorkspaceFolder: string;
	/** Native source workspace path on the parent host, when reported by the launcher. */
	readonly hostWorkspaceFolder?: string;
}

/** One chunk of output from a Dev Container CLI process. */
export interface IDevContainerAgentHostOutput {
	readonly connectionId: string;
	readonly data: string;
}

export const IDevContainerAgentHostMainService = createDecorator<IDevContainerAgentHostMainService>('devContainerAgentHostMainService');

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
}
