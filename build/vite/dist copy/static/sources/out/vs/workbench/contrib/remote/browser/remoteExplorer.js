var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Extensions } from '../../../common/views.js';
import { IRemoteExplorerService, PORT_AUTO_FALLBACK_SETTING, PORT_AUTO_FORWARD_SETTING, PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID, PORT_AUTO_SOURCE_SETTING_OUTPUT, PORT_AUTO_SOURCE_SETTING_PROCESS, PortsEnablement, TUNNEL_VIEW_CONTAINER_ID, TUNNEL_VIEW_ID } from '../../../services/remote/common/remoteExplorerService.js';
import { AutoTunnelSource, forwardedPortsFeaturesEnabled, forwardedPortsViewEnabled, makeAddress, mapHasAddressLocalhostOrAllInterfaces, OnPortForward, TunnelCloseReason, TunnelSource } from '../../../services/remote/common/tunnelModel.js';
import { ForwardPortAction, OpenPortInBrowserAction, TunnelPanel, TunnelPanelDescriptor, TunnelViewModel, OpenPortInPreviewAction, openPreviewEnabledContext } from './tunnelView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { UrlFinder } from './urlFinder.js';
import Severity from '../../../../base/common/severity.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { IDebugService } from '../../debug/common/debug.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ITunnelService, TunnelPrivacyId } from '../../../../platform/tunnel/common/tunnel.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { portsViewIcon } from './remoteIcons.js';
import { Event } from '../../../../base/common/event.js';
import { IExternalUriOpenerService } from '../../externalUriOpener/common/externalUriOpenerService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { toAction } from '../../../../base/common/actions.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
export const VIEWLET_ID = 'workbench.view.remote';
let ForwardedPortsView = class ForwardedPortsView extends Disposable {
    constructor(contextKeyService, environmentService, remoteExplorerService, tunnelService, activityService, statusbarService) {
        super();
        this.contextKeyService = contextKeyService;
        this.environmentService = environmentService;
        this.remoteExplorerService = remoteExplorerService;
        this.tunnelService = tunnelService;
        this.activityService = activityService;
        this.statusbarService = statusbarService;
        this.contextKeyListener = this._register(new MutableDisposable());
        this.activityBadge = this._register(new MutableDisposable());
        this.hasPortsInSession = false;
        this._register(Registry.as(Extensions.ViewsRegistry).registerViewWelcomeContent(TUNNEL_VIEW_ID, {
            content: this.environmentService.remoteAuthority ? nls.localize('remoteNoPorts', "No forwarded ports. Forward a port to access your running services locally.\n[Forward a Port]({0})", `command:${ForwardPortAction.INLINE_ID}`)
                : nls.localize('noRemoteNoPorts', "No forwarded ports. Forward a port to access your locally running services over the internet.\n[Forward a Port]({0})", `command:${ForwardPortAction.INLINE_ID}`),
        }));
        this.enableBadgeAndStatusBar();
        this.enableForwardedPortsFeatures();
        if (!this.environmentService.remoteAuthority) {
            this._register(Event.once(this.tunnelService.onTunnelOpened)(() => {
                this.hasPortsInSession = true;
            }));
        }
    }
    async getViewContainer() {
        return Registry.as(Extensions.ViewContainersRegistry).registerViewContainer({
            id: TUNNEL_VIEW_CONTAINER_ID,
            title: nls.localize2('ports', "Ports"),
            icon: portsViewIcon,
            ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [TUNNEL_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
            storageId: TUNNEL_VIEW_CONTAINER_ID,
            hideIfEmpty: true,
            order: 5
        }, 1 /* ViewContainerLocation.Panel */);
    }
    async enableForwardedPortsFeatures() {
        this.contextKeyListener.clear();
        const featuresEnabled = !!forwardedPortsFeaturesEnabled.getValue(this.contextKeyService);
        const viewEnabled = !!forwardedPortsViewEnabled.getValue(this.contextKeyService);
        if (featuresEnabled || viewEnabled) {
            // Also enable the view if it isn't already.
            if (!viewEnabled) {
                this.contextKeyService.createKey(forwardedPortsViewEnabled.key, true);
            }
            const viewContainer = await this.getViewContainer();
            const tunnelPanelDescriptor = new TunnelPanelDescriptor(new TunnelViewModel(this.remoteExplorerService, this.tunnelService), this.environmentService);
            const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
            if (viewContainer) {
                this.remoteExplorerService.enablePortsFeatures(!featuresEnabled);
                viewsRegistry.registerViews([tunnelPanelDescriptor], viewContainer);
            }
        }
        else {
            this.contextKeyListener.value = this.contextKeyService.onDidChangeContext(e => {
                if (e.affectsSome(new Set([...forwardedPortsFeaturesEnabled.keys(), ...forwardedPortsViewEnabled.keys()]))) {
                    this.enableForwardedPortsFeatures();
                }
            });
        }
    }
    enableBadgeAndStatusBar() {
        const disposable = Registry.as(Extensions.ViewsRegistry).onViewsRegistered(e => {
            if (e.find(view => view.views.find(viewDescriptor => viewDescriptor.id === TUNNEL_VIEW_ID))) {
                this._register(Event.debounce(this.remoteExplorerService.tunnelModel.onForwardPort, (_last, e) => e, 50)(() => {
                    this.updateActivityBadge();
                    this.updateStatusBar();
                }));
                this._register(Event.debounce(this.remoteExplorerService.tunnelModel.onClosePort, (_last, e) => e, 50)(() => {
                    this.updateActivityBadge();
                    this.updateStatusBar();
                }));
                this.updateActivityBadge();
                this.updateStatusBar();
                disposable.dispose();
            }
        });
    }
    async updateActivityBadge() {
        if (this.remoteExplorerService.tunnelModel.forwarded.size > 0) {
            this.activityBadge.value = this.activityService.showViewActivity(TUNNEL_VIEW_ID, {
                badge: new NumberBadge(this.remoteExplorerService.tunnelModel.forwarded.size, n => n === 1 ? nls.localize('1forwardedPort', "1 forwarded port") : nls.localize('nForwardedPorts', "{0} forwarded ports", n))
            });
        }
        else {
            this.activityBadge.clear();
        }
    }
    updateStatusBar() {
        if (!this.environmentService.remoteAuthority && !this.hasPortsInSession) {
            // We only want to show the ports status bar entry when the user has taken an action that indicates that they might care about it.
            return;
        }
        if (!this.entryAccessor) {
            this._register(this.entryAccessor = this.statusbarService.addEntry(this.entry, 'status.forwardedPorts', 0 /* StatusbarAlignment.LEFT */, 40));
        }
        else {
            this.entryAccessor.update(this.entry);
        }
    }
    get entry() {
        let tooltip;
        const count = this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
        const text = `${count}`;
        if (count === 0) {
            tooltip = nls.localize('remote.forwardedPorts.statusbarTextNone', "No Ports Forwarded");
        }
        else {
            const allTunnels = Array.from(this.remoteExplorerService.tunnelModel.forwarded.values());
            allTunnels.push(...Array.from(this.remoteExplorerService.tunnelModel.detected.values()));
            tooltip = nls.localize('remote.forwardedPorts.statusbarTooltip', "Forwarded Ports: {0}", allTunnels.map(forwarded => forwarded.remotePort).join(', '));
        }
        return {
            name: nls.localize('status.forwardedPorts', "Forwarded Ports"),
            text: `$(radio-tower) ${text}`,
            ariaLabel: tooltip,
            tooltip,
            command: `${TUNNEL_VIEW_ID}.focus`
        };
    }
};
ForwardedPortsView = __decorate([
    __param(0, IContextKeyService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IRemoteExplorerService),
    __param(3, ITunnelService),
    __param(4, IActivityService),
    __param(5, IStatusbarService)
], ForwardedPortsView);
export { ForwardedPortsView };
let PortRestore = class PortRestore {
    constructor(remoteExplorerService, logService) {
        this.remoteExplorerService = remoteExplorerService;
        this.logService = logService;
        if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
            Event.once(this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet)(async () => {
                await this.restore();
            });
        }
        else {
            this.restore();
        }
    }
    async restore() {
        this.logService.trace('ForwardedPorts: Doing first restore.');
        return this.remoteExplorerService.restore();
    }
};
PortRestore = __decorate([
    __param(0, IRemoteExplorerService),
    __param(1, ILogService)
], PortRestore);
export { PortRestore };
let AutomaticPortForwarding = class AutomaticPortForwarding extends Disposable {
    constructor(terminalService, notificationService, openerService, externalOpenerService, remoteExplorerService, environmentService, contextKeyService, configurationService, debugService, remoteAgentService, tunnelService, hostService, logService, storageService, preferencesService) {
        super();
        this.terminalService = terminalService;
        this.notificationService = notificationService;
        this.openerService = openerService;
        this.externalOpenerService = externalOpenerService;
        this.remoteExplorerService = remoteExplorerService;
        this.contextKeyService = contextKeyService;
        this.configurationService = configurationService;
        this.debugService = debugService;
        this.tunnelService = tunnelService;
        this.hostService = hostService;
        this.logService = logService;
        this.storageService = storageService;
        this.preferencesService = preferencesService;
        if (!environmentService.remoteAuthority) {
            return;
        }
        configurationService.whenRemoteConfigurationLoaded().then(() => remoteAgentService.getEnvironment()).then(environment => {
            this.setup(environment);
            this._register(configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration(PORT_AUTO_SOURCE_SETTING)) {
                    this.setup(environment);
                }
                else if (e.affectsConfiguration(PORT_AUTO_FALLBACK_SETTING) && !this.portListener) {
                    this.listenForPorts();
                }
            }));
        });
        if (!this.storageService.getBoolean('processPortForwardingFallback', 1 /* StorageScope.WORKSPACE */, true)) {
            this.configurationService.updateValue(PORT_AUTO_FALLBACK_SETTING, 0, 5 /* ConfigurationTarget.WORKSPACE */);
        }
    }
    getPortAutoFallbackNumber() {
        const fallbackAt = this.configurationService.inspect(PORT_AUTO_FALLBACK_SETTING);
        if ((fallbackAt.value !== undefined) && (fallbackAt.value === 0 || (fallbackAt.value !== fallbackAt.defaultValue))) {
            return fallbackAt.value;
        }
        const inspectSource = this.configurationService.inspect(PORT_AUTO_SOURCE_SETTING);
        if (inspectSource.applicationValue === PORT_AUTO_SOURCE_SETTING_PROCESS ||
            inspectSource.userValue === PORT_AUTO_SOURCE_SETTING_PROCESS ||
            inspectSource.userLocalValue === PORT_AUTO_SOURCE_SETTING_PROCESS ||
            inspectSource.userRemoteValue === PORT_AUTO_SOURCE_SETTING_PROCESS ||
            inspectSource.workspaceFolderValue === PORT_AUTO_SOURCE_SETTING_PROCESS ||
            inspectSource.workspaceValue === PORT_AUTO_SOURCE_SETTING_PROCESS) {
            return 0;
        }
        return fallbackAt.value ?? 20;
    }
    listenForPorts() {
        let fallbackAt = this.getPortAutoFallbackNumber();
        if (fallbackAt === 0) {
            this.portListener?.dispose();
            return;
        }
        if (this.procForwarder && !this.portListener && (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_PROCESS)) {
            this.portListener = this._register(this.remoteExplorerService.tunnelModel.onForwardPort(async () => {
                fallbackAt = this.getPortAutoFallbackNumber();
                if (fallbackAt === 0) {
                    this.portListener?.dispose();
                    return;
                }
                if (Array.from(this.remoteExplorerService.tunnelModel.forwarded.values()).filter(tunnel => tunnel.source.source === TunnelSource.Auto).length > fallbackAt) {
                    await this.configurationService.updateValue(PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID);
                    this.notificationService.notify({
                        message: nls.localize('remote.autoForwardPortsSource.fallback', "Over 20 ports have been automatically forwarded. The `process` based automatic port forwarding has been switched to `hybrid` in settings. Some ports may no longer be detected."),
                        severity: Severity.Warning,
                        actions: {
                            primary: [
                                toAction({
                                    id: 'switchBack',
                                    label: nls.localize('remote.autoForwardPortsSource.fallback.switchBack', "Undo"),
                                    run: async () => {
                                        await this.configurationService.updateValue(PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_PROCESS);
                                        await this.configurationService.updateValue(PORT_AUTO_FALLBACK_SETTING, 0, 5 /* ConfigurationTarget.WORKSPACE */);
                                        this.portListener?.dispose();
                                        this.portListener = undefined;
                                    }
                                }),
                                toAction({
                                    id: 'showPortSourceSetting',
                                    label: nls.localize('remote.autoForwardPortsSource.fallback.showPortSourceSetting', "Show Setting"),
                                    run: async () => {
                                        await this.preferencesService.openSettings({
                                            query: 'remote.autoForwardPortsSource'
                                        });
                                    }
                                })
                            ]
                        }
                    });
                }
            }));
        }
        else {
            this.portListener?.dispose();
            this.portListener = undefined;
        }
    }
    setup(environment) {
        const alreadyForwarded = this.procForwarder?.forwarded;
        const isSwitch = this.outputForwarder || this.procForwarder;
        this.procForwarder?.dispose();
        this.procForwarder = undefined;
        this.outputForwarder?.dispose();
        this.outputForwarder = undefined;
        if (environment?.os !== 3 /* OperatingSystem.Linux */) {
            if (this.configurationService.inspect(PORT_AUTO_SOURCE_SETTING).default?.value !== PORT_AUTO_SOURCE_SETTING_OUTPUT) {
                Registry.as(ConfigurationExtensions.Configuration)
                    .registerDefaultConfigurations([{ overrides: { 'remote.autoForwardPortsSource': PORT_AUTO_SOURCE_SETTING_OUTPUT } }]);
            }
            this.outputForwarder = this._register(new OutputAutomaticPortForwarding(this.terminalService, this.notificationService, this.openerService, this.externalOpenerService, this.remoteExplorerService, this.configurationService, this.debugService, this.tunnelService, this.hostService, this.logService, this.contextKeyService, () => false));
        }
        else {
            const useProc = () => (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_PROCESS);
            if (useProc()) {
                this.procForwarder = this._register(new ProcAutomaticPortForwarding(false, alreadyForwarded, !isSwitch, this.configurationService, this.remoteExplorerService, this.notificationService, this.openerService, this.externalOpenerService, this.tunnelService, this.hostService, this.logService, this.contextKeyService));
            }
            else if (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_HYBRID) {
                this.procForwarder = this._register(new ProcAutomaticPortForwarding(true, alreadyForwarded, !isSwitch, this.configurationService, this.remoteExplorerService, this.notificationService, this.openerService, this.externalOpenerService, this.tunnelService, this.hostService, this.logService, this.contextKeyService));
            }
            this.outputForwarder = this._register(new OutputAutomaticPortForwarding(this.terminalService, this.notificationService, this.openerService, this.externalOpenerService, this.remoteExplorerService, this.configurationService, this.debugService, this.tunnelService, this.hostService, this.logService, this.contextKeyService, useProc));
        }
        this.listenForPorts();
    }
};
AutomaticPortForwarding = __decorate([
    __param(0, ITerminalService),
    __param(1, INotificationService),
    __param(2, IOpenerService),
    __param(3, IExternalUriOpenerService),
    __param(4, IRemoteExplorerService),
    __param(5, IWorkbenchEnvironmentService),
    __param(6, IContextKeyService),
    __param(7, IWorkbenchConfigurationService),
    __param(8, IDebugService),
    __param(9, IRemoteAgentService),
    __param(10, ITunnelService),
    __param(11, IHostService),
    __param(12, ILogService),
    __param(13, IStorageService),
    __param(14, IPreferencesService)
], AutomaticPortForwarding);
export { AutomaticPortForwarding };
class OnAutoForwardedAction extends Disposable {
    static { this.NOTIFY_COOL_DOWN = 5000; } // milliseconds
    constructor(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService) {
        super();
        this.notificationService = notificationService;
        this.remoteExplorerService = remoteExplorerService;
        this.openerService = openerService;
        this.externalOpenerService = externalOpenerService;
        this.tunnelService = tunnelService;
        this.hostService = hostService;
        this.logService = logService;
        this.contextKeyService = contextKeyService;
        this.notificationDisposable = this._register(new MutableDisposable());
        this.alreadyOpenedOnce = new Set();
        this.lastNotifyTime = new Date();
        this.lastNotifyTime.setFullYear(this.lastNotifyTime.getFullYear() - 1);
    }
    async doAction(tunnels) {
        this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Starting action for ${tunnels[0]?.tunnelRemotePort}`);
        this.doActionTunnels = tunnels;
        const tunnel = await this.portNumberHeuristicDelay();
        this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose ${tunnel?.tunnelRemotePort}`);
        if (tunnel) {
            const allAttributes = await this.remoteExplorerService.tunnelModel.getAttributes([{ port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost }]);
            const attributes = allAttributes?.get(tunnel.tunnelRemotePort)?.onAutoForward;
            this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) onAutoForward action is ${attributes}`);
            switch (attributes) {
                case OnPortForward.OpenBrowserOnce: {
                    if (this.alreadyOpenedOnce.has(tunnel.localAddress)) {
                        break;
                    }
                    this.alreadyOpenedOnce.add(tunnel.localAddress);
                    // Intentionally do not break so that the open browser path can be run.
                }
                case OnPortForward.OpenBrowser: {
                    const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
                    await OpenPortInBrowserAction.run(this.remoteExplorerService.tunnelModel, this.openerService, address);
                    break;
                }
                case OnPortForward.OpenPreview: {
                    const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
                    await OpenPortInPreviewAction.run(this.remoteExplorerService.tunnelModel, this.openerService, this.externalOpenerService, address);
                    break;
                }
                case OnPortForward.Silent: break;
                default: {
                    const elapsed = new Date().getTime() - this.lastNotifyTime.getTime();
                    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) time elapsed since last notification ${elapsed} ms`);
                    if (elapsed > OnAutoForwardedAction.NOTIFY_COOL_DOWN) {
                        await this.showNotification(tunnel);
                    }
                }
            }
        }
    }
    hide(removedPorts) {
        if (this.doActionTunnels) {
            this.doActionTunnels = this.doActionTunnels.filter(value => !removedPorts.includes(value.tunnelRemotePort));
        }
        if (this.lastShownPort && removedPorts.indexOf(this.lastShownPort) >= 0) {
            this.lastNotification?.close();
        }
    }
    async portNumberHeuristicDelay() {
        this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Starting heuristic delay`);
        if (!this.doActionTunnels || this.doActionTunnels.length === 0) {
            return;
        }
        this.doActionTunnels = this.doActionTunnels.sort((a, b) => a.tunnelRemotePort - b.tunnelRemotePort);
        const firstTunnel = this.doActionTunnels.shift();
        // Heuristic.
        if (firstTunnel.tunnelRemotePort % 1000 === 0) {
            this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose tunnel because % 1000: ${firstTunnel.tunnelRemotePort}`);
            this.newerTunnel = firstTunnel;
            return firstTunnel;
            // 9229 is the node inspect port
        }
        else if (firstTunnel.tunnelRemotePort < 10000 && firstTunnel.tunnelRemotePort !== 9229) {
            this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose tunnel because < 10000: ${firstTunnel.tunnelRemotePort}`);
            this.newerTunnel = firstTunnel;
            return firstTunnel;
        }
        this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Waiting for "better" tunnel than ${firstTunnel.tunnelRemotePort}`);
        this.newerTunnel = undefined;
        return new Promise(resolve => {
            setTimeout(() => {
                if (this.newerTunnel) {
                    resolve(undefined);
                }
                else if (this.doActionTunnels?.includes(firstTunnel)) {
                    resolve(firstTunnel);
                }
                else {
                    resolve(undefined);
                }
            }, 3000);
        });
    }
    async basicMessage(tunnel) {
        const properties = await this.remoteExplorerService.tunnelModel.getAttributes([{ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }], false);
        const label = properties?.get(tunnel.tunnelRemotePort)?.label;
        return nls.localize('remote.tunnelsView.automaticForward', "Your application{0} running on port {1} is available.  ", label ? ` (${label})` : '', tunnel.tunnelRemotePort);
    }
    linkMessage() {
        return nls.localize({ key: 'remote.tunnelsView.notificationLink2', comment: ['[See all forwarded ports]({0}) is a link. Only translate `See all forwarded ports`. Do not change brackets and parentheses or {0}'] }, "[See all forwarded ports]({0})", `command:${TunnelPanel.ID}.focus`);
    }
    async showNotification(tunnel) {
        if (!await this.hostService.hadLastFocus()) {
            return;
        }
        this.lastNotification?.close();
        let message = await this.basicMessage(tunnel);
        const choices = [this.openBrowserChoice(tunnel)];
        if (!isWeb || openPreviewEnabledContext.getValue(this.contextKeyService)) {
            choices.push(this.openPreviewChoice(tunnel));
        }
        if ((tunnel.tunnelLocalPort !== tunnel.tunnelRemotePort) && this.tunnelService.canElevate && this.tunnelService.isPortPrivileged(tunnel.tunnelRemotePort)) {
            // Privileged ports are not on Windows, so it's safe to use "superuser"
            message += nls.localize('remote.tunnelsView.elevationMessage', "You'll need to run as superuser to use port {0} locally.  ", tunnel.tunnelRemotePort);
            choices.unshift(this.elevateChoice(tunnel));
        }
        if (tunnel.privacy === TunnelPrivacyId.Private && isWeb && this.tunnelService.canChangePrivacy) {
            choices.push(this.makePublicChoice(tunnel));
        }
        message += this.linkMessage();
        this.lastNotification = this.notificationService.prompt(Severity.Info, message, choices, { neverShowAgain: { id: 'remote.tunnelsView.autoForwardNeverShow', isSecondary: true } });
        this.lastShownPort = tunnel.tunnelRemotePort;
        this.lastNotifyTime = new Date();
        this.notificationDisposable.value = this.lastNotification.onDidClose(() => {
            this.lastNotification = undefined;
            this.lastShownPort = undefined;
        });
    }
    makePublicChoice(tunnel) {
        return {
            label: nls.localize('remote.tunnelsView.makePublic', "Make Public"),
            run: async () => {
                const oldTunnelDetails = mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.forwarded, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
                await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, TunnelCloseReason.Other);
                return this.remoteExplorerService.forward({
                    remote: { host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort },
                    local: tunnel.tunnelLocalPort,
                    name: oldTunnelDetails?.name,
                    elevateIfNeeded: true,
                    privacy: TunnelPrivacyId.Public,
                    source: oldTunnelDetails?.source
                });
            }
        };
    }
    openBrowserChoice(tunnel) {
        const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
        return {
            label: OpenPortInBrowserAction.LABEL,
            run: () => OpenPortInBrowserAction.run(this.remoteExplorerService.tunnelModel, this.openerService, address)
        };
    }
    openPreviewChoice(tunnel) {
        const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
        return {
            label: OpenPortInPreviewAction.LABEL,
            run: () => OpenPortInPreviewAction.run(this.remoteExplorerService.tunnelModel, this.openerService, this.externalOpenerService, address)
        };
    }
    elevateChoice(tunnel) {
        return {
            // Privileged ports are not on Windows, so it's ok to stick to just "sudo".
            label: nls.localize('remote.tunnelsView.elevationButton', "Use Port {0} as Sudo...", tunnel.tunnelRemotePort),
            run: async () => {
                await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, TunnelCloseReason.Other);
                const newTunnel = await this.remoteExplorerService.forward({
                    remote: { host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort },
                    local: tunnel.tunnelRemotePort,
                    elevateIfNeeded: true,
                    source: AutoTunnelSource
                });
                if (!newTunnel || (typeof newTunnel === 'string')) {
                    return;
                }
                this.lastNotification?.close();
                this.lastShownPort = newTunnel.tunnelRemotePort;
                this.lastNotification = this.notificationService.prompt(Severity.Info, await this.basicMessage(newTunnel) + this.linkMessage(), [this.openBrowserChoice(newTunnel), this.openPreviewChoice(tunnel)], { neverShowAgain: { id: 'remote.tunnelsView.autoForwardNeverShow', isSecondary: true } });
                this.notificationDisposable.value = this.lastNotification.onDidClose(() => {
                    this.lastNotification = undefined;
                    this.lastShownPort = undefined;
                });
            }
        };
    }
}
class OutputAutomaticPortForwarding extends Disposable {
    constructor(terminalService, notificationService, openerService, externalOpenerService, remoteExplorerService, configurationService, debugService, tunnelService, hostService, logService, contextKeyService, privilegedOnly) {
        super();
        this.terminalService = terminalService;
        this.notificationService = notificationService;
        this.openerService = openerService;
        this.externalOpenerService = externalOpenerService;
        this.remoteExplorerService = remoteExplorerService;
        this.configurationService = configurationService;
        this.debugService = debugService;
        this.tunnelService = tunnelService;
        this.hostService = hostService;
        this.logService = logService;
        this.contextKeyService = contextKeyService;
        this.privilegedOnly = privilegedOnly;
        this.notifier = new OnAutoForwardedAction(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService);
        this._register(configurationService.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING)) {
                this.tryStartStopUrlFinder();
            }
        }));
        this.portsFeatures = this._register(this.remoteExplorerService.onEnabledPortsFeatures(() => {
            this.tryStartStopUrlFinder();
        }));
        this.tryStartStopUrlFinder();
        if (configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_HYBRID) {
            this._register(this.tunnelService.onTunnelClosed(tunnel => this.notifier.hide([tunnel.port])));
        }
    }
    tryStartStopUrlFinder() {
        if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
            this.startUrlFinder();
        }
        else {
            this.stopUrlFinder();
        }
    }
    startUrlFinder() {
        if (!this.urlFinder && (this.remoteExplorerService.portsFeaturesEnabled !== PortsEnablement.AdditionalFeatures)) {
            return;
        }
        this.portsFeatures?.dispose();
        this.urlFinder = this._register(new UrlFinder(this.terminalService, this.debugService));
        this._register(this.urlFinder.onDidMatchLocalUrl(async (localUrl) => {
            if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.detected, localUrl.host, localUrl.port)) {
                return;
            }
            const attributes = (await this.remoteExplorerService.tunnelModel.getAttributes([localUrl]))?.get(localUrl.port);
            if (attributes?.onAutoForward === OnPortForward.Ignore) {
                return;
            }
            if (this.privilegedOnly() && !this.tunnelService.isPortPrivileged(localUrl.port)) {
                return;
            }
            const forwarded = await this.remoteExplorerService.forward({ remote: localUrl, source: AutoTunnelSource }, attributes ?? null);
            if (forwarded && (typeof forwarded !== 'string')) {
                this.notifier.doAction([forwarded]);
            }
        }));
    }
    stopUrlFinder() {
        if (this.urlFinder) {
            this.urlFinder.dispose();
            this.urlFinder = undefined;
        }
    }
}
class ProcAutomaticPortForwarding extends Disposable {
    constructor(unforwardOnly, alreadyAutoForwarded, needsInitialCandidates, configurationService, remoteExplorerService, notificationService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService) {
        super();
        this.unforwardOnly = unforwardOnly;
        this.alreadyAutoForwarded = alreadyAutoForwarded;
        this.needsInitialCandidates = needsInitialCandidates;
        this.configurationService = configurationService;
        this.remoteExplorerService = remoteExplorerService;
        this.notificationService = notificationService;
        this.openerService = openerService;
        this.externalOpenerService = externalOpenerService;
        this.tunnelService = tunnelService;
        this.hostService = hostService;
        this.logService = logService;
        this.contextKeyService = contextKeyService;
        this.autoForwarded = new Set();
        this.notifiedOnly = new Set();
        this.initialCandidates = new Set();
        this.notifier = new OnAutoForwardedAction(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService);
        alreadyAutoForwarded?.forEach(port => this.autoForwarded.add(port));
        this.initialize();
    }
    get forwarded() {
        return this.autoForwarded;
    }
    async initialize() {
        if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
            await new Promise(resolve => this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet(() => resolve()));
        }
        this._register(this.configurationService.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING)) {
                await this.startStopCandidateListener();
            }
        }));
        this.portsFeatures = this._register(this.remoteExplorerService.onEnabledPortsFeatures(async () => {
            await this.startStopCandidateListener();
        }));
        this.startStopCandidateListener();
    }
    async startStopCandidateListener() {
        if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
            await this.startCandidateListener();
        }
        else {
            this.stopCandidateListener();
        }
    }
    stopCandidateListener() {
        if (this.candidateListener) {
            this.candidateListener.dispose();
            this.candidateListener = undefined;
        }
    }
    async startCandidateListener() {
        if (this.candidateListener || (this.remoteExplorerService.portsFeaturesEnabled !== PortsEnablement.AdditionalFeatures)) {
            return;
        }
        this.portsFeatures?.dispose();
        // Capture list of starting candidates so we don't auto forward them later.
        await this.setInitialCandidates();
        // Need to check the setting again, since it may have changed while we waited for the initial candidates to be set.
        if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
            this.candidateListener = this._register(this.remoteExplorerService.tunnelModel.onCandidatesChanged(this.handleCandidateUpdate, this));
        }
    }
    async setInitialCandidates() {
        if (!this.needsInitialCandidates) {
            this.logService.debug(`ForwardedPorts: (ProcForwarding) Not setting initial candidates`);
            return;
        }
        let startingCandidates = this.remoteExplorerService.tunnelModel.candidatesOrUndefined;
        if (!startingCandidates) {
            await new Promise(resolve => this.remoteExplorerService.tunnelModel.onCandidatesChanged(() => resolve()));
            startingCandidates = this.remoteExplorerService.tunnelModel.candidates;
        }
        for (const value of startingCandidates) {
            this.initialCandidates.add(makeAddress(value.host, value.port));
        }
        this.logService.debug(`ForwardedPorts: (ProcForwarding) Initial candidates set to ${startingCandidates.map(candidate => candidate.port).join(', ')}`);
    }
    async forwardCandidates() {
        let attributes;
        const allTunnels = [];
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Attempting to forward ${this.remoteExplorerService.tunnelModel.candidates.length} candidates`);
        for (const value of this.remoteExplorerService.tunnelModel.candidates) {
            if (!value.detail) {
                this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} missing detail`);
                continue;
            }
            if (!attributes) {
                attributes = await this.remoteExplorerService.tunnelModel.getAttributes(this.remoteExplorerService.tunnelModel.candidates);
            }
            const portAttributes = attributes?.get(value.port);
            const address = makeAddress(value.host, value.port);
            if (this.initialCandidates.has(address) && (portAttributes?.onAutoForward === undefined)) {
                continue;
            }
            if (this.notifiedOnly.has(address) || this.autoForwarded.has(address)) {
                continue;
            }
            const alreadyForwarded = mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.forwarded, value.host, value.port);
            if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.detected, value.host, value.port)) {
                continue;
            }
            if (portAttributes?.onAutoForward === OnPortForward.Ignore) {
                this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} is ignored`);
                continue;
            }
            const forwarded = await this.remoteExplorerService.forward({ remote: value, source: AutoTunnelSource }, portAttributes ?? null);
            if (!alreadyForwarded && forwarded) {
                this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} has been forwarded`);
                this.autoForwarded.add(address);
            }
            else if (forwarded) {
                this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} has been notified`);
                this.notifiedOnly.add(address);
            }
            if (forwarded && (typeof forwarded !== 'string')) {
                allTunnels.push(forwarded);
            }
        }
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Forwarded ${allTunnels.length} candidates`);
        if (allTunnels.length === 0) {
            return undefined;
        }
        return allTunnels;
    }
    async handleCandidateUpdate(removed) {
        const removedPorts = [];
        let autoForwarded;
        if (this.unforwardOnly) {
            autoForwarded = new Map();
            for (const entry of this.remoteExplorerService.tunnelModel.forwarded.entries()) {
                if (entry[1].source.source === TunnelSource.Auto) {
                    autoForwarded.set(entry[0], entry[1]);
                }
            }
        }
        else {
            autoForwarded = new Map(this.autoForwarded.entries());
        }
        for (const removedPort of removed) {
            const key = removedPort[0];
            let value = removedPort[1];
            const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(autoForwarded, value.host, value.port);
            if (forwardedValue) {
                if (typeof forwardedValue === 'string') {
                    this.autoForwarded.delete(key);
                }
                else {
                    value = { host: forwardedValue.remoteHost, port: forwardedValue.remotePort };
                }
                await this.remoteExplorerService.close(value, TunnelCloseReason.AutoForwardEnd);
                removedPorts.push(value.port);
            }
            else if (this.notifiedOnly.delete(key)) {
                removedPorts.push(value.port);
            }
            else {
                this.initialCandidates.delete(key);
            }
        }
        if (this.unforwardOnly) {
            return;
        }
        if (removedPorts.length > 0) {
            await this.notifier.hide(removedPorts);
        }
        const tunnels = await this.forwardCandidates();
        if (tunnels) {
            await this.notifier.doAction(tunnels);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlRXhwbG9yZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9yZW1vdGUvYnJvd3Nlci9yZW1vdGVFeHBsb3Jlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxVQUFVLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRyxPQUFPLEVBQUUsVUFBVSxFQUFpRixNQUFNLDBCQUEwQixDQUFDO0FBQ3JJLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSwwQkFBMEIsRUFBRSx5QkFBeUIsRUFBRSx3QkFBd0IsRUFBRSwrQkFBK0IsRUFBRSwrQkFBK0IsRUFBRSxnQ0FBZ0MsRUFBRSxlQUFlLEVBQUUsd0JBQXdCLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDbFYsT0FBTyxFQUFjLGdCQUFnQixFQUFFLDZCQUE2QixFQUFFLHlCQUF5QixFQUFFLFdBQVcsRUFBRSxxQ0FBcUMsRUFBRSxhQUFhLEVBQVUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDcFEsT0FBTyxFQUFFLGlCQUFpQixFQUFFLHVCQUF1QixFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSxlQUFlLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN0TCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUE0QyxpQkFBaUIsRUFBc0IsTUFBTSxr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