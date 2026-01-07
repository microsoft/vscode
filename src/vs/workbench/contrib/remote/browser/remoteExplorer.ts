/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Extensions, IViewContainersRegistry, IViewsRegistry, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { IRemoteExplorerService, PORT_AUTO_FALLBACK_SETTING, PORT_AUTO_FORWARD_SETTING, PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID, PORT_AUTO_SOURCE_SETTING_OUTPUT, PORT_AUTO_SOURCE_SETTING_PROCESS, PortsEnablement, TUNNEL_VIEW_CONTAINER_ID, TUNNEL_VIEW_ID } from '../../../services/remote/common/remoteExplorerService.js';
import { Attributes, AutoTunnelSource, forwardedPortsFeaturesEnabled, forwardedPortsViewEnabled, makeAddress, mapHasAddressLocalhostOrAllInterfaces, OnPortForward, Tunnel, TunnelCloseReason, TunnelSource } from '../../../services/remote/common/tunnelModel.js';
import { ForwardPortAction, OpenPortInBrowserAction, TunnelPanel, TunnelPanelDescriptor, TunnelViewModel, OpenPortInPreviewAction, openPreviewEnabledContext } from './tunnelView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { UrlFinder } from './urlFinder.js';
import Severity from '../../../../base/common/severity.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationHandle, INotificationService, IPromptChoice } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import { IDebugService } from '../../debug/common/debug.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { isWeb, OperatingSystem } from '../../../../base/common/platform.js';
import { ITunnelService, RemoteTunnel, TunnelPrivacyId } from '../../../../platform/tunnel/common/tunnel.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { portsViewIcon } from './remoteIcons.js';
import { Event } from '../../../../base/common/event.js';
import { IExternalUriOpenerService } from '../../externalUriOpener/common/externalUriOpenerService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchConfigurationService } from '../../../services/configuration/common/configuration.js';
import { IRemoteAgentEnvironment } from '../../../../platform/remote/common/remoteAgentEnvironment.js';
import { toAction } from '../../../../base/common/actions.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';

export const VIEWLET_ID = 'workbench.view.remote';

export class ForwardedPortsView extends Disposable implements IWorkbenchContribution {
	private readonly contextKeyListener = this._register(new MutableDisposable<IDisposable>());
	private readonly activityBadge = this._register(new MutableDisposable<IDisposable>());
	private entryAccessor: IStatusbarEntryAccessor | undefined;
	private hasPortsInSession: boolean = false;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IActivityService private readonly activityService: IActivityService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();
		this._register(Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViewWelcomeContent(TUNNEL_VIEW_ID, {
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

	private async getViewContainer(): Promise<ViewContainer | null> {
		return Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({
			id: TUNNEL_VIEW_CONTAINER_ID,
			title: nls.localize2('ports', "Ports"),
			icon: portsViewIcon,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [TUNNEL_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: TUNNEL_VIEW_CONTAINER_ID,
			hideIfEmpty: true,
			order: 5
		}, ViewContainerLocation.Panel);
	}

	private async enableForwardedPortsFeatures() {
		this.contextKeyListener.clear();

		const featuresEnabled: boolean = !!forwardedPortsFeaturesEnabled.getValue(this.contextKeyService);
		const viewEnabled: boolean = !!forwardedPortsViewEnabled.getValue(this.contextKeyService);

		if (featuresEnabled || viewEnabled) {
			// Also enable the view if it isn't already.
			if (!viewEnabled) {
				this.contextKeyService.createKey(forwardedPortsViewEnabled.key, true);
			}
			const viewContainer = await this.getViewContainer();
			const tunnelPanelDescriptor = new TunnelPanelDescriptor(new TunnelViewModel(this.remoteExplorerService, this.tunnelService), this.environmentService);
			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			if (viewContainer) {
				this.remoteExplorerService.enablePortsFeatures(!featuresEnabled);
				viewsRegistry.registerViews([tunnelPanelDescriptor], viewContainer);
			}
		} else {
			this.contextKeyListener.value = this.contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(new Set([...forwardedPortsFeaturesEnabled.keys(), ...forwardedPortsViewEnabled.keys()]))) {
					this.enableForwardedPortsFeatures();
				}
			});
		}
	}

	private enableBadgeAndStatusBar() {
		const disposable = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).onViewsRegistered(e => {
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

	private async updateActivityBadge() {
		if (this.remoteExplorerService.tunnelModel.forwarded.size > 0) {
			this.activityBadge.value = this.activityService.showViewActivity(TUNNEL_VIEW_ID, {
				badge: new NumberBadge(this.remoteExplorerService.tunnelModel.forwarded.size, n => n === 1 ? nls.localize('1forwardedPort', "1 forwarded port") : nls.localize('nForwardedPorts', "{0} forwarded ports", n))
			});
		} else {
			this.activityBadge.clear();
		}
	}

	private updateStatusBar() {
		if (!this.environmentService.remoteAuthority && !this.hasPortsInSession) {
			// We only want to show the ports status bar entry when the user has taken an action that indicates that they might care about it.
			return;
		}

		if (!this.entryAccessor) {
			this._register(this.entryAccessor = this.statusbarService.addEntry(this.entry, 'status.forwardedPorts', StatusbarAlignment.LEFT, 40));
		} else {
			this.entryAccessor.update(this.entry);
		}
	}

	private get entry(): IStatusbarEntry {
		let tooltip: string;
		const count = this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
		const text = `${count}`;
		if (count === 0) {
			tooltip = nls.localize('remote.forwardedPorts.statusbarTextNone', "No Ports Forwarded");
		} else {
			const allTunnels = Array.from(this.remoteExplorerService.tunnelModel.forwarded.values());
			allTunnels.push(...Array.from(this.remoteExplorerService.tunnelModel.detected.values()));
			tooltip = nls.localize('remote.forwardedPorts.statusbarTooltip', "Forwarded Ports: {0}",
				allTunnels.map(forwarded => forwarded.remotePort).join(', '));
		}
		return {
			name: nls.localize('status.forwardedPorts', "Forwarded Ports"),
			text: `$(radio-tower) ${text}`,
			ariaLabel: tooltip,
			tooltip,
			command: `${TUNNEL_VIEW_ID}.focus`
		};
	}
}

export class PortRestore implements IWorkbenchContribution {
	constructor(
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@ILogService private readonly logService: ILogService
	) {
		if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
			Event.once(this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet)(async () => {
				await this.restore();
			});
		} else {
			this.restore();
		}
	}

	private async restore() {
		this.logService.trace('ForwardedPorts: Doing first restore.');
		return this.remoteExplorerService.restore();
	}
}


export class AutomaticPortForwarding extends Disposable implements IWorkbenchContribution {
	private procForwarder: ProcAutomaticPortForwarding | undefined;
	private outputForwarder: OutputAutomaticPortForwarding | undefined;
	private portListener: IDisposable | undefined;

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IExternalUriOpenerService private readonly externalOpenerService: IExternalUriOpenerService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@IDebugService private readonly debugService: IDebugService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IHostService private readonly hostService: IHostService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super();
		if (!environmentService.remoteAuthority) {
			return;
		}

		configurationService.whenRemoteConfigurationLoaded().then(() => remoteAgentService.getEnvironment()).then(environment => {
			this.setup(environment);
			this._register(configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(PORT_AUTO_SOURCE_SETTING)) {
					this.setup(environment);
				} else if (e.affectsConfiguration(PORT_AUTO_FALLBACK_SETTING) && !this.portListener) {
					this.listenForPorts();
				}
			}));
		});

		if (!this.storageService.getBoolean('processPortForwardingFallback', StorageScope.WORKSPACE, true)) {
			this.configurationService.updateValue(PORT_AUTO_FALLBACK_SETTING, 0, ConfigurationTarget.WORKSPACE);
		}
	}

	private getPortAutoFallbackNumber(): number {
		const fallbackAt = this.configurationService.inspect<number>(PORT_AUTO_FALLBACK_SETTING);
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

	private listenForPorts() {
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
										await this.configurationService.updateValue(PORT_AUTO_FALLBACK_SETTING, 0, ConfigurationTarget.WORKSPACE);
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
		} else {
			this.portListener?.dispose();
			this.portListener = undefined;
		}
	}


	private setup(environment: IRemoteAgentEnvironment | null) {
		const alreadyForwarded = this.procForwarder?.forwarded;
		const isSwitch = this.outputForwarder || this.procForwarder;
		this.procForwarder?.dispose();
		this.procForwarder = undefined;
		this.outputForwarder?.dispose();
		this.outputForwarder = undefined;
		if (environment?.os !== OperatingSystem.Linux) {
			if (this.configurationService.inspect<string>(PORT_AUTO_SOURCE_SETTING).default?.value !== PORT_AUTO_SOURCE_SETTING_OUTPUT) {
				Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
					.registerDefaultConfigurations([{ overrides: { 'remote.autoForwardPortsSource': PORT_AUTO_SOURCE_SETTING_OUTPUT } }]);
			}
			this.outputForwarder = this._register(new OutputAutomaticPortForwarding(this.terminalService, this.notificationService, this.openerService, this.externalOpenerService,
				this.remoteExplorerService, this.configurationService, this.debugService, this.tunnelService, this.hostService, this.logService, this.contextKeyService, () => false));
		} else {
			const useProc = () => (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_PROCESS);
			if (useProc()) {
				this.procForwarder = this._register(new ProcAutomaticPortForwarding(false, alreadyForwarded, !isSwitch, this.configurationService, this.remoteExplorerService, this.notificationService,
					this.openerService, this.externalOpenerService, this.tunnelService, this.hostService, this.logService, this.contextKeyService));
			} else if (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_HYBRID) {
				this.procForwarder = this._register(new ProcAutomaticPortForwarding(true, alreadyForwarded, !isSwitch, this.configurationService, this.remoteExplorerService, this.notificationService,
					this.openerService, this.externalOpenerService, this.tunnelService, this.hostService, this.logService, this.contextKeyService));
			}
			this.outputForwarder = this._register(new OutputAutomaticPortForwarding(this.terminalService, this.notificationService, this.openerService, this.externalOpenerService,
				this.remoteExplorerService, this.configurationService, this.debugService, this.tunnelService, this.hostService, this.logService, this.contextKeyService, useProc));
		}
		this.listenForPorts();
	}
}

class OnAutoForwardedAction extends Disposable {
	private lastNotifyTime: Date;
	private static NOTIFY_COOL_DOWN = 5000; // milliseconds
	private lastNotification: INotificationHandle | undefined;
	private lastShownPort: number | undefined;
	private doActionTunnels: RemoteTunnel[] | undefined;
	private alreadyOpenedOnce: Set<string> = new Set();

	constructor(private readonly notificationService: INotificationService,
		private readonly remoteExplorerService: IRemoteExplorerService,
		private readonly openerService: IOpenerService,
		private readonly externalOpenerService: IExternalUriOpenerService,
		private readonly tunnelService: ITunnelService,
		private readonly hostService: IHostService,
		private readonly logService: ILogService,
		private readonly contextKeyService: IContextKeyService) {
		super();
		this.lastNotifyTime = new Date();
		this.lastNotifyTime.setFullYear(this.lastNotifyTime.getFullYear() - 1);
	}

	public async doAction(tunnels: RemoteTunnel[]): Promise<void> {
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

	public hide(removedPorts: number[]) {
		if (this.doActionTunnels) {
			this.doActionTunnels = this.doActionTunnels.filter(value => !removedPorts.includes(value.tunnelRemotePort));
		}
		if (this.lastShownPort && removedPorts.indexOf(this.lastShownPort) >= 0) {
			this.lastNotification?.close();
		}
	}

	private newerTunnel: RemoteTunnel | undefined;
	private async portNumberHeuristicDelay(): Promise<RemoteTunnel | undefined> {
		this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Starting heuristic delay`);
		if (!this.doActionTunnels || this.doActionTunnels.length === 0) {
			return;
		}
		this.doActionTunnels = this.doActionTunnels.sort((a, b) => a.tunnelRemotePort - b.tunnelRemotePort);
		const firstTunnel = this.doActionTunnels.shift()!;
		// Heuristic.
		if (firstTunnel.tunnelRemotePort % 1000 === 0) {
			this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose tunnel because % 1000: ${firstTunnel.tunnelRemotePort}`);
			this.newerTunnel = firstTunnel;
			return firstTunnel;
			// 9229 is the node inspect port
		} else if (firstTunnel.tunnelRemotePort < 10000 && firstTunnel.tunnelRemotePort !== 9229) {
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
				} else if (this.doActionTunnels?.includes(firstTunnel)) {
					resolve(firstTunnel);
				} else {
					resolve(undefined);
				}
			}, 3000);
		});
	}

	private async basicMessage(tunnel: RemoteTunnel) {
		const properties = await this.remoteExplorerService.tunnelModel.getAttributes([{ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }], false);
		const label = properties?.get(tunnel.tunnelRemotePort)?.label;
		return nls.localize('remote.tunnelsView.automaticForward', "Your application{0} running on port {1} is available.  ",
			label ? ` (${label})` : '',
			tunnel.tunnelRemotePort);
	}

	private linkMessage() {
		return nls.localize(
			{ key: 'remote.tunnelsView.notificationLink2', comment: ['[See all forwarded ports]({0}) is a link. Only translate `See all forwarded ports`. Do not change brackets and parentheses or {0}'] },
			"[See all forwarded ports]({0})", `command:${TunnelPanel.ID}.focus`);
	}

	private async showNotification(tunnel: RemoteTunnel) {
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
		this.lastNotification.onDidClose(() => {
			this.lastNotification = undefined;
			this.lastShownPort = undefined;
		});
	}

	private makePublicChoice(tunnel: RemoteTunnel): IPromptChoice {
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

	private openBrowserChoice(tunnel: RemoteTunnel): IPromptChoice {
		const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
		return {
			label: OpenPortInBrowserAction.LABEL,
			run: () => OpenPortInBrowserAction.run(this.remoteExplorerService.tunnelModel, this.openerService, address)
		};
	}

	private openPreviewChoice(tunnel: RemoteTunnel): IPromptChoice {
		const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
		return {
			label: OpenPortInPreviewAction.LABEL,
			run: () => OpenPortInPreviewAction.run(this.remoteExplorerService.tunnelModel, this.openerService, this.externalOpenerService, address)
		};
	}

	private elevateChoice(tunnel: RemoteTunnel): IPromptChoice {
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
				this.lastNotification = this.notificationService.prompt(Severity.Info,
					await this.basicMessage(newTunnel) + this.linkMessage(),
					[this.openBrowserChoice(newTunnel), this.openPreviewChoice(tunnel)],
					{ neverShowAgain: { id: 'remote.tunnelsView.autoForwardNeverShow', isSecondary: true } });
				this.lastNotification.onDidClose(() => {
					this.lastNotification = undefined;
					this.lastShownPort = undefined;
				});
			}
		};
	}
}

class OutputAutomaticPortForwarding extends Disposable {
	private portsFeatures?: IDisposable;
	private urlFinder?: UrlFinder;
	private notifier: OnAutoForwardedAction;

	constructor(
		private readonly terminalService: ITerminalService,
		readonly notificationService: INotificationService,
		readonly openerService: IOpenerService,
		readonly externalOpenerService: IExternalUriOpenerService,
		private readonly remoteExplorerService: IRemoteExplorerService,
		private readonly configurationService: IConfigurationService,
		private readonly debugService: IDebugService,
		readonly tunnelService: ITunnelService,
		readonly hostService: IHostService,
		readonly logService: ILogService,
		readonly contextKeyService: IContextKeyService,
		readonly privilegedOnly: () => boolean
	) {
		super();
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

	private tryStartStopUrlFinder() {
		if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
			this.startUrlFinder();
		} else {
			this.stopUrlFinder();
		}
	}

	private startUrlFinder() {
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

	private stopUrlFinder() {
		if (this.urlFinder) {
			this.urlFinder.dispose();
			this.urlFinder = undefined;
		}
	}
}

class ProcAutomaticPortForwarding extends Disposable {
	private candidateListener: IDisposable | undefined;
	private autoForwarded: Set<string> = new Set();
	private notifiedOnly: Set<string> = new Set();
	private notifier: OnAutoForwardedAction;
	private initialCandidates: Set<string> = new Set();
	private portsFeatures: IDisposable | undefined;

	constructor(
		private readonly unforwardOnly: boolean,
		readonly alreadyAutoForwarded: Set<string> | undefined,
		private readonly needsInitialCandidates: boolean,
		private readonly configurationService: IConfigurationService,
		readonly remoteExplorerService: IRemoteExplorerService,
		readonly notificationService: INotificationService,
		readonly openerService: IOpenerService,
		readonly externalOpenerService: IExternalUriOpenerService,
		readonly tunnelService: ITunnelService,
		readonly hostService: IHostService,
		readonly logService: ILogService,
		readonly contextKeyService: IContextKeyService,
	) {
		super();
		this.notifier = new OnAutoForwardedAction(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService);
		alreadyAutoForwarded?.forEach(port => this.autoForwarded.add(port));
		this.initialize();
	}

	get forwarded(): Set<string> {
		return this.autoForwarded;
	}

	private async initialize() {
		if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
			await new Promise<void>(resolve => this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet(() => resolve()));
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

	private async startStopCandidateListener() {
		if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
			await this.startCandidateListener();
		} else {
			this.stopCandidateListener();
		}
	}

	private stopCandidateListener() {
		if (this.candidateListener) {
			this.candidateListener.dispose();
			this.candidateListener = undefined;
		}
	}

	private async startCandidateListener() {
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

	private async setInitialCandidates() {
		if (!this.needsInitialCandidates) {
			this.logService.debug(`ForwardedPorts: (ProcForwarding) Not setting initial candidates`);
			return;
		}
		let startingCandidates = this.remoteExplorerService.tunnelModel.candidatesOrUndefined;
		if (!startingCandidates) {
			await new Promise<void>(resolve => this.remoteExplorerService.tunnelModel.onCandidatesChanged(() => resolve()));
			startingCandidates = this.remoteExplorerService.tunnelModel.candidates;
		}

		for (const value of startingCandidates) {
			this.initialCandidates.add(makeAddress(value.host, value.port));
		}
		this.logService.debug(`ForwardedPorts: (ProcForwarding) Initial candidates set to ${startingCandidates.map(candidate => candidate.port).join(', ')}`);
	}

	private async forwardCandidates(): Promise<RemoteTunnel[] | undefined> {
		let attributes: Map<number, Attributes> | undefined;
		const allTunnels: RemoteTunnel[] = [];
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
			} else if (forwarded) {
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

	private async handleCandidateUpdate(removed: Map<string, { host: string; port: number }>) {
		const removedPorts: number[] = [];
		let autoForwarded: Map<string, string | Tunnel>;
		if (this.unforwardOnly) {
			autoForwarded = new Map();
			for (const entry of this.remoteExplorerService.tunnelModel.forwarded.entries()) {
				if (entry[1].source.source === TunnelSource.Auto) {
					autoForwarded.set(entry[0], entry[1]);
				}
			}
		} else {
			autoForwarded = new Map(this.autoForwarded.entries());
		}

		for (const removedPort of removed) {
			const key = removedPort[0];
			let value = removedPort[1];
			const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(autoForwarded, value.host, value.port);
			if (forwardedValue) {
				if (typeof forwardedValue === 'string') {
					this.autoForwarded.delete(key);
				} else {
					value = { host: forwardedValue.remoteHost, port: forwardedValue.remotePort };
				}
				await this.remoteExplorerService.close(value, TunnelCloseReason.AutoForwardEnd);
				removedPorts.push(value.port);
			} else if (this.notifiedOnly.delete(key)) {
				removedPorts.push(value.port);
			} else {
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
