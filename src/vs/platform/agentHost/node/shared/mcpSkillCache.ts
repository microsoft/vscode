/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { ISessionDataService } from '../../common/sessionDataService.js';

export const MCP_SKILLS_METADATA_KEY = 'mcpSkills';

export interface ICachedMcpSkill {
	/** Published server-prefixed name, never a qualified runtime command. */
	readonly name: string;
	readonly description: string;
	readonly userInvocable: boolean;
	readonly enabled: boolean;
	readonly uri: string;
}

function isCachedMcpSkill(value: unknown): value is ICachedMcpSkill {
	if (!isObject(value)) {
		return false;
	}
	const skill = value as Record<string, unknown>;
	return typeof skill.name === 'string' && typeof skill.description === 'string'
		&& typeof skill.userInvocable === 'boolean' && typeof skill.enabled === 'boolean'
		&& typeof skill.uri === 'string' && !!URI.parse(skill.uri).scheme;
}

/** Parses the cache, dropping malformed entries; a missing or malformed cache is empty. */
function parseMcpSkillCache(raw: string | undefined): Map<string, readonly ICachedMcpSkill[]> {
	const skills = new Map<string, readonly ICachedMcpSkill[]>();
	try {
		const value: unknown = raw === undefined ? undefined : JSON.parse(raw);
		if (isObject(value)) {
			for (const [server, entries] of Object.entries(value as Record<string, unknown>)) {
				if (Array.isArray(entries)) {
					skills.set(server, entries.filter(isCachedMcpSkill));
				}
			}
		}
	} catch {
		// Malformed caches are ignored.
	}
	return skills;
}

function serializeMcpSkillCache(skills: ReadonlyMap<string, readonly ICachedMcpSkill[]>): string {
	return JSON.stringify(Object.fromEntries([...skills].sort(([a], [b]) => a.localeCompare(b)).map(([server, entries]) => [server,
		[...entries].sort((a, b) => a.uri.localeCompare(b.uri)).map(({ name, description, userInvocable, enabled, uri }) => ({ name, description, userInvocable, enabled, uri })),
	])));
}

/** Reads completion-only metadata; missing, malformed or unreadable caches are ignored. */
export async function readMcpSkillCache(session: URI, sessionDataService: ISessionDataService): Promise<ReadonlyMap<string, readonly ICachedMcpSkill[]>> {
	try {
		const ref = sessionDataService.openDatabase(session);
		try {
			return parseMcpSkillCache(await ref.object.getMetadata(MCP_SKILLS_METADATA_KEY));
		} finally {
			ref.dispose();
		}
	} catch {
		return new Map();
	}
}

/** Writes compact server-name-to-completion-entry JSON without delaying runtime snapshots. */
export class McpSkillCacheWriter {
	private _serialized: string | undefined;
	private readonly _writes = new Sequencer();

	constructor(
		private readonly _session: URI,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/**
	 * Records a runtime skill snapshot. Servers for which `isAuthoritative` returns false, such as servers that
	 * have not started and so have not been discovered, keep their previously cached skills unless the snapshot
	 * reports some. By default every server is authoritative, so an empty snapshot clears the cache.
	 */
	write(skills: ReadonlyMap<string, readonly ICachedMcpSkill[]>, isAuthoritative: (serverName: string) => boolean = () => true): void {
		void this._writes.queue(async () => {
			const ref = this._sessionDataService.openDatabase(this._session);
			try {
				// An absent cache is equivalent to an empty one, so sessions without MCP skills never write.
				const previous = this._serialized ?? await ref.object.getMetadata(MCP_SKILLS_METADATA_KEY) ?? '{}';
				const merged = new Map(skills);
				for (const [server, entries] of parseMcpSkillCache(previous)) {
					if (!merged.has(server) && !isAuthoritative(server)) {
						merged.set(server, entries);
					}
				}
				const serialized = serializeMcpSkillCache(merged);
				if (serialized !== previous) {
					await ref.object.setMetadata(MCP_SKILLS_METADATA_KEY, serialized);
				}
				this._serialized = serialized;
			} finally {
				ref.dispose();
			}
		}).catch(error => this._logService.warn(`[McpSkillCache] Failed to persist MCP skills for ${this._session}`, error));
	}
}
