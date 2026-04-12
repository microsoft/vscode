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
var TunnelPanel_1;
import './media/tunnelView.css';
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService, RawContextKey, ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ICommandService, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { Event } from '../../../../base/common/event.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { toDisposable, dispose, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ActionRunner } from '../../../../base/common/actions.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { createActionViewItem, getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IRemoteExplorerService, TunnelType, TUNNEL_VIEW_ID, TunnelEditId } from '../../../services/remote/common/remoteExplorerService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { URI } from '../../../../base/common/uri.js';
import { isAllInterfaces, isLocalhost, isRemoteTunnel, ITunnelService, TunnelPrivacyId, TunnelProtocol } from '../../../../platform/tunnel/common/tunnel.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { copyAddressIcon, forwardedPortWithoutProcessIcon, forwardedPortWithProcessIcon, forwardPortIcon, labelPortIcon, openBrowserIcon, openPreviewIcon, portsViewIcon, privatePortIcon, stopForwardIcon } from './remoteIcons.js';
import { IExternalUriOpenerService } from '../../externalUriOpener/common/externalUriOpenerService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { WorkbenchTable } from '../../../../platform/list/browser/listService.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { STATUS_BAR_REMOTE_ITEM_BACKGROUND } from '../../../common/theme.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { TunnelCloseReason, TunnelSource, forwardedPortsViewEnabled, makeAddress, mapHasAddressLocalhostOrAllInterfaces, parseAddress } from '../../../services/remote/common/tunnelModel.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
export const openPreviewEnabledContext = new RawContextKey('openPreviewEnabled', false);
class TunnelTreeVirtualDelegate {
    constructor(remoteExplorerService) {
        this.remoteExplorerService = remoteExplorerService;
        this.headerRowHeight = 22;
    }
    getHeight(row) {
        return (row.tunnelType === TunnelType.Add && !this.remoteExplorerService.getEditableData(undefined)) ? 30 : 22;
    }
}
let TunnelViewModel = class TunnelViewModel {
    constructor(remoteExplorerService, tunnelService) {
        this.remoteExplorerService = remoteExplorerService;
        this.tunnelService = tunnelService;
        this._candidates = new Map();
        this.input = {
            label: nls.localize('remote.tunnelsView.addPort', "Add Port"),
            icon: undefined,
            tunnelType: TunnelType.Add,
            hasRunningProcess: false,
            remoteHost: '',
            remotePort: 0,
            processDescription: '',
            tooltipPostfix: '',
            iconTooltip: '',
            portTooltip: '',
            processTooltip: '',
            originTooltip: '',
            privacyTooltip: '',
            source: { source: TunnelSource.User, description: '' },
            protocol: TunnelProtocol.Http,
            privacy: {
                id: TunnelPrivacyId.Private,
                themeIcon: privatePortIcon.id,
                label: nls.localize('tunnelPrivacy.private', "Private")
            },
            strip: () => undefined
        };
        this.model = remoteExplorerService.tunnelModel;
        this.onForwardedPortsChanged = Event.any(this.model.onForwardPort, this.model.onClosePort, this.model.onPortName, this.model.onCandidatesChanged);
    }
    get all() {
        const result = [];
        this._candidates = new Map();
        this.model.candidates.forEach(candidate => {
            this._candidates.set(makeAddress(candidate.host, candidate.port), candidate);
        });
        if ((this.model.forwarded.size > 0) || this.remoteExplorerService.getEditableData(undefined)) {
            result.push(...this.forwarded);
        }
        if (this.model.detected.size > 0) {
            result.push(...this.detected);
        }
        result.push(this.input);
        return result;
    }
    addProcessInfoFromCandidate(tunnelItem) {
        const key = makeAddress(tunnelItem.remoteHost, tunnelItem.remotePort);
        if (this._candidates.has(key)) {
            tunnelItem.processDescription = this._candidates.get(key).detail;
        }
    }
    get forwarded() {
        const forwarded = Array.from(this.model.forwarded.values()).map(tunnel => {
            const tunnelItem = TunnelItem.createFromTunnel(this.remoteExplorerService, this.tunnelService, tunnel);
            this.addProcessInfoFromCandidate(tunnelItem);
            return tunnelItem;
        }).sort((a, b) => {
            if (a.remotePort === b.remotePort) {
                return a.remoteHost < b.remoteHost ? -1 : 1;
            }
            else {
                return a.remotePort < b.remotePort ? -1 : 1;
            }
        });
        return forwarded;
    }
    get detected() {
        return Array.from(this.model.detected.values()).map(tunnel => {
            const tunnelItem = TunnelItem.createFromTunnel(this.remoteExplorerService, this.tunnelService, tunnel, TunnelType.Detected, false);
            this.addProcessInfoFromCandidate(tunnelItem);
            return tunnelItem;
        });
    }
    isEmpty() {
        return (this.detected.length === 0) &&
            ((this.forwarded.length === 0) || (this.forwarded.length === 1 &&
                (this.forwarded[0].tunnelType === TunnelType.Add) && !this.remoteExplorerService.getEditableData(undefined)));
    }
};
TunnelViewModel = __decorate([
    __param(0, IRemoteExplorerService),
    __param(1, ITunnelService)
], TunnelViewModel);
export { TunnelViewModel };
function emptyCell(item) {
    return { label: '', tunnel: item, editId: TunnelEditId.None, tooltip: '' };
}
class IconColumn {
    constructor() {
        this.label = '';
        this.tooltip = '';
        this.weight = 1;
        this.minimumWidth = 40;
        this.maximumWidth = 40;
        this.templateId = 'actionbar';
    }
    project(row) {
        if (row.tunnelType === TunnelType.Add) {
            return emptyCell(row);
        }
        const icon = row.processDescription ? forwardedPortWithProcessIcon : forwardedPortWithoutProcessIcon;
        let tooltip = '';
        if (row instanceof TunnelItem) {
            tooltip = `${row.iconTooltip} ${row.tooltipPostfix}`;
        }
        return {
            label: '', icon, tunnel: row, editId: TunnelEditId.None, tooltip
        };
    }
}
class PortColumn {
    constructor() {
        this.label = nls.localize('tunnel.portColumn.label', "Port");
        this.tooltip = nls.localize('tunnel.portColumn.tooltip', "The label and remote port number of the forwarded port.");
        this.weight = 1;
        this.templateId = 'actionbar';
    }
    project(row) {
        const isAdd = row.tunnelType === TunnelType.Add;
        const label = row.label;
        let tooltip = '';
        if (row instanceof TunnelItem && !isAdd) {
            tooltip = `${row.portTooltip} ${row.tooltipPostfix}`;
        }
        else {
            tooltip = label;
        }
        return {
            label, tunnel: row, menuId: MenuId.TunnelPortInline,
            editId: row.tunnelType === TunnelType.Add ? TunnelEditId.New : TunnelEditId.Label, tooltip
        };
    }
}
class LocalAddressColumn {
    constructor() {
        this.label = nls.localize('tunnel.addressColumn.label', "Forwarded Address");
        this.tooltip = nls.localize('tunnel.addressColumn.tooltip', "The address that the forwarded port is available at.");
        this.weight = 1;
        this.templateId = 'actionbar';
    }
    project(row) {
        if (row.tunnelType === TunnelType.Add) {
            return emptyCell(row);
        }
        const label = row.localAddress ?? '';
        let tooltip = label;
        if (row instanceof TunnelItem) {
            tooltip = row.tooltipPostfix;
        }
        return {
            label,
            menuId: MenuId.TunnelLocalAddressInline,
            tunnel: row,
            editId: TunnelEditId.LocalPort,
            tooltip,
            markdownTooltip: label ? LocalAddressColumn.getHoverText(label) : undefined
        };
    }
    static getHoverText(localAddress) {
        return function (configurationService) {
            const editorConf = configurationService.getValue('editor');
            let clickLabel = '';
            if (editorConf.multiCursorModifier === 'ctrlCmd') {
                if (isMacintosh) {
                    clickLabel = nls.localize('portsLink.followLinkAlt.mac', "option + click");
                }
                else {
                    clickLabel = nls.localize('portsLink.followLinkAlt', "alt + click");
                }
            }
            else {
                if (isMacintosh) {
                    clickLabel = nls.localize('portsLink.followLinkCmd', "cmd + click");
                }
                else {
                    clickLabel = nls.localize('portsLink.followLinkCtrl', "ctrl + click");
                }
            }
            const markdown = new MarkdownString('', true);
            const uri = localAddress.startsWith('http') ? localAddress : `http://${localAddress}`;
            return markdown.appendLink(uri, 'Follow link').appendMarkdown(` (${clickLabel})`);
        };
    }
}
class RunningProcessColumn {
    constructor() {
        this.label = nls.localize('tunnel.processColumn.label', "Running Process");
        this.tooltip = nls.localize('tunnel.processColumn.tooltip', "The command line of the process that is using the port.");
        this.weight = 2;
        this.templateId = 'actionbar';
    }
    project(row) {
        if (row.tunnelType === TunnelType.Add) {
            return emptyCell(row);
        }
        const label = row.processDescription ?? '';
        return { label, tunnel: row, editId: TunnelEditId.None, tooltip: row instanceof TunnelItem ? row.processTooltip : '' };
    }
}
class OriginColumn {
    constructor() {
        this.label = nls.localize('tunnel.originColumn.label', "Origin");
        this.tooltip = nls.localize('tunnel.originColumn.tooltip', "The source that a forwarded port originates from. Can be an extension, user forwarded, statically forwarded, or automatically forwarded.");
        this.weight = 1;
        this.templateId = 'actionbar';
    }
    project(row) {
        if (row.tunnelType === TunnelType.Add) {
            return emptyCell(row);
        }
        const label = row.source.description;
        const tooltip = `${row instanceof TunnelItem ? row.originTooltip : ''}. ${row instanceof TunnelItem ? row.tooltipPostfix : ''}`;
        return { label, menuId: MenuId.TunnelOriginInline, tunnel: row, editId: TunnelEditId.None, tooltip };
    }
}
class PrivacyColumn {
    constructor() {
        this.label = nls.localize('tunnel.privacyColumn.label', "Visibility");
        this.tooltip = nls.localize('tunnel.privacyColumn.tooltip', "The availability of the forwarded port.");
        this.weight = 1;
        this.templateId = 'actionbar';
    }
    project(row) {
        if (row.tunnelType === TunnelType.Add) {
            return emptyCell(row);
        }
        const label = row.privacy?.label;
        let tooltip = '';
        if (row instanceof TunnelItem) {
            tooltip = `${row.privacy.label} ${row.tooltipPostfix}`;
        }
        return { label, tunnel: row, icon: { id: row.privacy.themeIcon }, editId: TunnelEditId.None, tooltip };
    }
}
let ActionBarRenderer = class ActionBarRenderer {
    constructor(instantiationService, contextKeyService, menuService, contextViewService, remoteExplorerService, commandService, configurationService) {
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.menuService = menuService;
        this.contextViewService = contextViewService;
        this.remoteExplorerService = remoteExplorerService;
        this.commandService = commandService;
        this.configurationService = configurationService;
        this.templateId = 'actionbar';
        this._hoverDelegate = getDefaultHoverDelegate('mouse');
    }
    set actionRunner(actionRunner) {
        this._actionRunner = actionRunner;
    }
    renderTemplate(container) {
        const cell = dom.append(container, dom.$('.ports-view-actionbar-cell'));
        const icon = dom.append(cell, dom.$('.ports-view-actionbar-cell-icon'));
        const templateDisposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        templateDisposables.add(elementDisposables);
        const label = templateDisposables.add(new IconLabel(cell, {
            supportHighlights: true,
            hoverDelegate: this._hoverDelegate
        }));
        const actionsContainer = dom.append(cell, dom.$('.actions'));
        const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
            actionViewItemProvider: createActionViewItem.bind(undefined, this.instantiationService),
            hoverDelegate: this._hoverDelegate
        }));
        return { label, icon, actionBar, container: cell, templateDisposables, elementDisposables };
    }
    renderElement(element, index, templateData) {
        // reset
        templateData.actionBar.clear();
        templateData.icon.className = 'ports-view-actionbar-cell-icon';
        templateData.icon.style.display = 'none';
        templateData.label.setLabel('');
        templateData.label.element.style.display = 'none';
        templateData.container.style.height = '22px';
        if (templateData.button) {
            templateData.button.element.style.display = 'none';
        }
        templateData.container.style.paddingLeft = '0px';
        templateData.elementDisposables.clear();
        let editableData;
        if (element.editId === TunnelEditId.New && (editableData = this.remoteExplorerService.getEditableData(undefined))) {
            this.renderInputBox(templateData, editableData);
        }
        else {
            editableData = this.remoteExplorerService.getEditableData(element.tunnel, element.editId);
            if (editableData) {
                this.renderInputBox(templateData, editableData);
            }
            else if ((element.tunnel.tunnelType === TunnelType.Add) && (element.menuId === MenuId.TunnelPortInline)) {
                this.renderButton(element, templateData);
            }
            else {
                this.renderActionBarItem(element, templateData);
            }
        }
    }
    renderButton(element, templateData) {
        templateData.container.style.paddingLeft = '7px';
        templateData.container.style.height = '28px';
        templateData.button = templateData.elementDisposables.add(new Button(templateData.container, defaultButtonStyles));
        templateData.button.label = element.label;
        templateData.button.element.title = element.tooltip;
        templateData.elementDisposables.add(templateData.button.onDidClick(() => {
            this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
        }));
    }
    tunnelContext(tunnel) {
        let context;
        if (tunnel instanceof TunnelItem) {
            context = tunnel.strip();
        }
        if (!context) {
            context = {
                tunnelType: tunnel.tunnelType,
                remoteHost: tunnel.remoteHost,
                remotePort: tunnel.remotePort,
                localAddress: tunnel.localAddress,
                protocol: tunnel.protocol,
                localUri: tunnel.localUri,
                localPort: tunnel.localPort,
                name: tunnel.name,
                closeable: tunnel.closeable,
                source: tunnel.source,
                privacy: tunnel.privacy,
                processDescription: tunnel.processDescription,
                label: tunnel.label
            };
        }
        return context;
    }
    renderActionBarItem(element, templateData) {
        templateData.label.element.style.display = 'flex';
        templateData.label.setLabel(element.label, undefined, {
            title: element.markdownTooltip ?
                { markdown: element.markdownTooltip(this.configurationService), markdownNotSupportedFallback: element.tooltip }
                : element.tooltip,
            extraClasses: element.menuId === MenuId.TunnelLocalAddressInline ? ['ports-view-actionbar-cell-localaddress'] : undefined
        });
        templateData.actionBar.context = this.tunnelContext(element.tunnel);
        templateData.container.style.paddingLeft = '10px';
        const context = [
            ['view', TUNNEL_VIEW_ID],
            [TunnelTypeContextKey.key, element.tunnel.tunnelType],
            [TunnelCloseableContextKey.key, element.tunnel.closeable],
            [TunnelPrivacyContextKey.key, element.tunnel.privacy.id],
            [TunnelProtocolContextKey.key, element.tunnel.protocol]
        ];
        const contextKeyService = this.contextKeyService.createOverlay(context);
        if (element.menuId) {
            const menu = templateData.elementDisposables.add(this.menuService.createMenu(element.menuId, contextKeyService));
            let actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
            if (actions) {
                const labelActions = actions.filter(action => action.id.toLowerCase().indexOf('label') >= 0);
                if (labelActions.length > 1) {
                    labelActions.sort((a, b) => a.label.length - b.label.length);
                    labelActions.pop();
                    actions = actions.filter(action => labelActions.indexOf(action) < 0);
                }
                templateData.actionBar.push(actions, { icon: true, label: false });
                if (this._actionRunner) {
                    templateData.actionBar.actionRunner = this._actionRunner;
                }
            }
        }
        if (element.icon) {
            templateData.icon.className = `ports-view-actionbar-cell-icon ${ThemeIcon.asClassName(element.icon)}`;
            templateData.icon.title = element.tooltip;
            templateData.icon.style.display = 'inline';
        }
    }
    renderInputBox(templateData, editableData) {
        // Required for FireFox. The blur event doesn't fire on FireFox when you just mash the "+" button to forward a port.
        if (this.inputDone) {
            this.inputDone(false, false);
            this.inputDone = undefined;
        }
        const { container } = templateData;
        container.style.paddingLeft = '5px';
        const value = editableData.startingValue || '';
        const inputBox = new InputBox(container, this.contextViewService, {
            ariaLabel: nls.localize('remote.tunnelsView.input', "Press Enter to confirm or Escape to cancel."),
            validationOptions: {
                validation: (value) => {
                    const message = editableData.validationMessage(value);
                    if (!message) {
                        return null;
                    }
                    return {
                        content: message.content,
                        formatContent: true,
                        type: message.severity === Severity.Error ? 3 /* MessageType.ERROR */ : 1 /* MessageType.INFO */
                    };
                }
            },
            placeholder: editableData.placeholder || '',
            inputBoxStyles: defaultInputBoxStyles
        });
        inputBox.value = value;
        inputBox.focus();
        inputBox.select({ start: 0, end: editableData.startingValue ? editableData.startingValue.length : 0 });
        const done = createSingleCallFunction(async (success, finishEditing) => {
            dispose(toDispose);
            if (this.inputDone) {
                this.inputDone = undefined;
            }
            inputBox.element.style.display = 'none';
            const inputValue = inputBox.value;
            if (finishEditing) {
                return editableData.onFinish(inputValue, success);
            }
        });
        this.inputDone = done;
        const toDispose = [
            inputBox,
            dom.addStandardDisposableListener(inputBox.inputElement, dom.EventType.KEY_DOWN, async (e) => {
                if (e.equals(3 /* KeyCode.Enter */)) {
                    e.stopPropagation();
                    if (inputBox.validate() !== 3 /* MessageType.ERROR */) {
                        return done(true, true);
                    }
                    else {
                        return done(false, true);
                    }
                }
                else if (e.equals(9 /* KeyCode.Escape */)) {
                    e.preventDefault();
                    e.stopPropagation();
                    return done(false, true);
                }
            }),
            dom.addDisposableListener(inputBox.inputElement, dom.EventType.BLUR, () => {
                return done(inputBox.validate() !== 3 /* MessageType.ERROR */, true);
            })
        ];
        templateData.elementDisposables.add(toDisposable(() => {
            done(false, false);
        }));
    }
    disposeElement(element, index, templateData) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.templateDisposables.dispose();
    }
};
ActionBarRenderer = __decorate([
    __param(0, IInstantiationService),
    __param(1, IContextKeyService),
    __param(2, IMenuService),
    __param(3, IContextViewService),
    __param(4, IRemoteExplorerService),
    __param(5, ICommandService),
    __param(6, IConfigurationService)
], ActionBarRenderer);
class TunnelItem {
    static createFromTunnel(remoteExplorerService, tunnelService, tunnel, type = TunnelType.Forwarded, closeable) {
        return new TunnelItem(type, tunnel.remoteHost, tunnel.remotePort, tunnel.source, !!tunnel.hasRunningProcess, tunnel.protocol, tunnel.localUri, tunnel.localAddress, tunnel.localPort, closeable === undefined ? tunnel.closeable : closeable, tunnel.name, tunnel.runningProcess, tunnel.pid, tunnel.privacy, remoteExplorerService, tunnelService);
    }
    /**
     * Removes all non-serializable properties from the tunnel
     * @returns A new TunnelItem without any services
     */
    strip() {
        return new TunnelItem(this.tunnelType, this.remoteHost, this.remotePort, this.source, this.hasRunningProcess, this.protocol, this.localUri, this.localAddress, this.localPort, this.closeable, this.name, this.runningProcess, this.pid, this._privacy);
    }
    constructor(tunnelType, remoteHost, remotePort, source, hasRunningProcess, protocol, localUri, localAddress, localPort, closeable, name, runningProcess, pid, _privacy, remoteExplorerService, tunnelService) {
        this.tunnelType = tunnelType;
        this.remoteHost = remoteHost;
        this.remotePort = remotePort;
        this.source = source;
        this.hasRunningProcess = hasRunningProcess;
        this.protocol = protocol;
        this.localUri = localUri;
        this.localAddress = localAddress;
        this.localPort = localPort;
        this.closeable = closeable;
        this.name = name;
        this.runningProcess = runningProcess;
        this.pid = pid;
        this._privacy = _privacy;
        this.remoteExplorerService = remoteExplorerService;
        this.tunnelService = tunnelService;
    }
    get label() {
        if (this.tunnelType === TunnelType.Add && this.name) {
            return this.name;
        }
        const portNumberLabel = (isLocalhost(this.remoteHost) || isAllInterfaces(this.remoteHost))
            ? `${this.remotePort}`
            : `${this.remoteHost}:${this.remotePort}`;
        if (this.name) {
            return `${this.name} (${portNumberLabel})`;
        }
        else {
            return portNumberLabel;
        }
    }
    set processDescription(description) {
        this.runningProcess = description;
    }
    get processDescription() {
        let description = '';
        if (this.runningProcess) {
            if (this.pid && this.remoteExplorerService?.namedProcesses.has(this.pid)) {
                // This is a known process. Give it a friendly name.
                description = this.remoteExplorerService.namedProcesses.get(this.pid);
            }
            else {
                description = this.runningProcess.replace(/\0/g, ' ').trim();
            }
            if (this.pid) {
                description += ` (${this.pid})`;
            }
        }
        else if (this.hasRunningProcess) {
            description = nls.localize('tunnelView.runningProcess.inacessable', "Process information unavailable");
        }
        return description;
    }
    get tooltipPostfix() {
        let information;
        if (this.localAddress) {
            information = nls.localize('remote.tunnel.tooltipForwarded', "Remote port {0}:{1} forwarded to local address {2}. ", this.remoteHost, this.remotePort, this.localAddress);
        }
        else {
            information = nls.localize('remote.tunnel.tooltipCandidate', "Remote port {0}:{1} not forwarded. ", this.remoteHost, this.remotePort);
        }
        return information;
    }
    get iconTooltip() {
        const isAdd = this.tunnelType === TunnelType.Add;
        if (!isAdd) {
            return `${this.processDescription ? nls.localize('tunnel.iconColumn.running', "Port has running process.") :
                nls.localize('tunnel.iconColumn.notRunning', "No running process.")}`;
        }
        else {
            return this.label;
        }
    }
    get portTooltip() {
        const isAdd = this.tunnelType === TunnelType.Add;
        if (!isAdd) {
            return `${this.name ? nls.localize('remote.tunnel.tooltipName', "Port labeled {0}. ", this.name) : ''}`;
        }
        else {
            return '';
        }
    }
    get processTooltip() {
        return this.processDescription ?? '';
    }
    get originTooltip() {
        return this.source.description;
    }
    get privacy() {
        if (this.tunnelService?.privacyOptions) {
            return this.tunnelService?.privacyOptions.find(element => element.id === this._privacy) ??
                {
                    id: '',
                    themeIcon: Codicon.question.id,
                    label: nls.localize('tunnelPrivacy.unknown', "Unknown")
                };
        }
        else {
            return {
                id: TunnelPrivacyId.Private,
                themeIcon: privatePortIcon.id,
                label: nls.localize('tunnelPrivacy.private', "Private")
            };
        }
    }
}
const TunnelTypeContextKey = new RawContextKey('tunnelType', TunnelType.Add, true);
const TunnelCloseableContextKey = new RawContextKey('tunnelCloseable', false, true);
const TunnelPrivacyContextKey = new RawContextKey('tunnelPrivacy', undefined, true);
const TunnelPrivacyEnabledContextKey = new RawContextKey('tunnelPrivacyEnabled', false, true);
const TunnelProtocolContextKey = new RawContextKey('tunnelProtocol', TunnelProtocol.Http, true);
const TunnelViewFocusContextKey = new RawContextKey('tunnelViewFocus', false, nls.localize('tunnel.focusContext', "Whether the Ports view has focus."));
const TunnelViewSelectionKeyName = 'tunnelViewSelection';
// host:port
const TunnelViewSelectionContextKey = new RawContextKey(TunnelViewSelectionKeyName, undefined, true);
const TunnelViewMultiSelectionKeyName = 'tunnelViewMultiSelection';
// host:port[]
const TunnelViewMultiSelectionContextKey = new RawContextKey(TunnelViewMultiSelectionKeyName, undefined, true);
const PortChangableContextKey = new RawContextKey('portChangable', false, true);
const ProtocolChangeableContextKey = new RawContextKey('protocolChangable', true, true);
let TunnelPanel = class TunnelPanel extends ViewPane {
    static { TunnelPanel_1 = this; }
    static { this.ID = TUNNEL_VIEW_ID; }
    static { this.TITLE = nls.localize2('remote.tunnel', "Ports"); }
    constructor(viewModel, options, keybindingService, contextMenuService, contextKeyService, configurationService, instantiationService, viewDescriptorService, openerService, quickInputService, commandService, menuService, themeService, remoteExplorerService, hoverService, tunnelService, contextViewService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.viewModel = viewModel;
        this.quickInputService = quickInputService;
        this.commandService = commandService;
        this.menuService = menuService;
        this.remoteExplorerService = remoteExplorerService;
        this.tunnelService = tunnelService;
        this.contextViewService = contextViewService;
        this.tableDisposables = this._register(new DisposableStore());
        this.isEditing = false;
        // TODO: Should this be removed?
        //@ts-expect-error
        this.titleActions = [];
        this.lastFocus = [];
        this.height = 0;
        this.width = 0;
        this.tunnelTypeContext = TunnelTypeContextKey.bindTo(contextKeyService);
        this.tunnelCloseableContext = TunnelCloseableContextKey.bindTo(contextKeyService);
        this.tunnelPrivacyContext = TunnelPrivacyContextKey.bindTo(contextKeyService);
        this.tunnelPrivacyEnabledContext = TunnelPrivacyEnabledContextKey.bindTo(contextKeyService);
        this.tunnelPrivacyEnabledContext.set(tunnelService.canChangePrivacy);
        this.protocolChangableContextKey = ProtocolChangeableContextKey.bindTo(contextKeyService);
        this.protocolChangableContextKey.set(tunnelService.canChangeProtocol);
        this.tunnelProtocolContext = TunnelProtocolContextKey.bindTo(contextKeyService);
        this.tunnelViewFocusContext = TunnelViewFocusContextKey.bindTo(contextKeyService);
        this.tunnelViewSelectionContext = TunnelViewSelectionContextKey.bindTo(contextKeyService);
        this.tunnelViewMultiSelectionContext = TunnelViewMultiSelectionContextKey.bindTo(contextKeyService);
        this.portChangableContextKey = PortChangableContextKey.bindTo(contextKeyService);
        const overlayContextKeyService = this.contextKeyService.createOverlay([['view', TunnelPanel_1.ID]]);
        const titleMenu = this._register(this.menuService.createMenu(MenuId.TunnelTitle, overlayContextKeyService));
        const updateActions = () => {
            this.titleActions = getFlatActionBarActions(titleMenu.getActions());
            this.updateActions();
        };
        this._register(titleMenu.onDidChange(updateActions));
        updateActions();
        this._register(toDisposable(() => {
            this.titleActions = [];
        }));
        this.registerPrivacyActions();
        this._register(Event.once(this.tunnelService.onAddedTunnelProvider)(() => {
            let updated = false;
            if (this.tunnelPrivacyEnabledContext.get() === false) {
                this.tunnelPrivacyEnabledContext.set(tunnelService.canChangePrivacy);
                updated = true;
            }
            if (this.protocolChangableContextKey.get() === true) {
                this.protocolChangableContextKey.set(tunnelService.canChangeProtocol);
                updated = true;
            }
            if (updated) {
                updateActions();
                this.registerPrivacyActions();
                this.createTable();
                this.table?.layout(this.height, this.width);
            }
        }));
    }
    registerPrivacyActions() {
        for (const privacyOption of this.tunnelService.privacyOptions) {
            const optionId = `remote.tunnel.privacy${privacyOption.id}`;
            CommandsRegistry.registerCommand(optionId, ChangeTunnelPrivacyAction.handler(privacyOption.id));
            MenuRegistry.appendMenuItem(MenuId.TunnelPrivacy, ({
                order: 0,
                command: {
                    id: optionId,
                    title: privacyOption.label,
                    toggled: TunnelPrivacyContextKey.isEqualTo(privacyOption.id)
                }
            }));
        }
    }
    get portCount() {
        return this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
    }
    createTable() {
        if (!this.panelContainer) {
            return;
        }
        this.tableDisposables.clear();
        dom.clearNode(this.panelContainer);
        const widgetContainer = dom.append(this.panelContainer, dom.$('.customview-tree'));
        widgetContainer.classList.add('ports-view');
        widgetContainer.classList.add('file-icon-themable-tree', 'show-file-icons');
        const actionBarRenderer = new ActionBarRenderer(this.instantiationService, this.contextKeyService, this.menuService, this.contextViewService, this.remoteExplorerService, this.commandService, this.configurationService);
        const columns = [new IconColumn(), new PortColumn(), new LocalAddressColumn(), new RunningProcessColumn()];
        if (this.tunnelService.canChangePrivacy) {
            columns.push(new PrivacyColumn());
        }
        columns.push(new OriginColumn());
        this.table = this.instantiationService.createInstance(WorkbenchTable, 'RemoteTunnels', widgetContainer, new TunnelTreeVirtualDelegate(this.remoteExplorerService), columns, [actionBarRenderer], {
            keyboardNavigationLabelProvider: {
                getKeyboardNavigationLabel: (item) => {
                    return item.label;
                }
            },
            multipleSelectionSupport: true,
            accessibilityProvider: {
                getAriaLabel: (item) => {
                    if (item instanceof TunnelItem) {
                        return `${item.tooltipPostfix} ${item.portTooltip} ${item.iconTooltip} ${item.processTooltip} ${item.originTooltip} ${this.tunnelService.canChangePrivacy ? item.privacy.label : ''}`;
                    }
                    else {
                        return item.label;
                    }
                },
                getWidgetAriaLabel: () => nls.localize('tunnelView', "Tunnel View")
            },
            openOnSingleClick: true
        });
        const actionRunner = this.tableDisposables.add(new ActionRunner());
        actionBarRenderer.actionRunner = actionRunner;
        this.tableDisposables.add(this.table);
        this.tableDisposables.add(this.table.onContextMenu(e => this.onContextMenu(e, actionRunner)));
        this.tableDisposables.add(this.table.onMouseDblClick(e => this.onMouseDblClick(e)));
        this.tableDisposables.add(this.table.onDidChangeFocus(e => this.onFocusChanged(e)));
        this.tableDisposables.add(this.table.onDidChangeSelection(e => this.onSelectionChanged(e)));
        this.tableDisposables.add(this.table.onDidFocus(() => this.tunnelViewFocusContext.set(true)));
        this.tableDisposables.add(this.table.onDidBlur(() => this.tunnelViewFocusContext.set(false)));
        const rerender = () => this.table?.splice(0, Number.POSITIVE_INFINITY, this.viewModel.all);
        rerender();
        let lastPortCount = this.portCount;
        this.tableDisposables.add(Event.debounce(this.viewModel.onForwardedPortsChanged, (_last, e) => e, 50)(() => {
            const newPortCount = this.portCount;
            if (((lastPortCount === 0) || (newPortCount === 0)) && (lastPortCount !== newPortCount)) {
                this._onDidChangeViewWelcomeState.fire();
            }
            lastPortCount = newPortCount;
            rerender();
        }));
        this.tableDisposables.add(this.table.onMouseClick(e => {
            if (this.hasOpenLinkModifier(e.browserEvent) && this.table) {
                const selection = this.table.getSelectedElements();
                if ((selection.length === 0) ||
                    ((selection.length === 1) && (selection[0] === e.element))) {
                    this.commandService.executeCommand(OpenPortInBrowserAction.ID, e.element);
                }
            }
        }));
        this.tableDisposables.add(this.table.onDidOpen(e => {
            if (!e.element || (e.element.tunnelType !== TunnelType.Forwarded)) {
                return;
            }
            if (e.browserEvent?.type === 'dblclick') {
                this.commandService.executeCommand(LabelTunnelAction.ID);
            }
        }));
        this.tableDisposables.add(this.remoteExplorerService.onDidChangeEditable(e => {
            this.isEditing = !!this.remoteExplorerService.getEditableData(e?.tunnel, e?.editId);
            this._onDidChangeViewWelcomeState.fire();
            if (!this.isEditing) {
                widgetContainer.classList.remove('highlight');
            }
            rerender();
            if (this.isEditing) {
                widgetContainer.classList.add('highlight');
                if (!e) {
                    // When we are in editing mode for a new forward, rather than updating an existing one we need to reveal the input box since it might be out of view.
                    this.table?.reveal(this.table.indexOf(this.viewModel.input));
                }
            }
            else {
                if (e && (e.tunnel.tunnelType !== TunnelType.Add)) {
                    this.table?.setFocus(this.lastFocus);
                }
                this.focus();
            }
        }));
    }
    renderBody(container) {
        super.renderBody(container);
        this.panelContainer = dom.append(container, dom.$('.tree-explorer-viewlet-tree-view'));
        this.createTable();
    }
    shouldShowWelcome() {
        return this.viewModel.isEmpty() && !this.isEditing;
    }
    focus() {
        super.focus();
        this.table?.domFocus();
    }
    onFocusChanged(event) {
        if (event.indexes.length > 0 && event.elements.length > 0) {
            this.lastFocus = [...event.indexes];
        }
        const elements = event.elements;
        const item = elements && elements.length ? elements[0] : undefined;
        if (item) {
            this.tunnelViewSelectionContext.set(makeAddress(item.remoteHost, item.remotePort));
            this.tunnelTypeContext.set(item.tunnelType);
            this.tunnelCloseableContext.set(!!item.closeable);
            this.tunnelPrivacyContext.set(item.privacy.id);
            this.tunnelProtocolContext.set(item.protocol === TunnelProtocol.Https ? TunnelProtocol.Https : TunnelProtocol.Https);
            this.portChangableContextKey.set(!!item.localPort);
        }
        else {
            this.tunnelTypeContext.reset();
            this.tunnelViewSelectionContext.reset();
            this.tunnelCloseableContext.reset();
            this.tunnelPrivacyContext.reset();
            this.tunnelProtocolContext.reset();
            this.portChangableContextKey.reset();
        }
    }
    hasOpenLinkModifier(e) {
        const editorConf = this.configurationService.getValue('editor');
        let modifierKey = false;
        if (editorConf.multiCursorModifier === 'ctrlCmd') {
            modifierKey = e.altKey;
        }
        else {
            if (isMacintosh) {
                modifierKey = e.metaKey;
            }
            else {
                modifierKey = e.ctrlKey;
            }
        }
        return modifierKey;
    }
    onSelectionChanged(event) {
        const elements = event.elements;
        if (elements.length > 1) {
            this.tunnelViewMultiSelectionContext.set(elements.map(element => makeAddress(element.remoteHost, element.remotePort)));
        }
        else {
            this.tunnelViewMultiSelectionContext.set(undefined);
        }
    }
    onContextMenu(event, actionRunner) {
        if ((event.element !== undefined) && !(event.element instanceof TunnelItem)) {
            return;
        }
        event.browserEvent.preventDefault();
        event.browserEvent.stopPropagation();
        const node = event.element;
        if (node) {
            this.table?.setFocus([this.table.indexOf(node)]);
            this.tunnelTypeContext.set(node.tunnelType);
            this.tunnelCloseableContext.set(!!node.closeable);
            this.tunnelPrivacyContext.set(node.privacy.id);
            this.tunnelProtocolContext.set(node.protocol);
            this.portChangableContextKey.set(!!node.localPort);
        }
        else {
            this.tunnelTypeContext.set(TunnelType.Add);
            this.tunnelCloseableContext.set(false);
            this.tunnelPrivacyContext.set(undefined);
            this.tunnelProtocolContext.set(undefined);
            this.portChangableContextKey.set(false);
        }
        this.contextMenuService.showContextMenu({
            menuId: MenuId.TunnelContext,
            menuActionOptions: { shouldForwardArgs: true },
            contextKeyService: this.table?.contextKeyService,
            getAnchor: () => event.anchor,
            getActionViewItem: (action) => {
                const keybinding = this.keybindingService.lookupKeybinding(action.id);
                if (keybinding) {
                    return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
                }
                return undefined;
            },
            onHide: (wasCancelled) => {
                if (wasCancelled) {
                    this.table?.domFocus();
                }
            },
            getActionsContext: () => node?.strip(),
            actionRunner
        });
    }
    onMouseDblClick(e) {
        if (!e.element) {
            this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
        }
    }
    layoutBody(height, width) {
        this.height = height;
        this.width = width;
        super.layoutBody(height, width);
        this.table?.layout(height, width);
    }
};
TunnelPanel = TunnelPanel_1 = __decorate([
    __param(2, IKeybindingService),
    __param(3, IContextMenuService),
    __param(4, IContextKeyService),
    __param(5, IConfigurationService),
    __param(6, IInstantiationService),
    __param(7, IViewDescriptorService),
    __param(8, IOpenerService),
    __param(9, IQuickInputService),
    __param(10, ICommandService),
    __param(11, IMenuService),
    __param(12, IThemeService),
    __param(13, IRemoteExplorerService),
    __param(14, IHoverService),
    __param(15, ITunnelService),
    __param(16, IContextViewService)
], TunnelPanel);
export { TunnelPanel };
export class TunnelPanelDescriptor {
    constructor(viewModel, environmentService) {
        this.id = TunnelPanel.ID;
        this.name = TunnelPanel.TITLE;
        this.canToggleVisibility = true;
        this.hideByDefault = false;
        // group is not actually used for views that are not extension contributed. Use order instead.
        this.group = 'details@0';
        // -500 comes from the remote explorer viewOrderDelegate
        this.order = -500;
        this.canMoveView = true;
        this.containerIcon = portsViewIcon;
        this.ctorDescriptor = new SyncDescriptor(TunnelPanel, [viewModel]);
        this.remoteAuthority = environmentService.remoteAuthority ? environmentService.remoteAuthority.split('+')[0] : undefined;
    }
}
function isITunnelItem(item) {
    return item && item.tunnelType && item.remoteHost && item.source;
}
var LabelTunnelAction;
(function (LabelTunnelAction) {
    LabelTunnelAction.ID = 'remote.tunnel.label';
    LabelTunnelAction.LABEL = nls.localize('remote.tunnel.label', "Set Port Label");
    LabelTunnelAction.COMMAND_ID_KEYWORD = 'label';
    function handler() {
        return async (accessor, arg) => {
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            let tunnelContext;
            if (isITunnelItem(arg)) {
                tunnelContext = arg;
            }
            else {
                const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
                const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : undefined;
                if (tunnel) {
                    const tunnelService = accessor.get(ITunnelService);
                    tunnelContext = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, tunnel);
                }
            }
            if (tunnelContext) {
                const tunnelItem = tunnelContext;
                return new Promise(resolve => {
                    const startingValue = tunnelItem.name ? tunnelItem.name : `${tunnelItem.remotePort}`;
                    remoteExplorerService.setEditable(tunnelItem, TunnelEditId.Label, {
                        onFinish: async (value, success) => {
                            value = value.trim();
                            remoteExplorerService.setEditable(tunnelItem, TunnelEditId.Label, null);
                            const changed = success && (value !== startingValue);
                            if (changed) {
                                await remoteExplorerService.tunnelModel.name(tunnelItem.remoteHost, tunnelItem.remotePort, value);
                            }
                            resolve(changed ? { port: tunnelItem.remotePort, label: value } : undefined);
                        },
                        validationMessage: () => null,
                        placeholder: nls.localize('remote.tunnelsView.labelPlaceholder', "Port label"),
                        startingValue
                    });
                });
            }
            return undefined;
        };
    }
    LabelTunnelAction.handler = handler;
})(LabelTunnelAction || (LabelTunnelAction = {}));
const invalidPortString = nls.localize('remote.tunnelsView.portNumberValid', "Forwarded port should be a number or a host:port.");
const maxPortNumber = 65536;
const invalidPortNumberString = nls.localize('remote.tunnelsView.portNumberToHigh', "Port number must be \u2265 0 and < {0}.", maxPortNumber);
const requiresSudoString = nls.localize('remote.tunnelView.inlineElevationMessage', "May Require Sudo");
const alreadyForwarded = nls.localize('remote.tunnelView.alreadyForwarded', "Port is already forwarded");
export var ForwardPortAction;
(function (ForwardPortAction) {
    ForwardPortAction.INLINE_ID = 'remote.tunnel.forwardInline';
    ForwardPortAction.COMMANDPALETTE_ID = 'remote.tunnel.forwardCommandPalette';
    ForwardPortAction.LABEL = nls.localize2('remote.tunnel.forward', "Forward a Port");
    ForwardPortAction.TREEITEM_LABEL = nls.localize('remote.tunnel.forwardItem', "Forward Port");
    const forwardPrompt = nls.localize('remote.tunnel.forwardPrompt', "Port number or address (eg. 3000 or 10.10.10.10:2000).");
    function validateInput(remoteExplorerService, tunnelService, value, canElevate) {
        const parsed = parseAddress(value);
        if (!parsed) {
            return { content: invalidPortString, severity: Severity.Error };
        }
        else if (parsed.port >= maxPortNumber) {
            return { content: invalidPortNumberString, severity: Severity.Error };
        }
        else if (canElevate && tunnelService.isPortPrivileged(parsed.port)) {
            return { content: requiresSudoString, severity: Severity.Info };
        }
        else if (mapHasAddressLocalhostOrAllInterfaces(remoteExplorerService.tunnelModel.forwarded, parsed.host, parsed.port)) {
            return { content: alreadyForwarded, severity: Severity.Error };
        }
        return null;
    }
    function error(notificationService, tunnelOrError, host, port) {
        if (!tunnelOrError) {
            notificationService.warn(nls.localize('remote.tunnel.forwardError', "Unable to forward {0}:{1}. The host may not be available or that remote port may already be forwarded", host, port));
        }
        else if (typeof tunnelOrError === 'string') {
            notificationService.warn(nls.localize('remote.tunnel.forwardErrorProvided', "Unable to forward {0}:{1}. {2}", host, port, tunnelOrError));
        }
    }
    function inlineHandler() {
        return async (accessor, arg) => {
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            const notificationService = accessor.get(INotificationService);
            const tunnelService = accessor.get(ITunnelService);
            remoteExplorerService.setEditable(undefined, TunnelEditId.New, {
                onFinish: async (value, success) => {
                    remoteExplorerService.setEditable(undefined, TunnelEditId.New, null);
                    let parsed;
                    if (success && (parsed = parseAddress(value))) {
                        remoteExplorerService.forward({
                            remote: { host: parsed.host, port: parsed.port },
                            elevateIfNeeded: true
                        }).then(tunnelOrError => error(notificationService, tunnelOrError, parsed.host, parsed.port));
                    }
                },
                validationMessage: (value) => validateInput(remoteExplorerService, tunnelService, value, tunnelService.canElevate),
                placeholder: forwardPrompt
            });
        };
    }
    ForwardPortAction.inlineHandler = inlineHandler;
    function commandPaletteHandler() {
        return async (accessor, arg) => {
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            const notificationService = accessor.get(INotificationService);
            const viewsService = accessor.get(IViewsService);
            const quickInputService = accessor.get(IQuickInputService);
            const tunnelService = accessor.get(ITunnelService);
            await viewsService.openView(TunnelPanel.ID, true);
            const value = await quickInputService.input({
                prompt: forwardPrompt,
                validateInput: (value) => Promise.resolve(validateInput(remoteExplorerService, tunnelService, value, tunnelService.canElevate))
            });
            let parsed;
            if (value && (parsed = parseAddress(value))) {
                remoteExplorerService.forward({
                    remote: { host: parsed.host, port: parsed.port },
                    elevateIfNeeded: true
                }).then(tunnel => error(notificationService, tunnel, parsed.host, parsed.port));
            }
        };
    }
    ForwardPortAction.commandPaletteHandler = commandPaletteHandler;
})(ForwardPortAction || (ForwardPortAction = {}));
function makeTunnelPicks(tunnels, remoteExplorerService, tunnelService) {
    const picks = tunnels.map(forwarded => {
        const item = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, forwarded);
        return {
            label: item.label,
            description: item.processDescription,
            tunnel: item
        };
    });
    if (picks.length === 0) {
        picks.push({
            label: nls.localize('remote.tunnel.closeNoPorts', "No ports currently forwarded. Try running the {0} command", ForwardPortAction.LABEL.value)
        });
    }
    return picks;
}
var ClosePortAction;
(function (ClosePortAction) {
    ClosePortAction.INLINE_ID = 'remote.tunnel.closeInline';
    ClosePortAction.COMMANDPALETTE_ID = 'remote.tunnel.closeCommandPalette';
    ClosePortAction.LABEL = nls.localize2('remote.tunnel.close', "Stop Forwarding Port");
    function inlineHandler() {
        return async (accessor, arg) => {
            const contextKeyService = accessor.get(IContextKeyService);
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            let ports = [];
            const multiSelectContext = contextKeyService.getContextKeyValue(TunnelViewMultiSelectionKeyName);
            if (multiSelectContext) {
                multiSelectContext.forEach(context => {
                    const tunnel = remoteExplorerService.tunnelModel.forwarded.get(context);
                    if (tunnel) {
                        ports?.push(tunnel);
                    }
                });
            }
            else if (isITunnelItem(arg)) {
                ports = [arg];
            }
            else {
                const context = contextKeyService.getContextKeyValue(TunnelViewSelectionKeyName);
                const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : undefined;
                if (tunnel) {
                    ports = [tunnel];
                }
            }
            if (!ports || ports.length === 0) {
                return;
            }
            return Promise.all(ports.map(port => remoteExplorerService.close({ host: port.remoteHost, port: port.remotePort }, TunnelCloseReason.User)));
        };
    }
    ClosePortAction.inlineHandler = inlineHandler;
    function commandPaletteHandler() {
        return async (accessor) => {
            const quickInputService = accessor.get(IQuickInputService);
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            const tunnelService = accessor.get(ITunnelService);
            const commandService = accessor.get(ICommandService);
            const picks = makeTunnelPicks(Array.from(remoteExplorerService.tunnelModel.forwarded.values()).filter(tunnel => tunnel.closeable), remoteExplorerService, tunnelService);
            const result = await quickInputService.pick(picks, { placeHolder: nls.localize('remote.tunnel.closePlaceholder', "Choose a port to stop forwarding") });
            if (result && result.tunnel) {
                await remoteExplorerService.close({ host: result.tunnel.remoteHost, port: result.tunnel.remotePort }, TunnelCloseReason.User);
            }
            else if (result) {
                await commandService.executeCommand(ForwardPortAction.COMMANDPALETTE_ID);
            }
        };
    }
    ClosePortAction.commandPaletteHandler = commandPaletteHandler;
})(ClosePortAction || (ClosePortAction = {}));
export var OpenPortInBrowserAction;
(function (OpenPortInBrowserAction) {
    OpenPortInBrowserAction.ID = 'remote.tunnel.open';
    OpenPortInBrowserAction.LABEL = nls.localize('remote.tunnel.open', "Open in Browser");
    function handler() {
        return async (accessor, arg) => {
            let key;
            if (isITunnelItem(arg)) {
                key = makeAddress(arg.remoteHost, arg.remotePort);
            }
            else if (isRemoteTunnel(arg)) {
                key = makeAddress(arg.tunnelRemoteHost, arg.tunnelRemotePort);
            }
            if (key) {
                const model = accessor.get(IRemoteExplorerService).tunnelModel;
                const openerService = accessor.get(IOpenerService);
                return run(model, openerService, key);
            }
        };
    }
    OpenPortInBrowserAction.handler = handler;
    function run(model, openerService, key) {
        const tunnel = model.forwarded.get(key) || model.detected.get(key);
        if (tunnel) {
            return openerService.open(tunnel.localUri, { allowContributedOpeners: false });
        }
        return Promise.resolve();
    }
    OpenPortInBrowserAction.run = run;
})(OpenPortInBrowserAction || (OpenPortInBrowserAction = {}));
export var OpenPortInPreviewAction;
(function (OpenPortInPreviewAction) {
    OpenPortInPreviewAction.ID = 'remote.tunnel.openPreview';
    OpenPortInPreviewAction.LABEL = nls.localize('remote.tunnel.openPreview', "Preview in Editor");
    function handler() {
        return async (accessor, arg) => {
            let key;
            if (isITunnelItem(arg)) {
                key = makeAddress(arg.remoteHost, arg.remotePort);
            }
            else if (isRemoteTunnel(arg)) {
                key = makeAddress(arg.tunnelRemoteHost, arg.tunnelRemotePort);
            }
            if (key) {
                const model = accessor.get(IRemoteExplorerService).tunnelModel;
                const openerService = accessor.get(IOpenerService);
                const externalOpenerService = accessor.get(IExternalUriOpenerService);
                return run(model, openerService, externalOpenerService, key);
            }
        };
    }
    OpenPortInPreviewAction.handler = handler;
    async function run(model, openerService, externalOpenerService, key) {
        const tunnel = model.forwarded.get(key) || model.detected.get(key);
        if (tunnel) {
            const remoteHost = tunnel.remoteHost.includes(':') ? `[${tunnel.remoteHost}]` : tunnel.remoteHost;
            const sourceUri = URI.parse(`http://${remoteHost}:${tunnel.remotePort}`);
            const opener = await externalOpenerService.getOpener(tunnel.localUri, { sourceUri }, CancellationToken.None);
            if (opener) {
                return opener.openExternalUri(tunnel.localUri, { sourceUri }, CancellationToken.None);
            }
            return openerService.open(tunnel.localUri);
        }
        return Promise.resolve();
    }
    OpenPortInPreviewAction.run = run;
})(OpenPortInPreviewAction || (OpenPortInPreviewAction = {}));
var OpenPortInBrowserCommandPaletteAction;
(function (OpenPortInBrowserCommandPaletteAction) {
    OpenPortInBrowserCommandPaletteAction.ID = 'remote.tunnel.openCommandPalette';
    OpenPortInBrowserCommandPaletteAction.LABEL = nls.localize('remote.tunnel.openCommandPalette', "Open Port in Browser");
    function handler() {
        return async (accessor, arg) => {
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            const tunnelService = accessor.get(ITunnelService);
            const model = remoteExplorerService.tunnelModel;
            const quickPickService = accessor.get(IQuickInputService);
            const openerService = accessor.get(IOpenerService);
            const commandService = accessor.get(ICommandService);
            const options = [...model.forwarded, ...model.detected].map(value => {
                const tunnelItem = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, value[1]);
                return {
                    label: tunnelItem.label,
                    description: tunnelItem.processDescription,
                    tunnel: tunnelItem
                };
            });
            if (options.length === 0) {
                options.push({
                    label: nls.localize('remote.tunnel.openCommandPaletteNone', "No ports currently forwarded. Open the Ports view to get started.")
                });
            }
            else {
                options.push({
                    label: nls.localize('remote.tunnel.openCommandPaletteView', "Open the Ports view...")
                });
            }
            const picked = await quickPickService.pick(options, { placeHolder: nls.localize('remote.tunnel.openCommandPalettePick', "Choose the port to open") });
            if (picked && picked.tunnel) {
                return OpenPortInBrowserAction.run(model, openerService, makeAddress(picked.tunnel.remoteHost, picked.tunnel.remotePort));
            }
            else if (picked) {
                return commandService.executeCommand(`${TUNNEL_VIEW_ID}.focus`);
            }
        };
    }
    OpenPortInBrowserCommandPaletteAction.handler = handler;
})(OpenPortInBrowserCommandPaletteAction || (OpenPortInBrowserCommandPaletteAction = {}));
var CopyAddressAction;
(function (CopyAddressAction) {
    CopyAddressAction.INLINE_ID = 'remote.tunnel.copyAddressInline';
    CopyAddressAction.COMMANDPALETTE_ID = 'remote.tunnel.copyAddressCommandPalette';
    CopyAddressAction.INLINE_LABEL = nls.localize('remote.tunnel.copyAddressInline', "Copy Local Address");
    CopyAddressAction.COMMANDPALETTE_LABEL = nls.localize('remote.tunnel.copyAddressCommandPalette', "Copy Forwarded Port Address");
    async function copyAddress(remoteExplorerService, clipboardService, tunnelItem) {
        const address = remoteExplorerService.tunnelModel.address(tunnelItem.remoteHost, tunnelItem.remotePort);
        if (address) {
            await clipboardService.writeText(address.toString());
        }
    }
    function inlineHandler() {
        return async (accessor, arg) => {
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            let tunnelItem;
            if (isITunnelItem(arg)) {
                tunnelItem = arg;
            }
            else {
                const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
                tunnelItem = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : undefined;
            }
            if (tunnelItem) {
                return copyAddress(remoteExplorerService, accessor.get(IClipboardService), tunnelItem);
            }
        };
    }
    CopyAddressAction.inlineHandler = inlineHandler;
    function commandPaletteHandler() {
        return async (accessor, arg) => {
            const quickInputService = accessor.get(IQuickInputService);
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            const tunnelService = accessor.get(ITunnelService);
            const commandService = accessor.get(ICommandService);
            const clipboardService = accessor.get(IClipboardService);
            const tunnels = Array.from(remoteExplorerService.tunnelModel.forwarded.values()).concat(Array.from(remoteExplorerService.tunnelModel.detected.values()));
            const result = await quickInputService.pick(makeTunnelPicks(tunnels, remoteExplorerService, tunnelService), { placeHolder: nls.localize('remote.tunnel.copyAddressPlaceholdter', "Choose a forwarded port") });
            if (result && result.tunnel) {
                await copyAddress(remoteExplorerService, clipboardService, result.tunnel);
            }
            else if (result) {
                await commandService.executeCommand(ForwardPortAction.COMMANDPALETTE_ID);
            }
        };
    }
    CopyAddressAction.commandPaletteHandler = commandPaletteHandler;
})(CopyAddressAction || (CopyAddressAction = {}));
var ChangeLocalPortAction;
(function (ChangeLocalPortAction) {
    ChangeLocalPortAction.ID = 'remote.tunnel.changeLocalPort';
    ChangeLocalPortAction.LABEL = nls.localize('remote.tunnel.changeLocalPort', "Change Local Address Port");
    function validateInput(tunnelService, value, canElevate) {
        if (!value.match(/^[0-9]+$/)) {
            return { content: nls.localize('remote.tunnelsView.portShouldBeNumber', "Local port should be a number."), severity: Severity.Error };
        }
        else if (Number(value) >= maxPortNumber) {
            return { content: invalidPortNumberString, severity: Severity.Error };
        }
        else if (canElevate && tunnelService.isPortPrivileged(Number(value))) {
            return { content: requiresSudoString, severity: Severity.Info };
        }
        return null;
    }
    function handler() {
        return async (accessor, arg) => {
            const remoteExplorerService = accessor.get(IRemoteExplorerService);
            const notificationService = accessor.get(INotificationService);
            const tunnelService = accessor.get(ITunnelService);
            let tunnelContext;
            if (isITunnelItem(arg)) {
                tunnelContext = arg;
            }
            else {
                const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
                const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : undefined;
                if (tunnel) {
                    const tunnelService = accessor.get(ITunnelService);
                    tunnelContext = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, tunnel);
                }
            }
            if (tunnelContext) {
                const tunnelItem = tunnelContext;
                remoteExplorerService.setEditable(tunnelItem, TunnelEditId.LocalPort, {
                    onFinish: async (value, success) => {
                        remoteExplorerService.setEditable(tunnelItem, TunnelEditId.LocalPort, null);
                        if (success) {
                            await remoteExplorerService.close({ host: tunnelItem.remoteHost, port: tunnelItem.remotePort }, TunnelCloseReason.Other);
                            const numberValue = Number(value);
                            const newForward = await remoteExplorerService.forward({
                                remote: { host: tunnelItem.remoteHost, port: tunnelItem.remotePort },
                                local: numberValue,
                                name: tunnelItem.name,
                                elevateIfNeeded: true,
                                source: tunnelItem.source
                            });
                            if (newForward && (typeof newForward !== 'string') && newForward.tunnelLocalPort !== numberValue) {
                                notificationService.warn(nls.localize('remote.tunnel.changeLocalPortNumber', "The local port {0} is not available. Port number {1} has been used instead", value, newForward.tunnelLocalPort ?? newForward.localAddress));
                            }
                        }
                    },
                    validationMessage: (value) => validateInput(tunnelService, value, tunnelService.canElevate),
                    placeholder: nls.localize('remote.tunnelsView.changePort', "New local port")
                });
            }
        };
    }
    ChangeLocalPortAction.handler = handler;
})(ChangeLocalPortAction || (ChangeLocalPortAction = {}));
var ChangeTunnelPrivacyAction;
(function (ChangeTunnelPrivacyAction) {
    function handler(privacyId) {
        return async (accessor, arg) => {
            if (isITunnelItem(arg)) {
                const remoteExplorerService = accessor.get(IRemoteExplorerService);
                await remoteExplorerService.close({ host: arg.remoteHost, port: arg.remotePort }, TunnelCloseReason.Other);
                return remoteExplorerService.forward({
                    remote: { host: arg.remoteHost, port: arg.remotePort },
                    local: arg.localPort,
                    name: arg.name,
                    elevateIfNeeded: true,
                    privacy: privacyId,
                    source: arg.source
                });
            }
            return undefined;
        };
    }
    ChangeTunnelPrivacyAction.handler = handler;
})(ChangeTunnelPrivacyAction || (ChangeTunnelPrivacyAction = {}));
var SetTunnelProtocolAction;
(function (SetTunnelProtocolAction) {
    SetTunnelProtocolAction.ID_HTTP = 'remote.tunnel.setProtocolHttp';
    SetTunnelProtocolAction.ID_HTTPS = 'remote.tunnel.setProtocolHttps';
    SetTunnelProtocolAction.LABEL_HTTP = nls.localize('remote.tunnel.protocolHttp', "HTTP");
    SetTunnelProtocolAction.LABEL_HTTPS = nls.localize('remote.tunnel.protocolHttps', "HTTPS");
    async function handler(arg, protocol, remoteExplorerService, environmentService) {
        if (isITunnelItem(arg)) {
            const attributes = {
                protocol
            };
            const target = environmentService.remoteAuthority ? 4 /* ConfigurationTarget.USER_REMOTE */ : 3 /* ConfigurationTarget.USER_LOCAL */;
            return remoteExplorerService.tunnelModel.configPortsAttributes.addAttributes(arg.remotePort, attributes, target);
        }
    }
    function handlerHttp() {
        return async (accessor, arg) => {
            return handler(arg, TunnelProtocol.Http, accessor.get(IRemoteExplorerService), accessor.get(IWorkbenchEnvironmentService));
        };
    }
    SetTunnelProtocolAction.handlerHttp = handlerHttp;
    function handlerHttps() {
        return async (accessor, arg) => {
            return handler(arg, TunnelProtocol.Https, accessor.get(IRemoteExplorerService), accessor.get(IWorkbenchEnvironmentService));
        };
    }
    SetTunnelProtocolAction.handlerHttps = handlerHttps;
})(SetTunnelProtocolAction || (SetTunnelProtocolAction = {}));
const tunnelViewCommandsWeightBonus = 10; // give our commands a little bit more weight over other default list/tree commands
const isForwardedExpr = TunnelTypeContextKey.isEqualTo(TunnelType.Forwarded);
const isForwardedOrDetectedExpr = ContextKeyExpr.or(isForwardedExpr, TunnelTypeContextKey.isEqualTo(TunnelType.Detected));
const isNotMultiSelectionExpr = TunnelViewMultiSelectionContextKey.isEqualTo(undefined);
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: LabelTunnelAction.ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + tunnelViewCommandsWeightBonus,
    when: ContextKeyExpr.and(TunnelViewFocusContextKey, isForwardedExpr, isNotMultiSelectionExpr),
    primary: 60 /* KeyCode.F2 */,
    mac: {
        primary: 3 /* KeyCode.Enter */
    },
    handler: LabelTunnelAction.handler()
});
CommandsRegistry.registerCommand(ForwardPortAction.INLINE_ID, ForwardPortAction.inlineHandler());
CommandsRegistry.registerCommand(ForwardPortAction.COMMANDPALETTE_ID, ForwardPortAction.commandPaletteHandler());
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: ClosePortAction.INLINE_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + tunnelViewCommandsWeightBonus,
    when: ContextKeyExpr.and(TunnelCloseableContextKey, TunnelViewFocusContextKey),
    primary: 20 /* KeyCode.Delete */,
    mac: {
        primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */,
        secondary: [20 /* KeyCode.Delete */]
    },
    handler: ClosePortAction.inlineHandler()
});
CommandsRegistry.registerCommand(ClosePortAction.COMMANDPALETTE_ID, ClosePortAction.commandPaletteHandler());
CommandsRegistry.registerCommand(OpenPortInBrowserAction.ID, OpenPortInBrowserAction.handler());
CommandsRegistry.registerCommand(OpenPortInPreviewAction.ID, OpenPortInPreviewAction.handler());
CommandsRegistry.registerCommand(OpenPortInBrowserCommandPaletteAction.ID, OpenPortInBrowserCommandPaletteAction.handler());
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CopyAddressAction.INLINE_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + tunnelViewCommandsWeightBonus,
    when: ContextKeyExpr.and(TunnelViewFocusContextKey, isForwardedOrDetectedExpr, isNotMultiSelectionExpr),
    primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */,
    handler: CopyAddressAction.inlineHandler()
});
CommandsRegistry.registerCommand(CopyAddressAction.COMMANDPALETTE_ID, CopyAddressAction.commandPaletteHandler());
CommandsRegistry.registerCommand(ChangeLocalPortAction.ID, ChangeLocalPortAction.handler());
CommandsRegistry.registerCommand(SetTunnelProtocolAction.ID_HTTP, SetTunnelProtocolAction.handlerHttp());
CommandsRegistry.registerCommand(SetTunnelProtocolAction.ID_HTTPS, SetTunnelProtocolAction.handlerHttps());
MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
    command: {
        id: ClosePortAction.COMMANDPALETTE_ID,
        title: ClosePortAction.LABEL
    },
    when: forwardedPortsViewEnabled
}));
MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
    command: {
        id: ForwardPortAction.COMMANDPALETTE_ID,
        title: ForwardPortAction.LABEL
    },
    when: forwardedPortsViewEnabled
}));
MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
    command: {
        id: CopyAddressAction.COMMANDPALETTE_ID,
        title: CopyAddressAction.COMMANDPALETTE_LABEL
    },
    when: forwardedPortsViewEnabled
}));
MenuRegistry.appendMenuItem(MenuId.CommandPalette, ({
    command: {
        id: OpenPortInBrowserCommandPaletteAction.ID,
        title: OpenPortInBrowserCommandPaletteAction.LABEL
    },
    when: forwardedPortsViewEnabled
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '._open',
    order: 0,
    command: {
        id: OpenPortInBrowserAction.ID,
        title: OpenPortInBrowserAction.LABEL,
    },
    when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '._open',
    order: 1,
    command: {
        id: OpenPortInPreviewAction.ID,
        title: OpenPortInPreviewAction.LABEL,
    },
    when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
}));
// The group 0_manage is used by extensions, so try not to change it
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '0_manage',
    order: 1,
    command: {
        id: LabelTunnelAction.ID,
        title: LabelTunnelAction.LABEL,
        icon: labelPortIcon
    },
    when: ContextKeyExpr.and(isForwardedExpr, isNotMultiSelectionExpr)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '2_localaddress',
    order: 0,
    command: {
        id: CopyAddressAction.INLINE_ID,
        title: CopyAddressAction.INLINE_LABEL,
    },
    when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '2_localaddress',
    order: 1,
    command: {
        id: ChangeLocalPortAction.ID,
        title: ChangeLocalPortAction.LABEL,
    },
    when: ContextKeyExpr.and(isForwardedExpr, PortChangableContextKey, isNotMultiSelectionExpr)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '2_localaddress',
    order: 2,
    submenu: MenuId.TunnelPrivacy,
    title: nls.localize('tunnelContext.privacyMenu', "Port Visibility"),
    when: ContextKeyExpr.and(isForwardedExpr, TunnelPrivacyEnabledContextKey)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '2_localaddress',
    order: 3,
    submenu: MenuId.TunnelProtocol,
    title: nls.localize('tunnelContext.protocolMenu', "Change Port Protocol"),
    when: ContextKeyExpr.and(isForwardedExpr, isNotMultiSelectionExpr, ProtocolChangeableContextKey)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '3_forward',
    order: 0,
    command: {
        id: ClosePortAction.INLINE_ID,
        title: ClosePortAction.LABEL,
    },
    when: TunnelCloseableContextKey
}));
MenuRegistry.appendMenuItem(MenuId.TunnelContext, ({
    group: '3_forward',
    order: 1,
    command: {
        id: ForwardPortAction.INLINE_ID,
        title: ForwardPortAction.LABEL,
    },
}));
MenuRegistry.appendMenuItem(MenuId.TunnelProtocol, ({
    order: 0,
    command: {
        id: SetTunnelProtocolAction.ID_HTTP,
        title: SetTunnelProtocolAction.LABEL_HTTP,
        toggled: TunnelProtocolContextKey.isEqualTo(TunnelProtocol.Http)
    }
}));
MenuRegistry.appendMenuItem(MenuId.TunnelProtocol, ({
    order: 1,
    command: {
        id: SetTunnelProtocolAction.ID_HTTPS,
        title: SetTunnelProtocolAction.LABEL_HTTPS,
        toggled: TunnelProtocolContextKey.isEqualTo(TunnelProtocol.Https)
    }
}));
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, ({
    group: '0_manage',
    order: 0,
    command: {
        id: ForwardPortAction.INLINE_ID,
        title: ForwardPortAction.TREEITEM_LABEL,
        icon: forwardPortIcon
    },
    when: TunnelTypeContextKey.isEqualTo(TunnelType.Candidate)
}));
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, ({
    group: '0_manage',
    order: 4,
    command: {
        id: LabelTunnelAction.ID,
        title: LabelTunnelAction.LABEL,
        icon: labelPortIcon
    },
    when: isForwardedExpr
}));
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, ({
    group: '0_manage',
    order: 5,
    command: {
        id: ClosePortAction.INLINE_ID,
        title: ClosePortAction.LABEL,
        icon: stopForwardIcon
    },
    when: TunnelCloseableContextKey
}));
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, ({
    order: -1,
    command: {
        id: CopyAddressAction.INLINE_ID,
        title: CopyAddressAction.INLINE_LABEL,
        icon: copyAddressIcon
    },
    when: isForwardedOrDetectedExpr
}));
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, ({
    order: 0,
    command: {
        id: OpenPortInBrowserAction.ID,
        title: OpenPortInBrowserAction.LABEL,
        icon: openBrowserIcon
    },
    when: isForwardedOrDetectedExpr
}));
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, ({
    order: 1,
    command: {
        id: OpenPortInPreviewAction.ID,
        title: OpenPortInPreviewAction.LABEL,
        icon: openPreviewIcon
    },
    when: isForwardedOrDetectedExpr
}));
registerColor('ports.iconRunningProcessForeground', STATUS_BAR_REMOTE_ITEM_BACKGROUND, nls.localize('portWithRunningProcess.foreground', "The color of the icon for a port that has an associated running process."));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVubmVsVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3R1bm5lbFZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sd0JBQXdCLENBQUM7QUFDaEMsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBa0Msc0JBQXNCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNsRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDbkgsT0FBTyxFQUFFLGtCQUFrQixFQUFlLGFBQWEsRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0SSxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDeEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBa0MsTUFBTSxzREFBc0QsQ0FBQztBQUMxSCxPQUFPLEVBQUUsZUFBZSxFQUFtQixnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsWUFB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