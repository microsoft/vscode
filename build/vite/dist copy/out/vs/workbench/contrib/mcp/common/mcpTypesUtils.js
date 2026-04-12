/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { disposableTimeout, timeout } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, autorunSelfDisposable } from '../../../../base/common/observable.js';
/**
 * Waits up to `timeout` for a server passing the filter to be discovered,
 * and then starts it.
 */
export function startServerByFilter(mcpService, filter, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const store = new DisposableStore();
        store.add(autorun(reader => {
            const servers = mcpService.servers.read(reader);
            const server = servers.find(filter);
            if (server) {
                server.start({ promptType: 'all-untrusted' }).then(state => {
                    if (state.state === 3 /* McpConnectionState.Kind.Error */) {
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
export async function startServerAndWaitForLiveTools(server, opts, token) {
    const r = await server.start(opts);
    const store = new DisposableStore();
    const ok = await new Promise(resolve => {
        if (token?.isCancellationRequested || r.state === 3 /* McpConnectionState.Kind.Error */ || r.state === 0 /* McpConnectionState.Kind.Stopped */) {
            return resolve(false);
        }
        if (token) {
            store.add(token.onCancellationRequested(() => {
                resolve(false);
            }));
        }
        store.add(autorun(reader => {
            const connState = server.connectionState.read(reader).state;
            if (connState === 3 /* McpConnectionState.Kind.Error */ || connState === 0 /* McpConnectionState.Kind.Stopped */) {
                resolve(false); // some error, don't block the request
            }
            const toolState = server.cacheState.read(reader);
            if (toolState === 5 /* McpServerCacheState.Live */) {
                resolve(true); // got tools, all done
            }
        }));
    });
    store.dispose();
    if (ok) {
        await timeout(0); // let the tools register in the language model contribution
    }
    return ok;
}
export function mcpServerToSourceData(server, reader) {
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
export function canLoadMcpNetworkResourceDirectly(resource, server) {
    let isResourceRequestValid = false;
    if (resource.protocol === 'http:') {
        const launch = server?.connection.get()?.launchDefinition;
        if (launch && launch.type === 2 /* McpServerTransportType.HTTP */ && launch.uri.authority.toLowerCase() === resource.host.toLowerCase()) {
            isResourceRequestValid = true;
        }
    }
    else if (resource.protocol === 'https:') {
        isResourceRequestValid = true;
    }
    return isResourceRequestValid;
}
export function isTaskResult(obj) {
    return obj.task !== undefined;
}
export function findMcpServer(mcpService, filter, token) {
    return new Promise((resolve) => {
        autorunSelfDisposable(reader => {
            if (token) {
                if (token.isCancellationRequested) {
                    reader.dispose();
                    resolve(undefined);
                    return;
                }
                reader.store.add(token.onCancellationRequested(() => {
                    reader.dispose();
                    resolve(undefined);
                }));
            }
            const servers = mcpService.servers.read(reader);
            const server = servers.find(filter);
            if (server) {
                resolve(server);
                reader.dispose();
            }
        });
    });
}
export function translateMcpLogMessage(logger, params, prefix = '') {
    let contents = typeof params.data === 'string' ? params.data : JSON.stringify(params.data);
    if (params.logger) {
        contents = `${params.logger}: ${contents}`;
    }
    if (prefix) {
        contents = `${prefix} ${contents}`;
    }
    switch (params?.level) {
        case 'debug':
            logger.debug(contents);
            break;
        case 'info':
        case 'notice':
            logger.info(contents);
            break;
        case 'warning':
            logger.warn(contents);
            break;
        case 'error':
        case 'critical':
        case 'alert':
        case 'emergency':
            logger.error(contents);
            break;
        default:
            logger.info(contents);
            break;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwVHlwZXNVdGlscy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwVHlwZXNVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFOUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQUUscUJBQXFCLEVBQVcsTUFBTSx1Q0FBdUMsQ0FBQztBQU9oRzs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsVUFBdUIsRUFBRSxNQUFrQyxFQUFFLE9BQU8sR0FBRyxJQUFJO0lBQzlHLE9BQU8sSUFBSSxPQUFPLENBQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDNUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUNwQyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUMxQixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRCxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRXBDLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDMUQsSUFBSSxLQUFLLENBQUMsS0FBSywwQ0FBa0MsRUFBRSxDQUFDO3dCQUNu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