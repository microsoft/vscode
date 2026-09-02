/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { basename, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CustomizationEnablementKind, type AgentCustomization, CustomizationType, type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { customizationId, type ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptsService, isUserToggleableCustomization, matchesSessionType, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import type { ISyncableFile, ISyncableMcpServer, SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
import { AgentHostMcpServerDelivery, resolveMcpServersForAgentHostDelivery } from './agentHostMcpServerSupport.js';

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
			const userToggleable = isUserToggleableCustomization(type, source);
			for (const file of lists[i]) {
				if (matchesSessionType(file.sessionTypes, sessionType) && !seenUris.has(file.uri)) {
					seenUris.add(file.uri);
					result.push({
						uri: file.uri,
						type,
						source,
						pluginUri: file.pluginUri,
						extensionId: file.extension?.identifier.value,
						disabled: syncProvider.isDisabled(file.uri) || (userToggleable && userDisabled.has(file.uri)),
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
	const resolved = await resolveMcpServersForAgentHostDelivery(mcpService.servers.get(), configurationResolverService, sessionType, workingDirectories);
	return resolved.flatMap(({ server, definition, delivery, projectedConfiguration }) => {
		if (delivery !== AgentHostMcpServerDelivery.ClientForwarded || !definition || !projectedConfiguration) {
			return [];
		}
		return [{
			name: server.definition.label,
			configuration: projectedConfiguration,
			...(definition.defaultCwd && { defaultCwd: definition.defaultCwd }),
			enablement: withCustomizationEnablement(undefined, CustomizationEnablementKind.Global, {
				kind: CustomizationEnablementKind.Global,
				enabled: mcpService.enablementModel.readProfileEnabled(server.definition.id),
			}),
		} satisfies ISyncableMcpServer];
	});
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
