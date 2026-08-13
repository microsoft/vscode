/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMcpServer, IWorkbenchMcpServer } from '../../../mcp/common/mcpTypes.js';

/**
 * MCP servers are described by two independent models: {@link IWorkbenchMcpServer} (what is
 * installed and configured) and {@link IMcpServer} (what is running). There is no shared key
 * between them, so the two are matched heuristically on id and label.
 *
 * The matching is deliberately conservative: a candidate is only accepted when exactly one
 * runtime server answers to a key. Showing nothing is better than attributing one server's
 * tools or status to another.
 */

function normalizeMcpMatchKey(value: string | undefined): string | undefined {
	return value || undefined;
}

export function getUniqueMcpMatchKeys(values: readonly (string | undefined)[]): string[] {
	const keys = new Set<string>();
	for (const value of values) {
		const key = normalizeMcpMatchKey(value);
		if (key) {
			keys.add(key);
		}
	}
	return [...keys];
}

export function getWorkbenchServerMatchKeys(server: IWorkbenchMcpServer): string[] {
	return getUniqueMcpMatchKeys([server.id, server.name, server.label]);
}

export function getRuntimeServerMatchKeys(server: IMcpServer): string[] {
	return getUniqueMcpMatchKeys([server.definition.id, server.definition.label]);
}

/**
 * Indexes runtime servers by every key they answer to, so a list of installed servers can be
 * matched in one pass instead of rescanning the runtime set per row.
 */
export class LocalMcpServerMatcher {
	private readonly byKey = new Map<string, IMcpServer[]>();

	constructor(servers: readonly IMcpServer[]) {
		for (const server of servers) {
			for (const key of getRuntimeServerMatchKeys(server)) {
				let matches = this.byKey.get(key);
				if (!matches) {
					matches = [];
					this.byKey.set(key, matches);
				}
				matches.push(server);
			}
		}
	}

	find(keys: readonly (string | undefined)[]): IMcpServer | undefined {
		for (const key of getUniqueMcpMatchKeys(keys)) {
			const matches = this.byKey.get(key);
			if (matches?.length === 1) {
				return matches[0];
			}
		}
		return undefined;
	}
}

/**
 * Finds the running counterpart of an installed server. For a single lookup this is cheaper to
 * read than building a {@link LocalMcpServerMatcher}, and applies the same one-match-only rule.
 */
export function findRuntimeMcpServer(servers: readonly IMcpServer[], server: IWorkbenchMcpServer): IMcpServer | undefined {
	return new LocalMcpServerMatcher(servers).find(getWorkbenchServerMatchKeys(server));
}
