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
var InstallAction_1, InstallInWorkspaceAction_1, InstallInRemoteAction_1, UninstallAction_1, EnableMcpServerGloballyAction_1, EnableMcpServerForWorkspaceAction_1, DisableMcpServerGloballyAction_1, DisableMcpServerForWorkspaceAction_1, ManageMcpServerAction_1, StartServerAction_1, StopServerAction_1, RestartServerAction_1, AuthServerAction_1, ShowServerOutputAction_1, ShowServerConfigurationAction_1, ShowServerJsonConfigurationAction_1, ConfigureModelAccessAction_1, ShowSamplingRequestsAction_1, BrowseResourcesAction_1, McpServerStatusAction_1;
import { getDomNodePagePosition } from '../../../../base/browser/dom.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { disposeIfDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IAuthenticationQueryService } from '../../../services/authentication/common/authenticationQuery.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { errorIcon, infoIcon, manageExtensionIcon, trustIcon, warningIcon } from '../../extensions/browser/extensionsIcons.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpSamplingService, IMcpService, IMcpWorkbenchService, McpConnectionState } from '../common/mcpTypes.js';
import { startServerByFilter } from '../common/mcpTypesUtils.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { Schemas } from '../../../../base/common/network.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ActionWithDropdownActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import Severity from '../../../../base/common/severity.js';
import { isContributionDisabled, isContributionEnabled } from '../../chat/common/enablement.js';
export class McpServerAction extends Action {
    constructor() {
        super(...arguments);
        this._onDidChange = this._register(new Emitter());
        this._hidden = false;
        this.hideOnDisabled = true;
        this._mcpServer = null;
    }
    get onDidChange() { return this._onDidChange.event; }
    static { this.EXTENSION_ACTION_CLASS = 'extension-action'; }
    static { this.TEXT_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} text`; }
    static { this.LABEL_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} label`; }
    static { this.PROMINENT_LABEL_ACTION_CLASS = `${McpServerAction.LABEL_ACTION_CLASS} prominent`; }
    static { this.ICON_ACTION_CLASS = `${McpServerAction.EXTENSION_ACTION_CLASS} icon`; }
    get hidden() { return this._hidden; }
    set hidden(hidden) {
        if (this._hidden !== hidden) {
            this._hidden = hidden;
            this._onDidChange.fire({ hidden });
        }
    }
    _setEnabled(value) {
        super._setEnabled(value);
        if (this.hideOnDisabled) {
            this.hidden = !value;
        }
    }
    get mcpServer() { return this._mcpServer; }
    set mcpServer(mcpServer) { this._mcpServer = mcpServer; this.update(); }
}
export class ButtonWithDropDownExtensionAction extends McpServerAction {
    get menuActions() { return [...this._menuActions]; }
    get mcpServer() {
        return super.mcpServer;
    }
    set mcpServer(mcpServer) {
        this.actions.forEach(a => a.mcpServer = mcpServer);
        super.mcpServer = mcpServer;
    }
    constructor(id, clazz, actionsGroups) {
        clazz = `${clazz} action-dropdown`;
        super(id, undefined, clazz);
        this.actionsGroups = actionsGroups;
        this.menuActionClassNames = [];
        this._menuActions = [];
        this.menuActionClassNames = clazz.split(' ');
        this.hideOnDisabled = false;
        this.actions = actionsGroups.flat();
        this.update();
        this._register(Event.any(...this.actions.map(a => a.onDidChange))(() => this.update(true)));
        this.actions.forEach(a => this._register(a));
    }
    update(donotUpdateActions) {
        if (!donotUpdateActions) {
            this.actions.forEach(a => a.update());
        }
        const actionsGroups = this.actionsGroups.map(actionsGroup => actionsGroup.filter(a => !a.hidden));
        let actions = [];
        for (const visibleActions of actionsGroups) {
            if (visibleActions.length) {
                actions = [...actions, ...visibleActions, new Separator()];
            }
        }
        actions = actions.length ? actions.slice(0, actions.length - 1) : actions;
        this.primaryAction = actions[0];
        this._menuActions = actions.length > 1 ? actions : [];
        this._onDidChange.fire({ menuActions: this._menuActions });
        if (this.primaryAction) {
            this.hidden = false;
            this.enabled = this.primaryAction.enabled;
            this.label = this.getLabel(this.primaryAction);
            this.tooltip = this.primaryAction.tooltip;
        }
        else {
            this.hidden = true;
            this.enabled = false;
        }
    }
    async run() {
        if (this.enabled) {
            await this.primaryAction?.run();
        }
    }
    getLabel(action) {
        return action.label;
    }
}
export class ButtonWithDropdownExtensionActionViewItem extends ActionWithDropdownActionViewItem {
    constructor(action, options, contextMenuProvider) {
        super(null, action, options, contextMenuProvider);
        this._register(action.onDidChange(e => {
            if (e.hidden !== undefined || e.menuActions !== undefined) {
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
            this.element.classList.toggle('hide', this._action.hidden);
            const isMenuEmpty = this._action.menuActions.length === 0;
            this.element.classList.toggle('empty', isMenuEmpty);
            this.dropdownMenuActionViewItem.element.classList.toggle('hide', isMenuEmpty);
        }
    }
}
let DropDownAction = class DropDownAction extends McpServerAction {
    constructor(id, label, cssClass, enabled, instantiationService) {
        super(id, label, cssClass, enabled);
        this.instantiationService = instantiationService;
        this._actionViewItem = null;
    }
    createActionViewItem(options) {
        this._actionViewItem = this.instantiationService.createInstance(DropDownExtensionActionViewItem, this, options);
        return this._actionViewItem;
    }
    run(actionGroups) {
        this._actionViewItem?.showMenu(actionGroups);
        return Promise.resolve();
    }
};
DropDownAction = __decorate([
    __param(4, IInstantiationService)
], DropDownAction);
export { DropDownAction };
let DropDownExtensionActionViewItem = class DropDownExtensionActionViewItem extends ActionViewItem {
    constructor(action, options, contextMenuService) {
        super(null, action, { ...options, icon: true, label: true });
        this.contextMenuService = contextMenuService;
    }
    showMenu(menuActionGroups) {
        if (this.element) {
            const actions = this.getActions(menuActionGroups);
            const elementPosition = getDomNodePagePosition(this.element);
            const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
            this.contextMenuService.showContextMenu({
                getAnchor: () => anchor,
                getActions: () => actions,
                actionRunner: this.actionRunner,
                onHide: () => disposeIfDisposable(actions)
            });
        }
    }
    getActions(menuActionGroups) {
        let actions = [];
        for (const menuActions of menuActionGroups) {
            actions = [...actions, ...menuActions, new Separator()];
        }
        return actions.length ? actions.slice(0, actions.length - 1) : actions;
    }
};
DropDownExtensionActionViewItem = __decorate([
    __param(2, IContextMenuService)
], DropDownExtensionActionViewItem);
export { DropDownExtensionActionViewItem };
let InstallAction = class InstallAction extends McpServerAction {
    static { InstallAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent install`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(open, mcpWorkbenchService, telemetryService, mcpService) {
        super('extensions.install', localize('install', "Install"), InstallAction_1.CLASS, false);
        this.open = open;
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.telemetryService = telemetryService;
        this.mcpService = mcpService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = InstallAction_1.HIDE;
        if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
            return;
        }
        if (this.mcpServer.installState !== 3 /* McpServerInstallState.Uninstalled */) {
            return;
        }
        this.class = InstallAction_1.CLASS;
        this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
    }
    async run() {
        if (!this.mcpServer) {
            return;
        }
        if (this.open) {
            this.mcpWorkbenchService.open(this.mcpServer);
            alert(localize('mcpServerInstallation', "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
        }
        this.telemetryService.publicLog2('mcp:action:install', { name: this.mcpServer.gallery?.name });
        const installed = await this.mcpWorkbenchService.install(this.mcpServer);
        await startServerByFilter(this.mcpService, s => {
            return s.definition.label === installed.name;
        });
    }
};
InstallAction = InstallAction_1 = __decorate([
    __param(1, IMcpWorkbenchService),
    __param(2, ITelemetryService),
    __param(3, IMcpService)
], InstallAction);
export { InstallAction };
let InstallInWorkspaceAction = class InstallInWorkspaceAction extends McpServerAction {
    static { InstallInWorkspaceAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent install`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(open, mcpWorkbenchService, workspaceService, quickInputService, telemetryService, mcpService) {
        super('extensions.installWorkspace', localize('installInWorkspace', "Install in Workspace"), InstallAction.CLASS, false);
        this.open = open;
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.workspaceService = workspaceService;
        this.quickInputService = quickInputService;
        this.telemetryService = telemetryService;
        this.mcpService = mcpService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = InstallInWorkspaceAction_1.HIDE;
        if (this.workspaceService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
            return;
        }
        if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
            return;
        }
        if (this.mcpServer.installState !== 3 /* McpServerInstallState.Uninstalled */ && this.mcpServer.local?.scope === "workspace" /* LocalMcpServerScope.Workspace */) {
            return;
        }
        this.class = InstallAction.CLASS;
        this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
    }
    async run() {
        if (!this.mcpServer) {
            return;
        }
        if (this.open) {
            this.mcpWorkbenchService.open(this.mcpServer, { preserveFocus: true });
            alert(localize('mcpServerInstallation', "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
        }
        const target = await this.getConfigurationTarget();
        if (!target) {
            return;
        }
        this.telemetryService.publicLog2('mcp:action:install:workspace', { name: this.mcpServer.gallery?.name });
        const installed = await this.mcpWorkbenchService.install(this.mcpServer, { target });
        await startServerByFilter(this.mcpService, s => {
            return s.definition.label === installed.name;
        });
    }
    async getConfigurationTarget() {
        const options = [];
        for (const folder of this.workspaceService.getWorkspace().folders) {
            options.push({ target: folder, label: folder.name, description: localize('install in workspace folder', "Workspace Folder") });
        }
        if (this.workspaceService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            if (options.length > 0) {
                options.push({ type: 'separator' });
            }
            options.push({ target: 5 /* ConfigurationTarget.WORKSPACE */, label: localize('mcp.target.workspace', "Workspace") });
        }
        if (options.length === 1) {
            return options[0].target;
        }
        const targetPick = await this.quickInputService.pick(options, {
            title: localize('mcp.target.title', "Choose where to install the MCP server"),
        });
        return targetPick?.target;
    }
};
InstallInWorkspaceAction = InstallInWorkspaceAction_1 = __decorate([
    __param(1, IMcpWorkbenchService),
    __param(2, IWorkspaceContextService),
    __param(3, IQuickInputService),
    __param(4, ITelemetryService),
    __param(5, IMcpService)
], InstallInWorkspaceAction);
export { InstallInWorkspaceAction };
let InstallInRemoteAction = class InstallInRemoteAction extends McpServerAction {
    static { InstallInRemoteAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent install`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(open, mcpWorkbenchService, environmentService, telemetryService, labelService, mcpService) {
        super('extensions.installRemote', localize('installInRemote', "Install (Remote)"), InstallAction.CLASS, false);
        this.open = open;
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.environmentService = environmentService;
        this.telemetryService = telemetryService;
        this.labelService = labelService;
        this.mcpService = mcpService;
        const remoteLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority);
        this.label = localize('installInRemoteLabel', "Install in {0}", remoteLabel);
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = InstallInRemoteAction_1.HIDE;
        if (!this.environmentService.remoteAuthority) {
            return;
        }
        if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
            return;
        }
        if (this.mcpServer.installState !== 3 /* McpServerInstallState.Uninstalled */) {
            if (this.mcpServer.local?.scope === "remoteUser" /* LocalMcpServerScope.RemoteUser */) {
                return;
            }
            if (this.mcpWorkbenchService.local.find(mcpServer => mcpServer.name === this.mcpServer?.name && mcpServer.local?.scope === "remoteUser" /* LocalMcpServerScope.RemoteUser */)) {
                return;
            }
        }
        this.class = InstallAction.CLASS;
        this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
    }
    async run() {
        if (!this.mcpServer) {
            return;
        }
        if (this.open) {
            this.mcpWorkbenchService.open(this.mcpServer);
            alert(localize('mcpServerInstallation', "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
        }
        this.telemetryService.publicLog2('mcp:action:install:remote', { name: this.mcpServer.gallery?.name });
        const installed = await this.mcpWorkbenchService.install(this.mcpServer, { target: 4 /* ConfigurationTarget.USER_REMOTE */ });
        await startServerByFilter(this.mcpService, s => {
            return s.definition.label === installed.name;
        });
    }
};
InstallInRemoteAction = InstallInRemoteAction_1 = __decorate([
    __param(1, IMcpWorkbenchService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, ITelemetryService),
    __param(4, ILabelService),
    __param(5, IMcpService)
], InstallInRemoteAction);
export { InstallInRemoteAction };
export class InstallingLabelAction extends McpServerAction {
    static { this.LABEL = localize('installing', "Installing"); }
    static { this.CLASS = `${McpServerAction.LABEL_ACTION_CLASS} install installing`; }
    constructor() {
        super('extension.installing', InstallingLabelAction.LABEL, InstallingLabelAction.CLASS, false);
    }
    update() {
        this.class = `${InstallingLabelAction.CLASS}${this.mcpServer && this.mcpServer.installState === 0 /* McpServerInstallState.Installing */ ? '' : ' hide'}`;
    }
}
let UninstallAction = class UninstallAction extends McpServerAction {
    static { UninstallAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent uninstall`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpWorkbenchService) {
        super('extensions.uninstall', localize('uninstall', "Uninstall"), UninstallAction_1.CLASS, false);
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = UninstallAction_1.HIDE;
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        if (this.mcpServer.installState !== 1 /* McpServerInstallState.Installed */) {
            this.enabled = false;
            return;
        }
        this.class = UninstallAction_1.CLASS;
        this.enabled = true;
        this.label = localize('uninstall', "Uninstall");
    }
    async run() {
        if (!this.mcpServer) {
            return;
        }
        await this.mcpWorkbenchService.uninstall(this.mcpServer);
    }
};
UninstallAction = UninstallAction_1 = __decorate([
    __param(0, IMcpWorkbenchService)
], UninstallAction);
export { UninstallAction };
let EnableMcpServerGloballyAction = class EnableMcpServerGloballyAction extends McpServerAction {
    static { EnableMcpServerGloballyAction_1 = this; }
    static { this.ID = 'mcpServer.enableGlobally'; }
    constructor(mcpService) {
        super(EnableMcpServerGloballyAction_1.ID, localize('enableGlobally', "Enable"), McpServerAction.LABEL_ACTION_CLASS);
        this.mcpService = mcpService;
        this.tooltip = localize('enableGloballyTooltip', "Enable this MCP server");
        this.update();
    }
    update() {
        this.enabled = false;
        if (!this.mcpServer?.local) {
            return;
        }
        const server = this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
        if (!server) {
            return;
        }
        const enablement = server.enablement.get();
        this.enabled = isContributionDisabled(enablement);
    }
    async run() {
        if (!this.mcpServer) {
            return;
        }
        this.mcpService.enablementModel.setEnabled(this.mcpServer.id, 2 /* ContributionEnablementState.EnabledProfile */);
    }
};
EnableMcpServerGloballyAction = EnableMcpServerGloballyAction_1 = __decorate([
    __param(0, IMcpService)
], EnableMcpServerGloballyAction);
export { EnableMcpServerGloballyAction };
let EnableMcpServerForWorkspaceAction = class EnableMcpServerForWorkspaceAction extends McpServerAction {
    static { EnableMcpServerForWorkspaceAction_1 = this; }
    static { this.ID = 'mcpServer.enableForWorkspace'; }
    constructor(mcpService, workspaceService) {
        super(EnableMcpServerForWorkspaceAction_1.ID, localize('enableForWorkspace', "Enable (Workspace)"), McpServerAction.LABEL_ACTION_CLASS);
        this.mcpService = mcpService;
        this.workspaceService = workspaceService;
        this.tooltip = localize('enableForWorkspaceTooltip', "Enable this MCP server only in this workspace");
        this.update();
    }
    update() {
        this.enabled = false;
        if (!this.mcpServer?.local) {
            return;
        }
        if (this.workspaceService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
            return;
        }
        const server = this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
        if (!server) {
            return;
        }
        const enablement = server.enablement.get();
        this.enabled = isContributionDisabled(enablement);
    }
    async run() {
        if (!this.mcpServer) {
            return;
        }
        this.mcpService.enablementModel.setEnabled(this.mcpServer.id, 3 /* ContributionEnablementState.EnabledWorkspace */);
    }
};
EnableMcpServerForWorkspaceAction = EnableMcpServerForWorkspaceAction_1 = __decorate([
    __param(0, IMcpService),
    __param(1, IWorkspaceContextService)
], EnableMcpServerForWorkspaceAction);
export { EnableMcpServerForWorkspaceAction };
let DisableMcpServerGloballyAction = class DisableMcpServerGloballyAction extends McpServerAction {
    static { DisableMcpServerGloballyAction_1 = this; }
    static { this.ID = 'mcpServer.disableGlobally'; }
    constructor(mcpService) {
        super(DisableMcpServerGloballyAction_1.ID, localize('disableGlobally', "Disable"), McpServerAction.LABEL_ACTION_CLASS);
        this.mcpService = mcpService;
        this.tooltip = localize('disableGloballyTooltip', "Disable this MCP server");
        this.update();
    }
    update() {
        this.enabled = false;
        if (!this.mcpServer?.local) {
            return;
        }
        const server = this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
        if (!server) {
            return;
        }
        const enablement = server.enablement.get();
        this.enabled = isContributionEnabled(enablement);
    }
    async run() {
        if (!this.mcpServer) {
            return;
        }
        this.mcpService.enablementModel.setEnabled(this.mcpServer.id, 0 /* ContributionEnablementState.DisabledProfile */);
    }
};
DisableMcpServerGloballyAction = DisableMcpServerGloballyAction_1 = __decorate([
    __param(0, IMcpService)
], DisableMcpServerGloballyAction);
export { DisableMcpServerGloballyAction };
let DisableMcpServerForWorkspaceAction = class DisableMcpServerForWorkspaceAction extends McpServerAction {
    static { DisableMcpServerForWorkspaceAction_1 = this; }
    static { this.ID = 'mcpServer.disableForWorkspace'; }
    constructor(mcpService, workspaceService) {
        super(DisableMcpServerForWorkspaceAction_1.ID, localize('disableForWorkspace', "Disable (Workspace)"), McpServerAction.LABEL_ACTION_CLASS);
        this.mcpService = mcpService;
        this.workspaceService = workspaceService;
        this.tooltip = localize('disableForWorkspaceTooltip', "Disable this MCP server only in this workspace");
        this.update();
    }
    update() {
        this.enabled = false;
        if (!this.mcpServer?.local) {
            return;
        }
        if (this.workspaceService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
            return;
        }
        const server = this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
        if (!server) {
            return;
        }
        const enablement = server.enablement.get();
        this.enabled = isContributionEnabled(enablement);
    }
    async run() {
        if (!this.mcpServer) {
            return;
        }
        this.mcpService.enablementModel.setEnabled(this.mcpServer.id, 1 /* ContributionEnablementState.DisabledWorkspace */);
    }
};
DisableMcpServerForWorkspaceAction = DisableMcpServerForWorkspaceAction_1 = __decorate([
    __param(0, IMcpService),
    __param(1, IWorkspaceContextService)
], DisableMcpServerForWorkspaceAction);
export { DisableMcpServerForWorkspaceAction };
let EnableMcpDropDownAction = class EnableMcpDropDownAction extends ButtonWithDropDownExtensionAction {
    constructor(instantiationService) {
        super('mcpServer.enable', McpServerAction.LABEL_ACTION_CLASS, [
            [
                instantiationService.createInstance(EnableMcpServerGloballyAction),
                instantiationService.createInstance(EnableMcpServerForWorkspaceAction),
            ]
        ]);
    }
};
EnableMcpDropDownAction = __decorate([
    __param(0, IInstantiationService)
], EnableMcpDropDownAction);
export { EnableMcpDropDownAction };
let DisableMcpDropDownAction = class DisableMcpDropDownAction extends ButtonWithDropDownExtensionAction {
    constructor(instantiationService) {
        super('mcpServer.disable', McpServerAction.LABEL_ACTION_CLASS, [
            [
                instantiationService.createInstance(DisableMcpServerGloballyAction),
                instantiationService.createInstance(DisableMcpServerForWorkspaceAction),
            ]
        ]);
    }
};
DisableMcpDropDownAction = __decorate([
    __param(0, IInstantiationService)
], DisableMcpDropDownAction);
export { DisableMcpDropDownAction };
export function getContextMenuActions(mcpServer, isEditorAction, instantiationService) {
    return instantiationService.invokeFunction(accessor => {
        const workspaceService = accessor.get(IWorkspaceContextService);
        const environmentService = accessor.get(IWorkbenchEnvironmentService);
        const groups = [];
        const isInstalled = mcpServer.installState === 1 /* McpServerInstallState.Installed */;
        if (isInstalled) {
            groups.push([
                instantiationService.createInstance(StartServerAction),
            ]);
            groups.push([
                instantiationService.createInstance(StopServerAction),
                instantiationService.createInstance(RestartServerAction),
            ]);
            groups.push([
                instantiationService.createInstance(EnableMcpServerGloballyAction),
                instantiationService.createInstance(EnableMcpServerForWorkspaceAction),
                instantiationService.createInstance(DisableMcpServerGloballyAction),
                instantiationService.createInstance(DisableMcpServerForWorkspaceAction),
            ]);
            groups.push([
                instantiationService.createInstance(AuthServerAction),
            ]);
            groups.push([
                instantiationService.createInstance(ShowServerOutputAction),
                instantiationService.createInstance(ShowServerConfigurationAction),
                instantiationService.createInstance(ShowServerJsonConfigurationAction),
            ]);
            groups.push([
                instantiationService.createInstance(ConfigureModelAccessAction),
                instantiationService.createInstance(ShowSamplingRequestsAction),
            ]);
            groups.push([
                instantiationService.createInstance(BrowseResourcesAction),
            ]);
            if (!isEditorAction) {
                const installGroup = [instantiationService.createInstance(UninstallAction)];
                if (workspaceService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */) {
                    installGroup.push(instantiationService.createInstance(InstallInWorkspaceAction, false));
                }
                if (environmentService.remoteAuthority && mcpServer.local?.scope !== "remoteUser" /* LocalMcpServerScope.RemoteUser */) {
                    installGroup.push(instantiationService.createInstance(InstallInRemoteAction, false));
                }
                groups.push(installGroup);
            }
        }
        else {
            const installGroup = [];
            if (workspaceService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */) {
                installGroup.push(instantiationService.createInstance(InstallInWorkspaceAction, !isEditorAction));
            }
            if (environmentService.remoteAuthority) {
                installGroup.push(instantiationService.createInstance(InstallInRemoteAction, !isEditorAction));
            }
            groups.push(installGroup);
        }
        groups.forEach(group => group.forEach(extensionAction => extensionAction.mcpServer = mcpServer));
        return groups;
    });
}
let ManageMcpServerAction = class ManageMcpServerAction extends DropDownAction {
    static { ManageMcpServerAction_1 = this; }
    static { this.ID = 'mcpServer.manage'; }
    static { this.Class = `${McpServerAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon); }
    static { this.HideManageExtensionClass = `${this.Class} hide`; }
    constructor(isEditorAction, instantiationService) {
        super(ManageMcpServerAction_1.ID, '', '', true, instantiationService);
        this.isEditorAction = isEditorAction;
        this.tooltip = localize('manage', "Manage");
        this.update();
    }
    async run() {
        return super.run(this.mcpServer ? getContextMenuActions(this.mcpServer, this.isEditorAction, this.instantiationService) : []);
    }
    update() {
        this.class = ManageMcpServerAction_1.HideManageExtensionClass;
        this.enabled = false;
        if (!this.mcpServer) {
            return;
        }
        if (this.isEditorAction) {
            this.enabled = true;
            this.class = ManageMcpServerAction_1.Class;
        }
        else {
            this.enabled = !!this.mcpServer.local;
            this.class = this.enabled ? ManageMcpServerAction_1.Class : ManageMcpServerAction_1.HideManageExtensionClass;
        }
    }
};
ManageMcpServerAction = ManageMcpServerAction_1 = __decorate([
    __param(1, IInstantiationService)
], ManageMcpServerAction);
export { ManageMcpServerAction };
let StartServerAction = class StartServerAction extends McpServerAction {
    static { StartServerAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent start`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpService) {
        super('extensions.start', localize('start', "Start Server"), StartServerAction_1.CLASS, false);
        this.mcpService = mcpService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = StartServerAction_1.HIDE;
        const server = this.getServer();
        if (!server) {
            return;
        }
        const serverState = server.connectionState.get();
        if (!McpConnectionState.canBeStarted(serverState.state)) {
            return;
        }
        this.class = StartServerAction_1.CLASS;
        this.enabled = true;
        this.label = localize('start', "Start Server");
    }
    async run() {
        const server = this.getServer();
        if (!server) {
            return;
        }
        await server.start({ promptType: 'all-untrusted' });
        server.showOutput();
    }
    getServer() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
    }
};
StartServerAction = StartServerAction_1 = __decorate([
    __param(0, IMcpService)
], StartServerAction);
export { StartServerAction };
let StopServerAction = class StopServerAction extends McpServerAction {
    static { StopServerAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent stop`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpService) {
        super('extensions.stop', localize('stop', "Stop Server"), StopServerAction_1.CLASS, false);
        this.mcpService = mcpService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = StopServerAction_1.HIDE;
        const server = this.getServer();
        if (!server) {
            return;
        }
        const serverState = server.connectionState.get();
        if (McpConnectionState.canBeStarted(serverState.state)) {
            return;
        }
        this.class = StopServerAction_1.CLASS;
        this.enabled = true;
        this.label = localize('stop', "Stop Server");
    }
    async run() {
        const server = this.getServer();
        if (!server) {
            return;
        }
        await server.stop();
    }
    getServer() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
    }
};
StopServerAction = StopServerAction_1 = __decorate([
    __param(0, IMcpService)
], StopServerAction);
export { StopServerAction };
let RestartServerAction = class RestartServerAction extends McpServerAction {
    static { RestartServerAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent restart`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpService) {
        super('extensions.restart', localize('restart', "Restart Server"), RestartServerAction_1.CLASS, false);
        this.mcpService = mcpService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = RestartServerAction_1.HIDE;
        const server = this.getServer();
        if (!server) {
            return;
        }
        const serverState = server.connectionState.get();
        if (McpConnectionState.canBeStarted(serverState.state)) {
            return;
        }
        this.class = RestartServerAction_1.CLASS;
        this.enabled = true;
        this.label = localize('restart', "Restart Server");
    }
    async run() {
        const server = this.getServer();
        if (!server) {
            return;
        }
        await server.stop();
        await server.start({ promptType: 'all-untrusted' });
        server.showOutput();
    }
    getServer() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
    }
};
RestartServerAction = RestartServerAction_1 = __decorate([
    __param(0, IMcpService)
], RestartServerAction);
export { RestartServerAction };
let AuthServerAction = class AuthServerAction extends McpServerAction {
    static { AuthServerAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent account`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    static { this.SIGN_OUT = localize('mcp.signOut', 'Sign Out'); }
    static { this.DISCONNECT = localize('mcp.disconnect', 'Disconnect Account'); }
    constructor(mcpService, _authenticationQueryService, _authenticationService) {
        super('extensions.restart', localize('restart', "Restart Server"), RestartServerAction.CLASS, false);
        this.mcpService = mcpService;
        this._authenticationQueryService = _authenticationQueryService;
        this._authenticationService = _authenticationService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = AuthServerAction_1.HIDE;
        const server = this.getServer();
        if (!server) {
            return;
        }
        const accountQuery = this.getAccountQuery();
        if (!accountQuery) {
            return;
        }
        this._accountQuery = accountQuery;
        this.class = AuthServerAction_1.CLASS;
        this.enabled = true;
        let label = accountQuery.entities().getEntityCount().total > 1 ? AuthServerAction_1.DISCONNECT : AuthServerAction_1.SIGN_OUT;
        label += ` (${accountQuery.accountName})`;
        this.label = label;
    }
    async run() {
        const server = this.getServer();
        if (!server) {
            return;
        }
        const accountQuery = this.getAccountQuery();
        if (!accountQuery) {
            return;
        }
        await server.stop();
        const { providerId, accountName } = accountQuery;
        accountQuery.mcpServer(server.definition.id).setAccessAllowed(false, server.definition.label);
        if (this.label === AuthServerAction_1.SIGN_OUT) {
            const accounts = await this._authenticationService.getAccounts(providerId);
            const account = accounts.find(a => a.label === accountName);
            if (account) {
                const sessions = await this._authenticationService.getSessions(providerId, undefined, { account });
                for (const session of sessions) {
                    await this._authenticationService.removeSession(providerId, session.id);
                }
            }
        }
    }
    getServer() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
    }
    getAccountQuery() {
        const server = this.getServer();
        if (!server) {
            return undefined;
        }
        if (this._accountQuery) {
            return this._accountQuery;
        }
        const serverId = server.definition.id;
        const preferences = this._authenticationQueryService.mcpServer(serverId).getAllAccountPreferences();
        if (!preferences.size) {
            return undefined;
        }
        for (const [providerId, accountName] of preferences) {
            const accountQuery = this._authenticationQueryService.provider(providerId).account(accountName);
            if (!accountQuery.mcpServer(serverId).isAccessAllowed()) {
                continue; // skip accounts that are not allowed
            }
            return accountQuery;
        }
        return undefined;
    }
};
AuthServerAction = AuthServerAction_1 = __decorate([
    __param(0, IMcpService),
    __param(1, IAuthenticationQueryService),
    __param(2, IAuthenticationService)
], AuthServerAction);
export { AuthServerAction };
let ShowServerOutputAction = class ShowServerOutputAction extends McpServerAction {
    static { ShowServerOutputAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent output`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpService) {
        super('extensions.output', localize('output', "Show Output"), ShowServerOutputAction_1.CLASS, false);
        this.mcpService = mcpService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = ShowServerOutputAction_1.HIDE;
        const server = this.getServer();
        if (!server) {
            return;
        }
        this.class = ShowServerOutputAction_1.CLASS;
        this.enabled = true;
        this.label = localize('output', "Show Output");
    }
    async run() {
        const server = this.getServer();
        if (!server) {
            return;
        }
        server.showOutput();
    }
    getServer() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
    }
};
ShowServerOutputAction = ShowServerOutputAction_1 = __decorate([
    __param(0, IMcpService)
], ShowServerOutputAction);
export { ShowServerOutputAction };
let ShowServerConfigurationAction = class ShowServerConfigurationAction extends McpServerAction {
    static { ShowServerConfigurationAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent config`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpWorkbenchService) {
        super('extensions.config', localize('config', "Show Configuration"), ShowServerConfigurationAction_1.CLASS, false);
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = ShowServerConfigurationAction_1.HIDE;
        if (!this.mcpServer?.local) {
            return;
        }
        this.class = ShowServerConfigurationAction_1.CLASS;
        this.enabled = true;
    }
    async run() {
        if (!this.mcpServer?.local) {
            return;
        }
        this.mcpWorkbenchService.open(this.mcpServer, { tab: "configuration" /* McpServerEditorTab.Configuration */ });
    }
};
ShowServerConfigurationAction = ShowServerConfigurationAction_1 = __decorate([
    __param(0, IMcpWorkbenchService)
], ShowServerConfigurationAction);
export { ShowServerConfigurationAction };
let ShowServerJsonConfigurationAction = class ShowServerJsonConfigurationAction extends McpServerAction {
    static { ShowServerJsonConfigurationAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent config`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpService, mcpRegistry, editorService) {
        super('extensions.jsonConfig', localize('configJson', "Show Configuration (JSON)"), ShowServerJsonConfigurationAction_1.CLASS, false);
        this.mcpService = mcpService;
        this.mcpRegistry = mcpRegistry;
        this.editorService = editorService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = ShowServerJsonConfigurationAction_1.HIDE;
        const configurationTarget = this.getConfigurationTarget();
        if (!configurationTarget) {
            return;
        }
        this.class = ShowServerConfigurationAction.CLASS;
        this.enabled = true;
    }
    async run() {
        const configurationTarget = this.getConfigurationTarget();
        if (!configurationTarget) {
            return;
        }
        this.editorService.openEditor({
            resource: URI.isUri(configurationTarget) ? configurationTarget : configurationTarget.uri,
            options: { selection: URI.isUri(configurationTarget) ? undefined : configurationTarget.range }
        });
    }
    getConfigurationTarget() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        const server = this.mcpService.servers.get().find(s => s.definition.label === this.mcpServer?.name);
        if (!server) {
            return;
        }
        const collection = this.mcpRegistry.collections.get().find(c => c.id === server.collection.id);
        const serverDefinition = collection?.serverDefinitions.get().find(s => s.id === server.definition.id);
        return serverDefinition?.presentation?.origin || collection?.presentation?.origin;
    }
};
ShowServerJsonConfigurationAction = ShowServerJsonConfigurationAction_1 = __decorate([
    __param(0, IMcpService),
    __param(1, IMcpRegistry),
    __param(2, IEditorService)
], ShowServerJsonConfigurationAction);
export { ShowServerJsonConfigurationAction };
let ConfigureModelAccessAction = class ConfigureModelAccessAction extends McpServerAction {
    static { ConfigureModelAccessAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent config`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpService, commandService) {
        super('extensions.config', localize('mcp.configAccess', 'Configure Model Access'), ConfigureModelAccessAction_1.CLASS, false);
        this.mcpService = mcpService;
        this.commandService = commandService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = ConfigureModelAccessAction_1.HIDE;
        const server = this.getServer();
        if (!server) {
            return;
        }
        this.class = ConfigureModelAccessAction_1.CLASS;
        this.enabled = true;
        this.label = localize('mcp.configAccess', 'Configure Model Access');
    }
    async run() {
        const server = this.getServer();
        if (!server) {
            return;
        }
        this.commandService.executeCommand("workbench.mcp.configureSamplingModels" /* McpCommandIds.ConfigureSamplingModels */, server);
    }
    getServer() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
    }
};
ConfigureModelAccessAction = ConfigureModelAccessAction_1 = __decorate([
    __param(0, IMcpService),
    __param(1, ICommandService)
], ConfigureModelAccessAction);
export { ConfigureModelAccessAction };
let ShowSamplingRequestsAction = class ShowSamplingRequestsAction extends McpServerAction {
    static { ShowSamplingRequestsAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent config`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpService, samplingService, editorService) {
        super('extensions.config', localize('mcp.samplingLog', 'Show Sampling Requests'), ShowSamplingRequestsAction_1.CLASS, false);
        this.mcpService = mcpService;
        this.samplingService = samplingService;
        this.editorService = editorService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = ShowSamplingRequestsAction_1.HIDE;
        const server = this.getServer();
        if (!server) {
            return;
        }
        if (!this.samplingService.hasLogs(server)) {
            return;
        }
        this.class = ShowSamplingRequestsAction_1.CLASS;
        this.enabled = true;
    }
    async run() {
        const server = this.getServer();
        if (!server) {
            return;
        }
        if (!this.samplingService.hasLogs(server)) {
            return;
        }
        this.editorService.openEditor({
            resource: undefined,
            contents: this.samplingService.getLogText(server),
            label: localize('mcp.samplingLog.title', 'MCP Sampling: {0}', server.definition.label),
        });
    }
    getServer() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
    }
};
ShowSamplingRequestsAction = ShowSamplingRequestsAction_1 = __decorate([
    __param(0, IMcpService),
    __param(1, IMcpSamplingService),
    __param(2, IEditorService)
], ShowSamplingRequestsAction);
export { ShowSamplingRequestsAction };
let BrowseResourcesAction = class BrowseResourcesAction extends McpServerAction {
    static { BrowseResourcesAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent config`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    constructor(mcpService, commandService) {
        super('extensions.config', localize('mcp.resources', 'Browse Resources'), BrowseResourcesAction_1.CLASS, false);
        this.mcpService = mcpService;
        this.commandService = commandService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = BrowseResourcesAction_1.HIDE;
        const server = this.getServer();
        if (!server) {
            return;
        }
        const capabilities = server.capabilities.get();
        if (capabilities !== undefined && !(capabilities & 16 /* McpCapability.Resources */)) {
            return;
        }
        this.class = BrowseResourcesAction_1.CLASS;
        this.enabled = true;
    }
    async run() {
        const server = this.getServer();
        if (!server) {
            return;
        }
        const capabilities = server.capabilities.get();
        if (capabilities !== undefined && !(capabilities & 16 /* McpCapability.Resources */)) {
            return;
        }
        return this.commandService.executeCommand("workbench.mcp.browseResources" /* McpCommandIds.BrowseResources */, server);
    }
    getServer() {
        if (!this.mcpServer) {
            return;
        }
        if (!this.mcpServer.local) {
            return;
        }
        return this.mcpService.servers.get().find(s => s.definition.id === this.mcpServer?.id);
    }
};
BrowseResourcesAction = BrowseResourcesAction_1 = __decorate([
    __param(0, IMcpService),
    __param(1, ICommandService)
], BrowseResourcesAction);
export { BrowseResourcesAction };
let McpServerStatusAction = class McpServerStatusAction extends McpServerAction {
    static { McpServerStatusAction_1 = this; }
    static { this.CLASS = `${McpServerAction.ICON_ACTION_CLASS} extension-status`; }
    get status() { return this._status; }
    constructor(mcpWorkbenchService, commandService) {
        super('extensions.status', '', `${McpServerStatusAction_1.CLASS} hide`, false);
        this.mcpWorkbenchService = mcpWorkbenchService;
        this.commandService = commandService;
        this._status = [];
        this._onDidChangeStatus = this._register(new Emitter());
        this.onDidChangeStatus = this._onDidChangeStatus.event;
        this.update();
    }
    update() {
        this.computeAndUpdateStatus();
    }
    computeAndUpdateStatus() {
        this.updateStatus(undefined, true);
        this.enabled = false;
        if (!this.mcpServer) {
            return;
        }
        if ((this.mcpServer.gallery || this.mcpServer.installable) && this.mcpServer.installState === 3 /* McpServerInstallState.Uninstalled */) {
            const result = this.mcpWorkbenchService.canInstall(this.mcpServer);
            if (result !== true) {
                this.updateStatus({ icon: warningIcon, message: result }, true);
                return;
            }
        }
        const runtimeState = this.mcpServer.runtimeStatus;
        if (runtimeState?.message) {
            this.updateStatus({ icon: runtimeState.message.severity === Severity.Warning ? warningIcon : runtimeState.message.severity === Severity.Error ? errorIcon : infoIcon, message: runtimeState.message.text }, true);
        }
    }
    updateStatus(status, updateClass) {
        if (status) {
            if (this._status.some(s => s.message.value === status.message.value && s.icon?.id === status.icon?.id)) {
                return;
            }
        }
        else {
            if (this._status.length === 0) {
                return;
            }
            this._status = [];
        }
        if (status) {
            this._status.push(status);
            this._status.sort((a, b) => b.icon === trustIcon ? -1 :
                a.icon === trustIcon ? 1 :
                    b.icon === errorIcon ? -1 :
                        a.icon === errorIcon ? 1 :
                            b.icon === warningIcon ? -1 :
                                a.icon === warningIcon ? 1 :
                                    b.icon === infoIcon ? -1 :
                                        a.icon === infoIcon ? 1 :
                                            0);
        }
        if (updateClass) {
            if (status?.icon === errorIcon) {
                this.class = `${McpServerStatusAction_1.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
            }
            else if (status?.icon === warningIcon) {
                this.class = `${McpServerStatusAction_1.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
            }
            else if (status?.icon === infoIcon) {
                this.class = `${McpServerStatusAction_1.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
            }
            else if (status?.icon === trustIcon) {
                this.class = `${McpServerStatusAction_1.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
            }
            else {
                this.class = `${McpServerStatusAction_1.CLASS} hide`;
            }
        }
        this._onDidChangeStatus.fire();
    }
    async run() {
        if (this._status[0]?.icon === trustIcon) {
            return this.commandService.executeCommand('workbench.trust.manage');
        }
    }
};
McpServerStatusAction = McpServerStatusAction_1 = __decorate([
    __param(0, IMcpWorkbenchService),
    __param(1, ICommandService)
], McpServerStatusAction);
export { McpServerStatusAction };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwU2VydmVyQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFNlcnZlckFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxjQUFjLEVBQTBCLE1BQU0sMERBQTBELENBQUM7QUFDbEgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxNQUFNLEVBQStCLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0UsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ25HLE9BQU8sRUFBaUIsMkJBQTJCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUM1SCxP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