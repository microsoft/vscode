/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Action } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { ActionWithDropdownActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { isContributionDisabled, isContributionEnabled } from '../common/enablement.js';
import { IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { buildEnablementContextMenuGroup } from './enablementActions.js';
import { hasKey } from '../../../../base/common/types.js';
//#region Simple actions
let InstallPluginAction = class InstallPluginAction extends Action {
    constructor(item, pluginInstallService) {
        super('agentPlugin.install', localize('install', "Install"), 'extension-action label prominent install', true, () => pluginInstallService.installPlugin({
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
};
InstallPluginAction = __decorate([
    __param(1, IPluginInstallService)
], InstallPluginAction);
export { InstallPluginAction };
export class UninstallPluginAction extends Action {
    constructor(plugin) {
        super('agentPlugin.uninstall', localize('uninstall', "Uninstall"), 'extension-action label uninstall', true, () => { plugin.remove(); return Promise.resolve(); });
    }
}
let OpenPluginFolderAction = class OpenPluginFolderAction extends Action {
    constructor(plugin, commandService, openerService) {
        super('agentPlugin.openFolder', localize('openPluginFolder', "Open Plugin Folder"), undefined, true, async () => {
            try {
                await commandService.executeCommand('revealFileInOS', plugin.uri);
            }
            catch {
                await openerService.open(dirname(plugin.uri));
            }
        });
    }
};
OpenPluginFolderAction = __decorate([
    __param(1, ICommandService),
    __param(2, IOpenerService)
], OpenPluginFolderAction);
export { OpenPluginFolderAction };
let OpenPluginReadmeAction = class OpenPluginReadmeAction extends Action {
    constructor(readmeUri, openerService) {
        super('agentPlugin.openReadme', localize('openReadme', "Open README"), undefined, true, () => openerService.open(readmeUri));
    }
};
OpenPluginReadmeAction = __decorate([
    __param(1, IOpenerService)
], OpenPluginReadmeAction);
export { OpenPluginReadmeAction };
//#endregion
//#region Context menu
/**
 * Builds the standard context menu action groups for an installed plugin.
 */
export function getInstalledPluginContextMenuActions(plugin, instantiationService) {
    return instantiationService.invokeFunction(accessor => {
        const agentPluginService = accessor.get(IAgentPluginService);
        const workspaceService = accessor.get(IWorkspaceContextService);
        const groups = [];
        groups.push(buildEnablementContextMenuGroup(plugin.enablement.get(), plugin.uri.toString(), agentPluginService.enablementModel, workspaceService, 'agentPlugin'));
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
    get hidden() { return this._hidden; }
    set hidden(v) { this._hidden = v; }
    constructor(id, label, cssClass, enabled, actionCallback) {
        super(id, label, cssClass, enabled, actionCallback);
        this._hidden = !enabled;
    }
    _setEnabled(value) {
        super._setEnabled(value);
        this.hidden = !value;
    }
}
/**
 * Dropdown action that aggregates enablement sub-actions and shows the
 * first visible one as the primary button, with others in the dropdown.
 * Hides itself entirely when all sub-actions are hidden.
 */
export class EnablementDropDownAction extends Action {
    get menuActions() { return [...this._menuActions]; }
    get isHidden() { return this._isHidden; }
    get onDidChange() { return this._onDidChange.event; }
    constructor(id, subActions) {
        super(id, undefined, 'extension-action label action-dropdown');
        this.menuActionClassNames = ['extension-action', 'label', 'action-dropdown'];
        this._menuActions = [];
        this._isHidden = false;
        this._onDidChange = new Emitter();
        this.subActions = subActions;
        for (const a of subActions) {
            a.onDidChange(() => this._updateDropdown());
        }
        this._updateDropdown();
    }
    _updateDropdown() {
        const visible = this.subActions.filter(a => !a.hidden);
        const primary = visible[0];
        this._menuActions = visible.length > 1 ? [...visible] : [];
        if (primary) {
            this._isHidden = false;
            this.enabled = true;
            this.label = primary.label;
            this.tooltip = primary.tooltip;
        }
        else {
            this._isHidden = true;
            this.enabled = false;
        }
        this._onDidChange.fire({ menuActions: this._menuActions });
    }
    async run() {
        const primary = this.subActions.find(a => !a.hidden);
        await primary?.run();
    }
    dispose() {
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
    constructor(action, options, contextMenuProvider) {
        super(null, action, options, contextMenuProvider);
        this._register(action.onDidChange(e => {
            if (hasKey(e, { menuActions: true })) {
                this.updateClass();
            }
        }));
    }
    render(container) {
        super.render(container);
        this.updateClass();
    }
    updateClass() {
        super.updateClass();
        if (this.element && this.dropdownMenuActionViewItem?.element) {
            const action = this._action;
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
export function createEnablePluginDropDown(plugin, enablementModel, workspaceContextService) {
    const key = plugin.uri.toString();
    const hasWorkspace = workspaceContextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */;
    const enable = new EnablementSubAction('agentPlugin.enable', localize('enable', "Enable"), 'extension-action label prominent', isContributionDisabled(plugin.enablement.get()), () => { enablementModel.setEnabled(key, 2 /* ContributionEnablementState.EnabledProfile */); return Promise.resolve(); });
    const enableWorkspace = new EnablementSubAction('agentPlugin.enableForWorkspace', localize('enableForWorkspace', "Enable (Workspace)"), 'extension-action label', isContributionDisabled(plugin.enablement.get()) && hasWorkspace, () => { enablementModel.setEnabled(key, 3 /* ContributionEnablementState.EnabledWorkspace */); return Promise.resolve(); });
    return new EnablementDropDownAction('agentPlugin.enableDropdown', [enable, enableWorkspace]);
}
/**
 * Creates the disable dropdown action for a plugin, containing Disable
 * and Disable (Workspace) sub-actions.
 */
export function createDisablePluginDropDown(plugin, enablementModel, workspaceContextService) {
    const key = plugin.uri.toString();
    const hasWorkspace = workspaceContextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */;
    const disable = new EnablementSubAction('agentPlugin.disable', localize('disable', "Disable"), 'extension-action label disable', isContributionEnabled(plugin.enablement.get()), () => { enablementModel.setEnabled(key, 0 /* ContributionEnablementState.DisabledProfile */); return Promise.resolve(); });
    const disableWorkspace = new EnablementSubAction('agentPlugin.disableForWorkspace', localize('disableForWorkspace', "Disable (Workspace)"), 'extension-action label disable', isContributionEnabled(plugin.enablement.get()) && hasWorkspace, () => { enablementModel.setEnabled(key, 1 /* ContributionEnablementState.DisabledWorkspace */); return Promise.resolve(); });
    return new EnablementDropDownAction('agentPlugin.disableDropdown', [disable, disableWorkspace]);
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5BY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50UGx1Z2luQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsTUFBTSxFQUErQixNQUFNLG9DQUFvQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzRCxPQUFPLEVBQUUsZ0NBQWdDLEVBQTRDLE1BQU0sZ0VBQWdFLENBQUM7QUFFNUosT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFOUUsT0FBTyxFQUFFLHdCQUF3QixFQUFrQixNQUFNLG9EQUFvRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFpRCxzQkFBc0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3ZJLE9BQU8sRUFBZ0IsbUJBQW1CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUVsRixPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN6RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFMUQsd0JBQXdCO0FBRWpCLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsTUFBTTtJQUM5QyxZQUNDLElBQTRCLEVBQ0wsb0JBQTJD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