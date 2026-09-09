/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname } from '../../../../base/common/path.js';
import { basename, extUri, joinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { parseFrontMatter } from '../../../../base/common/yaml.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../common/agentHostFileSystemService.js';
import { IFileService } from '../../../files/common/files.js';
import { parseRuleFile, resolveAgentDisableModelInvocation, type IMcpServerDefinition, type IParsedAgent, type IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';
import type { ISyncedCustomization } from '../../common/agentPluginManager.js';
import { CustomizationEnablementKind, type AgentSelection } from '../../common/state/protocol/state.js';
import { CustomizationType, type ChildCustomization, type ClientPluginCustomization, type McpServerCustomization, type PluginCustomization } from '../../common/state/sessionState.js';
import { readClientPluginMcpDefaultCwd } from '../../common/meta/clientPluginCustomizationMeta.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { AGENT_HOST_FILE_LINK_INSTRUCTIONS } from '../shared/fileLinkInstructions.js';
import { toCodexMcpServerJson, type ICodexMcpServerConfigJson } from './codexMcpServers.js';

export const CODEX_FILE_LINK_INSTRUCTIONS = [
	AGENT_HOST_FILE_LINK_INSTRUCTIONS,
	'',
	'<file_link_path_format>',
	'- Use the actual filesystem path. Example prefixes such as `/path/to` or `/abs/path` are placeholders, not text to prepend to a path.',
	'- On Windows, drive-letter paths are already absolute: [foo.ts](C:/project/foo.ts). Do not add a leading `/` or prepend the working directory.',
	'- For UNC paths, preserve the server and share: [foo.ts](//server/share/foo.ts).',
	'</file_link_path_format>',
].join('\n');

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
	readonly input?: ClientPluginCustomization;
	readonly customization?: PluginCustomization;
}

export interface ICodexAgentRoleSource {
	readonly name: string;
	readonly description: string;
	readonly instructions: string;
	readonly model?: string;
}

export interface ICodexCustomizationConfig {
	readonly agentRoles: readonly ICodexAgentRoleSource[];
	readonly developerInstructions: string;
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

	setEnabled(id: string, enabled: boolean): boolean {
		const current = this._enablement.get(id) !== false;
		if (current === enabled) {
			return false;
		}
		this._enablement.set(id, enabled);
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

	private _isEnabled(plugin: ICodexClientPlugin): boolean {
		return this._enablement.get(plugin.synced.customization.id) ?? isCustomizationEnabled(plugin.customization ?? plugin.synced.customization);
	}

	/** Every client plugin, deduplicated by customization id. */
	plugins(): readonly ICodexClientPlugin[] {
		return this._merged();
	}

	isEnabled(plugin: ICodexClientPlugin): boolean {
		return this._isEnabled(plugin);
	}

	/** The merged plugins that are currently enabled and successfully parsed. */
	enabledPlugins(): readonly ICodexClientPlugin[] {
		return this._merged().filter(p => p.parsed !== undefined && this._isEnabled(p));
	}

	/**
	 * Projects the store onto the AHP {@link PluginCustomization} surface, with
	 * the enablement overlay applied and each plugin's parsed children folded
	 * in (skills, MCP servers, agents, instructions, hooks).
	 */
	toCustomizations(): PluginCustomization[] {
		return this._merged().map(plugin => {
			const base = plugin.customization ?? plugin.synced.customization;
			const children = base.children ?? (plugin.parsed ? parsedPluginChildren(plugin.parsed) : undefined);
			return {
				...base,
				...(this._enablement.has(base.id) ? { enablement: [{ kind: CustomizationEnablementKind.Session, enabled: this._enablement.get(base.id)! }] } : {}),
				...(children ? { children } : {}),
			};
		});
	}
}

/** Collects every child customization a parsed plugin exposes, deduped by id. */
export function parsedPluginChildren(parsed: IParsedPlugin): ChildCustomization[] {
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
export function codexMcpServersFromPlugins(plugins: readonly ICodexClientPlugin[], primaryCwd?: URI): Record<string, ICodexMcpServerConfigJson> {
	const out: Record<string, ICodexMcpServerConfigJson> = {};
	for (const plugin of plugins) {
		for (const def of plugin.parsed?.mcpServers ?? emptyMcpDefs) {
			const child = plugin.customization?.children?.find((candidate): candidate is McpServerCustomization => candidate.type === CustomizationType.McpServer && candidate.name === def.name);
			if (child && !isCustomizationEnabled(child)) {
				continue;
			}
			if (!Object.prototype.hasOwnProperty.call(out, def.name)) {
				const defaultCwd = readClientPluginMcpDefaultCwd(plugin.synced.customization, def.name, primaryCwd) ?? def.defaultCwd;
				out[def.name] = toCodexMcpServerJson(def.configuration, defaultCwd);
			}
		}
	}
	return out;
}

/** Maps each plugin-provided MCP server name to the URI of its owning plugin. */
export function codexPluginMcpServerSources(plugins: readonly ICodexClientPlugin[]): ReadonlyMap<string, string> {
	const sources = new Map<string, string>();
	for (const plugin of plugins) {
		for (const server of plugin.parsed?.mcpServers ?? emptyMcpDefs) {
			if (!sources.has(server.name)) {
				sources.set(server.name, plugin.synced.customization.uri);
			}
		}
	}
	return sources;
}

const emptyMcpDefs: readonly IMcpServerDefinition[] = [];

export function codexMcpServersFromDefinitions(definitions: readonly IMcpServerDefinition[]): Record<string, ICodexMcpServerConfigJson> {
	const out: Record<string, ICodexMcpServerConfigJson> = {};
	for (const definition of definitions) {
		if (!Object.hasOwn(out, definition.name)) {
			out[definition.name] = toCodexMcpServerJson(definition.configuration, definition.defaultCwd);
		}
	}
	return out;
}

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

/**
 * Builds Codex's launch-time roles and developer instructions. Workspace
 * agents are processed first so the session's own repository wins a role-name
 * collision with a global client plugin.
 */
export async function codexCustomizationConfig(
	workspaceAgents: readonly IParsedAgent[],
	plugins: readonly ICodexClientPlugin[],
	selectedAgent: AgentSelection | undefined,
	fileService: IFileService,
): Promise<ICodexCustomizationConfig> {
	const agentRoles = new Map<string, ICodexAgentRoleSource>();
	const pluginInstructions: string[] = [];
	let selectedAgentInstructions: string | undefined;
	let selectedAgentMatch = SelectedAgentMatch.None;
	const selectedAgentUri = selectedAgent?.uri;

	const addAgent = async (agent: IParsedAgent, match: SelectedAgentMatch): Promise<void> => {
		try {
			const content = (await fileService.readFile(agent.uri)).value.toString();
			const frontmatter = parseFrontMatter(content);
			const name = frontmatter?.getStringValue('name')?.trim() || agent.name;
			const description = frontmatter?.getStringValue('description')?.trim() || agent.description || name;
			const instructions = frontmatter?.body ?? content;
			const model = frontmatter?.getStringArrayValue('model')?.map(value => value.trim()).find(Boolean) || agent.model;
			const infer = frontmatter?.getBooleanValue('infer');
			const disableModelInvocation = resolveAgentDisableModelInvocation(infer, frontmatter?.getBooleanValue('disable-model-invocation'), agent.disableModelInvocation);
			if (!disableModelInvocation && !agentRoles.has(name)) {
				agentRoles.set(name, {
					name,
					description,
					instructions,
					...(model ? { model } : {}),
				});
			}
			if (match > selectedAgentMatch) {
				selectedAgentInstructions = instructions;
				selectedAgentMatch = match;
			}
		} catch { }
	};

	for (const agent of workspaceAgents) {
		const match = selectedAgentUri && extUri.isEqual(agent.uri, URI.parse(selectedAgentUri))
			? SelectedAgentMatch.Exact
			: SelectedAgentMatch.None;
		await addAgent(agent, match);
	}

	for (const plugin of plugins) {
		for (const agent of plugin.parsed?.agents ?? []) {
			const match = selectedAgentUri ? matchSelectedAgent(plugin, agent.uri, selectedAgentUri) : SelectedAgentMatch.None;
			await addAgent(agent, match);
		}

		for (const instruction of plugin.parsed?.instructions ?? []) {
			try {
				const rule = await parseRuleFile(instruction.uri, fileService);
				if (!isAlwaysOnRule(rule.globs, rule.alwaysApply)) {
					continue;
				}
				const content = (await fileService.readFile(instruction.uri)).value.toString();
				const frontmatter = parseFrontMatter(content);
				const body = frontmatter?.body ?? content;
				if (body.trim()) {
					pluginInstructions.push(body.trim());
				}
			} catch { }
		}
	}

	const developerInstructions = [
		...pluginInstructions,
		...(selectedAgentInstructions ? [selectedAgentInstructions.trim()] : []),
		CODEX_FILE_LINK_INSTRUCTIONS,
	].filter(Boolean).join('\n\n');

	return {
		agentRoles: [...agentRoles.values()],
		developerInstructions,
	};
}

function isAlwaysOnRule(globs: readonly string[] | undefined, alwaysApply: boolean | undefined): boolean {
	if (!globs?.length) {
		return alwaysApply !== false;
	}
	return globs.some(glob => glob.trim() === '**' || glob.trim() === '**/*');
}

const enum SelectedAgentMatch {
	None,
	SyntheticBundleSource,
	Exact,
}

function matchSelectedAgent(plugin: ICodexClientPlugin, agentUri: URI, selectedAgentUri: string): SelectedAgentMatch {
	const selectedUri = URI.parse(selectedAgentUri);
	if (extUri.isEqual(agentUri, selectedUri)) {
		return SelectedAgentMatch.Exact;
	}
	const pluginDir = plugin.synced.pluginDir;
	if (!pluginDir) {
		return SelectedAgentMatch.None;
	}
	const relativeAgentPath = relativePath(pluginDir, agentUri);
	if (relativeAgentPath === undefined) {
		return SelectedAgentMatch.None;
	}
	const sourcePluginUri = URI.parse(plugin.synced.customization.uri);
	const sourceAgentUri = relativeAgentPath ? joinPath(sourcePluginUri, relativeAgentPath) : sourcePluginUri;
	if (extUri.isEqual(sourceAgentUri, selectedUri)) {
		return SelectedAgentMatch.Exact;
	}

	// The workbench's synthetic bundle flattens loose custom agents into its
	// `agents/` directory, while the Agents window intentionally exposes each
	// agent's original workspace/user URI. The host cannot reconstruct that
	// original parent path, but the filename remains stable and is unique in
	// the flattened bundle. Keep this as a lower-priority fallback so an exact
	// match from another plugin always wins.
	if (sourcePluginUri.scheme === SYNCED_CUSTOMIZATION_SCHEME
		&& relativeAgentPath.startsWith('agents/')
		&& basename(agentUri) === basename(selectedUri)) {
		return SelectedAgentMatch.SyntheticBundleSource;
	}

	return SelectedAgentMatch.None;
}

export function codexAgentRoleToml(role: ICodexAgentRoleSource): string {
	return [
		`name = ${JSON.stringify(role.name)}`,
		`description = ${JSON.stringify(role.description)}`,
		`developer_instructions = ${JSON.stringify(role.instructions)}`,
		...(role.model ? [`model = ${JSON.stringify(role.model)}`] : []),
		'',
	].join('\n');
}

export function codexSkillCapabilityRoots(plugins: readonly ICodexClientPlugin[]): URI[] {
	return codexSkillRootsFromPlugins(plugins).map(path => URI.file(path));
}
