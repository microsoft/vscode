/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../files/common/files.js';
import { ILogService } from '../../../../log/common/log.js';
import { makeMcpServerCustomization, parseAgentFile, toParsedAgent, type IParsedAgent, type IParsedRule, type IParsedSkill } from '../../../../agentPlugins/common/pluginParsers.js';
import { CustomizationType, type AgentSelection, type McpServerCustomization } from '../../../common/state/protocol/channels-session/state.js';
import { CustomizationLoadStatus, customizationId, type AgentCustomization, type ChildCustomization, type Customization, type DirectoryCustomization, type HookCustomization, type PluginCustomization, type RuleCustomization, type SkillCustomization } from '../../../common/state/sessionState.js';
import type { ISdkResolvedCustomizations } from '../claudeSdkPipeline.js';
import { deriveMcpState } from './scan/claudeMcpScan.js';
import { claudeMemoryFiles } from './scan/claudeRuleScan.js';
import type { IResolvedNativePlugin } from './scan/claudeNativePluginScan.js';
import { CLAUDE_BUILTIN_AGENTS, buildClaudeBuiltinSkillsContainer, buildSdkBuiltinSkillsContainer } from './claudeBuiltinCommands.js';

/**
 * The Claude SDK's built-in default agent. Hidden from the picker:
 * selecting it would be equivalent to "no selection" since the SDK
 * uses it as the fallback when `Options.agent` is omitted.
 */
export const CLAUDE_SDK_DEFAULT_AGENT_NAME = 'general-purpose';

/**
 * Scheme for synthetic, non-openable URIs that mark SDK-only customizations
 * the disk scan couldn't locate (Decision D2). It has no file provider, so
 * the workbench renders such entries read-only. The writer ({@link nonEditableUri})
 * and reader ({@link resolveClaudeAgentName}) share this constant so the two
 * never drift.
 */
const CLAUDE_INTERNAL_SCHEME = 'claude-internal';

function makeDirectory(base: URI, sub: string, contents: CustomizationType.Agent | CustomizationType.Skill | CustomizationType.Rule | CustomizationType.Hook, children: readonly (AgentCustomization | SkillCustomization | RuleCustomization | HookCustomization)[]): DirectoryCustomization {
	const uri = URI.joinPath(base, '.claude', sub).toString();
	return {
		type: CustomizationType.Directory,
		id: customizationId(uri),
		uri,
		name: sub,
		enabled: true,
		contents,
		writable: true,
		load: { kind: CustomizationLoadStatus.Loaded },
		children: [...children],
	};
}

/**
 * Projects a resolved Claude-native plugin into a top-level
 * {@link PluginCustomization} (its own protocol container type — *not* a
 * per-scope {@link DirectoryCustomization}, mirroring how MCP servers are
 * top-level). The container `uri` is the real plugin root directory; its
 * `name` is the `enabledPlugins` id (the manifest carries no display name
 * through {@link IResolvedNativePlugin}). Children are the plugin's bundled
 * components, deduped by id (a plugin's hooks share one settings-file
 * customization, so the groups would otherwise repeat).
 */
function makePlugin(plugin: IResolvedNativePlugin): PluginCustomization {
	const uri = plugin.root.toString();
	const children: ChildCustomization[] = [];
	const seen = new Set<string>();
	const push = (child: ChildCustomization) => {
		if (!seen.has(child.id)) {
			seen.add(child.id);
			children.push(child);
		}
	};
	for (const agent of plugin.parsed.agents) { push(agent.customization); }
	for (const skill of plugin.parsed.skills) { push(skill.customization); }
	for (const rule of plugin.parsed.instructions) { push(rule.customization); }
	for (const hook of plugin.parsed.hooks) { push(hook.customization); }
	for (const mcp of plugin.parsed.mcpServers) { push(mcp.customization); }
	return {
		type: CustomizationType.Plugin,
		id: customizationId(uri),
		uri,
		name: plugin.id,
		enabled: true,
		load: { kind: CustomizationLoadStatus.Loaded },
		children,
	};
}

/**
 * The scope a discovered customization belongs to, derived from which
 * `.claude/` tree contains its source file.
 */
const enum ClaudeCustomizationScope {
	Workspace = 'workspace',
	User = 'user',
}

/**
 * Attributes a discovered file to the scope whose `.claude/` directory
 * contains it. SDK-only (`claude-internal:`) and any out-of-tree URIs fall
 * back to the user scope. Drives per-scope grouping so the workbench can
 * label containers "Workspace" vs "User".
 */
function scopeOf(uri: URI, workingDirectory: URI | undefined): ClaudeCustomizationScope {
	return workingDirectory && uri.scheme === workingDirectory.scheme && isEqualOrParent(uri, workingDirectory)
		? ClaudeCustomizationScope.Workspace
		: ClaudeCustomizationScope.User;
}

/**
 * Maps the disk-discovered customizations into the protocol
 * {@link Customization} surface. Agents, skills and rules are wrapped in
 * {@link DirectoryCustomization} containers (the protocol's `Customization`
 * union has no bare agent/skill/rule member), one container per (scope, kind):
 * the container `uri` is the real `<scope>/.claude/<sub>` directory so the
 * workbench derives the "Workspace" vs "User" label from it (mirroring
 * CopilotAgent). Each child carries its real source-file `uri` so the
 * workbench can open it for editing. MCP servers are top-level entries.
 */
export function mapDiscoveredCustomizations(
	discovered: readonly (IParsedAgent | IParsedSkill | IParsedRule)[],
	mcpServers: readonly McpServerCustomization[],
	hooks: readonly HookCustomization[],
	nativePlugins: readonly IResolvedNativePlugin[],
	workingDirectory: URI | undefined,
	userHome: URI,
): readonly Customization[] {
	const buckets = new Map<ClaudeCustomizationScope, { agents: AgentCustomization[]; skills: SkillCustomization[]; rules: RuleCustomization[]; hooks: HookCustomization[] }>([
		[ClaudeCustomizationScope.Workspace, { agents: [], skills: [], rules: [], hooks: [] }],
		[ClaudeCustomizationScope.User, { agents: [], skills: [], rules: [], hooks: [] }],
	]);
	for (const d of discovered) {
		const bucket = buckets.get(scopeOf(d.uri, workingDirectory))!;
		if (d.customization.type === CustomizationType.Agent) {
			bucket.agents.push(d.customization);
		} else if (d.customization.type === CustomizationType.Skill) {
			bucket.skills.push(d.customization);
		} else {
			bucket.rules.push(d.customization);
		}
	}
	// Hooks arrive already projected (one per declaring settings file); they
	// carry no `IParsed*` wrapper, so attribute them to scope via their source
	// settings-file uri.
	for (const hook of hooks) {
		buckets.get(scopeOf(URI.parse(hook.uri), workingDirectory))!.hooks.push(hook);
	}

	const result: Customization[] = [];
	// Workspace containers first (precedence), then user. `base` is the scope
	// root the container `.claude/<sub>` uri is built from.
	const orderedScopes: readonly (readonly [ClaudeCustomizationScope, URI | undefined])[] = [
		[ClaudeCustomizationScope.Workspace, workingDirectory],
		[ClaudeCustomizationScope.User, userHome],
	];
	for (const [scope, base] of orderedScopes) {
		if (!base) {
			continue;
		}
		const bucket = buckets.get(scope)!;
		if (bucket.agents.length > 0) {
			result.push(makeDirectory(base, 'agents', CustomizationType.Agent, bucket.agents));
		}
		if (bucket.skills.length > 0) {
			result.push(makeDirectory(base, 'skills', CustomizationType.Skill, bucket.skills));
		}
		if (bucket.rules.length > 0) {
			result.push(makeDirectory(base, 'rules', CustomizationType.Rule, bucket.rules));
		}
		if (bucket.hooks.length > 0) {
			result.push(makeDirectory(base, 'hooks', CustomizationType.Hook, bucket.hooks));
		}
	}

	// Native plugins are top-level entries (like MCP servers), each carrying
	// its bundled components as children.
	for (const plugin of nativePlugins) {
		result.push(makePlugin(plugin));
	}

	result.push(...mcpServers);
	return result;
}

/**
 * A synthetic, non-openable URI that marks an SDK-only customization the
 * disk scan couldn't locate. The `claude-internal:` scheme has no file
 * provider, so the workbench renders the entry read-only (Decision D2).
 */
function nonEditableUri(kind: string, name: string): URI {
	return URI.from({ scheme: CLAUDE_INTERNAL_SCHEME, path: `/${kind}/${encodeURIComponent(name)}` });
}

/**
 * Resolves an {@link AgentSelection} URI to the SDK agent name the SDK
 * expects on `Options.agent`. {@link AgentSelection} carries only a `uri`,
 * so the name is recovered from the source:
 *
 * - A `claude-internal:` URI — an SDK-only agent the disk scan couldn't
 *   locate (Decision D2); the name is the path segment encoded by
 *   {@link nonEditableUri} (this is its inverse).
 * - A real `file:` agent — the SDK keys agents by their frontmatter
 *   `name`, which may differ from the filename, so it is parsed (falling
 *   back to the basename when the file can't be read).
 *
 * Returns `undefined` when no agent is selected (or the name can't be
 * recovered) so the SDK falls back to its default (no `--agent` flag).
 */
export async function resolveClaudeAgentName(
	agent: AgentSelection | undefined,
	fileService: IFileService,
	logService: ILogService,
	sessionId: string,
): Promise<string | undefined> {
	if (!agent) {
		return undefined;
	}
	const uri = URI.parse(agent.uri);

	// SDK-only (non-editable) agents encode the name in the path:
	// `claude-internal:/agent/<encoded-name>` (inverse of nonEditableUri).
	if (uri.scheme === CLAUDE_INTERNAL_SCHEME) {
		const last = uri.path.split('/').pop() ?? '';
		const name = last ? decodeURIComponent(last) : '';
		if (!name) {
			logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: could not extract agent name from URI '${agent.uri}'`);
			return undefined;
		}
		return name;
	}

	// Real on-disk agent: the SDK identifies it by its frontmatter `name`,
	// which the filename need not match.
	try {
		const parsed = await parseAgentFile(uri, fileService);
		if (parsed.name) {
			return parsed.name;
		}
	} catch (err) {
		logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: failed to parse agent file '${agent.uri}', falling back to basename`, err);
	}

	const basename = uri.path.split('/').pop() ?? '';
	const name = basename.replace(/\.md$/i, '');
	if (!name) {
		logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: could not extract agent name from URI '${agent.uri}'`);
		return undefined;
	}
	return name;
}

/**
 * Builds the discovered-customization projection for a session, applying
 * the live SDK snapshot as a post-materialize filter.
 *
 * - `sdk === undefined` (provisional): the full disk-discovered set is
 *   returned unfiltered — no live session yet to say what's active.
 * - `sdk` present (materialized): disk entries are kept only when the live
 *   session knows them (matched by name, per type — agents against the SDK
 *   agent set; skills against the SDK command set; MCP against the SDK
 *   server set, enriched with live state). SDK-known AGENTS and MCP servers
 *   with no matching disk file are surfaced as NON-EDITABLE entries
 *   (`claude-internal:` — Decision D2): a non-editable agent is still
 *   selectable and a non-editable MCP server still shows status. SDK-only
 *   SKILLS (Claude's built-in slash commands like `/init`) are NOT mixed in
 *   among the editable disk skills — instead they appear, read-only, in the
 *   separate "Built-in" skills container this function appends. The SDK's
 *   built-in default agent is hidden. Rules (CLAUDE.md + `.claude/rules`)
 *   have no SDK counterpart and are always kept.
 *
 * The "Built-in" surfacing for BOTH agents and skills is decided here (the
 * single place that has the disk set and the optional `sdk` snapshot): built-in
 * agents merge into the agent set (selectable, `claude-internal:`); built-in
 * skills are a separate read-only container appended to the result.
 */
export function buildDiscoveredCustomizations(
	discovered: readonly (IParsedAgent | IParsedSkill | IParsedRule)[],
	mcpServers: readonly McpServerCustomization[],
	hooks: readonly HookCustomization[],
	nativePlugins: readonly IResolvedNativePlugin[],
	workingDirectory: URI | undefined,
	userHome: URI,
	sdk: ISdkResolvedCustomizations | undefined,
): readonly Customization[] {
	// Native plugins the live session actually loaded → surfaced as top-level
	// containers (passed to the mapper at the end). The SDK `init.plugins`
	// reports each loaded plugin's `source` (its `<plugin>@<marketplace>` id)
	// and a `path`. Match on `source` against the resolved plugin id first — it
	// is exact and stable — and fall back to a normalized `path` match (older
	// SDKs without `source`). The `path` alone is unreliable: for a
	// workspace-`local`-scoped plugin the SDK can report a non-cache path that
	// never matches the resolved root. The plugin is the atomic filtering unit.
	//
	// A plugin's bundled components are ALSO reported by the live SDK as
	// agents / commands / MCP servers. Collect each surfaced plugin's own
	// parsed component names so those SDK entries are suppressed from the
	// standalone fallbacks below — each component then appears once, under its
	// plugin container, not also loose in the per-scope lists (Decision PB-10).
	// The SDK names plugin components inconsistently (agents namespaced as
	// `<plugin>:<name>`, skills usually bare), so both forms are registered.
	// Only *surfaced* plugins contribute, so a loaded-but-unsurfaced plugin's
	// components are never silently dropped. A single pass matches each native
	// plugin to its SDK entry, building the visible set and the suppression
	// name sets together (no second `find`).
	const visiblePlugins: IResolvedNativePlugin[] = [];
	const pluginAgentNames = new Set<string>();
	const pluginSkillNames = new Set<string>();
	const pluginMcpNames = new Set<string>();
	if (sdk) {
		for (const p of nativePlugins) {
			const sdkPlugin = sdk.plugins.find(s => s.source === p.id || URI.file(s.path).fsPath === p.root.fsPath);
			if (!sdkPlugin) {
				continue;
			}
			visiblePlugins.push(p);
			const ns = sdkPlugin.name;
			const add = (set: Set<string>, name: string) => { set.add(name); if (ns) { set.add(`${ns}:${name}`); } };
			for (const a of p.parsed.agents) { add(pluginAgentNames, a.name); }
			for (const s of p.parsed.skills) { add(pluginSkillNames, s.name); }
			for (const m of p.parsed.mcpServers) { add(pluginMcpNames, m.name); }
		}
	} else {
		visiblePlugins.push(...nativePlugins);
	}

	// The read-only "Built-in" skills container: pre-materialize the curated
	// list, post-materialize the live SDK command set minus the disk skills
	// (and minus plugin-contributed skills, which belong to a plugin container).
	// Appended to whichever projection is returned below so the SDK-vs-curated
	// decision for built-in skills sits next to the one for built-in agents.
	const diskSkillNames = new Set(
		discovered.filter(d => d.customization.type === CustomizationType.Skill).map(d => d.name)
	);
	const builtinSkills = sdk
		? buildSdkBuiltinSkillsContainer(sdk.commands.filter(c => !pluginSkillNames.has(c.name)), diskSkillNames)
		: buildClaudeBuiltinSkillsContainer(diskSkillNames);
	const withBuiltinSkills = (list: readonly Customization[]): readonly Customization[] =>
		builtinSkills ? [...list, builtinSkills] : list;

	if (!sdk) {
		// Pre-materialize there is no live agent set, so seed the curated
		// built-in agents alongside the disk agents. They use the same
		// non-editable `claude-internal:` shape the SDK fallback produces
		// post-materialize (selectable, name round-trips), so the same agent
		// looks identical before and after materialize. A disk agent of the
		// same name wins; the SDK default agent is hidden.
		const diskAgentNames = new Set(
			discovered.filter(d => d.customization.type === CustomizationType.Agent).map(d => d.name)
		);
		const builtinAgents = CLAUDE_BUILTIN_AGENTS
			.filter(a => a.name !== CLAUDE_SDK_DEFAULT_AGENT_NAME && !diskAgentNames.has(a.name))
			.map(a => toParsedAgent({ uri: nonEditableUri('agent', a.name), name: a.name, description: a.description() }));
		return withBuiltinSkills(mapDiscoveredCustomizations([...discovered, ...builtinAgents], mcpServers, hooks, nativePlugins, workingDirectory, userHome));
	}

	const agentNames = new Set(sdk.agents.map(a => a.name));
	const commandNames = new Set(sdk.commands.map(c => c.name));
	const mcpByName = new Map(sdk.mcpServers.map(s => [s.name, s] as const));

	// Keep disk entries the live session actually loaded. A loaded skill
	// surfaces in the SDK's `supportedCommands()` set, so disk skills are
	// matched against `commandNames`.
	const seenAgents = new Set<string>();
	const entries: (IParsedAgent | IParsedSkill | IParsedRule)[] = [];
	for (const d of discovered) {
		if (d.customization.type === CustomizationType.Agent) {
			// Hide the SDK's built-in default agent even when a same-named
			// file exists on disk — selecting it is equivalent to "no
			// selection", so it must never reach the picker post-materialize.
			if (d.name === CLAUDE_SDK_DEFAULT_AGENT_NAME) {
				continue;
			}
			if (agentNames.has(d.name)) {
				entries.push(d);
				seenAgents.add(d.name);
			}
		} else if (d.customization.type === CustomizationType.Skill) {
			if (commandNames.has(d.name)) {
				entries.push(d);
			}
		} else {
			// Rules (CLAUDE.md + `.claude/rules`) have no SDK counterpart, so
			// they are never filtered — always keep them.
			entries.push(d);
		}
	}

	// SDK-known-but-not-on-disk AGENTS → non-editable fallback (Decision D2):
	// still selectable as the session agent even without an editable file.
	// (Skills get no such fallback — see the doc comment: a non-openable
	// skill entry is only ever a dead link.)
	for (const agent of sdk.agents) {
		if (agent.name === CLAUDE_SDK_DEFAULT_AGENT_NAME || seenAgents.has(agent.name) || pluginAgentNames.has(agent.name)) {
			continue;
		}
		entries.push(toParsedAgent({ uri: nonEditableUri('agent', agent.name), name: agent.name, ...(agent.description ? { description: agent.description } : {}) }));
	}

	// MCP: keep disk servers the SDK loaded (enriched with live state); add
	// SDK-only servers as non-editable entries (status is still informative).
	const seenMcp = new Set<string>();
	const servers: McpServerCustomization[] = [];
	for (const server of mcpServers) {
		const sdkServer = mcpByName.get(server.name);
		if (!sdkServer) {
			continue;
		}
		seenMcp.add(server.name);
		servers.push({ ...server, state: deriveMcpState(sdkServer.status) });
	}
	for (const [name, sdkServer] of mcpByName) {
		if (seenMcp.has(name) || pluginMcpNames.has(name)) {
			continue;
		}
		servers.push({ ...makeMcpServerCustomization(nonEditableUri('mcp', name), name), state: deriveMcpState(sdkServer.status) });
	}

	// Native plugins were matched to the live SDK set at the top of this
	// function (`visiblePlugins`); surface them as top-level containers.
	return withBuiltinSkills(mapDiscoveredCustomizations(entries, servers, hooks, visiblePlugins, workingDirectory, userHome));
}

/**
 * The customization-source subpaths under a `.claude` directory. Only edits
 * to these should force a re-scan. Everything else under `.claude` is Claude
 * SDK runtime churn — `history.jsonl`, `projects/` (per-message transcripts),
 * `tasks/`, `file-history/`, `sessions/`, `shell-snapshots/`, `backups/`,
 * `session-env/`, `statsig`, and assorted `*-cache.json` files — all of which
 * the SDK rewrites constantly during a turn. Triggering on those produced a
 * storm of `SessionCustomizationsChanged` envelopes (thousands per session),
 * so the watcher deliberately triggers on this allowlist only.
 */
const CLAUDE_CUSTOMIZATION_SUBPATHS: readonly string[] = Object.freeze([
	'agents',
	'skills',
	'commands',
	'rules',
	'plugins',
	'CLAUDE.md',
	'settings.json',
	'settings.local.json',
]);

/**
 * Watches a session's on-disk Claude customization sources and fires
 * {@link onDidChange} (debounced) whenever any of them is created, edited,
 * or removed, so the workbench re-fetches `getSessionCustomizations`.
 *
 * Watched roots:
 *  - `<cwd>/.claude` and `<userHome>/.claude` (recursive) — cover the
 *    agents / skills / commands trees, the `.claude/rules` + `.claude/CLAUDE.md`
 *    instruction sources, plus the inline `settings.json` MCP config.
 *  - `<cwd>` (non-recursive) — watched to catch the sibling `.mcp.json` and
 *    the root `CLAUDE.md` / `CLAUDE.local.md` memory files.
 *
 * The recursive `.claude` watches keep OS-level watcher count low, but the
 * change *triggers* are narrowed to {@link CLAUDE_CUSTOMIZATION_SUBPATHS} (and
 * the specific memory / `.mcp.json` files) so the SDK's high-frequency runtime
 * writes elsewhere under `.claude` (and unrelated edits in the workspace root)
 * don't force a re-scan.
 */
export class ClaudeCustomizationWatcher extends Disposable {

	private static readonly DEBOUNCE_MS = 300;

	readonly onDidChange: Event<void>;

	constructor(
		workingDirectory: URI | undefined,
		userHome: URI,
		fileService: IFileService,
		logService: ILogService,
		debounceMs: number = ClaudeCustomizationWatcher.DEBOUNCE_MS,
	) {
		super();

		// URIs whose subtree (or exact file, for `.mcp.json`) signals a re-scan.
		const triggers: URI[] = [];
		const watch = (uri: URI, recursive: boolean) => {
			try {
				this._register(fileService.watch(uri, { recursive, excludes: [] }));
			} catch (err) {
				logService.warn(`[ClaudeCustomizationWatcher] failed to watch '${uri.toString()}': ${err instanceof Error ? err.message : String(err)}`);
			}
		};

		// Trigger only on the customization sources under a `.claude` root, not
		// on the root itself — that would fire on every SDK runtime write (see
		// CLAUDE_CUSTOMIZATION_SUBPATHS).
		const addClaudeTriggers = (base: URI) => {
			for (const sub of CLAUDE_CUSTOMIZATION_SUBPATHS) {
				triggers.push(URI.joinPath(base, sub));
			}
		};

		if (workingDirectory) {
			const projectClaude = URI.joinPath(workingDirectory, '.claude');
			watch(projectClaude, true);
			addClaudeTriggers(projectClaude);
			watch(workingDirectory, false);
			triggers.push(URI.joinPath(workingDirectory, '.mcp.json'));
		}
		const userClaude = URI.joinPath(userHome, '.claude');
		watch(userClaude, true);
		addClaudeTriggers(userClaude);

		// Memory files (CLAUDE.md / CLAUDE.local.md) — reuse the scanner's
		// canonical list so the watcher never drifts from what it actually
		// reads. Entries already under a recursively-watched `.claude` root
		// (e.g. `.claude/CLAUDE.md`) are harmless duplicate triggers.
		triggers.push(...claudeMemoryFiles(workingDirectory, userHome));

		// Collapse the raw file-change stream into a single debounced signal.
		// The `DisposableStore` argument is required because `onDidChange` is a
		// public property (see the `Event.debounce` leak-safety note).
		this.onDidChange = Event.signal(Event.debounce(
			Event.filter(fileService.onDidFilesChange, e => triggers.some(t => e.affects(t)), this._store),
			(_last, e) => e,
			debounceMs,
			undefined,
			undefined,
			undefined,
			this._store,
		));
	}
}
