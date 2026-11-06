/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from '../../../base/common/platform.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentConnection } from './agentService.js';
import { readAgentHostResources } from './meta/agentHostResources.js';

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
	const root = connection.rootState?.value;
	const platform = readAgentHostResources(root instanceof Error ? undefined : root)?.platform;
	switch (platform) {
		case 'windows':
			return OperatingSystem.Windows;
		case 'macos':
			return OperatingSystem.Macintosh;
		case 'linux':
			return OperatingSystem.Linux;
	}
	const defaultDirectory = connection.initializeResult?.get()?.defaultDirectory;
	if (defaultDirectory) {
		const uri = typeof defaultDirectory === 'string' ? URI.parse(defaultDirectory) : URI.revive(defaultDirectory);
		if (uri.scheme === Schemas.file && (uri.authority || /^\/[a-zA-Z]:\//.test(uri.path))) {
			return OperatingSystem.Windows;
		}
	}
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
