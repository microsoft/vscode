/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64 } from '../../../base/common/buffer.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import {
	AgentHostResourcePermissionError,
	IAgentHostResourceService,
	LOCAL_AGENT_HOST_ADDRESS,
} from './agentHostResourceService.js';
import { IRemoteFilesystemConnection } from './agentHostFileSystemProvider.js';
import { AhpJsonlLogger } from './ahpJsonlLogger.js';
import { AhpErrorCodes } from './state/protocol/errors.js';
import {
	ContentEncoding,
	type ResourceCopyParams, type ResourceCopyResult, type ResourceDeleteParams, type ResourceDeleteResult,
	type ResourceListResult, type ResourceMkdirParams, type ResourceMkdirResult, type ResourceMoveParams, type ResourceMoveResult,
	type ResourceReadResult, type ResourceRequestParams, type ResourceRequestResult, type ResourceResolveParams, type ResourceResolveResult, type ResourceWriteParams, type ResourceWriteResult,
} from './state/protocol/commands.js';

/**
 * IPC channel name used for in-process agent-host → renderer reverse
 * filesystem RPCs. The renderer registers a server channel under this
 * name on its `MessagePortClient`; the agent host reaches it via
 * `connection.channelClient.getChannel(name)` on its `UtilityProcessServer`.
 *
 * Mirrors the WebSocket reverse-RPC handlers in
 * `RemoteAgentHostProtocolClient._handleReverseRequest`.
 */
export const AGENT_HOST_CLIENT_RESOURCE_CHANNEL = 'agentHostClientResource';

/**
 * Wraps an {@link IChannel} (typically obtained from the agent host's
 * `UtilityProcessServer.getChannel`) into an
 * {@link IRemoteFilesystemConnection} suitable for registering with
 * `AgentHostClientFileSystemProvider.registerAuthority`.
 */
export function createAgentHostClientResourceConnection(channel: IChannel): IRemoteFilesystemConnection {
	return {
		resourceList: (uri) => channel.call('resourceList', { uri: uri.toString() }) as Promise<ResourceListResult>,
		resourceRead: (uri) => channel.call('resourceRead', { uri: uri.toString() }) as Promise<ResourceReadResult>,
		resourceWrite: (params) => channel.call('resourceWrite', { ...params, uri: params.uri.toString() }) as Promise<ResourceWriteResult>,
		resourceCopy: (params) => channel.call('resourceCopy', { ...params, source: params.source.toString(), destination: params.destination.toString() }) as Promise<ResourceCopyResult>,
		resourceDelete: (params) => channel.call('resourceDelete', { ...params, uri: params.uri.toString() }) as Promise<ResourceDeleteResult>,
		resourceMove: (params) => channel.call('resourceMove', { ...params, source: params.source.toString(), destination: params.destination.toString() }) as Promise<ResourceMoveResult>,
		resourceResolve: (params) => channel.call('resourceResolve', { ...params, uri: params.uri.toString() }) as Promise<ResourceResolveResult>,
		resourceMkdir: (params) => channel.call('resourceMkdir', { ...params, uri: params.uri.toString() }) as Promise<ResourceMkdirResult>,
		resourceRequest: (params) => channel.call('resourceRequest', { ...params, uri: params.uri.toString() }) as Promise<ResourceRequestResult>,
	};
}

/**
 * Server-side channel for in-process reverse FS RPCs from the local agent
 * host. Thin adapter — translates JSON-RPC frames into
 * {@link IAgentHostResourceService} calls, keyed on
 * {@link LOCAL_AGENT_HOST_ADDRESS} so permission policy is shared with
 * remote agent hosts. Permission denials are surfaced as
 * `PermissionDenied` wire frames carrying the suggested
 * `resourceRequest` so the host can run the standard request → retry loop.
 */
export class AgentHostClientResourceChannel implements IServerChannel {

	constructor(
		private readonly _ahpLogger: AhpJsonlLogger | undefined,
		@IAgentHostResourceService private readonly _resourceService: IAgentHostResourceService,
	) { }

	listen<T>(_ctx: unknown, event: string): Event<T> {
		throw new Error(`No event '${event}' on AgentHostClientResourceChannel`);
	}

	async call<T>(ctx: unknown, command: string, arg?: unknown): Promise<T> {
		const requestFrame = { jsonrpc: '2.0' as const, method: command, params: arg };
		this._logReverseFrame(requestFrame, 's2c');
		try {
			const result = await this._call(ctx, command, arg);
			const responseFrame = { jsonrpc: '2.0' as const, method: command, result: result ?? null };
			this._logReverseFrame(responseFrame, 'c2s');
			return result as T;
		} catch (err) {
			const errorFrame = err instanceof AgentHostResourcePermissionError
				? {
					jsonrpc: '2.0' as const,
					method: command,
					error: {
						code: AhpErrorCodes.PermissionDenied,
						message: err.message,
						data: err.request ? { request: err.request } : undefined,
					},
				}
				: {
					jsonrpc: '2.0' as const,
					method: command,
					error: {
						code: -32603,
						message: err instanceof Error ? err.message : String(err),
					},
				};
			this._logReverseFrame(errorFrame, 'c2s');
			throw err;
		}
	}

	private _logReverseFrame(frame: object, dir: 'c2s' | 's2c'): void {
		this._ahpLogger?.log(frame, dir);
	}

	private async _call(_ctx: unknown, command: string, arg?: unknown): Promise<unknown> {
		const a = (arg ?? {}) as Record<string, unknown>;
		const addr = LOCAL_AGENT_HOST_ADDRESS;
		switch (command) {
			case 'resourceList': {
				const result = await this._resourceService.list(addr, URI.parse(a.uri as string));
				return { entries: result.entries };
			}
			case 'resourceRead': {
				const result = await this._resourceService.read(addr, URI.parse(a.uri as string));
				return { data: encodeBase64(result.bytes), encoding: ContentEncoding.Base64 };
			}
			case 'resourceWrite': {
				await this._resourceService.write(addr, a as unknown as ResourceWriteParams);
				return {};
			}
			case 'resourceDelete': {
				await this._resourceService.del(addr, a as unknown as ResourceDeleteParams);
				return {};
			}
			case 'resourceMove': {
				await this._resourceService.move(addr, a as unknown as ResourceMoveParams);
				return {};
			}
			case 'resourceCopy': {
				await this._resourceService.copy(addr, a as unknown as ResourceCopyParams);
				return {};
			}
			case 'resourceResolve': {
				return this._resourceService.resolve(addr, a as unknown as ResourceResolveParams);
			}
			case 'resourceMkdir': {
				await this._resourceService.mkdir(addr, a as unknown as ResourceMkdirParams);
				return {};
			}
			case 'resourceRequest': {
				try {
					await this._resourceService.request(addr, a as unknown as ResourceRequestParams);
					return {};
				} catch (err) {
					if (err instanceof CancellationError) {
						throw new AgentHostResourcePermissionError(undefined);
					}
					throw err;
				}
			}
		}
		throw new Error(`Unknown command '${command}' on AgentHostClientResourceChannel`);
	}
}
