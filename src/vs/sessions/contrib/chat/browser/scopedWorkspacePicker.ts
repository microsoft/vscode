/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IOutputService } from '../../../../workbench/services/output/common/output.js';
import { IPreferencesService } from '../../../../workbench/services/preferences/common/preferences.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAgentHostFilterService } from '../../remoteAgentHost/common/agentHostFilter.js';
import { IWorkspacePickerItem, IWorkspaceSelection, WorkspacePicker } from './sessionWorkspacePicker.js';

/**
 * A simplified workspace picker that scopes its contents to the host
 * currently selected in the agent host filter. It shows:
 *
 *  1. Recent workspaces for the selected host
 *  2. A single "Select Folder..." entry that invokes the host's browse action
 *
 * Falls back to the Copilot local provider when no host is selected (e.g. on
 * desktop, where the host filter UI is not surfaced).
 */
export class ScopedWorkspacePicker extends WorkspacePicker {

	constructor(
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IStorageService storageService: IStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IClipboardService clipboardService: IClipboardService,
		@IPreferencesService preferencesService: IPreferencesService,
		@IOutputService outputService: IOutputService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
	) {
		super(
			actionWidgetService,
			storageService,
			uriIdentityService,
			sessionsProvidersService,
			sessionsManagementService,
			remoteAgentHostService,
			quickInputService,
			clipboardService,
			preferencesService,
			outputService,
			configurationService,
			commandService,
		);

		// When the scoped host changes, if the current selection no longer
		// belongs to the selected host, reset it: prefer the most recent
		// workspace for the new host, otherwise clear the selection.
		this._register(this._agentHostFilterService.onDidChange(() => this._onScopedHostChanged()));
	}

	private _onScopedHostChanged(): void {
		const scopedProviderId = this._agentHostFilterService.selectedProviderId;
		const current = this.selectedProject;
		if (current && scopedProviderId !== undefined && current.providerId === scopedProviderId) {
			this._onDidChangeSelection.fire();
			return;
		}

		const firstRecent = scopedProviderId !== undefined
			? this._getRecentWorkspaces().find(w => w.providerId === scopedProviderId)
			: undefined;
		if (firstRecent) {
			this.setSelectedWorkspace({ providerId: firstRecent.providerId, workspace: firstRecent.workspace });
			return;
		}

		this.clearSelection();
		this._onDidSelectWorkspace.fire(undefined);
	}

	protected override _buildItems(): IActionListItem<IWorkspacePickerItem>[] {
		const items: IActionListItem<IWorkspacePickerItem>[] = [];

		const scopedProviderId = this._agentHostFilterService.selectedProviderId;
		if (scopedProviderId === undefined) {
			return [];
		}
		const provider = this.sessionsProvidersService.getProvider(scopedProviderId);
		if (!provider) {
			return items;
		}

		// 1. Recent workspaces for the scoped provider
		const recents = this._getRecentWorkspaces().filter(w => w.providerId === scopedProviderId);
		for (const { workspace, providerId } of recents) {
			const selection: IWorkspaceSelection = { providerId, workspace };
			items.push({
				kind: ActionListItemKind.Action,
				label: workspace.label,
				group: { title: '', icon: workspace.icon },
				item: { selection, checked: this._isSelectedWorkspace(selection) || undefined },
				onRemove: () => this._removeRecentWorkspace(selection),
			});
		}

		// 2. "Select Folder..." — dispatches the scoped provider's first browse action
		const allBrowseActions = this._getAllBrowseActions();
		const browseIndex = allBrowseActions.findIndex(a => a.providerId === scopedProviderId);
		if (browseIndex >= 0 && !this._isProviderUnavailable(scopedProviderId)) {
			if (items.length > 0) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push({
				kind: ActionListItemKind.Action,
				label: localize('scopedWorkspacePicker.selectFolder', "Select Folder..."),
				group: { title: '', icon: Codicon.folderOpened },
				item: { browseActionIndex: browseIndex },
			});
		}

		return items;
	}
}
