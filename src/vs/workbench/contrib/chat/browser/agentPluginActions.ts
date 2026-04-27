/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, IAction, IActionChangeEvent } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ActionWithDropdownActionViewItem, IActionWithDropdownActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IContextMenuProvider } from '../../../../base/browser/contextmenu.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { ContributionEnablementState, IEnablementModel, isContributionDisabled, isContributionEnabled } from '../common/enablement.js';
import { IAgentPlugin, IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePluginItem } from './agentPluginEditor/agentPluginItems.js';
import { buildEnablementContextMenuGroup } from './enablementActions.js';
import { hasKey } from '../../../../base/common/types.js';

//#region Simple actions

export class InstallPluginAction extends Action {
	constructor(
		item: IMarketplacePluginItem,
		@IPluginInstallService pluginInstallService: IPluginInstallService,
	) {
		super('agentPlugin.install', localize('install', "Install"), 'extension-action label prominent install', true,
			() => pluginInstallService.installPlugin({
				name: item.name,
				description: item.description,
				version: '',
				source: item.source,
				sourceDescriptor: item.sourceDescriptor,
				marketplace: item.marketplace,
				marketplaceReference: item.marketplaceReference,
				marketplaceType: item.marketplaceType,
				readmeUri: item.readmeUri,
			}));
	}
}

export class UninstallPluginAction extends Action {
	constructor(plugin: IAgentPlugin) {
		super('agentPlugin.uninstall', localize('uninstall', "Uninstall"), 'extension-action label uninstall', true,
			() => { plugin.remove(); return Promise.resolve(); });
	}
}

export class OpenPluginFolderAction extends Action {
	constructor(
		plugin: IAgentPlugin,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
	) {
		super('agentPlugin.openFolder', localize('openPluginFolder', "Open Plugin Folder"), undefined, true,
			async () => {
				try {
					await commandService.executeCommand('revealFileInOS', plugin.uri);
				} catch {
					await openerService.open(dirname(plugin.uri));
				}
			});
	}
}

export class OpenPluginReadmeAction extends Action {
	constructor(
		readmeUri: import('../../../../base/common/uri.js').URI,
		@IOpenerService openerService: IOpenerService,
	) {
		super('agentPlugin.openReadme', localize('openReadme', "Open README"), undefined, true,
			() => openerService.open(readmeUri));
	}
}

//#endregion

//#region Context menu

/**
 * Builds the standard context menu action groups for an installed plugin.
 */
export function getInstalledPluginContextMenuActions(plugin: IAgentPlugin, instantiationService: IInstantiationService): IAction[][] {
	return instantiationService.invokeFunction(accessor => {
		const agentPluginService = accessor.get(IAgentPluginService);
		const workspaceService = accessor.get(IWorkspaceContextService);
		const groups: IAction[][] = [];
		groups.push(buildEnablementContextMenuGroup(
			plugin.enablement.get(),
			plugin.uri.toString(),
			agentPluginService.enablementModel,
			workspaceService,
			'agentPlugin',
		));
		groups.push([
			instantiationService.createInstance(OpenPluginFolderAction, plugin),
			instantiationService.createInstance(OpenPluginReadmeAction, joinPath(plugin.uri, 'README.md')),
		]);
		if (plugin.fromMarketplace) {
			groups.push([new UninstallPluginAction(plugin)]);
		}
		return groups;
	});
}

//#endregion

//#region Dropdown enablement actions for editor-style action bars

/**
 * Sub-action base class that auto-hides when disabled, for use inside
 * {@link EnablementDropDownAction}.
 */
class EnablementSubAction extends Action {
	private _hidden: boolean;
	get hidden(): boolean { return this._hidden; }
	set hidden(v: boolean) { this._hidden = v; }

	constructor(id: string, label: string, cssClass: string, enabled: boolean, actionCallback: () => Promise<void>) {
		super(id, label, cssClass, enabled, actionCallback);
		this._hidden = !enabled;
	}

	protected override _setEnabled(value: boolean): void {
		super._setEnabled(value);
		this.hidden = !value;
	}
}

interface IEnablementActionChangeEvent extends IActionChangeEvent {
	readonly menuActions?: IAction[];
}

/**
 * Dropdown action that aggregates enablement sub-actions and shows the
 * first visible one as the primary button, with others in the dropdown.
 * Hides itself entirely when all sub-actions are hidden.
 */
export class EnablementDropDownAction extends Action {
	readonly menuActionClassNames = ['extension-action', 'label', 'action-dropdown'];
	private _menuActions: IAction[] = [];
	get menuActions(): IAction[] { return [...this._menuActions]; }

	private _isHidden = false;
	get isHidden(): boolean { return this._isHidden; }

	protected override readonly _onDidChange = new Emitter<IEnablementActionChangeEvent>();
	override get onDidChange() { return this._onDidChange.event; }

	private readonly subActions: EnablementSubAction[];

	constructor(id: string, subActions: EnablementSubAction[]) {
		super(id, undefined, 'extension-action label action-dropdown');
		this.subActions = subActions;
		for (const a of subActions) {
			a.onDidChange(() => this._updateDropdown());
		}
		this._updateDropdown();
	}

	private _updateDropdown(): void {
		const visible = this.subActions.filter(a => !a.hidden);
		const primary = visible[0];
		this._menuActions = visible.length > 1 ? [...visible] : [];

		if (primary) {
			this._isHidden = false;
			this.enabled = true;
			this.label = primary.label;
			this.tooltip = primary.tooltip;
		} else {
			this._isHidden = true;
			this.enabled = false;
		}
		this._onDidChange.fire({ menuActions: this._menuActions });
	}

	override async run(): Promise<void> {
		const primary = this.subActions.find(a => !a.hidden);
		await primary?.run();
	}

	override dispose(): void {
		for (const a of this.subActions) {
			a.dispose();
		}
		super.dispose();
	}
}

/**
 * View item for {@link EnablementDropDownAction} that properly hides
 * the dropdown chevron when there are no secondary actions.
 */
export class EnablementDropdownActionViewItem extends ActionWithDropdownActionViewItem {
	constructor(
		action: EnablementDropDownAction,
		options: IActionViewItemOptions & IActionWithDropdownActionViewItemOptions,
		contextMenuProvider: IContextMenuProvider,
	) {
		super(null, action, options, contextMenuProvider);
		this._register(action.onDidChange(e => {
			if (hasKey(e, { menuActions: true })) {
				this.updateClass();
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.updateClass();
	}

	protected override updateClass(): void {
		super.updateClass();
		if (this.element && this.dropdownMenuActionViewItem?.element) {
			const action = this._action as EnablementDropDownAction;
			this.element.classList.toggle('hide', action.isHidden);
			const isMenuEmpty = action.menuActions.length === 0;
			this.element.classList.toggle('empty', isMenuEmpty);
			this.dropdownMenuActionViewItem.element.classList.toggle('hide', isMenuEmpty);
		}
	}
}

/**
 * Creates the enable dropdown action for a plugin, containing Enable
 * and Enable (Workspace) sub-actions.
 */
export function createEnablePluginDropDown(
	plugin: IAgentPlugin,
	enablementModel: IEnablementModel,
	workspaceContextService: IWorkspaceContextService,
): EnablementDropDownAction {
	const key = plugin.uri.toString();
	const hasWorkspace = workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY;

	const enable = new EnablementSubAction('agentPlugin.enable', localize('enable', "Enable"), 'extension-action label prominent',
		isContributionDisabled(plugin.enablement.get()),
		() => { enablementModel.setEnabled(key, ContributionEnablementState.EnabledProfile); return Promise.resolve(); });

	const enableWorkspace = new EnablementSubAction('agentPlugin.enableForWorkspace', localize('enableForWorkspace', "Enable (Workspace)"), 'extension-action label',
		isContributionDisabled(plugin.enablement.get()) && hasWorkspace,
		() => { enablementModel.setEnabled(key, ContributionEnablementState.EnabledWorkspace); return Promise.resolve(); });

	return new EnablementDropDownAction('agentPlugin.enableDropdown', [enable, enableWorkspace]);
}

/**
 * Creates the disable dropdown action for a plugin, containing Disable
 * and Disable (Workspace) sub-actions.
 */
export function createDisablePluginDropDown(
	plugin: IAgentPlugin,
	enablementModel: IEnablementModel,
	workspaceContextService: IWorkspaceContextService,
): EnablementDropDownAction {
	const key = plugin.uri.toString();
	const hasWorkspace = workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY;

	const disable = new EnablementSubAction('agentPlugin.disable', localize('disable', "Disable"), 'extension-action label disable',
		isContributionEnabled(plugin.enablement.get()),
		() => { enablementModel.setEnabled(key, ContributionEnablementState.DisabledProfile); return Promise.resolve(); });

	const disableWorkspace = new EnablementSubAction('agentPlugin.disableForWorkspace', localize('disableForWorkspace', "Disable (Workspace)"), 'extension-action label disable',
		isContributionEnabled(plugin.enablement.get()) && hasWorkspace,
		() => { enablementModel.setEnabled(key, ContributionEnablementState.DisabledWorkspace); return Promise.resolve(); });

	return new EnablementDropDownAction('agentPlugin.disableDropdown', [disable, disableWorkspace]);
}

//#endregion
