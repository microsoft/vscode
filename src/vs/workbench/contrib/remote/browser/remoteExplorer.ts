/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Extensions, IViewContainersRegistry, IViewDescriptorService, IViewsRegistry, IViewsService, ViewContainer, ViewContainerLocation } from 'vs/workbench/common/views';
import { IRemoteExplorerService, makeAddress, mapHasAddressLocalhostOrAllInterfaces, TUNNEL_VIEW_ID } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { PORT_AUTO_FORWARD_SETTING, forwardedPortsViewEnabled, ForwardPortAction, OpenPortInBrowserAction, TunnelPanel, TunnelPanelDescriptor, TunnelViewModel } from 'vs/workbench/contrib/remote/browser/tunnelView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
import { UrlFinder } from 'vs/workbench/contrib/remote/browser/urlFinder';
import Severity from 'vs/base/common/severity';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationHandle, INotificationService, IPromptChoice } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IDebugService } from 'vs/workbench/contrib/debug/common/debug';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { OperatingSystem } from 'vs/base/common/platform';
import { isPortPrivileged, ITunnelService, RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { portsViewIcon } from 'vs/workbench/contrib/remote/browser/remoteIcons';
import { Event } from 'vs/base/common/event';

export const VIEWLET_ID = 'workbench.view.remote';

export class ForwardedPortsView extends Disposable implements IWorkbenchContribution {
	private contextKeyListener?: IDisposable;
	private _activityBadge?: IDisposable;
	private entryAccessor: IStatusbarEntryAccessor | undefined;
	private readonly tasExperimentService: ITASExperimentService | undefined;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IRemoteExplorerService private readonly remoteExplorerService: IRemoteExplorerService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IActivityService private readonly activityService: IActivityService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@optional(ITASExperimentService) tasExperimentService: ITASExperimentService,
	) {
		super();
		this.tasExperimentService = tasExperimentService;
		this._register(Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViewWelcomeContent(TUNNEL_VIEW_ID, {
			content: `Forwarded ports allow you to access your running services locally.\n[Forward a Port](command:${ForwardPortAction.INLINE_ID})`,
		}));
		this.enableBadgeAndStatusBar();
		this.enableForwardedPortsView();
	}

	private async usePanelTreatment(): Promise<boolean> {
		if (this.tasExperimentService) {
			return !!(await this.tasExperimentService.getTreatment<boolean>('portspanel'));
		}
		return false;
	}

	private async getViewContainer(): Promise<ViewContainer | null> {
		if (await this.usePanelTreatment()) {
			return Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer({
				id: TunnelPanel.ID,
				name: nls.localize('ports', "Ports"),
				icon: portsViewIcon,
				ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [TunnelPanel.ID, { mergeViewWithContainerWhenSingleView: true, donotShowContainerTitleWhenMergedWithContainer: true }]),
				storageId: TunnelPanel.ID,
				hideIfEmpty: true,
				order: 5
			}, ViewContainerLocation.Panel);
		} else {
			return this.viewDescriptorService.getViewContainerById(VIEWLET_ID);
		}
	}

	private async enableForwardedPortsView() {
		if (this.contextKeyListener) {
			this.contextKeyListener.dispose();
			this.contextKeyListener = undefined;
		}

		const viewEnabled: boolean = !!forwardedPortsViewEnabled.getValue(this.contextKeyService);

		if (this.environmentService.remoteAuthority && viewEnabled) {
			const viewContainer = await this.getViewContainer();
			const tunnelPanelDescriptor = new TunnelPanelDescriptor(new TunnelViewModel(this.remoteExplorerService, this.configurationService), this.environmentService);
			const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
			if (viewContainer) {
				this.remoteExplorerService.enablePortsFeatures();
				viewsRegistry.registerViews([tunnelPanelDescriptor!], viewContainer);
			}
		} else if (this.environmentService.remoteAuthority) {
			this.contextKeyListener = this.contextKeyService.onDidChangeContext(e => {
				if (e.affectsSome(new Set(forwardedPortsViewEnabled.keys()))) {
					this.enableForwardedPortsView();
				}
			});
		}
	}

	private enableBadgeAndStatusBar() {
		const disposable = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).onViewsRegistered(e => {
			if (e.find(view => view.views.find(viewDescriptor => viewDescriptor.id === TUNNEL_VIEW_ID))) {
				this._register(this.remoteExplorerService.tunnelModel.onForwardPort(() => {
					this.updateActivityBadge();
					this.updateStatusBar();
				}));
				this._register(this.remoteExplorerService.tunnelModel.onClosePort(() => {
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
		if (!(await this.usePanelTreatment())) {
			return;
		}
		if (this._activityBadge) {
			this._activityBadge.dispose();
		}
		if (this.remoteExplorerService.tunnelModel.forwarded.size > 0) {
			const viewContainer = this.viewDescriptorService.getViewContainerByViewId(TUNNEL_VIEW_ID);
			if (viewContainer) {
				this._activityBadge = this.activityService.showViewContainerActivity(viewContainer.id, {
					badge: new NumberBadge(this.remoteExplorerService.tunnelModel.forwarded.size, n => n === 1 ? nls.localize('1forwardedPort', "1 forwarded port") : nls.localize('nForwardedPorts', "{0} forwarded ports", n))
				});
			}
		}
	}

	private updateStatusBar() {
		if (!this.entryAccessor) {
			this._register(this.entryAccessor = this.statusbarService.addEntry(this.entry, 'status.forwardedPorts', nls.localize('status.forwardedPorts', "Forwarded Ports"), StatusbarAlignment.LEFT, 40));
		} else {
			this.entryAccessor.update(this.entry);
		}
	}

	private get entry(): IStatusbarEntry {
		let text: string;
		let tooltip: string;
		const count = this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
		text = `${count}`;
		if (count === 0) {
			tooltip = nls.localize('remote.forwardedPorts.statusbarTextNone', "No Ports Forwarded");
		} else {
			const allTunnels = Array.from(this.remoteExplorerService.tunnelModel.forwarded.values());
			allTunnels.push(...Array.from(this.remoteExplorerService.tunnelModel.detected.values()));
			tooltip = nls.localize('remote.forwardedPorts.statusbarTooltip', "Forwarded Ports: {0}",
				allTunnels.map(forwarded => forwarded.remotePort).join(', '));
		}
		return {
			text: `$(radio-tower) ${text}`,
			ariaLabel: tooltip,
			tooltip,
			command: `${TUNNEL_VIEW_ID}.focus`
		};
	}
}

export class PortRestore implements IWorkbenchContribution {
	constructor(
		@IRemoteExplorerService readonly remoteExplorerService: IRemoteExplorerService,
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
		return this.remoteExplorerService.restore();
	}
}


export class AutomaticPortForwarding extends Disposable implements IWorkbenchContribution {

	constructor(
		@ITerminalService readonly terminalService: ITerminalService,
		@INotificationService readonly notificationService: INotificationService,
		@IOpenerService readonly openerService: IOpenerService,
		@IViewsService readonly viewsService: IViewsService,
		@IRemoteExplorerService readonly remoteExplorerService: IRemoteExplorerService,
		@IWorkbenchEnvironmentService readonly environmentService: IWorkbenchEnvironmentService,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IDebugService readonly debugService: IDebugService,
		@IRemoteAgentService readonly remoteAgentService: IRemoteAgentService,
		@ITunnelService readonly tunnelService: ITunnelService
	) {
		super();
		if (!this.environmentService.remoteAuthority) {
			return;
		}

		remoteAgentService.getEnvironment().then(environment => {
			if (environment?.os === OperatingSystem.Windows) {
				this._register(new WindowsAutomaticPortForwarding(terminalService, notificationService, openerService,
					remoteExplorerService, configurationService, debugService, tunnelService));
			} else if (environment?.os === OperatingSystem.Linux) {
				this._register(new LinuxAutomaticPortForwarding(configurationService, remoteExplorerService, notificationService, openerService, tunnelService));
			}
		});
	}
}

class ForwardedPortNotifier extends Disposable {
	private lastNotifyTime: Date;
	private static COOL_DOWN = 5000; // milliseconds
	private lastNotification: INotificationHandle | undefined;
	private lastShownPort: number | undefined;

	constructor(private readonly notificationService: INotificationService,
		private readonly remoteExplorerService: IRemoteExplorerService,
		private readonly openerService: IOpenerService,
		private readonly tunnelService: ITunnelService) {
		super();
		this.lastNotifyTime = new Date();
		this.lastNotifyTime.setFullYear(this.lastNotifyTime.getFullYear() - 1);
	}

	public async notify(tunnels: RemoteTunnel[]) {
		const tunnel = await this.portNumberHeuristicDelay(tunnels);
		if (tunnel) {
			if (Date.now() - this.lastNotifyTime.getTime() > ForwardedPortNotifier.COOL_DOWN) {
				this.showNotification(tunnel);
			}
		}
	}

	public async hide(removedPorts: number[]) {
		if (this.lastShownPort && removedPorts.indexOf(this.lastShownPort) >= 0) {
			this.lastNotification?.close();
		}
	}

	private newerTunnel: RemoteTunnel | undefined;
	private async portNumberHeuristicDelay(tunnels: RemoteTunnel[]): Promise<RemoteTunnel | undefined> {
		if (tunnels.length === 0) {
			return;
		}
		tunnels = tunnels.sort((a, b) => a.tunnelRemotePort - b.tunnelRemotePort);
		const firstTunnel = tunnels.shift()!;
		// Heuristic.
		if (firstTunnel.tunnelRemotePort % 1000 === 0) {
			this.newerTunnel = firstTunnel;
			return firstTunnel;
			// 9229 is the node inspect port
		} else if (firstTunnel.tunnelRemotePort < 10000 && firstTunnel.tunnelRemotePort !== 9229) {
			this.newerTunnel = firstTunnel;
			return firstTunnel;
		}

		this.newerTunnel = undefined;
		return new Promise(resolve => {
			setTimeout(() => {
				if (this.newerTunnel) {
					resolve(undefined);
				} else {
					resolve(firstTunnel);
				}
			}, 3000);
		});
	}

	private basicMessage(tunnel: RemoteTunnel) {
		return nls.localize('remote.tunnelsView.automaticForward', "Your service running on port {0} is available.  ",
			tunnel.tunnelRemotePort);
	}

	private linkMessage() {
		return nls.localize('remote.tunnelsView.notificationLink', "[See all forwarded ports](command:{0}.focus)", TunnelPanel.ID);
	}

	private showNotification(tunnel: RemoteTunnel) {
		if (this.lastNotification) {
			this.lastNotification.close();
		}
		let message = this.basicMessage(tunnel);
		const choices = [this.openChoice(tunnel)];

		if (tunnel.tunnelLocalPort !== undefined && this.tunnelService.canElevate && isPortPrivileged(tunnel.tunnelRemotePort)) {
			// Privileged ports are not on Windows, so it's safe to use "superuser"
			message += nls.localize('remote.tunnelsView.elevationMessage', "You'll need to run as superuser to use port {0} locally.  ", tunnel.tunnelRemotePort);
			choices.unshift(this.elevateChoice(tunnel));
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

	private openChoice(tunnel: RemoteTunnel): IPromptChoice {
		const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
		return {
			label: OpenPortInBrowserAction.LABEL,
			run: () => OpenPortInBrowserAction.run(this.remoteExplorerService.tunnelModel, this.openerService, address)
		};
	}

	private elevateChoice(tunnel: RemoteTunnel): IPromptChoice {
		return {
			// Privileged ports are not on Windows, so it's ok to stick to just "sudo".
			label: nls.localize('remote.tunnelsView.elevationButton', "Use Port {0} as Sudo...", tunnel.tunnelRemotePort),
			run: async () => {
				await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort });
				const newTunnel = await this.remoteExplorerService.forward({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, tunnel.tunnelRemotePort, undefined, undefined, true);
				if (!newTunnel) {
					return;
				}
				if (this.lastNotification) {
					this.lastNotification.close();
				}
				this.lastShownPort = newTunnel.tunnelRemotePort;
				this.lastNotification = this.notificationService.prompt(Severity.Info, this.basicMessage(newTunnel) + this.linkMessage(), [this.openChoice(newTunnel)], { neverShowAgain: { id: 'remote.tunnelsView.autoForwardNeverShow', isSecondary: true } });
				this.lastNotification.onDidClose(() => {
					this.lastNotification = undefined;
					this.lastShownPort = undefined;
				});
			}
		};
	}
}

class WindowsAutomaticPortForwarding extends Disposable {
	private portsFeatures?: IDisposable;
	private urlFinder?: UrlFinder;
	private notifier: ForwardedPortNotifier;

	constructor(
		private readonly terminalService: ITerminalService,
		readonly notificationService: INotificationService,
		readonly openerService: IOpenerService,
		private readonly remoteExplorerService: IRemoteExplorerService,
		private readonly configurationService: IConfigurationService,
		private readonly debugService: IDebugService,
		readonly tunnelService: ITunnelService
	) {
		super();
		this.notifier = new ForwardedPortNotifier(notificationService, remoteExplorerService, openerService, tunnelService);
		this._register(configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING)) {
				this.tryStartStopUrlFinder();
			}
		}));

		this.portsFeatures = this._register(this.remoteExplorerService.onEnabledPortsFeatures(() => {
			this.tryStartStopUrlFinder();
		}));
		this.tryStartStopUrlFinder();
	}

	private tryStartStopUrlFinder() {
		if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
			this.startUrlFinder();
		} else {
			this.stopUrlFinder();
		}
	}

	private startUrlFinder() {
		if (!this.urlFinder && !this.remoteExplorerService.portsFeaturesEnabled) {
			return;
		}
		if (this.portsFeatures) {
			this.portsFeatures.dispose();
		}
		this.urlFinder = this._register(new UrlFinder(this.terminalService, this.debugService));
		this._register(this.urlFinder.onDidMatchLocalUrl(async (localUrl) => {
			if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.forwarded, localUrl.host, localUrl.port)) {
				return;
			}
			const forwarded = await this.remoteExplorerService.forward(localUrl);
			if (forwarded) {
				this.notifier.notify([forwarded]);
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

class LinuxAutomaticPortForwarding extends Disposable {
	private candidateListener: IDisposable | undefined;
	private autoForwarded: Set<string> = new Set();
	private notifier: ForwardedPortNotifier;
	private initialCandidates: Set<string> = new Set();
	private portsFeatures: IDisposable | undefined;

	constructor(
		private readonly configurationService: IConfigurationService,
		readonly remoteExplorerService: IRemoteExplorerService,
		readonly notificationService: INotificationService,
		readonly openerService: IOpenerService,
		readonly tunnelService: ITunnelService
	) {
		super();
		this.notifier = new ForwardedPortNotifier(notificationService, remoteExplorerService, openerService, tunnelService);
		this._register(configurationService.onDidChangeConfiguration(async (e) => {
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
		if (this.candidateListener || !this.remoteExplorerService.portsFeaturesEnabled) {
			return;
		}
		if (this.portsFeatures) {
			this.portsFeatures.dispose();
		}

		if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
			await new Promise<void>(resolve => this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet(() => resolve()));
		}

		// Capture list of starting candidates so we don't auto forward them later.
		await this.setInitialCandidates();

		this.candidateListener = this._register(this.remoteExplorerService.tunnelModel.onCandidatesChanged(this.handleCandidateUpdate, this));
	}

	private async setInitialCandidates() {
		let startingCandidates = this.remoteExplorerService.tunnelModel.candidatesOrUndefined;
		if (!startingCandidates) {
			await new Promise<void>(resolve => this.remoteExplorerService.tunnelModel.onCandidatesChanged(() => resolve()));
			startingCandidates = this.remoteExplorerService.tunnelModel.candidates;
		}

		startingCandidates.forEach(async (value) => {
			this.initialCandidates.add(makeAddress(value.host, value.port));
		});
	}

	private async forwardCandidates(): Promise<RemoteTunnel[] | undefined> {
		const allTunnels = <RemoteTunnel[]>(await Promise.all(this.remoteExplorerService.tunnelModel.candidates.map(async (value) => {
			const address = makeAddress(value.host, value.port);
			if (this.initialCandidates.has(address)) {
				return undefined;
			}
			if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.detected, value.host, value.port)) {
				return undefined;
			}
			if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.forwarded, value.host, value.port)) {
				return undefined;
			}
			const forwarded = await this.remoteExplorerService.forward(value);
			if (forwarded) {
				this.autoForwarded.add(address);
			}
			return forwarded;
		}))).filter(tunnel => !!tunnel);
		if (allTunnels.length === 0) {
			return undefined;
		}
		return allTunnels;
	}

	private async handleCandidateUpdate(removed: Map<string, { host: string, port: number }>) {
		const removedPorts: number[] = [];
		removed.forEach((value, key) => {
			if (this.autoForwarded.has(key)) {
				this.remoteExplorerService.close(value);
				this.autoForwarded.delete(key);
				removedPorts.push(value.port);
			} else if (this.initialCandidates.has(key)) {
				this.initialCandidates.delete(key);
			}
		});

		if (removedPorts.length > 0) {
			await this.notifier.hide(removedPorts);
		}

		const tunnels = await this.forwardCandidates();
		if (tunnels) {
			await this.notifier.notify(tunnels);
		}
	}
}
