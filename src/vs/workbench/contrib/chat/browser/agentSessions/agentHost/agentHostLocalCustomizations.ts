/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { basename, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CustomizationEnablementKind, type AgentCustomization, CustomizationType, type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { customizationId, type ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService, isUserToggleableCustomization, matchesSessionType, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../../../../mcp/common/discovery/pluginMcpDiscovery.js';
import { extensionPrefixedIdentifier, IMcpService, McpCollectionDefinition, McpServerLaunch, McpServerTransportType } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IWorkspaceFolderData } from '../../../../../../platform/workspace/common/workspace.js';
import type { ISyncableFile, ISyncableMcpServer, SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';

const COPILOT_CHAT_EXTENSION_ID = 'github.copilot-chat';
export const COPILOT_CHAT_GITHUB_MCP_COLLECTION_ID = extensionPrefixedIdentifier(new ExtensionIdentifier(COPILOT_CHAT_EXTENSION_ID), 'github');
const LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX = 'agent-host-';
const AGENT_HOST_PROVIDERS_WITH_GITHUB_MCP = new Set(['copilotcli', 'claude', 'codex']);

export function agentHostProviderHasBuiltInGitHubMcpServer(provider: string): boolean {
	return AGENT_HOST_PROVIDERS_WITH_GITHUB_MCP.has(provider);
}

function hasBuiltInGitHubMcpServer(sessionType: string): boolean {
	const localProvider = sessionType.startsWith(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX)
		? sessionType.slice(LOCAL_AGENT_HOST_SESSION_TYPE_PREFIX.length)
		: undefined;
	return agentHostProviderHasBuiltInGitHubMcpServer(localProvider ?? '');
}

/**
 * Prompt types that participate in auto-sync to an agent host harness.
 *
 * Hooks are intentionally excluded — bundling hooks requires merging into
 * `hooks/hooks.json` (see {@link SyncedCustomizationBundler}).
 */
export const SYNCABLE_PROMPT_TYPES: readonly PromptsType[] = [
	PromptsType.agent,
	PromptsType.skill,
	PromptsType.instructions,
	PromptsType.prompt,
];

/**
 * Storage sources whose contents are auto-synced by default. Remote agent
 * registrations can additionally include user storage.
 *
 * `builtin` only yields skills bundled with the Agents app (e.g. `/create-pr`,
 * `/merge`); for every other prompt type the prompts service returns nothing,
 * and in the regular VS Code workbench window it returns nothing at all.
 */
export const SYNCABLE_STORAGE_SOURCES: readonly PromptsStorage[] = [
	PromptsStorage.plugin,
	PromptsStorage.extension,
	PromptsStorage.builtIn,
];

export interface ILocalCustomizationSyncOptions {
	readonly includeUserStorage?: boolean;
}

export interface ILocalCustomizationFile {
	readonly uri: URI;
	readonly type: PromptsType;
	readonly source: AICustomizationSource;
	readonly disabled: boolean;
	readonly pluginUri?: URI;
	readonly extensionId?: string;
}

/**
 * Enumerates all local customization files eligible for auto-sync to an
 * agent host harness, annotating each with whether the user has opted out.
 *
 * This is the single source of truth used by both the AI Customization view
 * (to render disable affordances) and the agent host wire (to compute the
 * `customizations` set published via `activeClientSet`).
 *
 * A file counts as opted out when the per-harness sync provider has it disabled,
 * or when the user disabled it in the Customizations UI
 * (`IPromptsService.getDisabledPromptFiles`) and that customization is one the
 * UI can re-enable ({@link isUserToggleableCustomization}). See "Enabling and
 * Disabling Built-in Skills" in `src/vs/sessions/AI_CUSTOMIZATIONS.md` for why
 * the second store is scoped rather than honoured for every prompt type.
 *
 * Built-in skills bundled with the Agents app (only present when the
 * sessions-aware prompts service is in play) are also enumerated so that
 * `/create-pr`, `/merge`, etc. are available to every agent host without
 * any per-provider plumbing. In the regular VS Code workbench window the
 * built-in lookup returns nothing and this is a no-op.
 */
export async function enumerateLocalCustomizationsForHarness(
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	sessionType: string,
	token: CancellationToken,
	options: ILocalCustomizationSyncOptions | undefined,
): Promise<readonly ILocalCustomizationFile[]> {
	const result: ILocalCustomizationFile[] = [];
	const seenUris = new ResourceSet();
	const storageSources = options?.includeUserStorage
		? [PromptsStorage.user, ...SYNCABLE_STORAGE_SOURCES]
		: SYNCABLE_STORAGE_SOURCES;
	for (const type of SYNCABLE_PROMPT_TYPES) {
		const userDisabled = promptsService.getDisabledPromptFiles(type);
		const lists = await Promise.all(
			storageSources.map(storage => promptsService.listPromptFilesForStorage(type, storage, token)),
		);
		for (let i = 0; i < lists.length; i++) {
			const source = storageSources[i];
			const honourUserDisabled = isUserToggleableCustomization(type, source);
			for (const file of lists[i]) {
				if (matchesSessionType(file.sessionTypes, sessionType) && !seenUris.has(file.uri)) {
					seenUris.add(file.uri);
					result.push({
						uri: file.uri,
						type,
						source,
						pluginUri: file.pluginUri,
						extensionId: file.extension?.identifier.value,
						disabled: syncProvider.isDisabled(file.uri)
							|| (honourUserDisabled && userDisabled.has(file.uri)),
					});
				}
			}
		}
	}

	return result;
}

/**
 * Resolves the selectable custom-agent metadata that the client has already
 * discovered and will publish to an agent host for `sessionType`.
 *
 * Client customization refs intentionally omit parsed children; the host adds
 * those later in `SessionState.customizations`. New Agents-window drafts need
 * the picker before that state exists, so this mirrors the same eligibility
 * rules used by {@link resolveCustomizationRefs} without waiting for the host
 * to parse the plugin or synthetic bundle.
 */
export async function resolveLocalCustomAgents(
	fileService: IFileService,
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	agentPluginService: IAgentPluginService,
	sessionType: string,
	options: ILocalCustomizationSyncOptions | undefined,
): Promise<readonly AgentCustomization[]> {
	const plugins = agentPluginService.plugins.get();
	const result: AgentCustomization[] = [];
	const parser = new PromptFileParser();
	const pending: Promise<void>[] = [];
	const enumerated = await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, sessionType, CancellationToken.None, options);

	for (const agent of enumerated) {
		if (agent.type !== PromptsType.agent || agent.disabled) {
			continue;
		}
		const plugin = agent.source === AICustomizationSources.plugin
			? plugins.find(candidate => isEqualOrParent(agent.uri, candidate.uri))
			: undefined;
		if (agent.source === AICustomizationSources.plugin && !plugin) {
			continue;
		}
		const pluginAgent = plugin?.agents.get().find(candidate => candidate.uri.toString() === agent.uri.toString());
		pending.push((async () => {
			let name = pluginAgent?.name ?? basename(agent.uri, '.agent.md');
			let description = pluginAgent?.description;
			let disableUserInvocation: boolean | undefined;
			try {
				const content = await fileService.readFile(agent.uri);
				const header = parser.parse(agent.uri, content.value.toString()).header;
				name = header?.name ?? name;
				description = header?.description ?? description;
				disableUserInvocation = header?.userInvocable === false || undefined;
			} catch {
				// The host will parse the full agent after session creation. Keep the
				// discovery metadata as a best-effort draft fallback if the file moved.
			}
			result.push({
				type: CustomizationType.Agent,
				id: agent.uri.toString(),
				uri: agent.uri.toString(),
				name,
				description,
				disableUserInvocation,
			});
		})());
	}
	await Promise.all(pending);
	result.sort((a, b) => a.name.localeCompare(b.name) || a.uri.toString().localeCompare(b.uri.toString()));
	return result;
}

/**
 * Converts an {@link McpServerLaunch} back into the declarative
 * {@link IMcpServerConfiguration} shape understood by the agent host's
 * Open Plugin `.mcp.json` reader. Returns `undefined` for launches that
 * cannot be expressed declaratively (e.g. extension-resolved servers with
 * no command or URL).
 */
function launchToMcpServerConfiguration(launch: McpServerLaunch): IMcpServerConfiguration | undefined {
	switch (launch.type) {
		case McpServerTransportType.Stdio:
			if (!launch.command) {
				return undefined;
			}
			return {
				type: McpServerType.LOCAL,
				command: launch.command,
				args: launch.args.length > 0 ? [...launch.args] : undefined,
				env: Object.keys(launch.env).length > 0 ? { ...launch.env } : undefined,
				envFile: launch.envFile,
				cwd: launch.cwd,
			};
		case McpServerTransportType.HTTP:
			return {
				type: McpServerType.REMOTE,
				url: launch.uri.toString(),
				headers: launch.headers.length > 0 ? Object.fromEntries(launch.headers) : undefined,
			};
	}
}

/**
 * Attempts to resolve every configuration variable (`${workspaceFolder}`,
 * `${env:…}`, …) in an MCP server config without any user interaction, using
 * {@link IConfigurationResolverService.resolveAsync}. Returns the resolved
 * config, or `undefined` when it cannot be fully resolved without prompting the
 * user.
 *
 * The synced `.mcp.json` is launched by the agent host verbatim, so any
 * variable the agent host can't itself expand must be resolved here up front.
 * Variables requiring interaction (`${input:…}`, `${command:…}`) or context we
 * don't have (e.g. `${workspaceFolder}` outside a folder) cause the server to
 * be skipped.
 */
async function resolveConfigurationForSync(
	configurationResolverService: IConfigurationResolverService,
	folder: IWorkspaceFolderData | undefined,
	configuration: IMcpServerConfiguration,
): Promise<IMcpServerConfiguration | undefined> {
	const expr = ConfigurationResolverExpression.parse(configuration);

	// Interactive variables (`${input:…}`, `${command:…}`) can only be resolved
	// by prompting the user, so a server referencing them is skipped. This is
	// checked up front because `resolveAsync` "resolves" them to their own
	// literal text when no value mapping is supplied, which would otherwise
	// leave them out of `unresolved()` below.
	for (const replacement of expr.unresolved()) {
		if (replacement.name === 'input' || replacement.name === 'command') {
			return undefined;
		}
	}

	try {
		// Resolves everything that can be resolved without interaction; throws
		// when a variable requires context we don't have (e.g. no folder).
		await configurationResolverService.resolveAsync(folder, expr);
	} catch {
		return undefined;
	}

	// Any replacement left unresolved would require user interaction.
	if (!Iterable.isEmpty(expr.unresolved())) {
		return undefined;
	}

	return expr.toObject();
}

/**
 * Enumerates MCP servers configured directly in VS Code — i.e. those that
 * are not contributed by an agent plugin — so they can be bundled into the
 * synthetic synced plugin. Plugin-sourced servers are excluded because they
 * are already synced via their owning plugin's customization ref. Servers whose
 * launch cannot be expressed declaratively are skipped.
 *
 * Workspace-discovered servers are also excluded by default: the agent host
 * discovers workspace `.mcp.json` itself, so syncing them would duplicate. The
 * exception is `.vscode/mcp.json`, which the agent host does not discover
 * (despite what the SDK's `enableConfigDiscovery` docs imply) — those are
 * synced, but only when their config can be resolved without requiring user
 * interaction. For agent-host providers with their own GitHub MCP server, the
 * Copilot Chat extension's duplicate provider is excluded.
 */
export async function collectNonPluginMcpServers(mcpService: IMcpService, configurationResolverService: IConfigurationResolverService, sessionType: string, workingDirectories: readonly URI[]): Promise<ISyncableMcpServer[]> {
	const result: ISyncableMcpServer[] = [];
	for (const server of mcpService.servers.get()) {
		if (server.collection.id.startsWith(MCP_PLUGIN_COLLECTION_ID_PREFIX)) {
			continue;
		}
		const definitions = server.readDefinitions().get();
		const definition = definitions.server;
		const launch = definition?.launch;
		if (!launch) {
			continue;
		}
		const collection = definitions.collection;
		if (hasBuiltInGitHubMcpServer(sessionType)
			&& collection?.id === COPILOT_CHAT_GITHUB_MCP_COLLECTION_ID
			&& collection.source instanceof ExtensionIdentifier
			&& ExtensionIdentifier.equals(collection.source, COPILOT_CHAT_EXTENSION_ID)) {
			continue;
		}
		let configuration = launchToMcpServerConfiguration(launch);
		if (!configuration) {
			continue;
		}
		if (collection && McpCollectionDefinition.isWorkspaceDiscovered(collection)) {
			if (McpCollectionDefinition.isVscodeMcpJson(collection)) {
				const origin = collection.presentation?.origin;
				if (!origin || !workingDirectories.some(workingDirectory => isEqualOrParent(origin, workingDirectory))) {
					continue;
				}
				const resolved = await resolveConfigurationForSync(configurationResolverService, definition.variableReplacement?.folder, configuration);
				if (!resolved) {
					continue;
				}
				configuration = resolved;
			} else {
				continue;
			}
		}
		result.push({
			name: server.definition.label,
			configuration,
			...(definition.defaultCwd && { defaultCwd: definition.defaultCwd }),
			enablement: withCustomizationEnablement(undefined, CustomizationEnablementKind.Global, {
				kind: CustomizationEnablementKind.Global,
				enabled: mcpService.enablementModel.readProfileEnabled(server.definition.id),
			}),
		});
	}
	return result;
}

/**
 * Resolves the customization refs to include in an `activeClientSet`
 * message.
 *
 * Every eligible local file is synced unless the user opted out. Files
 * belonging to installed plugins are de-duped to a single plugin ref;
 * remaining loose files — together with MCP servers configured directly in
 * VS Code — are bundled into a synthetic Open Plugin.
 */
export async function resolveCustomizationRefs(
	fileService: IFileService,
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	agentPluginService: IAgentPluginService,
	mcpService: IMcpService,
	configurationResolverService: IConfigurationResolverService,
	bundler: SyncedCustomizationBundler,
	sessionType: string,
	options: ILocalCustomizationSyncOptions | undefined,
	workingDirectories: readonly URI[] = [],
): Promise<ClientPluginCustomization[]> {
	const enumerated = await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, sessionType, CancellationToken.None, options);
	const enabled = enumerated.filter(e => !e.disabled);

	const plugins = agentPluginService.plugins.get();
	const pluginRefs = new Map<string, Promise<ClientPluginCustomization>>();
	const looseFiles: ISyncableFile[] = [];

	const addPluginRef = (plugin: IAgentPlugin) => {
		const key = plugin.uri.toString();
		if (!pluginRefs.has(key)) {
			const promise = (async (): Promise<ClientPluginCustomization> => {
				let nonce: number | undefined;
				try {
					nonce = (await fileService.stat(plugin.uri)).mtime;
				} catch {
					// ignored, sync will probably fail later though...
				}

				const ref: ClientPluginCustomization = {
					type: CustomizationType.Plugin,
					id: customizationId(key),
					uri: key as ProtocolURI,
					name: plugin.label,
					enablement: withCustomizationEnablement(undefined, CustomizationEnablementKind.Global, {
						kind: CustomizationEnablementKind.Global,
						enabled: agentPluginService.enablementModel.readProfileEnabled(key),
					}),
				};
				if (nonce !== undefined) {
					ref.nonce = nonce.toString(16);
				}
				return ref;
			})();
			pluginRefs.set(key, promise);
		}
	};

	for (const entry of enabled) {
		if (entry.source === AICustomizationSources.plugin) {
			const plugin = plugins.find(p => isEqualOrParent(entry.uri, p.uri));
			if (!plugin) {
				continue;
			}
			addPluginRef(plugin);
		} else {
			looseFiles.push({ uri: entry.uri, type: entry.type, source: entry.source, extensionId: entry.extensionId, pluginUri: entry.pluginUri });
		}
	}

	// Plugin prompt discovery is not guaranteed to be hydrated before an agent
	// host registration resolves (notably in the Agents window). Include every
	// enabled plugin with a concrete contribution directly; `pluginRefs`
	// de-duplicates those already found through prompt-file enumeration.
	for (const plugin of plugins) {
		if (pluginRefs.has(plugin.uri.toString())) {
			continue;
		}
		if (plugin.hooks.get().length === 0
			&& plugin.commands.get().length === 0
			&& plugin.skills.get().length === 0
			&& plugin.agents.get().length === 0
			&& plugin.instructions.get().length === 0
			&& plugin.mcpServerDefinitions.get().length === 0) {
			continue;
		}
		addPluginRef(plugin);
	}

	const refs: Promise<ClientPluginCustomization | undefined>[] = [...pluginRefs.values()];
	const mcpServers = await collectNonPluginMcpServers(mcpService, configurationResolverService, sessionType, workingDirectories);
	if (looseFiles.length > 0 || mcpServers.length > 0) {
		refs.push(bundler.bundle(looseFiles, mcpServers).then(r => r?.ref));
	}
	return await Promise.all(refs).then(r => r.filter(isDefined));
}
