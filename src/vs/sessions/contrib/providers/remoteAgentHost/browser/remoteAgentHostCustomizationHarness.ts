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
import { AGENT_HOST_SCHEME, fromAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import type { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, customizationId, type Customization } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { AICustomizationManagementSection, IAICustomizationWorkspaceService } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationSyncProvider, type IHarnessDescriptor, type ICustomizationItemAction } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { AgentCustomizationItemProvider } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js';
import { CustomizationType } from '../../../../../platform/agentHost/common/state/protocol/state.js';

function customizationKey(customization: Customization): string {
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

	async removeConfiguredPlugin(customizationToRemove: Customization): Promise<void> {
		const updated = this.getConfiguredCustomizations().filter(customization => customizationKey(customization) !== customizationKey(customizationToRemove));
		this.dispatchCustomizations(updated);
	}

	private getConfiguredCustomizations(): readonly Customization[] {
		const rootState = this._connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return [];
		}

		return getAgentHostConfiguredCustomizations(rootState.config?.values);
	}

	private dispatchCustomizations(customizations: readonly Customization[]): void {
		this._connection.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: {
				[AgentHostConfigKey.Customizations]: customizations.map(c => ({
					uri: c.uri,
					displayName: c.name,
				})),
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
		const uriString = original.toString();
		const newCustomization: Customization = {
			type: CustomizationType.Plugin,
			id: customizationId(uriString),
			uri: uriString,
			name: basename(original) || original.path,
			enabled: true,
		};

		const current = this.getConfiguredCustomizations();
		const nextKey = customizationKey(newCustomization);
		if (current.some(customization => customizationKey(customization) === nextKey)) {
			this._notificationService.info(localize(
				'remoteAgentHost.pluginAlreadyConfigured',
				"'{0}' is already configured on {1}.",
				newCustomization.name,
				this._hostLabel,
			));
			return;
		}

		this.dispatchCustomizations([...current, newCustomization]);
	}
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
	syncProvider: ICustomizationSyncProvider,
): IHarnessDescriptor {
	return {
		id: harnessId,
		label: displayName,
		icon: ThemeIcon.fromId(Codicon.remote.id),
		hiddenSections: [
			AICustomizationManagementSection.Models,
			AICustomizationManagementSection.McpServers,
		],
		hideGenerateButton: true,
		itemProvider,
		syncProvider,
		pluginActions: controller.pluginActions,
	};
}
