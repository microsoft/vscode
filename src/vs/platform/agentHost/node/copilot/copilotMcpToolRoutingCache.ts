/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { stableStringify } from '../../../../base/common/objects.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentHostStorageService } from '../agentHostStorageService.js';

const STORAGE_KEY = 'copilotMcpToolRoutingCache';
const STORAGE_VERSION = 1;
const MAX_SERVERS = 128;
const MAX_TOOLS_PER_SERVER = 256;
const MAX_DESCRIPTION_LENGTH = 4096;
const MCP_ROUTING_PROXY_NAME_PREFIX = 'mcp_route_';
const MCP_ROUTING_PROXY_NAME_HASH_LENGTH = 16;
const MCP_ROUTING_PROXY_NAME_MAX_LENGTH = 64;

export interface ICopilotMcpRoutingTool {
	readonly name: string;
	readonly description?: string;
}

interface IStoredMcpRoutingEntry {
	readonly serverName: string;
	readonly tools: readonly ICopilotMcpRoutingTool[];
	readonly updatedAt: number;
}

interface IStoredMcpRoutingCache {
	readonly version: typeof STORAGE_VERSION;
	readonly entries: Record<string, IStoredMcpRoutingEntry>;
}

export interface ICopilotMcpRoutingServer {
	readonly serverName: string;
	readonly configuration: unknown;
}

export interface ICachedCopilotMcpRoutingServer extends ICopilotMcpRoutingServer {
	readonly cacheKey: string;
	readonly tools: readonly ICopilotMcpRoutingTool[];
}

export class CopilotMcpToolRoutingCache {
	constructor(
		private readonly _storageService: IAgentHostStorageService,
		private readonly _logService: ILogService,
	) { }

	get(server: ICopilotMcpRoutingServer): ICachedCopilotMcpRoutingServer | undefined {
		const cacheKey = getMcpRoutingCacheKey(server);
		const entry = this._read().entries[cacheKey];
		return entry ? { ...server, cacheKey, tools: entry.tools } : undefined;
	}

	store(server: ICopilotMcpRoutingServer, tools: readonly ICopilotMcpRoutingTool[]): void {
		const cacheKey = getMcpRoutingCacheKey(server);
		const current = this._read();
		const entries = {
			...current.entries,
			[cacheKey]: {
				serverName: server.serverName,
				tools: tools.slice(0, MAX_TOOLS_PER_SERVER).map(tool => ({
					name: tool.name,
					...(tool.description ? { description: tool.description.slice(0, MAX_DESCRIPTION_LENGTH) } : {}),
				})),
				updatedAt: Date.now(),
			},
		};
		const retainedEntries = Object.fromEntries(Object.entries(entries)
			.sort(([, first], [, second]) => second.updatedAt - first.updatedAt)
			.slice(0, MAX_SERVERS));
		try {
			this._storageService.set<IStoredMcpRoutingCache>(STORAGE_KEY, {
				version: STORAGE_VERSION,
				entries: retainedEntries,
			});
		} catch (error) {
			this._logService.warn('[CopilotMcpToolRoutingCache] Failed to persist MCP tool routing metadata', error);
		}
	}

	private _read(): IStoredMcpRoutingCache {
		try {
			const stored = this._storageService.get<unknown>(STORAGE_KEY);
			if (isStoredCache(stored)) {
				return stored;
			}
		} catch (error) {
			this._logService.warn('[CopilotMcpToolRoutingCache] Failed to read MCP tool routing metadata', error);
		}
		return { version: STORAGE_VERSION, entries: {} };
	}
}

export function getMcpRoutingCacheKey(server: ICopilotMcpRoutingServer, source?: string): string {
	return createHash('sha256')
		.update(stableStringify(source === undefined ? [server.serverName, server.configuration] : [server.serverName, server.configuration, source]), 'utf8')
		.digest('hex');
}

export function getMcpRoutingProxyName(server: ICopilotMcpRoutingServer): string {
	const hash = getMcpRoutingCacheKey(server).slice(0, MCP_ROUTING_PROXY_NAME_HASH_LENGTH);
	const suffix = `_${hash}`;
	const maxServerNameLength = MCP_ROUTING_PROXY_NAME_MAX_LENGTH - MCP_ROUTING_PROXY_NAME_PREFIX.length - suffix.length;
	const sanitizedServerName = server.serverName.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'server';
	const serverName = sanitizedServerName.slice(0, maxServerNameLength).replace(/_+$/g, '');
	return `${MCP_ROUTING_PROXY_NAME_PREFIX}${serverName}${suffix}`;
}

function isStoredCache(value: unknown): value is IStoredMcpRoutingCache {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Partial<IStoredMcpRoutingCache>;
	if (candidate.version !== STORAGE_VERSION || !candidate.entries || typeof candidate.entries !== 'object' || Array.isArray(candidate.entries)) {
		return false;
	}
	const entries = Object.values(candidate.entries);
	if (entries.length > MAX_SERVERS) {
		return false;
	}
	return entries.every(entry =>
		!!entry
		&& typeof entry === 'object'
		&& typeof entry.serverName === 'string'
		&& typeof entry.updatedAt === 'number'
		&& Array.isArray(entry.tools)
		&& entry.tools.length <= MAX_TOOLS_PER_SERVER
		&& entry.tools.every(tool =>
			!!tool
			&& typeof tool === 'object'
			&& typeof tool.name === 'string'
			&& tool.name.length > 0
			&& (tool.description === undefined || (typeof tool.description === 'string' && tool.description.length <= MAX_DESCRIPTION_LENGTH))
		)
	);
}
