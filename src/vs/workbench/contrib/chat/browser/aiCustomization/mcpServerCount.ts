/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../../base/common/observable.js';
import { getCustomizationScopeEnablement, type CustomizationDisabledReason } from '../../../../../platform/agentHost/common/customizationEnablement.js';
import { isContributionEnabled } from '../../common/enablement.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { IMcpServer } from '../../../mcp/common/mcpTypes.js';

export type AgentHostMcpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

export function getUniqueMcpMatchKeys(values: readonly (string | undefined)[]): string[] {
	const keys = new Set<string>();
	for (const value of values) {
		if (value) {
			keys.add(value);
		}
	}
	return [...keys];
}

export class ActiveSessionMcpServerMatcher {
	private readonly byKey = new Map<string, AgentHostMcpServer[]>();
	private readonly matchedIds = new Set<string>();

	constructor(private readonly servers: readonly AgentHostMcpServer[]) {
		for (const server of servers) {
			const separator = server.id.indexOf('/');
			const rawId = separator >= 0 ? server.id.slice(separator + 1) : server.id;
			for (const key of getUniqueMcpMatchKeys([rawId, server.name])) {
				let bucket = this.byKey.get(key);
				if (!bucket) {
					bucket = [];
					this.byKey.set(key, bucket);
				}
				bucket.push(server);
			}
		}
	}

	take(keys: readonly (string | undefined)[]): AgentHostMcpServer | undefined {
		for (const key of getUniqueMcpMatchKeys(keys)) {
			const matches = this.byKey.get(key)?.filter(server => !this.matchedIds.has(server.id));
			if (matches?.length === 1) {
				this.matchedIds.add(matches[0].id);
				return matches[0];
			}
		}
		return undefined;
	}

	unmatched(query: string): AgentHostMcpServer[] {
		return this.servers.filter(server => !this.matchedIds.has(server.id) && (!query || server.name.toLowerCase().includes(query)));
	}
}

export function getRuntimeServerMatchKeys(server: IMcpServer): string[] {
	return getUniqueMcpMatchKeys([server.definition.id, server.definition.label]);
}

export function isMcpServerInUse(primaryEnabled: boolean, activeSessionServer: AgentHostMcpServer | undefined): boolean {
	return primaryEnabled
		&& activeSessionServer?.enabled !== false
		&& activeSessionServer?.disabledReason?.source !== 'plugin';
}

export function getEffectiveMcpServerCount(
	localServers: readonly IMcpServer[],
	activeSessionServers: readonly AgentHostMcpServer[],
	reader: IReader,
	hiddenCollectionIds: readonly string[] | undefined,
): number {
	if (activeSessionServers.length === 0) {
		return localServers.filter(server =>
			!hiddenCollectionIds?.includes(server.collection.id)
			&& isContributionEnabled(server.enablement.read(reader))
		).length;
	}

	const activeSessionMatcher = new ActiveSessionMcpServerMatcher(activeSessionServers);
	let count = 0;
	for (const localServer of localServers) {
		if (hiddenCollectionIds?.includes(localServer.collection.id)) {
			continue;
		}
		const activeSessionServer = activeSessionMatcher.take(getRuntimeServerMatchKeys(localServer));
		const primaryEnabled = activeSessionServer && isHostOwnedPluginMcpServer(activeSessionServer)
			? getCustomizationScopeEnablement(activeSessionServer).global
			: isContributionEnabled(localServer.enablement.read(reader));
		if (isMcpServerInUse(primaryEnabled, activeSessionServer)) {
			count++;
		}
	}
	for (const activeSessionServer of activeSessionMatcher.unmatched('')) {
		if (isMcpServerInUse(getCustomizationScopeEnablement(activeSessionServer).global, activeSessionServer)) {
			count++;
		}
	}
	return count;
}

function isHostOwnedPluginMcpServer(server: {
	readonly isPluginProvided?: boolean;
	readonly isClientBundled?: boolean;
	readonly disabledReason?: CustomizationDisabledReason;
}): boolean {
	return server.isPluginProvided === true && !server.isClientBundled;
}
