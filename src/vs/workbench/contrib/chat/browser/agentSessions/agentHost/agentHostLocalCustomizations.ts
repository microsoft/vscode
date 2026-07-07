/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CustomizationType, type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { customizationId, type ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { AICustomizationSource, AICustomizationSources, BUILTIN_STORAGE } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptPath, IPromptsService, matchesSessionType, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../../../common/enablement.js';
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from '../../../../mcp/common/discovery/pluginMcpDiscovery.js';
import { IMcpService, McpCollectionDefinition, McpServerLaunch, McpServerTransportType } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IWorkspaceFolderData } from '../../../../../../platform/workspace/common/workspace.js';
import type { ISyncableMcpServer, SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { isDefined } from '../../../../../../base/common/types.js';

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
 * Storage sources whose contents are auto-synced. Extension and built-in
 * customizations are included so the agent host has the same skills,
 * instructions, and agents available as the local VS Code client.
 */
export const SYNCABLE_STORAGE_SOURCES: readonly PromptsStorage[] = [
	PromptsStorage.plugin,
	PromptsStorage.extension
];

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
): Promise<readonly ILocalCustomizationFile[]> {
	const result: ILocalCustomizationFile[] = [];
	for (const type of SYNCABLE_PROMPT_TYPES) {
		const lists = await Promise.all(
			SYNCABLE_STORAGE_SOURCES.map(storage => promptsService.listPromptFilesForStorage(type, storage, token)),
		);
		for (let i = 0; i < lists.length; i++) {
			const source = SYNCABLE_STORAGE_SOURCES[i];
			for (const file of lists[i]) {
				if (matchesSessionType(file.sessionTypes, sessionType)) {
					result.push({
						uri: file.uri,
						type,
						source,
						pluginUri: file.pluginUri,
						extensionId: file.extension?.identifier.value,
						disabled: syncProvider.isDisabled(file.uri),
					});
				}
			}
		}
	}

	// Built-in skills (e.g. `/create-pr`, `/merge`) are exposed via
	// `BUILTIN_STORAGE`, which is not a member of the core `PromptsStorage`
	// enum. The sessions-aware prompts service supports this extra storage,
	// but the regular workbench prompts service throws on unknown storage
	// values; treat that case as "no built-in skills available" so
	// enumeration remains a no-op outside Sessions.
	let builtinSkills: readonly IPromptPath[] = [];
	try {
		builtinSkills = await promptsService.listPromptFilesForStorage(
			PromptsType.skill,
			BUILTIN_STORAGE as unknown as PromptsStorage,
			token,
		);
	} catch {
		builtinSkills = [];
	}
	for (const file of builtinSkills) {
		if (matchesSessionType(file.sessionTypes, sessionType)) {
			result.push({
				uri: file.uri,
				type: PromptsType.skill,
				source: BUILTIN_STORAGE,
				disabled: syncProvider.isDisabled(file.uri),
			});
		}
	}

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
 * are already synced via their owning plugin's customization ref. Disabled
 * servers and servers whose launch cannot be expressed declaratively are
 * skipped.
 *
 * Workspace-discovered servers are also excluded by default: the agent host
 * discovers workspace `.mcp.json` itself, so syncing them would duplicate. The
 * exception is `.vscode/mcp.json`, which the agent host does not discover
 * (despite what the SDK's `enableConfigDiscovery` docs imply) — those are
 * synced, but only when their config can be resolved without requiring user
 * interaction.
 */
export async function collectNonPluginMcpServers(mcpService: IMcpService, configurationResolverService: IConfigurationResolverService): Promise<ISyncableMcpServer[]> {
	const result: ISyncableMcpServer[] = [];
	for (const server of mcpService.servers.get()) {
		if (server.collection.id.startsWith(MCP_PLUGIN_COLLECTION_ID_PREFIX)) {
			continue;
		}
		if (!isContributionEnabled(server.enablement.get())) {
			continue;
		}
		const definitions = server.readDefinitions().get();
		const definition = definitions.server;
		const launch = definition?.launch;
		if (!launch) {
			continue;
		}
		let configuration = launchToMcpServerConfiguration(launch);
		if (!configuration) {
			continue;
		}
		const collection = definitions.collection;
		if (collection && McpCollectionDefinition.isWorkspaceDiscovered(collection)) {
			if (!McpCollectionDefinition.isVscodeMcpJson(collection)) {
				continue;
			}
			const resolved = await resolveConfigurationForSync(configurationResolverService, definition.variableReplacement?.folder, configuration);
			if (!resolved) {
				continue;
			}
			configuration = resolved;
		}
		result.push({ name: server.definition.label, configuration });
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
): Promise<ClientPluginCustomization[]> {
	const enumerated = await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, sessionType, CancellationToken.None);
	const enabled = enumerated.filter(e => !e.disabled);

	const plugins = agentPluginService.plugins.get();
	const pluginRefs = new Map<string, Promise<ClientPluginCustomization>>();
	const looseFiles: { uri: URI; type: PromptsType }[] = [];

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

				return {
					type: CustomizationType.Plugin,
					id: customizationId(key),
					uri: key as ProtocolURI,
					name: plugin.label,
					nonce: nonce?.toString(16),
					enabled: true,
				};
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
			if (syncProvider.isDisabled(plugin.uri)) {
				continue;
			}
			if (!isContributionEnabled(plugin.enablement.get())) {
				continue;
			}
			addPluginRef(plugin);
		} else {
			looseFiles.push({ uri: entry.uri, type: entry.type });
		}
	}

	// Plugins that only contribute MCP servers have no prompt files, so they
	// are never surfaced by enumeration above. Include them explicitly so
	// their servers are still synced to the harness.
	for (const plugin of plugins) {
		if (pluginRefs.has(plugin.uri.toString())) {
			continue;
		}
		if (syncProvider.isDisabled(plugin.uri)) {
			continue;
		}
		if (!isContributionEnabled(plugin.enablement.get())) {
			continue;
		}
		if (plugin.mcpServerDefinitions.get().length === 0) {
			continue;
		}
		addPluginRef(plugin);
	}

	const refs: Promise<ClientPluginCustomization | undefined>[] = [...pluginRefs.values()];
	const mcpServers = await collectNonPluginMcpServers(mcpService, configurationResolverService);
	if (looseFiles.length > 0 || mcpServers.length > 0) {
		refs.push(bundler.bundle(looseFiles, mcpServers).then(r => r?.ref));
	}
	return await Promise.all(refs).then(r => r.filter(isDefined));
}
