/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IFileService } from '../../files/common/files.js';
import { IRemoteFilesystemConnection } from './agentHostFileSystemProvider.js';
import {
	ContentEncoding, type DirectoryEntry, type ResourceDeleteParams, type ResourceDeleteResult,
	type ResourceListResult, type ResourceMoveParams, type ResourceMoveResult,
	type ResourceReadResult, type ResourceWriteParams, type ResourceWriteResult,
} from './state/protocol/commands.js';

/**
 * IPC channel name used for in-process agent-host → renderer reverse
 * filesystem RPCs. The renderer registers a server channel under this
 * name on its `MessagePortClient`; the agent host reaches it via
 * `connection.channelClient.getChannel(name)` on its `UtilityProcessServer`.
 *
 * Mirrors the WebSocket reverse-RPC handlers in
 * {@link RemoteAgentHostProtocolClient._handleReverseRequest}.
 */
export const AGENT_HOST_CLIENT_RESOURCE_CHANNEL = 'agentHostClientResource';

/**
 * Server-side channel implementation handling resource RPCs from the
 * agent host. Backed by the local {@link IFileService} on the renderer.
 */
export class AgentHostClientResourceChannel implements IServerChannel {

	constructor(private readonly _fileService: IFileService) { }

	listen<T>(_ctx: unknown, event: string): Event<T> {
		throw new Error(`No event '${event}' on AgentHostClientResourceChannel`);
	}

	async call<T>(_ctx: unknown, command: string, arg?: unknown): Promise<T> {
		const a = (arg ?? {}) as Record<string, unknown>;
		switch (command) {
			case 'resourceList': {
				const stat = await this._fileService.resolve(URI.parse(a.uri as string));
				if (!stat.isDirectory) {
					throw new Error(`Resource is not a directory: ${a.uri}`);
				}
				const entries: DirectoryEntry[] = (stat.children ?? []).map(c => ({
					name: c.name,
					type: c.isDirectory ? 'directory' : 'file',
				}));
				const result: ResourceListResult = { entries };
				return result as T;
			}
			case 'resourceRead': {
				const content = await this._fileService.readFile(URI.parse(a.uri as string));
				const result: ResourceReadResult = {
					data: encodeBase64(content.value),
					encoding: ContentEncoding.Base64,
				};
				return result as T;
			}
			case 'resourceWrite': {
				const params = a as unknown as ResourceWriteParams & { createOnly?: boolean };
				const writeUri = URI.parse(params.uri as unknown as string);
				const buf = params.encoding === ContentEncoding.Base64
					? decodeBase64(params.data)
					: VSBuffer.fromString(params.data);
				if (params.createOnly) {
					await this._fileService.createFile(writeUri, buf, { overwrite: false });
				} else {
					await this._fileService.writeFile(writeUri, buf);
				}
				const result: ResourceWriteResult = {};
				return result as T;
			}
			case 'resourceDelete': {
				const params = a as unknown as ResourceDeleteParams;
				await this._fileService.del(URI.parse(params.uri as unknown as string), { recursive: !!params.recursive });
				const result: ResourceDeleteResult = {};
				return result as T;
			}
			case 'resourceMove': {
				const params = a as unknown as ResourceMoveParams;
				await this._fileService.move(URI.parse(params.source as unknown as string), URI.parse(params.destination as unknown as string), !params.failIfExists);
				const result: ResourceMoveResult = {};
				return result as T;
			}
		}
		throw new Error(`Unknown command '${command}' on AgentHostClientResourceChannel`);
	}
}

/**
 * Wraps an {@link IChannel} (typically obtained from the agent host's
 * `UtilityProcessServer.getChannel`) into an
 * {@link IRemoteFilesystemConnection} suitable for registering with
 * {@link AgentHostClientFileSystemProvider.registerAuthority}.
 */
export function createAgentHostClientResourceConnection(channel: IChannel): IRemoteFilesystemConnection {
	return {
		resourceList: (uri) => channel.call('resourceList', { uri: uri.toString() }) as Promise<ResourceListResult>,
		resourceRead: (uri) => channel.call('resourceRead', { uri: uri.toString() }) as Promise<ResourceReadResult>,
		resourceWrite: (params) => channel.call('resourceWrite', { ...params, uri: params.uri.toString() }) as Promise<ResourceWriteResult>,
		resourceDelete: (params) => channel.call('resourceDelete', { ...params, uri: params.uri.toString() }) as Promise<ResourceDeleteResult>,
		resourceMove: (params) => channel.call('resourceMove', { ...params, source: params.source.toString(), destination: params.destination.toString() }) as Promise<ResourceMoveResult>,
	};
}
