/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import type { ISSHRemoteAgentHostService, ISSHAgentHostConnection, ISSHAgentHostConfig, ISSHConnectProgress, ISSHResolvedConfig } from '../common/sshRemoteAgentHost.js';

/**
 * Null implementation of {@link ISSHRemoteAgentHostService} for browser contexts
 * where SSH is not available.
 */
export class NullSSHRemoteAgentHostService implements ISSHRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeConnections = Event.None;
	readonly onDidReportConnectProgress: Event<ISSHConnectProgress> = Event.None;
	readonly connections: readonly ISSHAgentHostConnection[] = [];

	async connect(_config: ISSHAgentHostConfig): Promise<ISSHAgentHostConnection> {
		throw new Error('SSH connections are not supported in the browser.');
	}

	async disconnect(_host: string): Promise<void> { }

	async killRemoteAgentHost(_host: string): Promise<void> { }

	async listSSHConfigHosts(): Promise<string[]> {
		return [];
	}

	async resolveSSHConfig(_host: string): Promise<ISSHResolvedConfig> {
		throw new Error('SSH is not supported in the browser.');
	}

	async reconnect(_sshConfigHost: string, _name: string): Promise<ISSHAgentHostConnection> {
		throw new Error('SSH connections are not supported in the browser.');
	}
}
