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
import { CONTEXT_HAS_WORKSPACE_SETTINGS } from '../common/preferences.js';
import { preferencesOpenSettingsIcon } from './preferencesIcons.js';

export const OPEN_USER_SETTINGS_UI_TITLE = nls.localize2('openSettings2', "Open Settings (UI)");

/**
 * Follows whether the window has workspace settings to open: a workspace has
 * none in Agents mode. Tells it to the commands opening them, and shows the
 * "Open Settings (UI)" button in the title of the workspace settings file
 * while the workspace has one.
 */
export class WorkspaceSettingsAvailabilityContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceSettingsAvailability';
	static readonly COMMAND_ID = '_workbench.openWorkspaceSettingsEditor';

	private readonly registration = this._register(new MutableDisposable<DisposableStore>());
	private registeredResource: string | undefined;
	private readonly hasWorkspaceSettings: IContextKey<boolean>;

	constructor(
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAgentsModeService agentsModeService: IAgentsModeService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.hasWorkspaceSettings = CONTEXT_HAS_WORKSPACE_SETTINGS.bindTo(contextKeyService);
		this.update();
		this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.update()));
		// Save Workspace As moves the workspace settings to another file in the same workbench state
		this._register(workspaceContextService.onDidChangeWorkspaceName(() => this.update()));
		// Leaving Agents mode in a window with a workspace file keeps the workbench state, but the workspace settings come back
		this._register(agentsModeService.onDidChange(() => this.update()));
		// Folders mounted in Agents mode bring settings to open
		this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.updateHasWorkspaceSettings()));
	}

	private updateHasWorkspaceSettings(): void {
		this.hasWorkspaceSettings.set(this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && !!this.preferencesService.workspaceSettingsResource);
	}

	private update(): void {
		this.updateHasWorkspaceSettings();

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
		store.add(CommandsRegistry.registerCommand(WorkspaceSettingsAvailabilityContribution.COMMAND_ID, () => this.preferencesService.openWorkspaceSettings({ jsonEditor: false })));
		const when = ContextKeyExpr.and(ResourceContextKey.Resource.isEqualTo(resource), WorkbenchStateContext.isEqualTo('workspace'), ContextKeyExpr.not('isInDiffEditor'));
		for (const menuId of [MenuId.EditorTitle, MenuId.ModalEditorEditorTitle]) {
			store.add(MenuRegistry.appendMenuItem(menuId, {
				command: {
					id: WorkspaceSettingsAvailabilityContribution.COMMAND_ID,
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
