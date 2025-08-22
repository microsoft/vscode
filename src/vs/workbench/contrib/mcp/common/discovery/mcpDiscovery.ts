/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { SyncDescriptor0 } from '../../../../../platform/instantiation/common/descriptors.js';


export interface IMcpDiscovery extends IDisposable {
	start(): void;
}

class McpDiscoveryRegistry {
	private readonly _discovery: SyncDescriptor0<IMcpDiscovery>[] = [];

	register(discovery: SyncDescriptor0<IMcpDiscovery>): void {
		this._discovery.push(discovery);
	}

	getAll(): readonly SyncDescriptor0<IMcpDiscovery>[] {
		return this._discovery;
	}
}

export const mcpDiscoveryRegistry = new McpDiscoveryRegistry();



