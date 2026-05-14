/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentHostConfigKey, getAgentHostConfiguredCustomizations } from '../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { agentHostUri } from '../../../../../platform/agentHost/common/agentHostFileSystemProvider.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import type { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { type AgentInfo, type CustomizationRef } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService, type IStorageSourceFilter } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { type IHarnessDescriptor, type ICustomizationItem, type ICustomizationItemAction } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../../chat/common/builtinPromptsStorage.js';
import { AgentCustomizationSyncProvider } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationSyncProvider.js';
import { AgentCustomizationItemProvider } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js';

function customizationKey(customization: CustomizationRef): string {
	return customization.uri;
}

/**
 * Owns the client-side UI commands for configuring plugins on a remote
 * agent host. The actual source of truth lives in the host's root config.
 */
export class RemoteAgentPluginController extends Disposable {
	readonly pluginActions: readonly ICustomizationItemAction[];

	constructor(
		private readonly _hostLabel: string,
		private readonly _connectionAuthority: string,
		private readonly _connection: IAgentConnection,
		@IFileDialogService private readonly _fileDialogService: IFileDialogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IAICustomizationWorkspaceService _workspaceService: IAICustomizationWorkspaceService,
	) {
		super();

		this.pluginActions = [
			{
				id: 'remoteAgentHost.addPlugin',
				label: localize('remoteAgentHost.addPlugin', "Add Remote Plugin"),
				tooltip: localize('remoteAgentHost.addPluginTooltip', "Add a plugin folder that already exists on this remote agent host."),
				icon: Codicon.remote,
				run: () => this.addConfiguredPlugin(),
			},
		];
	}

	async removeConfiguredPlugin(customizationToRemove: CustomizationRef): Promise<void> {
		const updated = this.getConfiguredCustomizations().filter(customization => customizationKey(customization) !== customizationKey(customizationToRemove));
		this.dispatchCustomizations(updated);
	}

	private getConfiguredCustomizations(): readonly CustomizationRef[] {
		const rootState = this._connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return [];
		}

		return getAgentHostConfiguredCustomizations(rootState.config?.values);
	}

	private dispatchCustomizations(customizations: readonly CustomizationRef[]): void {
		this._connection.dispatch({
			type: ActionType.RootConfigChanged,
			config: {
				[AgentHostConfigKey.Customizations]: [...customizations],
			},
		});
	}

	private async pickRemotePluginFolder(title: string): Promise<URI | undefined> {
		try {
			const selected = await this._fileDialogService.showOpenDialog({
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				title,
				availableFileSystems: [AGENT_HOST_SCHEME],
				defaultUri: agentHostUri(this._connectionAuthority, '/'),
			});
			return selected?.[0];
		} catch {
			return undefined;
		}
	}

	private async addConfiguredPlugin(): Promise<void> {
		const selected = await this.pickRemotePluginFolder(localize('remoteAgentHost.selectPluginFolder', "Select Plugin Folder on {0}", this._hostLabel));
		if (!selected) {
			return;
		}

		const original = fromAgentHostUri(selected);
		const newCustomization: CustomizationRef = {
			uri: original.toString(),
			displayName: basename(original) || original.path,
		};

		const current = this.getConfiguredCustomizations();
		const nextKey = customizationKey(newCustomization);
		if (current.some(customization => customizationKey(customization) === nextKey)) {
			this._notificationService.info(localize(
				'remoteAgentHost.pluginAlreadyConfigured',
				"'{0}' is already configured on {1}.",
				newCustomization.displayName,
				this._hostLabel,
			));
			return;
		}

		this.dispatchCustomizations([...current, newCustomization]);
	}
}

/**
 * Creates a {@link AgentCustomizationItemProvider} that exposes a
 * remote agent's configured plugins as {@link ICustomizationItem}
 * entries for the plugin management widget.
 *
 * Each plugin is also **expanded** into its individual customization
 * files (agents, skills, instructions, prompts) by reading the plugin
 * directory through the agent-host filesystem provider. The expanded
 * children appear in per-type sections (Skills, Agents, etc.) while
 * the parent plugin item appears in the Plugins section.
 */
export function createRemoteAgentCustomizationItemProvider(
	agentInfo: AgentInfo,
	connection: IAgentConnection,
	connectionAuthority: string,
	controller: RemoteAgentPluginController,
	fileService: IFileService,
	logService: ILogService,
): AgentCustomizationItemProvider {
	return new AgentCustomizationItemProvider(
		agentInfo,
		connection,
		connectionAuthority,
		fileService,
		logService,
		(customization, clientId) => {
			if (clientId !== undefined) {
				// Customization came from the client; we don't allow actions on these since they're read-only reflections of client state.
				return undefined;
			}
			return [{
				id: 'remoteAgentHost.removeConfiguredPlugin',
				label: localize('remoteAgentHost.removeConfiguredPlugin', "Remove from Remote Host"),
				icon: Codicon.trash,
				run: () => controller.removeConfiguredPlugin(customization),
			}];
		},
	);
}

/**
 * Creates a {@link IHarnessDescriptor} for a remote agent discovered via
 * the agent host protocol.
 */
export function createRemoteAgentHarnessDescriptor(
	harnessId: string,
	displayName: string,
	controller: RemoteAgentPluginController,
	itemProvider: AgentCustomizationItemProvider,
	syncProvider: AgentCustomizationSyncProvider,
): IHarnessDescriptor {
	const allSources = [PromptsStorage.local, PromptsStorage.user, PromptsStorage.plugin, BUILTIN_STORAGE];
	const filter: IStorageSourceFilter = { sources: allSources };

	return {
		id: harnessId,
		label: displayName,
		icon: ThemeIcon.fromId(Codicon.remote.id),
		hiddenSections: [
			AICustomizationManagementSection.Models,
			AICustomizationManagementSection.McpServers,
		],
		hideGenerateButton: true,
		getStorageSourceFilter(_type: PromptsType): IStorageSourceFilter {
			return filter;
		},
		itemProvider,
		syncProvider,
		pluginActions: controller.pluginActions,
	};
}
