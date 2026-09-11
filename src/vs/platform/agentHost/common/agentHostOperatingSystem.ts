/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';
import type { IAgentConnection } from './agentService.js';

const operatingSystems = new WeakMap<IAgentConnection, Promise<OperatingSystem>>();

/**
 * Shares pending and successful host OS lookups per connection; failures propagate and allow later retries.
 */
export function getAgentHostOperatingSystem(connection: IAgentConnection): Promise<OperatingSystem> {
	let operatingSystem = operatingSystems.get(connection);
	if (!operatingSystem) {
		operatingSystem = resolveOperatingSystem(connection).catch(error => {
			operatingSystems.delete(connection);
			throw error;
		});
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
