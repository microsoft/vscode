/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRemoteAgentEnvironment, RemoteAgentConnectionContext } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';

export const RemoteExtensionLogFileName = 'remoteagent';

export const IRemoteAgentService = createDecorator<IRemoteAgentService>('remoteAgentService');

export interface IRemoteAgentService {
	_serviceBrand: any;

	getConnection(): IRemoteAgentConnection | null;
}

export interface IRemoteAgentConnection {
	readonly remoteAuthority: string;

	getEnvironment(): Promise<IRemoteAgentEnvironment | null>;

	getChannel<T extends IChannel>(channelName: string): T;
	registerChannel<T extends IServerChannel<RemoteAgentConnectionContext>>(channelName: string, channel: T): void;
}
