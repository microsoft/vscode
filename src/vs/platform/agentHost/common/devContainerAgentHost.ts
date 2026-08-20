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
	readonly workspaceFolder: string;
	readonly name: string;
}

/** Serializable connection metadata returned to the renderer. */
export interface IDevContainerAgentHostConnectResult {
	readonly connectionId: string;
	readonly address: string;
	readonly name: string;
	readonly remoteWorkspaceFolder: string;
}

export const IDevContainerAgentHostMainService = createDecorator<IDevContainerAgentHostMainService>('devContainerAgentHostMainService');

/** Shared-process service that owns Dev Container CLI processes and protocol relays. */
export interface IDevContainerAgentHostMainService extends IRelayChannel {
	readonly _serviceBrand: undefined;

	readonly onDidCloseConnection: Event<string>;

	connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult>;
	disconnect(connectionId: string): Promise<void>;
}
