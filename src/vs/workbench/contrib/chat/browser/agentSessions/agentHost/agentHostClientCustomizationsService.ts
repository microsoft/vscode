/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { derived } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isCopilotAgentHostProvider, parseAgentHostHarness } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { CustomizationEnablementKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { IConfigurationResolverService } from '../../../../../services/configurationResolver/common/configurationResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { AICustomizationSource } from '../../../common/aiCustomizationWorkspaceService.js';
import { type ICustomizationSyncProvider } from '../../../common/customizationHarnessService.js';
import { isContributionEnabled } from '../../../common/enablement.js';
import { IAgentPlugin, IAgentPluginAgent, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { PromptFileSource, PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { IAgenticSkillsService } from '../../../common/promptSyntax/service/agenticSkillsService.js';
import { IChatExtensionCustomizationsService } from '../../../common/promptSyntax/service/chatExtensionCustomizationsService.js';
import { IPromptPath, IPromptsService, matchesSessionType, PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { AgentHostMcpServerDelivery, resolveMcpServersForAgentHostDelivery } from './agentHostMcpServerSupport.js';
import { type ISyncableMcpServer } from './syncedCustomizationBundler.js';

export const IAgentHostClientCustomizationsService = createDecorator<IAgentHostClientCustomizationsService>('agentHostClientCustomizationsService');

/**
 * Prompt types that participate in auto-sync to an agent host harness.
 *
 * Hooks are intentionally excluded — bundling hooks requires merging into
 * `hooks/hooks.json`.
 */
const SYNCABLE_PROMPT_TYPES: readonly PromptsType[] = [
	PromptsType.agent,
	PromptsType.skill,
	PromptsType.instructions,
	PromptsType.prompt,
];

export interface IClientCustomizationCollectOptions {
	/** The session's working directories, against which workspace MCP servers are resolved. */
	readonly roots: readonly URI[];
	/** The harness's opt-outs; opted-out files are reported as disabled. */
	readonly syncProvider: ICustomizationSyncProvider;
	/** Ships user prompt files to a host that doesn't share the client's file system. */
	readonly includeUserStorage?: boolean;
}

/** A customization file that only the client knows about. */
export interface ILocalCustomizationFile {
	readonly uri: URI;
	readonly type: PromptsType;
	readonly source: AICustomizationSource;
	readonly disabled: boolean;
	readonly extensionId?: string;
	/** Display name of the contributing extension, when {@link extensionId} is set. */
	readonly extensionLabel?: string;
}

/** A plugin that the client knows about, with its client-owned global enablement. */
export interface IClientPlugin {
	readonly plugin: IAgentPlugin;
	/** The client's global decision for the plugin. */
	readonly enabled: boolean;
	/** `false` when the harness discovers the plugin natively and the client must not forward it. */
	readonly forwarded: boolean;
	/**
	 * The plugin's agents that can be selected before the host reports the session's customizations: none when the
	 * plugin is effectively disabled, and none that the user opted out of syncing.
	 */
	readonly selectableAgents: readonly IAgentPluginAgent[];
}

/** Everything the client contributes to an agent host session of one harness. */
export interface IClientCustomizationSnapshot {
	readonly files: readonly ILocalCustomizationFile[];
	readonly plugins: readonly IClientPlugin[];
	/** MCP servers that the client forwards, outside of plugins. */
	readonly mcpServers: readonly ISyncableMcpServer[];
}

/**
 * Collects the customizations that the client contributes to agent host sessions: files that only the client knows
 * (extension contributions, built-in skills, configured locations), plugins, and MCP servers.
 *
 * Owns no publication state; {@link IAgentHostActiveClientService} turns snapshots into published customizations.
 */
export interface IAgentHostClientCustomizationsService {
	readonly _serviceBrand: undefined;

	/** Fires when any source that a snapshot depends on may have changed. */
	readonly onDidChange: Event<void>;

	collect(sessionType: string, options: IClientCustomizationCollectOptions, token: CancellationToken): Promise<IClientCustomizationSnapshot>;
}

export class AgentHostClientCustomizationsService implements IAgentHostClientCustomizationsService {
	declare readonly _serviceBrand: undefined;

	readonly onDidChange: Event<void>;

	constructor(
		@IPromptsService private readonly _promptsService: IPromptsService,
		@IChatExtensionCustomizationsService private readonly _extensionCustomizations: IChatExtensionCustomizationsService,
		@IAgenticSkillsService private readonly _agenticSkills: IAgenticSkillsService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IMcpService private readonly _mcpService: IMcpService,
		@IConfigurationResolverService private readonly _configurationResolverService: IConfigurationResolverService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		// Each recomputation returns a new object, so any change of a read observable fires the event.
		const pluginsAndMcpServers = derived(reader => {
			for (const plugin of this._agentPluginService.plugins.read(reader)) {
				plugin.enablement.read(reader);
				plugin.hooks.read(reader);
				plugin.commands.read(reader);
				plugin.skills.read(reader);
				plugin.agents.read(reader);
				plugin.instructions.read(reader);
				plugin.mcpServerDefinitions.read(reader);
			}
			for (const server of this._mcpService.servers.read(reader)) {
				server.enablement.read(reader);
				server.readDefinitions().read(reader);
			}
			return {};
		});
		this.onDidChange = Event.any<unknown>(
			this._promptsService.onDidChangeCustomAgents,
			this._promptsService.onDidChangeSlashCommands,
			this._promptsService.onDidChangeSkills,
			this._promptsService.onDidChangeInstructions,
			this._extensionCustomizations.onDidChange,
			this._agenticSkills.onDidChange,
			Event.fromObservableLight(pluginsAndMcpServers),
		) as Event<void>;
	}

	async collect(sessionType: string, options: IClientCustomizationCollectOptions, token: CancellationToken): Promise<IClientCustomizationSnapshot> {
		const [files, mcpServers] = await Promise.all([
			this._collectFiles(sessionType, options, token),
			this._collectMcpServers(sessionType, options.roots),
		]);
		return { files, plugins: this._collectPlugins(sessionType, options.syncProvider), mcpServers };
	}

	/**
	 * Lists the files that only the client knows: extension contributions, built-in skills bundled with the Agents
	 * app, files in non-default configured locations, and, for remote hosts, user prompt files. Default locations
	 * remain host-discovered.
	 */
	private async _collectFiles(sessionType: string, options: IClientCustomizationCollectOptions, token: CancellationToken): Promise<readonly ILocalCustomizationFile[]> {
		const result: ILocalCustomizationFile[] = [];
		const seenUris = new ResourceSet();
		const harnessSessionType = parseAgentHostHarness(sessionType) ?? sessionType;
		// Of the profile-wide disabled states, agent hosts honor only those of built-in skills.
		const disabledBuiltinSkills = this._agenticSkills.getDisabledSkills();
		for (const type of SYNCABLE_PROMPT_TYPES) {
			// Standalone files are forwarded from configured locations, and remote hosts also get all user files.
			const standaloneStorages = type === PromptsType.prompt
				? (options.includeUserStorage ? [PromptsStorage.user] : [])
				: [PromptsStorage.local, PromptsStorage.user];
			const lists = await Promise.all([
				...standaloneStorages.map(async storage => (await this._promptsService.listPromptFilesForStorage(type, storage, token))
					.filter(file => (storage === PromptsStorage.user && options.includeUserStorage)
						|| file.source === PromptFileSource.ConfigWorkspace
						|| file.source === PromptFileSource.ConfigPersonal)),
				this._extensionCustomizations.getExtensionPromptFiles(type, token),
				type === PromptsType.skill ? this._agenticSkills.getSkills(token) : Promise.resolve([]),
			]);
			for (const file of lists.flat() as IPromptPath[]) {
				if (!matchesSessionType(file.sessionTypes, harnessSessionType) || seenUris.has(file.uri)) {
					continue;
				}
				seenUris.add(file.uri);
				result.push({
					uri: file.uri,
					type,
					source: file.storage,
					extensionId: file.extension?.identifier.value,
					extensionLabel: file.extension ? file.extension.displayName || file.extension.identifier.value : undefined,
					disabled: options.syncProvider.isDisabled(file.uri)
						|| (file.storage === PromptsStorage.builtIn && disabledBuiltinSkills.has(file.uri)),
				});
			}
		}
		return result;
	}

	/**
	 * Lists the installed plugins. Plugins that a harness owns are forwarded only to other harnesses; Copilot
	 * discovers its own installations natively and uses its own enablement.
	 */
	private _collectPlugins(sessionType: string, syncProvider: ICustomizationSyncProvider): readonly IClientPlugin[] {
		const nativeHarnessPlugins = isCopilotAgentHostProvider(parseAgentHostHarness(sessionType) ?? sessionType);
		return this._agentPluginService.plugins.get().map(plugin => {
			const harnessOwned = plugin.discovery === 'harness';
			return {
				selectableAgents: isContributionEnabled(plugin.enablement.get())
					? plugin.agents.get().filter(agent => !syncProvider.isDisabled(agent.uri))
					: [],
				plugin,
				enabled: harnessOwned
					? isContributionEnabled(plugin.enablement.get())
					: this._agentPluginService.enablementModel.readProfileEnabled(plugin.uri.toString()),
				forwarded: !(harnessOwned && nativeHarnessPlugins),
			};
		});
	}

	/**
	 * Collects MCP servers with resolved, representable configurations, excluding plugin-sourced servers, duplicate built-ins, and workspace-discovered servers other than `.vscode/mcp.json` entries.
	 * Copilot-home `mcp-config.json` (`COPILOT_HOME`, otherwise `~/.copilot`) is runtime-discovered only by the window's own Copilot host on the same machine and is never forwarded.
	 */
	private async _collectMcpServers(sessionType: string, roots: readonly URI[]): Promise<ISyncableMcpServer[]> {
		const resolved = await resolveMcpServersForAgentHostDelivery(this._mcpService.servers.get(), this._configurationResolverService, sessionType, roots, this._environmentService.remoteAuthority ?? null);
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
					enabled: this._mcpService.enablementModel.readProfileEnabled(server.definition.id),
				}),
			} satisfies ISyncableMcpServer];
		});
	}
}

registerSingleton(IAgentHostClientCustomizationsService, AgentHostClientCustomizationsService, InstantiationType.Delayed);
