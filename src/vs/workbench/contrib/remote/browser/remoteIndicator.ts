/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IRemoteAgentService, remoteConnectionLatencyMeasurer } from '../../../services/remote/common/remoteAgentService.js';
import { RunOnceScheduler, retry } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { MenuId, IMenuService, MenuItemAction, MenuRegistry, registerAction2, Action2, SubmenuItemAction, IMenu } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntryAccessor, IStatusbarEntry } from '../../../services/statusbar/browser/statusbar.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { Schemas } from '../../../../base/common/network.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { QuickPickItem, IQuickInputService, IQuickInputButton } from '../../../../platform/quickinput/common/quickInput.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { PersistentConnectionEventType } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { IRemoteAuthorityResolverService } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { PlatformName, PlatformToString, isWeb, platform } from '../../../../base/common/platform.js';
import { truncate } from '../../../../base/common/strings.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { getRemoteName } from '../../../../platform/remote/common/remoteHosts.js';
import { getVirtualWorkspaceLocation } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { getCodiconAriaLabel } from '../../../../base/common/iconLabels.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ReloadWindowAction } from '../../../browser/actions/windowActions.js';
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionsWorkbenchService, LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from '../../extensions/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { RemoteNameContext, VirtualWorkspaceContext } from '../../../common/contextkeys.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../../../base/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { DomEmitter } from '../../../../base/browser/event.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { infoIcon } from '../../extensions/browser/extensionsIcons.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../base/common/severity.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';

type ActionGroup = [string, Array<MenuItemAction | SubmenuItemAction>];

interface RemoteExtensionMetadata {
	id: string;
	installed: boolean;
	dependencies: string[];
	isPlatformCompatible: boolean;
	helpLink: string;
	startConnectLabel: string;
	startCommand: string;
	priority: number;
	supportedPlatforms?: PlatformName[];
}

export class RemoteStatusIndicator extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.remoteStatusIndicator';

	private static readonly REMOTE_ACTIONS_COMMAND_ID = 'workbench.action.remote.showMenu';
	private static readonly CLOSE_REMOTE_COMMAND_ID = 'workbench.action.remote.close';
	private static readonly SHOW_CLOSE_REMOTE_COMMAND_ID = !isWeb; // web does not have a "Close Remote" command
	private static readonly INSTALL_REMOTE_EXTENSIONS_ID = 'workbench.action.remote.extensions';

	private static readonly REMOTE_STATUS_LABEL_MAX_LENGTH = 40;

	private static readonly REMOTE_CONNECTION_LATENCY_SCHEDULER_DELAY = 60 * 1000;
	private static readonly REMOTE_CONNECTION_LATENCY_SCHEDULER_FIRST_RUN_DELAY = 10 * 1000;

	private remoteStatusEntry: IStatusbarEntryAccessor | undefined;

	private readonly remoteIndicatorMenu: IMenu; 				// filters its entries based on the current remote name of the window
	private readonly unrestrictedRemoteIndicatorMenu: IMenu; 	// does not filter its entries based on the current remote name of the window

	private remoteMenuActionsGroups: ActionGroup[] | undefined;

	private virtualWorkspaceLocation: { scheme: string; authority: string } | undefined = undefined;

	private connectionState: 'initializing' | 'connected' | 'reconnecting' | 'disconnected' | undefined = undefined;
	private connectionToken: string | undefined = undefined;
	private readonly connectionStateContextKey: IContextKey<'' | 'initializing' | 'disconnected' | 'connected'>;

	private networkState: 'online' | 'offline' | 'high-latency' | undefined = undefined;
	private measureNetworkConnectionLatencyScheduler: RunOnceScheduler | undefined = undefined;

	private loggedInvalidGroupNames: { [group: string]: boolean } = Object.create(null);

	private _remoteExtensionMetadata: RemoteExtensionMetadata[] | undefined = undefined;
	private get remoteExtensionMetadata(): RemoteExtensionMetadata[] {
		if (!this._remoteExtensionMetadata) {
			const remoteExtensionTips = { ...this.productService.remoteExtensionTips, ...this.productService.virtualWorkspaceExtensionTips };
			this._remoteExtensionMetadata = Object.values(remoteExtensionTips).filter(value => value.startEntry !== undefined).map(value => {
				return {
					id: value.extensionId,
					installed: false,
					friendlyName: value.friendlyName,
					isPlatformCompatible: false,
					dependencies: [],
					helpLink: value.startEntry?.helpLink ?? '',
					startConnectLabel: value.startEntry?.startConnectLabel ?? '',
					startCommand: value.startEntry?.startCommand ?? '',
					priority: value.startEntry?.priority ?? 10,
					supportedPlatforms: value.supportedPlatforms
				};
			});

			this.remoteExtensionMetadata.sort((ext1, ext2) => ext1.priority - ext2.priority);
		}

		return this._remoteExtensionMetadata;
	}

	private get remoteAuthority(): string | undefined {
		return this.environmentService.remoteAuthority;
	}

	private remoteMetadataInitialized: boolean = false;
	private readonly _onDidChangeEntries = this._register(new Emitter<void>());
	private readonly onDidChangeEntries: Event<void> = this._onDidChangeEntries.event;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@ILabelService private readonly labelService: ILabelService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IHostService private readonly hostService: IHostService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.unrestrictedRemoteIndicatorMenu = this._register(this.menuService.createMenu(MenuId.StatusBarWindowIndicatorMenu, this.contextKeyService)); // to be removed once migration completed
		this.remoteIndicatorMenu = this._register(this.menuService.createMenu(MenuId.StatusBarRemoteIndicatorMenu, this.contextKeyService));

		this.connectionStateContextKey = new RawContextKey<'' | 'initializing' | 'disconnected' | 'connected'>('remoteConnectionState', '').bindTo(this.contextKeyService);

		// Set initial connection state
		if (this.remoteAuthority) {
			this.connectionState = 'initializing';
			this.connectionStateContextKey.set(this.connectionState);
		} else {
			this.updateVirtualWorkspaceLocation();
		}

		this.registerActions();
		this.registerListeners();

		this.updateWhenInstalledExtensionsRegistered();
		this.updateRemoteStatusIndicator();
	}

	private registerActions(): void {
		const category = nls.localize2('remote.category', "Remote");

		// Show Remote Menu
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID,
					category,
					title: nls.localize2('remote.showMenu', "Show Remote Menu"),
					f1: true,
					keybinding: {
						weight: KeybindingWeight.WorkbenchContrib,
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyO,
					}
				});
			}
			run = () => that.showRemoteMenu();
		}));

		// Close Remote Connection
		if (RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID) {
			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
						category,
						title: nls.localize2('remote.close', "Close Remote Connection"),
						f1: true,
						precondition: ContextKeyExpr.or(RemoteNameContext, VirtualWorkspaceContext)
					});
				}
				run = () => that.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: null });
			}));
			if (this.remoteAuthority) {
				MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
					group: '6_close',
					command: {
						id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
						title: nls.localize({ key: 'miCloseRemote', comment: ['&& denotes a mnemonic'] }, "Close Re&&mote Connection")
					},
					order: 3.5
				});
			}
		}

		if (this.extensionGalleryService.isEnabled()) {
			this._register(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: RemoteStatusIndicator.INSTALL_REMOTE_EXTENSIONS_ID,
						category,
						title: nls.localize2('remote.install', "Install Remote Development Extensions"),
						f1: true
					});
				}
				run = (accessor: ServicesAccessor, input: string) => {
					const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
					return extensionsWorkbenchService.openSearch(`@recommended:remotes`);
				};
			}));
		}
	}

	private registerListeners(): void {

		// Menu changes
		const updateRemoteActions = () => {
			this.remoteMenuActionsGroups = undefined;
			this.updateRemoteStatusIndicator();
		};

		this._register(this.unrestrictedRemoteIndicatorMenu.onDidChange(updateRemoteActions));
		this._register(this.remoteIndicatorMenu.onDidChange(updateRemoteActions));

		// Update indicator when formatter changes as it may have an impact on the remote label
		this._register(this.labelService.onDidChangeFormatters(() => this.updateRemoteStatusIndicator()));

		// Update based on remote indicator changes if any
		const remoteIndicator = this.environmentService.options?.windowIndicator;
		if (remoteIndicator && remoteIndicator.onDidChange) {
			this._register(remoteIndicator.onDidChange(() => this.updateRemoteStatusIndicator()));
		}

		// Listen to changes of the connection
		if (this.remoteAuthority) {
			const connection = this.remoteAgentService.getConnection();
			if (connection) {
				this._register(connection.onDidStateChange((e) => {
					switch (e.type) {
						case PersistentConnectionEventType.ConnectionLost:
						case PersistentConnectionEventType.ReconnectionRunning:
						case PersistentConnectionEventType.ReconnectionWait:
							this.setConnectionState('reconnecting');
							break;
						case PersistentConnectionEventType.ReconnectionPermanentFailure:
							this.setConnectionState('disconnected');
							break;
						case PersistentConnectionEventType.ConnectionGain:
							this.setConnectionState('connected');
							break;
					}
				}));
			}
		} else {
			this._register(this.workspaceContextService.onDidChangeWorkbenchState(() => {
				this.updateVirtualWorkspaceLocation();
				this.updateRemoteStatusIndicator();
			}));
		}

		// Online / Offline changes (web only)
		if (isWeb) {
			this._register(Event.any(
				this._register(new DomEmitter(mainWindow, 'online')).event,
				this._register(new DomEmitter(mainWindow, 'offline')).event
			)(() => this.setNetworkState(navigator.onLine ? 'online' : 'offline')));
		}

		this._register(this.extensionService.onDidChangeExtensions(async (result) => {
			for (const ext of result.added) {
				const index = this.remoteExtensionMetadata.findIndex(value => ExtensionIdentifier.equals(value.id, ext.identifier));
				if (index > -1) {
					this.remoteExtensionMetadata[index].installed = true;
				}
			}
		}));

		this._register(this.extensionManagementService.onDidUninstallExtension(async (result) => {
			const index = this.remoteExtensionMetadata.findIndex(value => ExtensionIdentifier.equals(value.id, result.identifier.id));
			if (index > -1) {
				this.remoteExtensionMetadata[index].installed = false;
			}
		}));
	}

	private async initializeRemoteMetadata(): Promise<void> {

		if (this.remoteMetadataInitialized) {
			return;
		}

		const currentPlatform = PlatformToString(platform);
		for (let i = 0; i < this.remoteExtensionMetadata.length; i++) {
			const extensionId = this.remoteExtensionMetadata[i].id;
			const supportedPlatforms = this.remoteExtensionMetadata[i].supportedPlatforms;
			const isInstalled = (await this.extensionManagementService.getInstalled()).find(value => ExtensionIdentifier.equals(value.identifier.id, extensionId)) ? true : false;

			this.remoteExtensionMetadata[i].installed = isInstalled;
			if (isInstalled) {
				this.remoteExtensionMetadata[i].isPlatformCompatible = true;
			}
			else if (supportedPlatforms && !supportedPlatforms.includes(currentPlatform)) {
				this.remoteExtensionMetadata[i].isPlatformCompatible = false;
			}
			else {
				this.remoteExtensionMetadata[i].isPlatformCompatible = true;
			}
		}

		this.remoteMetadataInitialized = true;
		this._onDidChangeEntries.fire();
		this.updateRemoteStatusIndicator();
	}

	private updateVirtualWorkspaceLocation() {
		this.virtualWorkspaceLocation = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace());
	}

	private async updateWhenInstalledExtensionsRegistered(): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();

		const remoteAuthority = this.remoteAuthority;
		if (remoteAuthority) {

			// Try to resolve the authority to figure out connection state
			(async () => {
				try {
					const { authority } = await this.remoteAuthorityResolverService.resolveAuthority(remoteAuthority);
					this.connectionToken = authority.connectionToken;

					this.setConnectionState('connected');
				} catch (error) {
					this.setConnectionState('disconnected');
				}
			})();
		}

		this.updateRemoteStatusIndicator();
		this.initializeRemoteMetadata();
	}

	private setConnectionState(newState: 'disconnected' | 'connected' | 'reconnecting'): void {
		if (this.connectionState !== newState) {
			this.connectionState = newState;

			// simplify context key which doesn't support `connecting`
			if (this.connectionState === 'reconnecting') {
				this.connectionStateContextKey.set('disconnected');
			} else {
				this.connectionStateContextKey.set(this.connectionState);
			}

			// indicate status
			this.updateRemoteStatusIndicator();

			// start measuring connection latency once connected
			if (newState === 'connected') {
				this.scheduleMeasureNetworkConnectionLatency();
			}
		}
	}

	private scheduleMeasureNetworkConnectionLatency(): void {
		if (
			!this.remoteAuthority ||						// only when having a remote connection
			this.measureNetworkConnectionLatencyScheduler	// already scheduled
		) {
			return;
		}

		this.measureNetworkConnectionLatencyScheduler = this._register(new RunOnceScheduler(() => this.measureNetworkConnectionLatency(), RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_DELAY));
		this.measureNetworkConnectionLatencyScheduler.schedule(RemoteStatusIndicator.REMOTE_CONNECTION_LATENCY_SCHEDULER_FIRST_RUN_DELAY);
	}

	private async measureNetworkConnectionLatency(): Promise<void> {

		// Measure latency if we are online
		// but only when the window has focus to prevent constantly
		// waking up the connection to the remote

		if (this.hostService.hasFocus && this.networkState !== 'offline') {
			const measurement = await remoteConnectionLatencyMeasurer.measure(this.remoteAgentService);
			if (measurement) {
				if (measurement.high) {
					this.setNetworkState('high-latency');
				} else if (this.networkState === 'high-latency') {
					this.setNetworkState('online');
				}
			}
		}

		this.measureNetworkConnectionLatencyScheduler?.schedule();
	}

	private setNetworkState(newState: 'online' | 'offline' | 'high-latency'): void {
		if (this.networkState !== newState) {
			const oldState = this.networkState;
			this.networkState = newState;

			if (newState === 'high-latency') {
				this.logService.warn(`Remote network connection appears to have high latency (${remoteConnectionLatencyMeasurer.latency?.current?.toFixed(2)}ms last, ${remoteConnectionLatencyMeasurer.latency?.average?.toFixed(2)}ms average)`);
			}

			if (this.connectionToken) {
				if (newState === 'online' && oldState === 'high-latency') {
					this.logNetworkConnectionHealthTelemetry(this.connectionToken, 'good');
				} else if (newState === 'high-latency' && oldState === 'online') {
					this.logNetworkConnectionHealthTelemetry(this.connectionToken, 'poor');
				}
			}

			// update status
			this.updateRemoteStatusIndicator();
		}
	}

	private logNetworkConnectionHealthTelemetry(connectionToken: string, connectionHealth: 'good' | 'poor'): void {
		type RemoteConnectionHealthClassification = {
			owner: 'alexdima';
			comment: 'The remote connection health has changed (round trip time)';
			remoteName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the resolver.' };
			reconnectionToken: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the connection.' };
			connectionHealth: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The health of the connection: good or poor.' };
		};
		type RemoteConnectionHealthEvent = {
			remoteName: string | undefined;
			reconnectionToken: string;
			connectionHealth: 'good' | 'poor';
		};
		this.telemetryService.publicLog2<RemoteConnectionHealthEvent, RemoteConnectionHealthClassification>('remoteConnectionHealth', {
			remoteName: getRemoteName(this.remoteAuthority),
			reconnectionToken: connectionToken,
			connectionHealth
		});
	}

	private validatedGroup(group: string) {
		if (!group.match(/^(remote|virtualfs)_(\d\d)_(([a-z][a-z0-9+.-]*)_(.*))$/)) {
			if (!this.loggedInvalidGroupNames[group]) {
				this.loggedInvalidGroupNames[group] = true;
				this.logService.warn(`Invalid group name used in "statusBar/remoteIndicator" menu contribution: ${group}. Entries ignored. Expected format: 'remote_$ORDER_$REMOTENAME_$GROUPING or 'virtualfs_$ORDER_$FILESCHEME_$GROUPING.`);
			}
			return false;
		}
		return true;
	}

	private getRemoteMenuActions(doNotUseCache?: boolean): ActionGroup[] {
		if (!this.remoteMenuActionsGroups || doNotUseCache) {
			this.remoteMenuActionsGroups = this.remoteIndicatorMenu.getActions().filter(a => this.validatedGroup(a[0])).concat(this.unrestrictedRemoteIndicatorMenu.getActions());
		}
		return this.remoteMenuActionsGroups;
	}

	private updateRemoteStatusIndicator(): void {

		// Remote Indicator: show if provided via options, e.g. by the web embedder API
		const remoteIndicator = this.environmentService.options?.windowIndicator;
		if (remoteIndicator) {
			let remoteIndicatorLabel = remoteIndicator.label.trim();
			if (!remoteIndicatorLabel.startsWith('$(')) {
				remoteIndicatorLabel = `$(remote) ${remoteIndicatorLabel}`; // ensure the indicator has a codicon
			}

			this.renderRemoteStatusIndicator(truncate(remoteIndicatorLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH), remoteIndicator.tooltip, remoteIndicator.command);
			return;
		}

		// Show for remote windows on the desktop
		if (this.remoteAuthority) {
			const hostLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, this.remoteAuthority) || this.remoteAuthority;
			switch (this.connectionState) {
				case 'initializing':
					this.renderRemoteStatusIndicator(nls.localize('host.open', "Opening Remote..."), nls.localize('host.open', "Opening Remote..."), undefined, true /* progress */);
					break;
				case 'reconnecting':
					this.renderRemoteStatusIndicator(`${nls.localize('host.reconnecting', "Reconnecting to {0}...", truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH))}`, undefined, undefined, true /* progress */);
					break;
				case 'disconnected':
					this.renderRemoteStatusIndicator(`$(alert) ${nls.localize('disconnectedFrom', "Disconnected from {0}", truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH))}`);
					break;
				default: {
					const tooltip = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
					const hostNameTooltip = this.labelService.getHostTooltip(Schemas.vscodeRemote, this.remoteAuthority);
					if (hostNameTooltip) {
						tooltip.appendMarkdown(hostNameTooltip);
					} else {
						tooltip.appendText(nls.localize({ key: 'host.tooltip', comment: ['{0} is a remote host name, e.g. Dev Container'] }, "Editing on {0}", hostLabel));
					}
					this.renderRemoteStatusIndicator(`$(remote) ${truncate(hostLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH)}`, tooltip);
				}
			}
			return;
		}
		// Show when in a virtual workspace
		if (this.virtualWorkspaceLocation) {

			// Workspace with label: indicate editing source
			const workspaceLabel = this.labelService.getHostLabel(this.virtualWorkspaceLocation.scheme, this.virtualWorkspaceLocation.authority);
			if (workspaceLabel) {
				const tooltip = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
				const hostNameTooltip = this.labelService.getHostTooltip(this.virtualWorkspaceLocation.scheme, this.virtualWorkspaceLocation.authority);
				if (hostNameTooltip) {
					tooltip.appendMarkdown(hostNameTooltip);
				} else {
					tooltip.appendText(nls.localize({ key: 'workspace.tooltip', comment: ['{0} is a remote workspace name, e.g. GitHub'] }, "Editing on {0}", workspaceLabel));
				}
				if (!isWeb || this.remoteAuthority) {
					tooltip.appendMarkdown('\n\n');
					tooltip.appendMarkdown(nls.localize(
						{ key: 'workspace.tooltip2', comment: ['[features are not available]({1}) is a link. Only translate `features are not available`. Do not change brackets and parentheses or {0}'] },
						"Some [features are not available]({0}) for resources located on a virtual file system.",
						`command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`
					));
				}
				this.renderRemoteStatusIndicator(`$(remote) ${truncate(workspaceLabel, RemoteStatusIndicator.REMOTE_STATUS_LABEL_MAX_LENGTH)}`, tooltip);
				return;
			}
		}

		this.renderRemoteStatusIndicator(`$(remote)`, nls.localize('noHost.tooltip', "Open a Remote Window"));
		return;
	}

	private renderRemoteStatusIndicator(initialText: string, initialTooltip?: string | MarkdownString, command?: string, showProgress?: boolean): void {
		const { text, tooltip, ariaLabel } = this.withNetworkStatus(initialText, initialTooltip, showProgress);

		const properties: IStatusbarEntry = {
			name: nls.localize('remoteHost', "Remote Host"),
			kind: this.networkState === 'offline' ? 'offline' : 'remote',
			ariaLabel,
			text,
			showProgress,
			tooltip,
			command: command ?? RemoteStatusIndicator.REMOTE_ACTIONS_COMMAND_ID
		};

		if (this.remoteStatusEntry) {
			this.remoteStatusEntry.update(properties);
		} else {
			this.remoteStatusEntry = this.statusbarService.addEntry(properties, 'status.host', StatusbarAlignment.LEFT, Number.POSITIVE_INFINITY /* first entry */);
		}
	}

	private withNetworkStatus(initialText: string, initialTooltip?: string | MarkdownString, showProgress?: boolean): { text: string; tooltip: string | IMarkdownString | undefined; ariaLabel: string } {
		let text = initialText;
		let tooltip = initialTooltip;
		let ariaLabel = getCodiconAriaLabel(text);

		function textWithAlert(): string {

			// `initialText` can have a codicon in the beginning that already
			// indicates some kind of status, or we may have been asked to
			// show progress, where a spinning codicon appears. we only want
			// to replace with an alert icon for when a normal remote indicator
			// is shown.

			if (!showProgress && initialText.startsWith('$(remote)')) {
				return initialText.replace('$(remote)', '$(alert)');
			}

			return initialText;
		}

		switch (this.networkState) {
			case 'offline': {
				const offlineMessage = nls.localize('networkStatusOfflineTooltip', "Network appears to be offline, certain features might be unavailable.");

				text = textWithAlert();
				tooltip = this.appendTooltipLine(tooltip, offlineMessage);
				ariaLabel = `${ariaLabel}, ${offlineMessage}`;
				break;
			}
			case 'high-latency':
				text = textWithAlert();
				tooltip = this.appendTooltipLine(tooltip, nls.localize('networkStatusHighLatencyTooltip', "Network appears to have high latency ({0}ms last, {1}ms average), certain features may be slow to respond.", remoteConnectionLatencyMeasurer.latency?.current?.toFixed(2), remoteConnectionLatencyMeasurer.latency?.average?.toFixed(2)));
				break;
		}

		return { text, tooltip, ariaLabel };
	}

	private appendTooltipLine(tooltip: string | MarkdownString | undefined, line: string): MarkdownString {
		let markdownTooltip: MarkdownString;
		if (typeof tooltip === 'string') {
			markdownTooltip = new MarkdownString(tooltip, { isTrusted: true, supportThemeIcons: true });
		} else {
			markdownTooltip = tooltip ?? new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
		}

		if (markdownTooltip.value.length > 0) {
			markdownTooltip.appendMarkdown('\n\n');
		}

		markdownTooltip.appendMarkdown(line);

		return markdownTooltip;
	}

	private async installExtension(extensionId: string, remoteLabel: string): Promise<void> {
		try {
			await this.extensionsWorkbenchService.install(extensionId, {
				isMachineScoped: false,
				donotIncludePackAndDependencies: false,
				context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
			});
		} catch (error) {
			if (!this.lifecycleService.willShutdown) {
				const { confirmed } = await this.dialogService.confirm({
					type: Severity.Error,
					message: nls.localize('unknownSetupError', "An error occurred while setting up {0}. Would you like to try again?", remoteLabel),
					detail: error && !isCancellationError(error) ? toErrorMessage(error) : undefined,
					primaryButton: nls.localize('retry', "Retry")
				});
				if (confirmed) {
					return this.installExtension(extensionId, remoteLabel);
				}
			}
			throw error;
		}
	}

	private async runRemoteStartCommand(extensionId: string, startCommand: string) {

		// check to ensure the extension is installed
		await retry(async () => {
			const ext = await this.extensionService.getExtension(extensionId);
			if (!ext) {
				throw Error('Failed to find installed remote extension');
			}
			return ext;
		}, 300, 10);

		this.commandService.executeCommand(startCommand);
		this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
			id: 'remoteInstallAndRun',
			detail: extensionId,
			from: 'remote indicator'
		});
	}

	private showRemoteMenu() {
		const getCategoryLabel = (action: MenuItemAction) => {
			if (action.item.category) {
				return typeof action.item.category === 'string' ? action.item.category : action.item.category.value;
			}
			return undefined;
		};

		const matchCurrentRemote = () => {
			if (this.remoteAuthority) {
				return new RegExp(`^remote_\\d\\d_${getRemoteName(this.remoteAuthority)}_`);
			} else if (this.virtualWorkspaceLocation) {
				return new RegExp(`^virtualfs_\\d\\d_${this.virtualWorkspaceLocation.scheme}_`);
			}
			return undefined;
		};

		const computeItems = () => {
			let actionGroups = this.getRemoteMenuActions(true);

			const items: QuickPickItem[] = [];

			const currentRemoteMatcher = matchCurrentRemote();
			if (currentRemoteMatcher) {
				// commands for the current remote go first
				actionGroups = actionGroups.sort((g1, g2) => {
					const isCurrentRemote1 = currentRemoteMatcher.test(g1[0]);
					const isCurrentRemote2 = currentRemoteMatcher.test(g2[0]);
					if (isCurrentRemote1 !== isCurrentRemote2) {
						return isCurrentRemote1 ? -1 : 1;
					}
					// legacy indicator commands go last
					if (g1[0] !== '' && g2[0] === '') {
						return -1;
					} else if (g1[0] === '' && g2[0] !== '') {
						return 1;
					}
					return g1[0].localeCompare(g2[0]);
				});
			}

			let lastCategoryName: string | undefined = undefined;

			for (const actionGroup of actionGroups) {
				let hasGroupCategory = false;
				for (const action of actionGroup[1]) {
					if (action instanceof MenuItemAction) {
						if (!hasGroupCategory) {
							const category = getCategoryLabel(action);
							if (category !== lastCategoryName) {
								items.push({ type: 'separator', label: category });
								lastCategoryName = category;
							}
							hasGroupCategory = true;
						}
						const label = typeof action.item.title === 'string' ? action.item.title : action.item.title.value;
						items.push({
							type: 'item',
							id: action.item.id,
							label
						});
					}
				}
			}

			const showExtensionRecommendations = this.configurationService.getValue<boolean>('workbench.remoteIndicator.showExtensionRecommendations');
			if (showExtensionRecommendations && this.extensionGalleryService.isEnabled() && this.remoteMetadataInitialized) {

				const notInstalledItems: QuickPickItem[] = [];
				for (const metadata of this.remoteExtensionMetadata) {
					if (!metadata.installed && metadata.isPlatformCompatible) {
						// Create Install QuickPick with a help link
						const label = metadata.startConnectLabel;
						const buttons: IQuickInputButton[] = [{
							iconClass: ThemeIcon.asClassName(infoIcon),
							tooltip: nls.localize('remote.startActions.help', "Learn More")
						}];
						notInstalledItems.push({ type: 'item', id: metadata.id, label: label, buttons: buttons });
					}
				}

				items.push({
					type: 'separator', label: nls.localize('remote.startActions.install', 'Install')
				});
				items.push(...notInstalledItems);
			}

			items.push({
				type: 'separator'
			});

			const entriesBeforeConfig = items.length;

			if (RemoteStatusIndicator.SHOW_CLOSE_REMOTE_COMMAND_ID) {
				if (this.remoteAuthority) {
					items.push({
						type: 'item',
						id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
						label: nls.localize('closeRemoteConnection.title', 'Close Remote Connection')
					});

					if (this.connectionState === 'disconnected') {
						items.push({
							type: 'item',
							id: ReloadWindowAction.ID,
							label: nls.localize('reloadWindow', 'Reload Window')
						});
					}
				} else if (this.virtualWorkspaceLocation) {
					items.push({
						type: 'item',
						id: RemoteStatusIndicator.CLOSE_REMOTE_COMMAND_ID,
						label: nls.localize('closeVirtualWorkspace.title', 'Close Remote Workspace')
					});
				}
			}

			if (items.length === entriesBeforeConfig) {
				items.pop(); // remove the separator again
			}

			return items;
		};

		const disposables = new DisposableStore();
		const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
		quickPick.placeholder = nls.localize('remoteActions', "Select an option to open a Remote Window");
		quickPick.items = computeItems();
		quickPick.sortByLabel = false;
		quickPick.canSelectMany = false;
		disposables.add(Event.once(quickPick.onDidAccept)((async _ => {
			const selectedItems = quickPick.selectedItems;
			if (selectedItems.length === 1) {
				const commandId = selectedItems[0].id!;
				const remoteExtension = this.remoteExtensionMetadata.find(value => ExtensionIdentifier.equals(value.id, commandId));
				if (remoteExtension) {
					quickPick.items = [];
					quickPick.busy = true;
					quickPick.placeholder = nls.localize('remote.startActions.installingExtension', 'Installing extension... ');

					try {
						await this.installExtension(remoteExtension.id, selectedItems[0].label);
					} catch (error) {
						return;
					} finally {
						quickPick.hide();
					}
					await this.runRemoteStartCommand(remoteExtension.id, remoteExtension.startCommand);
				}
				else {
					this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
						id: commandId,
						from: 'remote indicator'
					});
					this.commandService.executeCommand(commandId);
					quickPick.hide();
				}
			}
		})));

		disposables.add(Event.once(quickPick.onDidTriggerItemButton)(async (e) => {
			const remoteExtension = this.remoteExtensionMetadata.find(value => ExtensionIdentifier.equals(value.id, e.item.id));
			if (remoteExtension) {
				await this.openerService.open(URI.parse(remoteExtension.helpLink));
			}
		}));

		// refresh the items when actions change
		disposables.add(this.unrestrictedRemoteIndicatorMenu.onDidChange(() => quickPick.items = computeItems()));
		disposables.add(this.remoteIndicatorMenu.onDidChange(() => quickPick.items = computeItems()));

		disposables.add(quickPick.onDidHide(() => disposables.dispose()));

		if (!this.remoteMetadataInitialized) {
			quickPick.busy = true;
			this._register(this.onDidChangeEntries(() => {
				// If quick pick is open, update the quick pick items after initialization.
				quickPick.busy = false;
				quickPick.items = computeItems();
			}));
		}

		quickPick.show();
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		...workbenchConfigurationNodeBase,
		properties: {
			'workbench.remoteIndicator.showExtensionRecommendations': {
				type: 'boolean',
				markdownDescription: nls.localize('remote.showExtensionRecommendations', "When enabled, remote extensions recommendations will be shown in the Remote Indicator menu."),
				default: true
			},
		}
	});
