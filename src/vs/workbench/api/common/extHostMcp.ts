/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { McpCollectionDefinition, McpServerDefinition, McpServerLaunch, McpServerTransportType } from '../../contrib/mcp/common/mcpTypes.js';
import { ExtHostMcpShape, MainContext, MainThreadMcpShape } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { StorageScope } from '../../../platform/storage/common/storage.js';
import { CancellationToken } from '../../../base/common/cancellation.js';

export const IExtHostMpcService = createDecorator<IExtHostMpcService>('IExtHostMpcService');

export interface IExtHostMpcService extends ExtHostMcpShape {
	registerMcpConfigurationProvider(extension: IExtensionDescription, provider: vscode.McpConfigurationProvider, metadata?: { label: string }): IDisposable;
}

export class ExtHostMcpService implements IExtHostMpcService {
	protected _proxy: MainThreadMcpShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadMcp);
	}

	$startMcp(id: number, launch: McpServerLaunch): void {
		// todo: SSE launches can be implemented in this common layer
		throw new Error('not implemented');
	}

	$stopMcp(id: number): void {
		// no-op
	}

	$sendMessage(id: number, message: string): void {
		// no-op
	}

	registerMcpConfigurationProvider(extension: IExtensionDescription, provider: vscode.McpConfigurationProvider, metadata?: { label: string }): IDisposable {
		const store = new DisposableStore();

		const mcp: McpCollectionDefinition.FromExtHost = {
			id: ExtensionIdentifier.toKey(extension.identifier),
			isTrustedByDefault: true,
			label: metadata?.label ?? extension.displayName ?? extension.name,
			scope: StorageScope.WORKSPACE
		};
		const update = async () => {

			const list = await provider.provideMcpServerDefinitions(CancellationToken.None);

			function isSSEConfig(candidate: vscode.McpServerDefinition): candidate is vscode.McpSSEServerDefinition {
				return typeof (candidate as vscode.McpSSEServerDefinition).url === 'string';
			}

			const servers: McpServerDefinition[] = [];

			for (const item of list ?? []) {
				servers.push({
					id: ExtensionIdentifier.toKey(extension.identifier),
					label: item.label,
					launch: isSSEConfig(item)
						? {
							type: McpServerTransportType.SSE,
							url: item.url
						}
						: {
							type: McpServerTransportType.Stdio,
							cwd: item.cwd,
							args: item.args,
							command: item.command,
							env: item.env
						}
				});
			}

			this._proxy.$upsertMcpCollection(mcp, servers);
		};

		store.add(toDisposable(() => {
			this._proxy.$deleteMcpCollection(mcp.id);
		}));

		if (provider.onDidChange) {
			store.add(provider.onDidChange(update));
		}

		setTimeout(update, 0);

		return store;
	}
}
