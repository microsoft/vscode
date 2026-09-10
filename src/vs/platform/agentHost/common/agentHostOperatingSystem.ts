/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';
import type { IAgentConnection } from './agentService.js';

const operatingSystems = new WeakMap<IAgentConnection, Promise<OperatingSystem>>();

/**
 * Lazily resolves the host OS once per connection object, sharing the request across sessions.
 * Both successful and failed requests stay cached for that connection's lifetime; failures propagate without retries.
 */
export function getAgentHostOperatingSystem(connection: IAgentConnection): Promise<OperatingSystem> {
	let operatingSystem = operatingSystems.get(connection);
	if (!operatingSystem) {
		operatingSystem = resolveOperatingSystem(connection);
		operatingSystems.set(connection, operatingSystem);
	}
	return operatingSystem;
}

async function resolveOperatingSystem(connection: IAgentConnection): Promise<OperatingSystem> {
	const { os } = await connection.getNetworkDiagnosticsInfo();
	switch (os) {
		case 'win32':
			return OperatingSystem.Windows;
		case 'darwin':
			return OperatingSystem.Macintosh;
		case 'linux':
			return OperatingSystem.Linux;
		default:
			throw new Error(`Unsupported agent host operating system: ${os}`);
	}
}
