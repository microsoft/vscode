/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IRemoteAgentHostService } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IAgentHostFilterService } from '../../remoteAgentHost/common/agentHostFilter.js';
import { IWorkspacePickerItem, IWorkspaceSelection, WorkspacePicker } from './sessionWorkspacePicker.js';
import { showMobileWorkspacePickerSheet, shouldUseMobileWorkspacePickerSheet } from './mobile/mobileWorkspacePickerSheet.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';

/**
 * Web variant of {@link WorkspacePicker} for the Agents window's
 * vscode.dev / insiders.vscode.dev surface. Two responsibilities on
 * top of the desktop picker:
 *
 *  1. Scopes its contents to the host currently selected in the agent
 *     host filter — recent workspaces for that host plus a single
 *     "Select Folder..." entry that invokes the host's browse action.
 *  2. On phone-layout viewports renders the picker as a bottom sheet
 *     (via `showMobileWorkspacePickerSheet`) instead of the desktop
 *     action-widget popup. Falls through to `super.showPicker()` on
 *     non-phone viewports, so a single instance works correctly
 *     across rotation across the phone breakpoint.
 *
 * Falls back to the Copilot local provider when no host is selected
 * (e.g. on Electron desktop, where the host filter UI is not
 * surfaced).
 */
export class WebWorkspacePicker extends WorkspacePicker {

	constructor(
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IStorageService storageService: IStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IRemoteAgentHostService remoteAgentHostService: IRemoteAgentHostService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IAgentHostFilterService private readonly _agentHostFilterService: IAgentHostFilterService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super(
			actionWidgetService,
			storageService,
			uriIdentityService,
			sessionsProvidersService,
			remoteAgentHostService,
			configurationService,
			commandService,
			workspacesService,
			menuService,
			contextKeyService,
			instantiationService,
			fileDialogService,
			quickInputService,
		);

		// When the scoped host changes, if the current selection no longer
		// belongs to the selected host, reset it: prefer the most recent
		// workspace for the new host, otherwise clear the selection.
		this._register(this._agentHostFilterService.onDidChange(() => this._onScopedHostChanged()));
	}

	protected override _showTabs(): boolean {
		// Scoped picker is already filtered to a single host — the categorical
		// tab bar would be redundant.
		return false;
	}

	override showPicker(): void {
		if (!this._triggerElement) {
			return;
		}
		// On phone, render the picker as a bottom sheet instead of the
		// desktop action-widget popup. Falls through to `super` on non-
		// phone viewports so a single instance handles both desktop
		// browsers and rotation across the phone breakpoint.
		if (!shouldUseMobileWorkspacePickerSheet(this._layoutService)) {
			super.showPicker();
			return;
		}
		const items = this._buildItems();
		showMobileWorkspacePickerSheet(
			this._layoutService,
			this._triggerElement,
			items,
			item => this._dispatchPickerItem(item),
			this._getAllBrowseActions(),
		);
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
				description: workspace.description,
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
