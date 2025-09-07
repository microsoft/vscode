/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ToolDataSource } from '../../chat/common/languageModelToolsService.js';
import { IMcpServer, IMcpServerStartOpts, IMcpService, McpConnectionState, McpServerCacheState } from './mcpTypes.js';

/**
 * Waits up to `timeout` for a server passing the filter to be discovered,
 * and then starts it.
 */
export function startServerByFilter(mcpService: IMcpService, filter: (s: IMcpServer) => boolean, timeout = 5000) {
	return new Promise<void>((resolve, reject) => {
		const store = new DisposableStore();
		store.add(autorun(reader => {
			const servers = mcpService.servers.read(reader);
			const server = servers.find(filter);

			if (server) {
				server.start({ promptType: 'all-untrusted' }).then(state => {
					if (state.state === McpConnectionState.Kind.Error) {
						server.showOutput();
					}
				});

				resolve();
				store.dispose();
			}
		}));

		store.add(disposableTimeout(() => {
			store.dispose();
			reject(new CancellationError());
		}, timeout));
	});
}

/**
 * Starts a server (if needed) and waits for its tools to be live. Returns
 * true/false whether this happened successfully.
 */
export function startServerAndWaitForLiveTools(server: IMcpServer, opts?: IMcpServerStartOpts, token?: CancellationToken): Promise<boolean> {
	const store = new DisposableStore();
	return new Promise<boolean>(resolve => {
		server.start(opts).catch(() => undefined).then(r => {
			if (token?.isCancellationRequested || !r || r.state === McpConnectionState.Kind.Error || r.state === McpConnectionState.Kind.Stopped) {
				return resolve(false);
			}

			if (token) {
				store.add(token.onCancellationRequested(() => {
					resolve(false);
				}));
			}

			store.add(autorun(reader => {
				const connState = server.connectionState.read(reader).state;
				if (connState === McpConnectionState.Kind.Error || connState === McpConnectionState.Kind.Stopped) {
					resolve(false); // some error, don't block the request
				}

				const toolState = server.cacheState.read(reader);
				if (toolState === McpServerCacheState.Live) {
					resolve(true); // got tools, all done
				}
			}));
		});
	}).finally(() => store.dispose());
}

export function mcpServerToSourceData(server: IMcpServer): ToolDataSource {
	const metadata = server.serverMetadata.get();
	return {
		type: 'mcp',
		serverLabel: metadata?.serverName,
		instructions: metadata?.serverInstructions,
		label: server.definition.label,
		collectionId: server.collection.id,
		definitionId: server.definition.id
	};
}
