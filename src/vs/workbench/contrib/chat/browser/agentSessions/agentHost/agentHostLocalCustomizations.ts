/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { basename, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isCopilotAgentHostProvider, isRemoteAgentHostSessionType, parseAgentHostHarness } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { CLAUDE_AGENT_PROVIDER_ID, CODEX_AGENT_PROVIDER_ID } from '../../../../../../platform/agentHost/common/agent.js';
import { CustomizationEnablementKind, type AgentCustomization, CustomizationType, type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { customizationId, type ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { AICustomizationSource, AICustomizationSources } from '../../../common/aiCustomizationWorkspaceService.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IPromptPath, IPromptsService, isUserToggleableCustomization, matchesSessionType, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { getSkillFolderName } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { isContributionEnabled } from '../../../common/enablement.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { SYNCED_CUSTOMIZATION_SCHEME, type ISyncableFile, type ISyncableMcpServer, type SyncedCustomizationBundler } from './syncedCustomizationBundler.js';
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
	/**
	 * Sync user customizations too. Set for an agent host on another machine,
	 * which cannot discover any of the client's files itself.
	 */
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
 * Non-default configured agent, skill, and instruction locations are adapted
 * into client customizations; default locations remain host-discovered.
 *
 * Built-in skills bundled with the Agents app (only present when the
 * sessions-aware prompts service is in play) are also enumerated so that
 * `/create-pr`, `/merge`, etc. are available to every agent host without
 * any per-provider plumbing. A built-in skill is left out when a workspace
 * or user skill with the same name overrides it and the harness receives or
 * discovers that skill. Workspace overrides are looked up in `roots`, the
 * folders the session works in: `undefined` stands for the window's
 * workspace and an empty array for a session without a workspace. In the
 * regular VS Code workbench window the built-in lookup returns nothing and
 * this is a no-op.
 */
export async function enumerateLocalCustomizationsForHarness(
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	sessionType: string,
	token: CancellationToken,
	options: ILocalCustomizationSyncOptions | undefined,
	roots?: readonly URI[],
): Promise<readonly ILocalCustomizationFile[]> {
	const result: ILocalCustomizationFile[] = [];
	const seenUris = new ResourceSet();
	const harnessSessionType = parseAgentHostHarness(sessionType) ?? sessionType;
	const fullySyncedStorageSources = options?.includeUserStorage
		? [PromptsStorage.user, ...SYNCABLE_STORAGE_SOURCES]
		: SYNCABLE_STORAGE_SOURCES;
	for (const type of SYNCABLE_PROMPT_TYPES) {
		const storageSources = type === PromptsType.prompt
			? fullySyncedStorageSources
			: [PromptsStorage.local, PromptsStorage.user, ...SYNCABLE_STORAGE_SOURCES];
		const userDisabled = promptsService.getDisabledPromptFiles(type);
		const lists = await Promise.all(
			storageSources.map(storage => promptsService.listPromptFilesForStorage(type, storage, token)),
		);
		const builtInIndex = storageSources.indexOf(PromptsStorage.builtIn);
		const overridingSkillNames = type === PromptsType.skill && builtInIndex >= 0 && lists[builtInIndex].length > 0
			? await getOverridingSkillNames(promptsService, syncProvider, storageSources, lists, harnessSessionType, fullySyncedStorageSources, !!options?.includeUserStorage, roots, token)
			: undefined;
		for (let i = 0; i < lists.length; i++) {
			const source = storageSources[i];
			const userToggleable = isUserToggleableCustomization(type, source);
			for (const file of lists[i]) {
				if (source === PromptsStorage.builtIn && overridingSkillNames?.has(getSkillFolderName(file.uri))) {
					continue;
				}
				if (!isSyncedToHarness(file, source, fullySyncedStorageSources)) {
					continue;
				}
				if (matchesSessionType(file.sessionTypes, harnessSessionType) && !seenUris.has(file.uri)) {
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
 * Whether `file`, listed from `storage`, is sent to the agent host: either its
 * whole storage is synced, or it comes from a non-default configured location.
 * Files in default locations are left for the host to discover itself.
 */
function isSyncedToHarness(file: IPromptPath, storage: PromptsStorage, fullySyncedStorageSources: readonly PromptsStorage[]): boolean {
	return fullySyncedStorageSources.includes(storage)
		|| file.source === PromptFileSource.ConfigWorkspace
		|| file.source === PromptFileSource.ConfigPersonal;
}

/**
 * Whether the agent host for `harness` discovers skills in the default skill
 * folder that `source` stands for without the client syncing them.
 */
function isSkillFolderDiscoveredByHarness(harness: string, source: PromptFileSource | undefined): boolean {
	if (isCopilotAgentHostProvider(harness)) {
		return source === PromptFileSource.AgentsWorkspace
			|| source === PromptFileSource.GitHubWorkspace
			|| source === PromptFileSource.ClaudeWorkspace
			|| source === PromptFileSource.AgentsPersonal
			|| source === PromptFileSource.CopilotPersonal;
	}
	if (harness === CLAUDE_AGENT_PROVIDER_ID) {
		return source === PromptFileSource.ClaudeWorkspace
			|| source === PromptFileSource.ClaudePersonal;
	}
	if (harness === CODEX_AGENT_PROVIDER_ID) {
		return source === PromptFileSource.AgentsWorkspace
			|| source === PromptFileSource.GitHubWorkspace
			|| source === PromptFileSource.AgentsPersonal;
	}
	return false;
}

/**
 * Collects the canonical (folder) names of workspace and user skills that
 * apply to `harnessSessionType` and that its agent host receives through the
 * sync or discovers itself. Built-in skills have the lowest precedence, so a
 * built-in skill with one of these names is overridden and must not be
 * forwarded to the agent host next to the workspace or user copy.
 *
 * A synced skill counts only while the user has not opted it out of the sync.
 * The host discovers workspace skills in the folders the session works in, so
 * `roots` are looked up rather than the window's workspace unless they are
 * `undefined`; an empty array means the session has no workspace. A host on
 * another machine (`isRemoteHost`) discovers none of the client's own files,
 * so for it only synced skills and skills in the session's folders count.
 */
async function getOverridingSkillNames(
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	storageSources: readonly PromptsStorage[],
	lists: readonly (readonly IPromptPath[])[],
	harnessSessionType: string,
	fullySyncedStorageSources: readonly PromptsStorage[],
	isRemoteHost: boolean,
	roots: readonly URI[] | undefined,
	token: CancellationToken,
): Promise<ReadonlySet<string>> {
	const names = new Set<string>();
	const addIfApplicable = (file: IPromptPath) => {
		if (matchesSessionType(file.sessionTypes, harnessSessionType)) {
			names.add(getSkillFolderName(file.uri));
		}
	};
	for (let i = 0; i < lists.length; i++) {
		const storage = storageSources[i];
		if (storage !== PromptsStorage.local && storage !== PromptsStorage.user) {
			continue;
		}
		const discoverable = !isRemoteHost && (storage === PromptsStorage.user || roots === undefined);
		for (const file of lists[i]) {
			const synced = isSyncedToHarness(file, storage, fullySyncedStorageSources) && !syncProvider.isDisabled(file.uri);
			if (synced || (discoverable && isSkillFolderDiscoveredByHarness(harnessSessionType, file.source))) {
				addIfApplicable(file);
			}
		}
	}
	if (roots?.length) {
		const rootLists = await Promise.all(roots.map(root => promptsService.listPromptFilesForStorage(PromptsType.skill, PromptsStorage.local, token, root)));
		for (const file of rootLists.flat()) {
			if (isSkillFolderDiscoveredByHarness(harnessSessionType, file.source)) {
				addIfApplicable(file);
			}
		}
	}
	return names;
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
 *
 * Pass `enumerated` when the caller already ran
 * {@link enumerateLocalCustomizationsForHarness} for the same session type
 * and options, to avoid listing every customization folder again. Its roots
 * don't matter here, as they only filter built-in skills.
 */
export async function resolveLocalCustomAgents(
	fileService: IFileService,
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	agentPluginService: IAgentPluginService,
	sessionType: string,
	options: ILocalCustomizationSyncOptions | undefined,
	enumerated?: readonly ILocalCustomizationFile[],
): Promise<readonly AgentCustomization[]> {
	const plugins = agentPluginService.plugins.get();
	const result: AgentCustomization[] = [];
	const parser = new PromptFileParser();
	const pending: Promise<void>[] = [];
	enumerated ??= await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, sessionType, CancellationToken.None, options);

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
		if (plugin?.copilotCliInstallation && !isContributionEnabled(plugin.enablement.get())) {
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
 * Collects MCP servers with resolved, representable configurations, excluding plugin-sourced servers, duplicate built-ins, and workspace-discovered servers other than `.vscode/mcp.json` entries.
 * Copilot-home `mcp-config.json` (`COPILOT_HOME`, otherwise `~/.copilot`) is runtime-discovered only by the window's own Copilot host on the same machine and is never forwarded.
 */
export async function collectNonPluginMcpServers(mcpService: IMcpService, configurationResolverService: IConfigurationResolverService, sessionType: string, workingDirectories: readonly URI[], windowRemoteAuthority: string | null): Promise<ISyncableMcpServer[]> {
	const resolved = await resolveMcpServersForAgentHostDelivery(mcpService.servers.get(), configurationResolverService, sessionType, workingDirectories, windowRemoteAuthority);
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
 * The bundlers that package forwarded files and MCP servers for an agent host.
 */
export interface ISyncedCustomizationBundlers {
	/** Bundles the remaining loose files, such as extension and built-in skills and agents, prompt files, and instructions. */
	readonly synced: SyncedCustomizationBundler;
	/** Bundles standalone user and workspace skills and agents, and every forwarded MCP server. */
	readonly standalone: SyncedCustomizationBundler;
}

/**
 * Whether a forwarded file is a standalone user or workspace skill or agent.
 * Extension and built-in skills and agents stay in the synced bundle, as the
 * workbench lockdown blocks only standalone prompt files.
 */
function isStandaloneSkillOrAgent(file: ISyncableFile): boolean {
	return (file.type === PromptsType.skill || file.type === PromptsType.agent)
		&& (file.source === AICustomizationSources.local || file.source === AICustomizationSources.user);
}

/**
 * Resolves the customization refs to include in an `activeClientSet`
 * message.
 *
 * Every eligible local file is synced unless the user opted out. Files
 * belonging to installed plugins are de-duped to a single plugin ref;
 * remaining loose files are bundled into a synthetic Open Plugin. Standalone
 * user and workspace skills and agents, together with the MCP servers that
 * VS Code forwards (user, workspace, or extension-contributed), go into a
 * separate standalone bundle so that the host does not deliver them as
 * plugin-provided content.
 *
 * Pass `enumerated` when the caller already ran
 * {@link enumerateLocalCustomizationsForHarness} for the same session type,
 * options and `workingDirectories`, to avoid listing every customization
 * folder again.
 */
export async function resolveCustomizationRefs(
	fileService: IFileService,
	promptsService: IPromptsService,
	syncProvider: ICustomizationSyncProvider,
	agentPluginService: IAgentPluginService,
	mcpService: IMcpService,
	configurationResolverService: IConfigurationResolverService,
	bundlers: ISyncedCustomizationBundlers,
	sessionType: string,
	options: ILocalCustomizationSyncOptions | undefined,
	workingDirectories?: readonly URI[],
	windowRemoteAuthority: string | null = null,
	enumerated?: readonly ILocalCustomizationFile[],
): Promise<ClientPluginCustomization[]> {
	enumerated ??= await enumerateLocalCustomizationsForHarness(promptsService, syncProvider, sessionType, CancellationToken.None, options, workingDirectories);
	const enabled = enumerated.filter(e => !e.disabled);

	const plugins = agentPluginService.plugins.get();
	const pluginRefs = new Map<string, Promise<ClientPluginCustomization>>();
	const looseFiles: ISyncableFile[] = [];

	const addPluginRef = (plugin: IAgentPlugin) => {
		if (plugin.copilotCliInstallation && isCopilotAgentHostProvider(parseAgentHostHarness(sessionType) ?? sessionType)) {
			return;
		}
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
						enabled: plugin.copilotCliInstallation
							? isContributionEnabled(plugin.enablement.get())
							: agentPluginService.enablementModel.readProfileEnabled(key),
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
	// host registration resolves (notably in the Agents window), and plugins can
	// ship content only the agent host runtime understands (for example Copilot
	// extensions with canvases). Include every installed plugin; `pluginRefs`
	// de-duplicates those already found through prompt-file enumeration.
	for (const plugin of plugins) {
		addPluginRef(plugin);
	}

	const refs: Promise<ClientPluginCustomization | undefined>[] = [...pluginRefs.values()];
	const mcpServers = await collectNonPluginMcpServers(mcpService, configurationResolverService, sessionType, workingDirectories ?? [], windowRemoteAuthority);
	const syncedFiles = looseFiles.filter(file => !isStandaloneSkillOrAgent(file));
	if (isRemoteAgentHostSessionType(sessionType) && parseAgentHostHarness(sessionType) === 'copilot') {
		syncedFiles.push({
			uri: URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: '/builtin/vscode-local-images.mdc' }),
			type: PromptsType.instructions,
			source: AICustomizationSources.builtin,
			content: '---\ndescription: Showing image files in VS Code\nalwaysApply: true\n---\n\nTo show the user an image file, reference its absolute path with `![alt](/absolute/path.png)`. If no earlier tool call in this session (such as a screenshot) already returned that image, call `view` on the path once first; never re-view an image just to show it.\n',
		});
	}
	if (syncedFiles.length > 0) {
		refs.push(bundlers.synced.bundle(syncedFiles, []).then(r => r?.ref));
	}
	// Plugin MCP servers travel with their plugin refs, so every server collected here is standalone.
	const standaloneFiles = looseFiles.filter(isStandaloneSkillOrAgent);
	if (standaloneFiles.length > 0 || mcpServers.length > 0) {
		refs.push(bundlers.standalone.bundle(standaloneFiles, mcpServers).then(r => r?.ref));
	}
	return await Promise.all(refs).then(r => r.filter(isDefined));
}
