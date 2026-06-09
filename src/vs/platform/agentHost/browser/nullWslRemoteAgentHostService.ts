/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import type {
	IWSLAgentHostConfig,
	IWSLAgentHostConnection,
	IWSLCachedDistro,
	IWSLConnectProgress,
	IWSLDistro,
	IWSLRemoteAgentHostService,
} from '../common/wslRemoteAgentHost.js';

/**
 * Null implementation of {@link IWSLRemoteAgentHostService} for browser
 * contexts where WSL is not available.
 */
export class NullWSLRemoteAgentHostService implements IWSLRemoteAgentHostService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeConnections = Event.None;
	readonly onDidReportConnectProgress: Event<IWSLConnectProgress> = Event.None;
	readonly connections: readonly IWSLAgentHostConnection[] = [];

	async isWSLAvailable(): Promise<boolean> {
		return false;
	}

	async listDistros(): Promise<IWSLDistro[]> {
		return [];
	}

	async listRunningDistros(): Promise<string[]> {
		return [];
	}

	async connect(_config: IWSLAgentHostConfig): Promise<IWSLAgentHostConnection> {
		throw new Error('WSL is not available on this platform.');
	}

	async disconnect(_distro: string): Promise<void> {
		throw new Error('WSL is not available on this platform.');
	}

	async reconnect(_distro: string, _name: string): Promise<IWSLAgentHostConnection> {
		throw new Error('WSL is not available on this platform.');
	}

	getCachedDistros(): readonly IWSLCachedDistro[] {
		return [];
	}
}
