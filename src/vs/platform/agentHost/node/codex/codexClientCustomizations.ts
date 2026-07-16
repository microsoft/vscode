/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname } from '../../../../base/common/path.js';
import type { IMcpServerDefinition, IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';
import type { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { type ChildCustomization, type PluginCustomization } from '../../common/state/sessionState.js';
import { toCodexMcpServerJson, type ICodexMcpServerConfigJson } from './codexMcpServers.js';

/**
 * Codex ingests **client-pushed** plugin customizations (the "Open Plugins"
 * the workbench syncs via {@link IActiveClient.customizations}) differently
 * from the `.agents`/`.codex` files it discovers itself. This module holds the
 * per-session store for those synced+parsed plugins plus the pure mappers that
 * project them into (a) the AHP {@link PluginCustomization} surface, (b) codex
 * per-thread `thread/start.config.mcp_servers`, and (c) process-global
 * `skills/extraRoots/set` roots.
 *
 * Feeding strategy (see the phase investigation):
 *  - MCP servers are attached **per session** via `thread/start.config`
 *    (verified: codex starts the server for that thread only), so a plugin's
 *    server only runs for sessions that enable it.
 *  - Skills are process-global in codex (`skills/extraRoots/set` replaces a
 *    single shared root list), so the store exposes the union of enabled skill
 *    roots and the agent sets it across all live sessions. This matches the
 *    semantics of client customizations, which are global user choices.
 */

/** A single client-pushed plugin: its sync result plus the parsed components (when the sync succeeded). */
export interface ICodexClientPlugin {
	readonly synced: ISyncedCustomization;
	readonly parsed: IParsedPlugin | undefined;
}

/**
 * Per-session store of client-pushed plugin customizations, keyed by the
 * contributing client id, with a per-customization enablement overlay
 * (absent = enabled, `false` = disabled). Merges every client's contribution
 * deduplicated by customization id (first client wins). Pure state holder —
 * the agent reads the projections below and drives codex.
 */
export class CodexClientCustomizationStore {

	private readonly _byClient = new Map<string, readonly ICodexClientPlugin[]>();
	private readonly _enablement = new Map<string, boolean>();

	/** Replace one client's synced+parsed plugin set. */
	setClient(clientId: string, plugins: readonly ICodexClientPlugin[]): void {
		this._byClient.set(clientId, plugins);
	}

	/** Drop a client's contribution. Returns whether anything was removed. */
	removeClient(clientId: string): boolean {
		return this._byClient.delete(clientId);
	}

	/**
	 * Toggle a client-pushed customization on/off. Returns whether the
	 * enablement actually changed (so callers can skip a no-op refresh).
	 */
	setEnabled(id: string, enabled: boolean): boolean {
		const current = this._enablement.get(id);
		const effective = current !== false; // absent counts as enabled
		if (effective === enabled) {
			return false;
		}
		if (enabled) {
			this._enablement.delete(id);
		} else {
			this._enablement.set(id, false);
		}
		return true;
	}

	/** Whether a client-pushed customization with this id exists in the store. */
	has(id: string): boolean {
		return this._merged().some(p => p.synced.customization.id === id);
	}

	/** Whether the store holds any client-pushed customizations. */
	isEmpty(): boolean {
		return this._merged().length === 0;
	}

	/** Merge of every client's plugins, deduplicated by customization id (first client wins). */
	private _merged(): readonly ICodexClientPlugin[] {
		const seen = new Set<string>();
		const out: ICodexClientPlugin[] = [];
		for (const plugins of this._byClient.values()) {
			for (const plugin of plugins) {
				const id = plugin.synced.customization.id;
				if (seen.has(id)) {
					continue;
				}
				seen.add(id);
				out.push(plugin);
			}
		}
		return out;
	}

	private _isEnabled(id: string): boolean {
		return this._enablement.get(id) !== false;
	}

	/** The merged plugins that are currently enabled and successfully parsed. */
	enabledPlugins(): readonly ICodexClientPlugin[] {
		return this._merged().filter(p => p.parsed !== undefined && this._isEnabled(p.synced.customization.id));
	}

	/**
	 * Projects the store onto the AHP {@link PluginCustomization} surface, with
	 * the enablement overlay applied and each plugin's parsed children folded
	 * in (skills, MCP servers, agents, instructions, hooks).
	 */
	toCustomizations(): PluginCustomization[] {
		return this._merged().map(plugin => {
			const base = plugin.synced.customization;
			const children = plugin.parsed ? parsedPluginChildren(plugin.parsed) : base.children;
			return {
				...base,
				enabled: this._isEnabled(base.id),
				...(children ? { children } : {}),
			};
		});
	}
}

/** Collects every child customization a parsed plugin exposes, deduped by id. */
function parsedPluginChildren(parsed: IParsedPlugin): ChildCustomization[] {
	const byId = new Map<string, ChildCustomization>();
	const add = (c: ChildCustomization) => { if (!byId.has(c.id)) { byId.set(c.id, c); } };
	for (const a of parsed.agents) { add(a.customization); }
	for (const s of parsed.skills) { add(s.customization); }
	for (const r of parsed.instructions) { add(r.customization); }
	for (const h of parsed.hooks) { add(h.customization); }
	for (const m of parsed.mcpServers) { add(m.customization); }
	return [...byId.values()];
}

/**
 * Builds the `mcp_servers` object for `thread/start.config` from a set of
 * client plugins. Later servers do not overwrite earlier ones (first
 * definition of a given name wins), matching the dedupe used elsewhere.
 * Returns an empty object when the plugins declare no MCP servers.
 */
export function codexMcpServersFromPlugins(plugins: readonly ICodexClientPlugin[]): Record<string, ICodexMcpServerConfigJson> {
	const out: Record<string, ICodexMcpServerConfigJson> = {};
	for (const plugin of plugins) {
		for (const def of plugin.parsed?.mcpServers ?? emptyMcpDefs) {
			if (!Object.prototype.hasOwnProperty.call(out, def.name)) {
				out[def.name] = toCodexMcpServerJson(def.configuration);
			}
		}
	}
	return out;
}

const emptyMcpDefs: readonly IMcpServerDefinition[] = [];

/**
 * Derives the codex skill roots (absolute fsPaths) for a set of client
 * plugins: the parent directory of each skill's `<name>/SKILL.md`, i.e. the
 * plugin's `skills` root, which codex scans for `<name>/SKILL.md` entries.
 * De-duplicated and sorted for a stable `skills/extraRoots/set` payload.
 */
export function codexSkillRootsFromPlugins(plugins: readonly ICodexClientPlugin[]): string[] {
	const roots = new Set<string>();
	for (const plugin of plugins) {
		for (const skill of plugin.parsed?.skills ?? []) {
			// skill.uri === <pluginDir>/<skillsDir>/<name>/SKILL.md
			// dirname twice === <pluginDir>/<skillsDir> (the root codex scans).
			roots.add(dirname(dirname(skill.uri.fsPath)));
		}
	}
	return [...roots].sort();
}
