/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { ToolDataSource } from '../../chat/common/tools/languageModelToolsService.js';
import { IMcpServer, IMcpServerStartOpts, IMcpService, McpConnectionState, McpServerCacheState, McpServerTransportType } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';


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
export async function startServerAndWaitForLiveTools(server: IMcpServer, opts?: IMcpServerStartOpts, token?: CancellationToken): Promise<boolean> {
	const r = await server.start(opts);

	const store = new DisposableStore();
	const ok = await new Promise<boolean>(resolve => {
		if (token?.isCancellationRequested || r.state === McpConnectionState.Kind.Error || r.state === McpConnectionState.Kind.Stopped) {
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

	if (ok) {
		await timeout(0); // let the tools register in the language model contribution
	}

	return ok;
}

export function mcpServerToSourceData(server: IMcpServer, reader?: IReader): ToolDataSource {
	const metadata = server.serverMetadata.read(reader);
	return {
		type: 'mcp',
		serverLabel: metadata?.serverName,
		instructions: metadata?.serverInstructions,
		label: server.definition.label,
		collectionId: server.collection.id,
		definitionId: server.definition.id
	};
}


/**
 * Validates whether the given HTTP or HTTPS resource is allowed for the specified MCP server.
 *
 * @param resource The URI of the resource to validate.
 * @param server The MCP server instance to validate against, or undefined.
 * @returns True if the resource request is valid for the server, false otherwise.
 */
export function canLoadMcpNetworkResourceDirectly(resource: URL, server: IMcpServer | undefined) {
	let isResourceRequestValid = false;
	if (resource.protocol === 'http:') {
		const launch = server?.connection.get()?.launchDefinition;
		if (launch && launch.type === McpServerTransportType.HTTP && launch.uri.authority.toLowerCase() === resource.host.toLowerCase()) {
			isResourceRequestValid = true;
		}
	} else if (resource.protocol === 'https:') {
		isResourceRequestValid = true;
	}
	return isResourceRequestValid;
}

export function isTaskResult(obj: MCP.Result | MCP.CreateTaskResult): obj is MCP.CreateTaskResult {
	return (obj as MCP.CreateTaskResult).task !== undefined;
}
