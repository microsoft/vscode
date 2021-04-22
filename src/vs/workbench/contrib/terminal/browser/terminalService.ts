/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { debounce, throttle } from 'vs/base/common/decorators';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { basename } from 'vs/base/common/path';
import { isMacintosh, isWeb, isWindows, OperatingSystem } from 'vs/base/common/platform';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import * as nls from 'vs/nls';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { IKeyMods, IPickOptions, IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ILocalTerminalService, IShellLaunchConfig, ITerminalLaunchError, ITerminalsLayoutInfo, ITerminalsLayoutInfoById, TerminalShellType, WindowsShellType } from 'vs/platform/terminal/common/terminal';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IViewDescriptorService, IViewsService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IRemoteTerminalService, ITerminalExternalLinkProvider, ITerminalInstance, ITerminalService, ITerminalTab, TerminalConnectionState } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { TerminalTab } from 'vs/workbench/contrib/terminal/browser/terminalTab';
import { TerminalViewPane } from 'vs/workbench/contrib/terminal/browser/terminalView';
import { IAvailableProfilesRequest, IRemoteTerminalAttachTarget, ITerminalProfile, IStartExtensionTerminalRequest, ITerminalConfigHelper, ITerminalNativeWindowsDelegate, ITerminalProcessExtHostProxy, KEYBINDING_CONTEXT_TERMINAL_ALT_BUFFER_ACTIVE, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_IS_OPEN, KEYBINDING_CONTEXT_TERMINAL_PROCESS_SUPPORTED, KEYBINDING_CONTEXT_TERMINAL_SHELL_TYPE, LinuxDistro, TERMINAL_VIEW_ID, ITerminalProfileObject, ITerminalTypeContribution } from 'vs/workbench/contrib/terminal/common/terminal';
import { escapeNonWindowsPath } from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ILifecycleService, ShutdownReason, WillShutdownEvent } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { configureTerminalProfileIcon } from 'vs/workbench/contrib/terminal/browser/terminalIcons';
import { equals } from 'vs/base/common/objects';
import { Codicon, iconRegistry } from 'vs/base/common/codicons';
import { ITerminalContributionService } from 'vs/workbench/contrib/terminal/common/terminalExtensionPoints';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { URI } from 'vs/base/common/uri';
import { ILabelService } from 'vs/platform/label/common/label';
import { Schemas } from 'vs/base/common/network';

interface IExtHostReadyEntry {
	promise: Promise<void>;
	resolve: () => void;
}

export class TerminalService implements ITerminalService {
	public _serviceBrand: undefined;

	private _isShuttingDown: boolean;
	private _terminalFocusContextKey: IContextKey<boolean>;
	private _terminalShellTypeContextKey: IContextKey<string>;
	private _terminalAltBufferActiveContextKey: IContextKey<boolean>;
	private _terminalTabs: ITerminalTab[] = [];
	private _backgroundedTerminalInstances: ITerminalInstance[] = [];
	private get _terminalInstances(): ITerminalInstance[] {
		return this._terminalTabs.reduce((p, c) => p.concat(c.terminalInstances), <ITerminalInstance[]>[]);
	}
	private _findState: FindReplaceState;
	private _extHostsReady: { [authority: string]: IExtHostReadyEntry | undefined } = {};
	private _activeTabIndex: number;
	private _linkProviders: Set<ITerminalExternalLinkProvider> = new Set();
	private _linkProviderDisposables: Map<ITerminalExternalLinkProvider, IDisposable[]> = new Map();
	private _processSupportContextKey: IContextKey<boolean>;

	public get activeTabIndex(): number { return this._activeTabIndex; }
	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }
	public get terminalTabs(): ITerminalTab[] { return this._terminalTabs; }
	public get isProcessSupportRegistered(): boolean { return !!this._processSupportContextKey.get(); }

	private _configHelper: TerminalConfigHelper;
	private _terminalContainer: HTMLElement | undefined;
	private _nativeWindowsDelegate: ITerminalNativeWindowsDelegate | undefined;
	private _remoteTerminalsInitPromise: Promise<void> | undefined;
	private _localTerminalsInitPromise: Promise<void> | undefined;
	private _connectionState: TerminalConnectionState;
	public get connectionState(): TerminalConnectionState { return this._connectionState; }
	private readonly _localTerminalService?: ILocalTerminalService;

	private _availableProfiles: ITerminalProfile[] | undefined;
	public get availableProfiles(): ITerminalProfile[] {
		this._refreshAvailableProfiles();
		return this._availableProfiles || [];
	}

	public get configHelper(): ITerminalConfigHelper { return this._configHelper; }

	private readonly _onActiveTabChanged = new Emitter<void>();
	public get onActiveTabChanged(): Event<void> { return this._onActiveTabChanged.event; }
	private readonly _onInstanceCreated = new Emitter<ITerminalInstance>();
	public get onInstanceCreated(): Event<ITerminalInstance> { return this._onInstanceCreated.event; }
	private readonly _onInstanceDisposed = new Emitter<ITerminalInstance>();
	public get onInstanceDisposed(): Event<ITerminalInstance> { return this._onInstanceDisposed.event; }
	private readonly _onInstanceProcessIdReady = new Emitter<ITerminalInstance>();
	public get onInstanceProcessIdReady(): Event<ITerminalInstance> { return this._onInstanceProcessIdReady.event; }
	private readonly _onInstanceLinksReady = new Emitter<ITerminalInstance>();
	public get onInstanceLinksReady(): Event<ITerminalInstance> { return this._onInstanceLinksReady.event; }
	private readonly _onInstanceRequestStartExtensionTerminal = new Emitter<IStartExtensionTerminalRequest>();
	public get onInstanceRequestStartExtensionTerminal(): Event<IStartExtensionTerminalRequest> { return this._onInstanceRequestStartExtensionTerminal.event; }
	private readonly _onInstanceDimensionsChanged = new Emitter<ITerminalInstance>();
	public get onInstanceDimensionsChanged(): Event<ITerminalInstance> { return this._onInstanceDimensionsChanged.event; }
	private readonly _onInstanceMaximumDimensionsChanged = new Emitter<ITerminalInstance>();
	public get onInstanceMaximumDimensionsChanged(): Event<ITerminalInstance> { return this._onInstanceMaximumDimensionsChanged.event; }
	private readonly _onInstancesChanged = new Emitter<void>();
	public get onInstancesChanged(): Event<void> { return this._onInstancesChanged.event; }
	private readonly _onInstanceTitleChanged = new Emitter<ITerminalInstance | undefined>();
	public get onInstanceTitleChanged(): Event<ITerminalInstance | undefined> { return this._onInstanceTitleChanged.event; }
	private readonly _onActiveInstanceChanged = new Emitter<ITerminalInstance | undefined>();
	public get onActiveInstanceChanged(): Event<ITerminalInstance | undefined> { return this._onActiveInstanceChanged.event; }
	private readonly _onInstancePrimaryStatusChanged = new Emitter<ITerminalInstance>();
	public get onInstancePrimaryStatusChanged(): Event<ITerminalInstance> { return this._onInstancePrimaryStatusChanged.event; }
	private readonly _onTabDisposed = new Emitter<ITerminalTab>();
	public get onTabDisposed(): Event<ITerminalTab> { return this._onTabDisposed.event; }
	private readonly _onRequestAvailableProfiles = new Emitter<IAvailableProfilesRequest>();
	public get onRequestAvailableProfiles(): Event<IAvailableProfilesRequest> { return this._onRequestAvailableProfiles.event; }
	private readonly _onDidRegisterProcessSupport = new Emitter<void>();
	public get onDidRegisterProcessSupport(): Event<void> { return this._onDidRegisterProcessSupport.event; }
	private readonly _onDidChangeConnectionState = new Emitter<void>();
	public get onDidChangeConnectionState(): Event<void> { return this._onDidChangeConnectionState.event; }
	private readonly _onDidChangeAvailableProfiles = new Emitter<ITerminalProfile[]>();
	public get onDidChangeAvailableProfiles(): Event<ITerminalProfile[]> { return this._onDidChangeAvailableProfiles.event; }
	private readonly _onPanelMovedToSide = new Emitter<void>();
	public get onPanelMovedToSide(): Event<void> { return this._onPanelMovedToSide.event; }

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private _layoutService: IWorkbenchLayoutService,
		@ILabelService labelService: ILabelService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IDialogService private _dialogService: IDialogService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IRemoteAgentService private _remoteAgentService: IRemoteAgentService,
		@IQuickInputService private _quickInputService: IQuickInputService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IViewsService private _viewsService: IViewsService,
		@IViewDescriptorService private readonly _viewDescriptorService: IViewDescriptorService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IRemoteTerminalService private readonly _remoteTerminalService: IRemoteTerminalService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ITerminalContributionService private readonly _terminalContributionService: ITerminalContributionService,
		@ICommandService private readonly _commandService: ICommandService,
		@optional(ILocalTerminalService) localTerminalService: ILocalTerminalService
	) {
		this._localTerminalService = localTerminalService;

		this._activeTabIndex = 0;
		this._isShuttingDown = false;
		this._findState = new FindReplaceState();
		lifecycleService.onBeforeShutdown(async e => e.veto(this._onBeforeShutdown(e.reason), 'veto.terminal'));
		lifecycleService.onWillShutdown(e => this._onWillShutdown(e));
		this._terminalFocusContextKey = KEYBINDING_CONTEXT_TERMINAL_FOCUS.bindTo(this._contextKeyService);
		this._terminalShellTypeContextKey = KEYBINDING_CONTEXT_TERMINAL_SHELL_TYPE.bindTo(this._contextKeyService);
		this._terminalAltBufferActiveContextKey = KEYBINDING_CONTEXT_TERMINAL_ALT_BUFFER_ACTIVE.bindTo(this._contextKeyService);
		this._configHelper = this._instantiationService.createInstance(TerminalConfigHelper);
		this.onTabDisposed(tab => this._removeTab(tab));
		this.onActiveTabChanged(() => {
			const instance = this.getActiveInstance();
			this._onActiveInstanceChanged.fire(instance ? instance : undefined);
		});
		// update detected profiles so for example we detect if you've installed a pwsh
		// this avoids having poll routinely
		this.onInstanceCreated(() => this._refreshAvailableProfiles());
		this.onInstanceLinksReady(instance => this._setInstanceLinkProviders(instance));
		this._handleInstanceContextKeys();
		this._processSupportContextKey = KEYBINDING_CONTEXT_TERMINAL_PROCESS_SUPPORTED.bindTo(this._contextKeyService);
		this._processSupportContextKey.set(!isWeb || this._remoteAgentService.getConnection() !== null);

		this._configurationService.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('terminal.integrated.profiles.windows') ||
				e.affectsConfiguration('terminal.integrated.profiles.osx') ||
				e.affectsConfiguration('terminal.integrated.profiles.linux') ||
				e.affectsConfiguration('terminal.integrated.defaultProfile.windows') ||
				e.affectsConfiguration('terminal.integrated.defaultProfile.osx') ||
				e.affectsConfiguration('terminal.integrated.defaultProfile.linux') ||
				e.affectsConfiguration('terminal.integrated.useWslProfiles')) {
				this._refreshAvailableProfiles();
			}
		});

		// Register a resource formatter for terminal URIs
		labelService.registerFormatter({
			scheme: Schemas.vscodeTerminal,
			formatting: {
				label: '${path}',
				separator: ''
			}
		});

		const enableTerminalReconnection = this.configHelper.config.enablePersistentSessions;

		const conn = this._remoteAgentService.getConnection();
		const remoteAuthority = conn ? conn.remoteAuthority : 'null';
		this._whenExtHostReady(remoteAuthority).then(() => {
			this._refreshAvailableProfiles();
		});

		// Connect to the extension host if it's there, set the connection state to connected when
		// it's done. This should happen even when there is no extension host.
		this._connectionState = TerminalConnectionState.Connecting;
		let initPromise: Promise<any>;
		if (!!this._environmentService.remoteAuthority && enableTerminalReconnection) {
			initPromise = this._remoteTerminalsInitPromise = this._reconnectToRemoteTerminals();
		} else if (enableTerminalReconnection) {
			initPromise = this._localTerminalsInitPromise = this._reconnectToLocalTerminals();
		} else {
			initPromise = Promise.resolve();
		}
		initPromise.then(() => this._setConnected());
	}

	private _setConnected() {
		this._connectionState = TerminalConnectionState.Connected;
		this._onDidChangeConnectionState.fire();
	}

	private async _reconnectToRemoteTerminals(): Promise<void> {
		// Reattach to all remote terminals
		const layoutInfo = await this._remoteTerminalService.getTerminalLayoutInfo();
		this._remoteTerminalService.reduceConnectionGraceTime();
		const reconnectCounter = this._recreateTerminalTabs(layoutInfo);
		/* __GDPR__
			"terminalReconnection" : {
				"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		 */
		const data = {
			count: reconnectCounter
		};
		this._telemetryService.publicLog('terminalReconnection', data);
		// now that terminals have been restored,
		// attach listeners to update remote when terminals are changed
		this.attachProcessLayoutListeners(true);
	}

	private async _reconnectToLocalTerminals(): Promise<void> {
		if (!this._localTerminalService) {
			return;
		}
		// Reattach to all local terminals
		const layoutInfo = await this._localTerminalService.getTerminalLayoutInfo();
		if (layoutInfo && layoutInfo.tabs.length > 0) {
			this._recreateTerminalTabs(layoutInfo);
		}
		// now that terminals have been restored,
		// attach listeners to update local state when terminals are changed
		this.attachProcessLayoutListeners(false);
	}

	private _recreateTerminalTabs(layoutInfo?: ITerminalsLayoutInfo): number {
		let reconnectCounter = 0;
		let activeTab: ITerminalTab | undefined;
		if (layoutInfo) {
			layoutInfo.tabs.forEach(tabLayout => {
				const terminalLayouts = tabLayout.terminals.filter(t => t.terminal && t.terminal.isOrphan);
				if (terminalLayouts.length) {
					reconnectCounter += terminalLayouts.length;
					let terminalInstance: ITerminalInstance | undefined;
					let tab: ITerminalTab | undefined;
					terminalLayouts.forEach((terminalLayout) => {
						if (!terminalInstance) {
							// create tab and terminal
							terminalInstance = this.createTerminal({ attachPersistentProcess: terminalLayout.terminal! });
							tab = this.getTabForInstance(terminalInstance);
							if (tabLayout.isActive) {
								activeTab = tab;
							}
						} else {
							// add split terminals to this tab
							this.splitInstance(terminalInstance, { attachPersistentProcess: terminalLayout.terminal! });
						}
					});
					const activeInstance = this.terminalInstances.find(t => {
						return t.shellLaunchConfig.attachPersistentProcess?.id === tabLayout.activePersistentProcessId;
					});
					if (activeInstance) {
						this.setActiveInstance(activeInstance);
					}
					tab?.resizePanes(tabLayout.terminals.map(terminal => terminal.relativeSize));
				}
			});
			if (layoutInfo.tabs.length) {
				this.setActiveTabByIndex(activeTab ? this.terminalTabs.indexOf(activeTab) : 0);
			}
		}
		return reconnectCounter;
	}

	private attachProcessLayoutListeners(isRemote: boolean): void {
		this.onActiveTabChanged(() => isRemote ? this._updateRemoteState() : this._updateLocalState());
		this.onActiveInstanceChanged(() => isRemote ? this._updateRemoteState() : this._updateLocalState());
		this.onInstancesChanged(() => isRemote ? this._updateRemoteState() : this._updateLocalState());
		// The state must be updated when the terminal is relaunched, otherwise the persistent
		// terminal ID will be stale and the process will be leaked.
		this.onInstanceProcessIdReady(() => isRemote ? this._updateRemoteState() : this._updateLocalState());
	}

	public setNativeWindowsDelegate(delegate: ITerminalNativeWindowsDelegate): void {
		this._nativeWindowsDelegate = delegate;
	}

	public setLinuxDistro(linuxDistro: LinuxDistro): void {
		this._configHelper.setLinuxDistro(linuxDistro);
	}

	private _handleInstanceContextKeys(): void {
		const terminalIsOpenContext = KEYBINDING_CONTEXT_TERMINAL_IS_OPEN.bindTo(this._contextKeyService);
		const updateTerminalContextKeys = () => {
			terminalIsOpenContext.set(this.terminalInstances.length > 0);
		};
		this.onInstancesChanged(() => updateTerminalContextKeys());
	}

	public getActiveOrCreateInstance(): ITerminalInstance {
		const activeInstance = this.getActiveInstance();
		return activeInstance ? activeInstance : this.createTerminal(undefined);
	}

	public requestStartExtensionTerminal(proxy: ITerminalProcessExtHostProxy, cols: number, rows: number): Promise<ITerminalLaunchError | undefined> {
		// The initial request came from the extension host, no need to wait for it
		return new Promise<ITerminalLaunchError | undefined>(callback => {
			this._onInstanceRequestStartExtensionTerminal.fire({ proxy, cols, rows, callback });
		});
	}

	public async extHostReady(remoteAuthority: string): Promise<void> {
		this._createExtHostReadyEntry(remoteAuthority);
		this._extHostsReady[remoteAuthority]!.resolve();
	}

	@throttle(10000)
	private async _refreshAvailableProfiles(): Promise<void> {
		const result = await this._detectProfiles(true);
		if (!equals(result, this._availableProfiles)) {
			this._availableProfiles = result;
			this._onDidChangeAvailableProfiles.fire(this._availableProfiles);
		}
	}

	private async _detectProfiles(configuredProfilesOnly: boolean): Promise<ITerminalProfile[]> {
		await this._extensionService.whenInstalledExtensionsRegistered();
		// Wait for the remoteAuthority to be ready (and listening for events) before firing
		// the event to spawn the ext host process
		const conn = this._remoteAgentService.getConnection();
		const remoteAuthority = conn ? conn.remoteAuthority : 'null';
		await this._whenExtHostReady(remoteAuthority);
		return new Promise(r => this._onRequestAvailableProfiles.fire({ callback: r, configuredProfilesOnly: configuredProfilesOnly }));
	}

	private async _whenExtHostReady(remoteAuthority: string): Promise<void> {
		this._createExtHostReadyEntry(remoteAuthority);
		return this._extHostsReady[remoteAuthority]!.promise;
	}

	private _createExtHostReadyEntry(remoteAuthority: string): void {
		if (this._extHostsReady[remoteAuthority]) {
			return;
		}

		let resolve!: () => void;
		const promise = new Promise<void>(r => resolve = r);
		this._extHostsReady[remoteAuthority] = { promise, resolve };
	}

	private _onBeforeShutdown(reason: ShutdownReason): boolean | Promise<boolean> {
		if (this.terminalInstances.length === 0) {
			// No terminal instances, don't veto
			return false;
		}

		const shouldPersistTerminals = this._configHelper.config.enablePersistentSessions && reason === ShutdownReason.RELOAD;
		if (this.configHelper.config.confirmOnExit && !shouldPersistTerminals) {
			return this._onBeforeShutdownAsync();
		}

		this._isShuttingDown = true;

		return false;
	}

	private async _onBeforeShutdownAsync(): Promise<boolean> {
		// veto if configured to show confirmation and the user chose not to exit
		const veto = await this._showTerminalCloseConfirmation();
		if (!veto) {
			this._isShuttingDown = true;
		}
		return veto;
	}

	private _onWillShutdown(e: WillShutdownEvent): void {
		// Don't touch processes if the shutdown was a result of reload as they will be reattached
		const shouldPersistTerminals = this._configHelper.config.enablePersistentSessions && e.reason === ShutdownReason.RELOAD;
		if (shouldPersistTerminals) {
			this.terminalInstances.forEach(instance => instance.detachFromProcess());
			return;
		}

		// Force dispose of all terminal instances, don't force immediate disposal of the terminal
		// processes on Windows as an additional mitigation for https://github.com/microsoft/vscode/issues/71966
		// which causes the pty host to become unresponsive, disconnecting all terminals across all
		// windows
		this.terminalInstances.forEach(instance => instance.dispose(!isWindows));

		this._localTerminalService?.setTerminalLayoutInfo(undefined);
	}

	public getTabLabels(): string[] {
		return this._terminalTabs.filter(tab => tab.terminalInstances.length > 0).map((tab, index) => {
			return `${index + 1}: ${tab.title ? tab.title : ''}`;
		});
	}

	public getFindState(): FindReplaceState {
		return this._findState;
	}

	@debounce(500)
	private _updateRemoteState(): void {
		if (!!this._environmentService.remoteAuthority) {
			const state: ITerminalsLayoutInfoById = {
				tabs: this.terminalTabs.map(t => t.getLayoutInfo(t === this.getActiveTab()))
			};
			this._remoteTerminalService.setTerminalLayoutInfo(state);
		}
	}

	@debounce(500)
	private _updateLocalState(): void {
		const state: ITerminalsLayoutInfoById = {
			tabs: this.terminalTabs.map(t => t.getLayoutInfo(t === this.getActiveTab()))
		};
		this._localTerminalService!.setTerminalLayoutInfo(state);
	}

	private _removeTab(tab: ITerminalTab): void {
		// Get the index of the tab and remove it from the list
		const index = this._terminalTabs.indexOf(tab);
		const activeTab = this.getActiveTab();
		const activeTabIndex = activeTab ? this._terminalTabs.indexOf(activeTab) : -1;
		const wasActiveTab = tab === activeTab;
		if (index !== -1) {
			this._terminalTabs.splice(index, 1);
		}

		// Adjust focus if the tab was active
		if (wasActiveTab && this._terminalTabs.length > 0) {
			// TODO: Only focus the new tab if the removed tab had focus?
			// const hasFocusOnExit = tab.activeInstance.hadFocusOnExit;
			const newIndex = index < this._terminalTabs.length ? index : this._terminalTabs.length - 1;
			this.setActiveTabByIndex(newIndex);
			const activeInstance = this.getActiveInstance();
			if (activeInstance) {
				activeInstance.focus(true);
			}
		} else if (activeTabIndex >= this._terminalTabs.length) {
			const newIndex = this._terminalTabs.length - 1;
			this.setActiveTabByIndex(newIndex);
		}

		// Hide the panel if there are no more instances, provided that VS Code is not shutting
		// down. When shutting down the panel is locked in place so that it is restored upon next
		// launch.
		if (this._terminalTabs.length === 0 && !this._isShuttingDown) {
			this.hidePanel();
			this._onActiveInstanceChanged.fire(undefined);
		}

		// Fire events
		this._onInstancesChanged.fire();
		if (wasActiveTab) {
			this._onActiveTabChanged.fire();
		}
	}

	public refreshActiveTab(): void {
		// Fire active instances changed
		this._onActiveTabChanged.fire();
	}

	public getActiveTab(): ITerminalTab | null {
		if (this._activeTabIndex < 0 || this._activeTabIndex >= this._terminalTabs.length) {
			return null;
		}
		return this._terminalTabs[this._activeTabIndex];
	}

	public getActiveInstance(): ITerminalInstance | null {
		const tab = this.getActiveTab();
		if (!tab) {
			return null;
		}
		return tab.activeInstance;
	}

	public doWithActiveInstance<T>(callback: (terminal: ITerminalInstance) => T): T | void {
		const instance = this.getActiveInstance();
		if (instance) {
			return callback(instance);
		}
	}

	public getInstanceFromId(terminalId: number): ITerminalInstance | undefined {
		let bgIndex = -1;
		this._backgroundedTerminalInstances.forEach((terminalInstance, i) => {
			if (terminalInstance.instanceId === terminalId) {
				bgIndex = i;
			}
		});
		if (bgIndex !== -1) {
			return this._backgroundedTerminalInstances[bgIndex];
		}
		try {
			return this.terminalInstances[this._getIndexFromId(terminalId)];
		} catch {
			return undefined;
		}
	}

	public getInstanceFromIndex(terminalIndex: number): ITerminalInstance {
		return this.terminalInstances[terminalIndex];
	}

	public setActiveInstance(terminalInstance: ITerminalInstance): void {
		// If this was a hideFromUser terminal created by the API this was triggered by show,
		// in which case we need to create the terminal tab
		if (terminalInstance.shellLaunchConfig.hideFromUser) {
			this._showBackgroundTerminal(terminalInstance);
		}
		this.setActiveInstanceByIndex(this._getIndexFromId(terminalInstance.instanceId));
	}

	public setActiveTabByIndex(tabIndex: number): void {
		if (tabIndex >= this._terminalTabs.length) {
			return;
		}

		const didTabChange = this._activeTabIndex !== tabIndex;
		this._activeTabIndex = tabIndex;

		this._terminalTabs.forEach((t, i) => t.setVisible(i === this._activeTabIndex));
		if (didTabChange) {
			this._onActiveTabChanged.fire();
		}
	}

	public isAttachedToTerminal(remoteTerm: IRemoteTerminalAttachTarget): boolean {
		return this.terminalInstances.some(term => term.processId === remoteTerm.pid);
	}

	public async initializeTerminals(): Promise<void> {
		if (this._remoteTerminalsInitPromise) {
			await this._remoteTerminalsInitPromise;
		} else if (this._localTerminalsInitPromise) {
			await this._localTerminalsInitPromise;
		}
		if (this.terminalTabs.length === 0 && this.isProcessSupportRegistered) {
			this.createTerminal();
		}
	}

	private _getInstanceFromGlobalInstanceIndex(index: number): { tab: ITerminalTab, tabIndex: number, instance: ITerminalInstance, localInstanceIndex: number } | null {
		let currentTabIndex = 0;
		while (index >= 0 && currentTabIndex < this._terminalTabs.length) {
			const tab = this._terminalTabs[currentTabIndex];
			const count = tab.terminalInstances.length;
			if (index < count) {
				return {
					tab,
					tabIndex: currentTabIndex,
					instance: tab.terminalInstances[index],
					localInstanceIndex: index
				};
			}
			index -= count;
			currentTabIndex++;
		}
		return null;
	}

	public setActiveInstanceByIndex(terminalIndex: number): void {
		const query = this._getInstanceFromGlobalInstanceIndex(terminalIndex);
		if (!query) {
			return;
		}

		query.tab.setActiveInstanceByIndex(query.localInstanceIndex);
		const didTabChange = this._activeTabIndex !== query.tabIndex;
		this._activeTabIndex = query.tabIndex;
		this._terminalTabs.forEach((t, i) => t.setVisible(i === query.tabIndex));

		// Only fire the event if there was a change
		if (didTabChange) {
			this._onActiveTabChanged.fire();
		}
	}

	public setActiveTabToNext(): void {
		if (this._terminalTabs.length <= 1) {
			return;
		}
		let newIndex = this._activeTabIndex + 1;
		if (newIndex >= this._terminalTabs.length) {
			newIndex = 0;
		}
		this.setActiveTabByIndex(newIndex);
	}

	public setActiveTabToPrevious(): void {
		if (this._terminalTabs.length <= 1) {
			return;
		}
		let newIndex = this._activeTabIndex - 1;
		if (newIndex < 0) {
			newIndex = this._terminalTabs.length - 1;
		}
		this.setActiveTabByIndex(newIndex);
	}

	public splitInstance(instanceToSplit: ITerminalInstance, shellLaunchConfig?: IShellLaunchConfig): ITerminalInstance | null;
	public splitInstance(instanceToSplit: ITerminalInstance, profile: ITerminalProfile, cwd?: string | URI): ITerminalInstance | null
	public splitInstance(instanceToSplit: ITerminalInstance, shellLaunchConfigOrProfile: IShellLaunchConfig | ITerminalProfile = {}, cwd?: string | URI): ITerminalInstance | null {
		const tab = this.getTabForInstance(instanceToSplit);
		if (!tab) {
			return null;
		}
		const shellLaunchConfig = this._convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile, cwd);
		const instance = tab.split(shellLaunchConfig);

		this._initInstanceListeners(instance);
		this._onInstancesChanged.fire();

		this._terminalTabs.forEach((t, i) => t.setVisible(i === this._activeTabIndex));
		return instance;
	}

	protected _initInstanceListeners(instance: ITerminalInstance): void {
		instance.addDisposable(instance.onDisposed(this._onInstanceDisposed.fire, this._onInstanceDisposed));
		instance.addDisposable(instance.onTitleChanged(this._onInstanceTitleChanged.fire, this._onInstanceTitleChanged));
		instance.addDisposable(instance.onProcessIdReady(this._onInstanceProcessIdReady.fire, this._onInstanceProcessIdReady));
		instance.addDisposable(instance.statusList.onDidChangePrimaryStatus(() => this._onInstancePrimaryStatusChanged.fire(instance)));
		instance.addDisposable(instance.onLinksReady(this._onInstanceLinksReady.fire, this._onInstanceLinksReady));
		instance.addDisposable(instance.onDimensionsChanged(() => {
			this._onInstanceDimensionsChanged.fire(instance);
			if (this.configHelper.config.enablePersistentSessions && this.isProcessSupportRegistered) {
				!!this._environmentService.remoteAuthority ? this._updateRemoteState() : this._updateLocalState();
			}
		}));
		instance.addDisposable(instance.onMaximumDimensionsChanged(() => this._onInstanceMaximumDimensionsChanged.fire(instance)));
		instance.addDisposable(instance.onFocus(this._onActiveInstanceChanged.fire, this._onActiveInstanceChanged));
	}

	public registerProcessSupport(isSupported: boolean): void {
		if (!isSupported) {
			return;
		}
		this._processSupportContextKey.set(isSupported);
		this._onDidRegisterProcessSupport.fire();
	}

	public registerLinkProvider(linkProvider: ITerminalExternalLinkProvider): IDisposable {
		const disposables: IDisposable[] = [];
		this._linkProviders.add(linkProvider);
		for (const instance of this.terminalInstances) {
			if (instance.areLinksReady) {
				disposables.push(instance.registerLinkProvider(linkProvider));
			}
		}
		this._linkProviderDisposables.set(linkProvider, disposables);
		return {
			dispose: () => {
				const disposables = this._linkProviderDisposables.get(linkProvider) || [];
				for (const disposable of disposables) {
					disposable.dispose();
				}
				this._linkProviders.delete(linkProvider);
			}
		};
	}

	private _setInstanceLinkProviders(instance: ITerminalInstance): void {
		for (const linkProvider of this._linkProviders) {
			const disposables = this._linkProviderDisposables.get(linkProvider);
			const provider = instance.registerLinkProvider(linkProvider);
			disposables?.push(provider);
		}
	}

	public getTabForInstance(instance: ITerminalInstance): ITerminalTab | undefined {
		return this._terminalTabs.find(tab => tab.terminalInstances.indexOf(instance) !== -1);
	}

	public async showPanel(focus?: boolean): Promise<void> {
		const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID) as TerminalViewPane;
		if (!pane) {
			await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
		}
		if (focus) {
			// Do the focus call asynchronously as going through the
			// command palette will force editor focus
			await timeout(0);
			const instance = this.getActiveInstance();
			if (instance) {
				await instance.focusWhenReady(true);
			}
		}
	}

	private _getIndexFromId(terminalId: number): number {
		let terminalIndex = -1;
		this.terminalInstances.forEach((terminalInstance, i) => {
			if (terminalInstance.instanceId === terminalId) {
				terminalIndex = i;
			}
		});
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	protected async _showTerminalCloseConfirmation(): Promise<boolean> {
		let message: string;
		if (this.terminalInstances.length === 1) {
			message = nls.localize('terminalService.terminalCloseConfirmationSingular', "There is an active terminal session, do you want to kill it?");
		} else {
			message = nls.localize('terminalService.terminalCloseConfirmationPlural', "There are {0} active terminal sessions, do you want to kill them?", this.terminalInstances.length);
		}
		const res = await this._dialogService.confirm({
			message,
			type: 'warning',
		});
		return !res.confirmed;
	}

	public preparePathForTerminalAsync(originalPath: string, executable: string, title: string, shellType: TerminalShellType): Promise<string> {
		return new Promise<string>(c => {
			if (!executable) {
				c(originalPath);
				return;
			}

			const hasSpace = originalPath.indexOf(' ') !== -1;
			const hasParens = originalPath.indexOf('(') !== -1 || originalPath.indexOf(')') !== -1;

			const pathBasename = basename(executable, '.exe');
			const isPowerShell = pathBasename === 'pwsh' ||
				title === 'pwsh' ||
				pathBasename === 'powershell' ||
				title === 'powershell';

			if (isPowerShell && (hasSpace || originalPath.indexOf('\'') !== -1)) {
				c(`& '${originalPath.replace(/'/g, '\'\'')}'`);
				return;
			}

			if (hasParens && isPowerShell) {
				c(`& '${originalPath}'`);
				return;
			}

			if (isWindows) {
				// 17063 is the build number where wsl path was introduced.
				// Update Windows uriPath to be executed in WSL.
				if (shellType !== undefined) {
					if (shellType === WindowsShellType.GitBash) {
						c(originalPath.replace(/\\/g, '/'));
						return;
					}
					else if (shellType === WindowsShellType.Wsl) {
						if (this._nativeWindowsDelegate && this._nativeWindowsDelegate.getWindowsBuildNumber() >= 17063) {
							c(this._nativeWindowsDelegate.getWslPath(originalPath));
						} else {
							c(originalPath.replace(/\\/g, '/'));
						}
						return;
					}

					if (hasSpace) {
						c('"' + originalPath + '"');
					} else {
						c(originalPath);
					}
				} else {
					const lowerExecutable = executable.toLowerCase();
					if (this._nativeWindowsDelegate && this._nativeWindowsDelegate.getWindowsBuildNumber() >= 17063 &&
						(lowerExecutable.indexOf('wsl') !== -1 || (lowerExecutable.indexOf('bash.exe') !== -1 && lowerExecutable.toLowerCase().indexOf('git') === -1))) {
						c(this._nativeWindowsDelegate.getWslPath(originalPath));
						return;
					} else if (hasSpace) {
						c('"' + originalPath + '"');
					} else {
						c(originalPath);
					}
				}

				return;
			}

			c(escapeNonWindowsPath(originalPath));
		});
	}

	private async _getPlatformKey(): Promise<string> {
		const env = await this._remoteAgentService.getEnvironment();
		if (env) {
			return env.os === OperatingSystem.Windows ? 'windows' : (env.os === OperatingSystem.Macintosh ? 'osx' : 'linux');
		}
		return isWindows ? 'windows' : (isMacintosh ? 'osx' : 'linux');
	}

	public async showProfileQuickPick(type: 'setDefault' | 'createInstance'): Promise<void> {
		let keyMods: IKeyMods | undefined;
		const profiles = await this._detectProfiles(false);
		const platformKey = await this._getPlatformKey();

		const options: IPickOptions<IProfileQuickPickItem> = {
			placeHolder: type === 'createInstance' ? nls.localize('terminal.integrated.selectProfileToCreate', "Select the terminal profile to create") : nls.localize('terminal.integrated.chooseDefaultProfile', "Select your default terminal profile"),
			onDidTriggerItemButton: async (context) => {
				if ('command' in context.item.profile) {
					return;
				}
				const configKey = `terminal.integrated.profiles.${platformKey}`;
				const configProfiles = this._configurationService.getValue<{ [key: string]: ITerminalProfileObject }>(configKey);
				const existingProfiles = configProfiles ? Object.keys(configProfiles) : [];
				const name = await this._quickInputService.input({
					prompt: nls.localize('enterTerminalProfileName', "Enter terminal profile name"),
					value: context.item.profile.profileName,
					validateInput: async input => {
						if (existingProfiles.includes(input)) {
							return nls.localize('terminalProfileAlreadyExists', "A terminal profile already exists with that name");
						}
						return undefined;
					}
				});
				if (!name) {
					return;
				}
				const newConfigValue: { [key: string]: ITerminalProfileObject } = { ...configProfiles } ?? {};
				newConfigValue[name] = {
					path: context.item.profile.path,
					args: context.item.profile.args
				};
				await this._configurationService.updateValue(configKey, newConfigValue, ConfigurationTarget.USER);
			},
			onKeyMods: mods => keyMods = mods
		};

		// Build quick pick items
		const quickPickItems: (IProfileQuickPickItem | IQuickPickSeparator)[] = [];
		const configProfiles = profiles.filter(e => !e.isAutoDetected);
		const autoDetectedProfiles = profiles.filter(e => e.isAutoDetected);
		if (configProfiles.length > 0) {
			quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles', "profiles") });
			quickPickItems.push(...configProfiles.map(e => this._createProfileQuickPickItem(e)));
		}
		// Add contributed profiles, these cannot be defaults
		if (type === 'createInstance') {
			quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles.contributed', "contributed") });
			for (const contributed of this._terminalContributionService.terminalTypes) {
				const icon = contributed.icon ? (iconRegistry.get(contributed.icon) || Codicon.terminal) : Codicon.terminal;
				quickPickItems.push({
					label: `$(${icon.id}) ${contributed.title}`,
					profile: contributed
				});
			}
		}
		if (autoDetectedProfiles.length > 0) {
			quickPickItems.push({ type: 'separator', label: nls.localize('terminalProfiles.detected', "detected") });
			quickPickItems.push(...autoDetectedProfiles.map(e => this._createProfileQuickPickItem(e)));
		}

		const value = await this._quickInputService.pick(quickPickItems, options);
		if (!value) {
			return;
		}
		if (type === 'createInstance') {
			// TODO: How to support alt here?
			if ('command' in value.profile) {
				return this._commandService.executeCommand(value.profile.command);
			}

			let instance;
			const activeInstance = this.getActiveInstance();
			if (keyMods?.alt && activeInstance) {
				// create split, only valid if there's an active instance
				if (activeInstance) {
					instance = this.splitInstance(activeInstance, value.profile);
				}
			} else {
				instance = this.createTerminal(value.profile);
			}
			if (instance) {
				this.showPanel(true);
				this.setActiveInstance(instance);
			}
		} else { // setDefault
			if ('command' in value.profile) {
				return; // Should never happen
			}
			// Add the profile to settings if necessary
			if (value.profile.isAutoDetected) {
				const profilesConfig = await this._configurationService.getValue(`terminal.integrated.profiles.${platformKey}`);
				if (typeof profilesConfig === 'object') {
					const newProfile: ITerminalProfileObject = {
						path: value.profile.path
					};
					if (value.profile.args) {
						newProfile.args = value.profile.args;
					}
					(profilesConfig as { [key: string]: ITerminalProfileObject })[value.profile.profileName] = newProfile;
				}
				await this._configurationService.updateValue(`terminal.integrated.profiles.${platformKey}`, profilesConfig, ConfigurationTarget.USER);
			}
			// Set the default profile
			await this._configurationService.updateValue(`terminal.integrated.defaultProfile.${platformKey}`, value.profile.profileName, ConfigurationTarget.USER);
		}
	}

	private _createProfileQuickPickItem(profile: ITerminalProfile): IProfileQuickPickItem {
		const buttons: IQuickInputButton[] = [{
			iconClass: ThemeIcon.asClassName(configureTerminalProfileIcon),
			tooltip: nls.localize('createQuickLaunchProfile', "Configure Terminal Profile")
		}];
		const icon = profile.icon ? (iconRegistry.get(profile.icon) || Codicon.terminal) : Codicon.terminal;
		const label = `$(${icon.id}) ${profile.profileName}`;
		if (profile.args) {
			if (typeof profile.args === 'string') {
				return { label, description: `${profile.path} ${profile.args}`, profile, buttons };
			}
			const argsString = profile.args.map(e => {
				if (e.includes(' ')) {
					return `"${e.replace('/"/g', '\\"')}"`;
				}
				return e;
			}).join(' ');
			return { label, description: `${profile.path} ${argsString}`, profile, buttons };
		}
		return { label, description: profile.path, profile, buttons };
	}

	public createInstance(container: HTMLElement | undefined, shellLaunchConfig: IShellLaunchConfig): ITerminalInstance {
		const instance = this._instantiationService.createInstance(TerminalInstance,
			this._terminalFocusContextKey,
			this._terminalShellTypeContextKey,
			this._terminalAltBufferActiveContextKey,
			this._configHelper,
			container,
			shellLaunchConfig
		);
		this._onInstanceCreated.fire(instance);
		return instance;
	}

	private _convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile?: IShellLaunchConfig | ITerminalProfile, cwd?: string | URI): IShellLaunchConfig {
		// Profile was provided
		if (shellLaunchConfigOrProfile && 'profileName' in shellLaunchConfigOrProfile) {
			const profile = shellLaunchConfigOrProfile;
			return {
				executable: profile.path,
				args: profile.args,
				env: profile.env,
				icon: profile.icon,
				name: profile.overrideName ? profile.profileName : undefined,
				cwd
			};
		}

		// Shell launch config was provided
		if (shellLaunchConfigOrProfile) {
			return shellLaunchConfigOrProfile;
		}

		// Return empty shell launch config
		return {};
	}

	public createTerminal(shellLaunchConfig?: IShellLaunchConfig): ITerminalInstance;
	public createTerminal(profile: ITerminalProfile): ITerminalInstance;
	public createTerminal(shellLaunchConfigOrProfile: IShellLaunchConfig | ITerminalProfile): ITerminalInstance {
		const shellLaunchConfig = this._convertProfileToShellLaunchConfig(shellLaunchConfigOrProfile);

		if (!shellLaunchConfig.customPtyImplementation && !this.isProcessSupportRegistered) {
			throw new Error('Could not create terminal when process support is not registered');
		}
		if (shellLaunchConfig.hideFromUser) {
			const instance = this.createInstance(undefined, shellLaunchConfig);
			this._backgroundedTerminalInstances.push(instance);
			this._initInstanceListeners(instance);
			return instance;
		}

		const terminalTab = this._instantiationService.createInstance(TerminalTab, this._terminalContainer, shellLaunchConfig);
		this._terminalTabs.push(terminalTab);
		terminalTab.onPanelMovedToSide(() => this._onPanelMovedToSide.fire());

		const instance = terminalTab.terminalInstances[0];

		terminalTab.addDisposable(terminalTab.onDisposed(this._onTabDisposed.fire, this._onTabDisposed));
		terminalTab.addDisposable(terminalTab.onInstancesChanged(this._onInstancesChanged.fire, this._onInstancesChanged));
		this._initInstanceListeners(instance);
		this._onInstancesChanged.fire();
		if (this.terminalInstances.length === 1) {
			// It's the first instance so it should be made active automatically, this must fire
			// after onInstancesChanged so consumers can react to the instance being added first
			this.setActiveInstanceByIndex(0);
		}
		return instance;
	}

	protected _showBackgroundTerminal(instance: ITerminalInstance): void {
		this._backgroundedTerminalInstances.splice(this._backgroundedTerminalInstances.indexOf(instance), 1);
		instance.shellLaunchConfig.hideFromUser = false;
		const terminalTab = this._instantiationService.createInstance(TerminalTab, this._terminalContainer, instance);
		this._terminalTabs.push(terminalTab);
		terminalTab.addDisposable(terminalTab.onDisposed(this._onTabDisposed.fire, this._onTabDisposed));
		terminalTab.addDisposable(terminalTab.onInstancesChanged(this._onInstancesChanged.fire, this._onInstancesChanged));
		if (this.terminalInstances.length === 1) {
			// It's the first instance so it should be made active automatically
			this.setActiveInstanceByIndex(0);
		}
		this._onInstancesChanged.fire();
	}

	public async focusFindWidget(): Promise<void> {
		await this.showPanel(false);
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		pane?.terminalTabbedView?.focusFindWidget();
	}

	public hideFindWidget(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		pane?.terminalTabbedView?.hideFindWidget();
	}

	public findNext(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		if (pane?.terminalTabbedView) {
			pane.terminalTabbedView.showFindWidget();
			pane.terminalTabbedView.getFindWidget().find(false);
		}
	}

	public findPrevious(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		if (pane?.terminalTabbedView) {
			pane.terminalTabbedView.showFindWidget();
			pane.terminalTabbedView.getFindWidget().find(true);
		}
	}

	public async setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): Promise<void> {
		this._configHelper.panelContainer = panelContainer;
		this._terminalContainer = terminalContainer;
		this._terminalTabs.forEach(tab => tab.attachToElement(terminalContainer));
	}

	public hidePanel(): void {
		// Hide the panel if the terminal is in the panel and it has no sibling views
		const location = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
		if (location === ViewContainerLocation.Panel) {
			const panel = this._viewDescriptorService.getViewContainerByViewId(TERMINAL_VIEW_ID);
			if (panel && this._viewDescriptorService.getViewContainerModel(panel).activeViewDescriptors.length === 1) {
				this._layoutService.setPanelHidden(true);
			}
		}
	}
}

interface IProfileQuickPickItem extends IQuickPickItem {
	profile: ITerminalProfile | ITerminalTypeContribution;
}
