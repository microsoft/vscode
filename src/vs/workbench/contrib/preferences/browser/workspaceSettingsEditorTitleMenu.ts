/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { ResourceContextKey, WorkbenchStateContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IAgentsModeService } from '../../../services/agentsMode/common/agentsMode.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { CONTEXT_WORKSPACE_SETTINGS_UNAVAILABLE } from '../common/preferences.js';
import { preferencesOpenSettingsIcon } from './preferencesIcons.js';

export const OPEN_USER_SETTINGS_UI_TITLE = nls.localize2('openSettings2', "Open Settings (UI)");

/**
 * Shows the "Open Settings (UI)" button in the title of the workspace settings
 * file. A workspace has no settings file in Agents mode, so the button only
 * comes once the workspace has one. Also tells whether the window has a
 * workspace without settings to open, which hides the commands opening them.
 */
export class WorkspaceSettingsEditorTitleMenuContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceSettingsEditorTitleMenu';
	static readonly COMMAND_ID = '_workbench.openWorkspaceSettingsEditor';

	private readonly registration = this._register(new MutableDisposable<DisposableStore>());
	private registeredResource: string | undefined;
	private readonly workspaceSettingsUnavailable: IContextKey<boolean>;

	constructor(
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAgentsModeService agentsModeService: IAgentsModeService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.workspaceSettingsUnavailable = CONTEXT_WORKSPACE_SETTINGS_UNAVAILABLE.bindTo(contextKeyService);
		this.update();
		this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.update()));
		// Leaving Agents mode in a window with a workspace file keeps the workbench state, but the workspace settings come back
		this._register(agentsModeService.onDidChange(() => this.update()));
		// Folders mounted in Agents mode bring settings to open
		this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.updateWorkspaceSettingsUnavailable()));
	}

	private updateWorkspaceSettingsUnavailable(): void {
		this.workspaceSettingsUnavailable.set(this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && !this.preferencesService.workspaceSettingsResource);
	}

	private update(): void {
		this.updateWorkspaceSettingsUnavailable();

		const resource = this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.preferencesService.workspaceSettingsResource?.toString() : undefined;
		if (resource === this.registeredResource) {
			return;
		}

		this.registeredResource = resource;
		this.registration.clear();
		if (!resource) {
			return;
		}

		const store = new DisposableStore();
		store.add(CommandsRegistry.registerCommand(WorkspaceSettingsEditorTitleMenuContribution.COMMAND_ID, () => this.preferencesService.openWorkspaceSettings({ jsonEditor: false })));
		const when = ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(resource), WorkbenchStateContext.isEqualTo('workspace'), ContextKeyExpr.not('isInDiffEditor'));
		for (const menuId of [MenuId.EditorTitle, MenuId.ModalEditorEditorTitle]) {
			store.add(MenuRegistry.appendMenuItem(menuId, {
				command: {
					id: WorkspaceSettingsEditorTitleMenuContribution.COMMAND_ID,
					title: OPEN_USER_SETTINGS_UI_TITLE,
					icon: preferencesOpenSettingsIcon
				},
				when,
				group: 'navigation',
				order: 1
			}));
		}
		this.registration.value = store;
	}
}
