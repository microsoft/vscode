/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Event, Emitter } from 'vs/base/common/event';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig, ITerminalConfigHelper, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE, TERMINAL_PANEL_ID, ITerminalTab, ITerminalProcessExtHostProxy, ISpawnExtHostProcessRequest, KEYBINDING_CONTEXT_TERMINAL_IS_OPEN, ITerminalNativeService, IShellDefinition, IAvailableShellsRequest, IStartExtensionTerminalRequest } from 'vs/workbench/contrib/terminal/common/terminal';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { URI } from 'vs/base/common/uri';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { escapeNonWindowsPath } from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { isWindows, isMacintosh, OperatingSystem } from 'vs/base/common/platform';
import { basename } from 'vs/base/common/path';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IOpenFileRequest } from 'vs/platform/windows/common/windows';
import { IPickOptions, IQuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';

interface IExtHostReadyEntry {
	promise: Promise<void>;
	resolve: () => void;
}

export abstract class TerminalService implements ITerminalService {
	public _serviceBrand: any;

	protected _isShuttingDown: boolean;
	protected _terminalFocusContextKey: IContextKey<boolean>;
	protected _findWidgetVisible: IContextKey<boolean>;
	protected _terminalContainer: HTMLElement | undefined;
	protected _terminalTabs: ITerminalTab[] = [];
	protected _backgroundedTerminalInstances: ITerminalInstance[] = [];
	protected get _terminalInstances(): ITerminalInstance[] {
		return this._terminalTabs.reduce((p, c) => p.concat(c.terminalInstances), <ITerminalInstance[]>[]);
	}
	private _findState: FindReplaceState;
	private _extHostsReady: { [authority: string]: IExtHostReadyEntry | undefined } = {};
	private _activeTabIndex: number;

	public get activeTabIndex(): number { return this._activeTabIndex; }
	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }
	public get terminalTabs(): ITerminalTab[] { return this._terminalTabs; }

	protected readonly _onActiveTabChanged = new Emitter<void>();
	public get onActiveTabChanged(): Event<void> { return this._onActiveTabChanged.event; }
	protected readonly _onInstanceCreated = new Emitter<ITerminalInstance>();
	public get onInstanceCreated(): Event<ITerminalInstance> { return this._onInstanceCreated.event; }
	protected readonly _onInstanceDisposed = new Emitter<ITerminalInstance>();
	public get onInstanceDisposed(): Event<ITerminalInstance> { return this._onInstanceDisposed.event; }
	protected readonly _onInstanceProcessIdReady = new Emitter<ITerminalInstance>();
	public get onInstanceProcessIdReady(): Event<ITerminalInstance> { return this._onInstanceProcessIdReady.event; }
	protected readonly _onInstanceRequestSpawnExtHostProcess = new Emitter<ISpawnExtHostProcessRequest>();
	public get onInstanceRequestSpawnExtHostProcess(): Event<ISpawnExtHostProcessRequest> { return this._onInstanceRequestSpawnExtHostProcess.event; }
	protected readonly _onInstanceRequestStartExtensionTerminal = new Emitter<IStartExtensionTerminalRequest>();
	public get onInstanceRequestStartExtensionTerminal(): Event<IStartExtensionTerminalRequest> { return this._onInstanceRequestStartExtensionTerminal.event; }
	protected readonly _onInstanceDimensionsChanged = new Emitter<ITerminalInstance>();
	public get onInstanceDimensionsChanged(): Event<ITerminalInstance> { return this._onInstanceDimensionsChanged.event; }
	protected readonly _onInstanceMaximumDimensionsChanged = new Emitter<ITerminalInstance>();
	public get onInstanceMaximumDimensionsChanged(): Event<ITerminalInstance> { return this._onInstanceMaximumDimensionsChanged.event; }
	protected readonly _onInstancesChanged = new Emitter<void>();
	public get onInstancesChanged(): Event<void> { return this._onInstancesChanged.event; }
	protected readonly _onInstanceTitleChanged = new Emitter<ITerminalInstance>();
	public get onInstanceTitleChanged(): Event<ITerminalInstance> { return this._onInstanceTitleChanged.event; }
	protected readonly _onActiveInstanceChanged = new Emitter<ITerminalInstance | undefined>();
	public get onActiveInstanceChanged(): Event<ITerminalInstance | undefined> { return this._onActiveInstanceChanged.event; }
	protected readonly _onTabDisposed = new Emitter<ITerminalTab>();
	public get onTabDisposed(): Event<ITerminalTab> { return this._onTabDisposed.event; }
	protected readonly _onRequestAvailableShells = new Emitter<IAvailableShellsRequest>();
	public get onRequestAvailableShells(): Event<IAvailableShellsRequest> { return this._onRequestAvailableShells.event; }

	public abstract get configHelper(): ITerminalConfigHelper;

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IPanelService protected readonly _panelService: IPanelService,
		@ILifecycleService readonly lifecycleService: ILifecycleService,
		@IStorageService protected readonly _storageService: IStorageService,
		@INotificationService protected readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IFileService protected readonly _fileService: IFileService,
		@IRemoteAgentService readonly _remoteAgentService: IRemoteAgentService,
		@ITerminalNativeService private readonly _terminalNativeService: ITerminalNativeService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		this._activeTabIndex = 0;
		this._isShuttingDown = false;
		this._findState = new FindReplaceState();
		lifecycleService.onBeforeShutdown(event => event.veto(this._onBeforeShutdown()));
		lifecycleService.onShutdown(() => this._onShutdown());
		this._terminalNativeService.onOpenFileRequest(e => this._onOpenFileRequest(e));
		this._terminalNativeService.onOsResume(() => this._onOsResume());
		this._terminalFocusContextKey = KEYBINDING_CONTEXT_TERMINAL_FOCUS.bindTo(this._contextKeyService);
		this._findWidgetVisible = KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE.bindTo(this._contextKeyService);
		this.onTabDisposed(tab => this._removeTab(tab));
		this.onActiveTabChanged(() => {
			const instance = this.getActiveInstance();
			this._onActiveInstanceChanged.fire(instance ? instance : undefined);
		});

		this._handleContextKeys();
	}

	private _handleContextKeys(): void {
		const terminalIsOpenContext = KEYBINDING_CONTEXT_TERMINAL_IS_OPEN.bindTo(this._contextKeyService);

		const updateTerminalContextKeys = () => {
			terminalIsOpenContext.set(this.terminalInstances.length > 0);
		};

		this.onInstancesChanged(() => updateTerminalContextKeys());
	}

	protected abstract _showBackgroundTerminal(instance: ITerminalInstance): void;

	public abstract createTerminal(shell?: IShellLaunchConfig, wasNewTerminalAction?: boolean): ITerminalInstance;
	public abstract createInstance(container: HTMLElement, shellLaunchConfig: IShellLaunchConfig): ITerminalInstance;
	public abstract setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void;

	public getActiveOrCreateInstance(wasNewTerminalAction?: boolean): ITerminalInstance {
		const activeInstance = this.getActiveInstance();
		return activeInstance ? activeInstance : this.createTerminal(undefined, wasNewTerminalAction);
	}

	public requestSpawnExtHostProcess(proxy: ITerminalProcessExtHostProxy, shellLaunchConfig: IShellLaunchConfig, activeWorkspaceRootUri: URI, cols: number, rows: number, isWorkspaceShellAllowed: boolean): void {
		this._extensionService.whenInstalledExtensionsRegistered().then(async () => {
			// Wait for the remoteAuthority to be ready (and listening for events) before firing
			// the event to spawn the ext host process
			const conn = this._remoteAgentService.getConnection();
			const remoteAuthority = conn ? conn.remoteAuthority : 'null';
			await this._whenExtHostReady(remoteAuthority);
			this._onInstanceRequestSpawnExtHostProcess.fire({ proxy, shellLaunchConfig, activeWorkspaceRootUri, cols, rows, isWorkspaceShellAllowed });
		});
	}

	public requestStartExtensionTerminal(proxy: ITerminalProcessExtHostProxy, cols: number, rows: number): void {
		this._onInstanceRequestStartExtensionTerminal.fire({ proxy, cols, rows });
	}

	public async extHostReady(remoteAuthority: string): Promise<void> {
		this._createExtHostReadyEntry(remoteAuthority);
		this._extHostsReady[remoteAuthority]!.resolve();
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

	private _onBeforeShutdown(): boolean | Promise<boolean> {
		if (this.terminalInstances.length === 0) {
			// No terminal instances, don't veto
			return false;
		}

		if (this.configHelper.config.confirmOnExit) {
			// veto if configured to show confirmation and the user choosed not to exit
			return this._showTerminalCloseConfirmation().then(veto => {
				if (!veto) {
					this._isShuttingDown = true;
				}
				return veto;
			});
		}

		this._isShuttingDown = true;

		return false;
	}

	private _onShutdown(): void {
		// Dispose of all instances
		this.terminalInstances.forEach(instance => instance.dispose(true));
	}

	private _onOpenFileRequest(request: IOpenFileRequest): void {
		// if the request to open files is coming in from the integrated terminal (identified though
		// the termProgram variable) and we are instructed to wait for editors close, wait for the
		// marker file to get deleted and then focus back to the integrated terminal.
		if (request.termProgram === 'vscode' && request.filesToWait) {
			const waitMarkerFileUri = URI.revive(request.filesToWait.waitMarkerFileUri);
			this._terminalNativeService.whenFileDeleted(waitMarkerFileUri).then(() => {
				if (this.terminalInstances.length > 0) {
					const terminal = this.getActiveInstance();
					if (terminal) {
						terminal.focus();
					}
				}
			});
		}
	}

	private _onOsResume(): void {
		const activeTab = this.getActiveTab();
		if (!activeTab) {
			return;
		}
		activeTab.terminalInstances.forEach(instance => instance.forceRedraw());
	}

	public getTabLabels(): string[] {
		return this._terminalTabs.filter(tab => tab.terminalInstances.length > 0).map((tab, index) => `${index + 1}: ${tab.title ? tab.title : ''}`);
	}

	public getFindState(): FindReplaceState {
		return this._findState;
	}

	private _removeTab(tab: ITerminalTab): void {
		// Get the index of the tab and remove it from the list
		const index = this._terminalTabs.indexOf(tab);
		const wasActiveTab = tab === this.getActiveTab();
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

	public getInstanceFromId(terminalId: number): ITerminalInstance | undefined {
		let bgIndex = -1;
		this._backgroundedTerminalInstances.forEach((terminalInstance, i) => {
			if (terminalInstance.id === terminalId) {
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
		this.setActiveInstanceByIndex(this._getIndexFromId(terminalInstance.id));
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

	public splitInstance(instanceToSplit: ITerminalInstance, shellLaunchConfig: IShellLaunchConfig = {}): ITerminalInstance | null {
		const tab = this._getTabForInstance(instanceToSplit);
		if (!tab) {
			return null;
		}

		const instance = tab.split(this._terminalFocusContextKey, this.configHelper, shellLaunchConfig);
		if (!instance) {
			this._showNotEnoughSpaceToast();
			return null;
		}

		this._initInstanceListeners(instance);
		this._onInstancesChanged.fire();

		this._terminalTabs.forEach((t, i) => t.setVisible(i === this._activeTabIndex));
		return instance;
	}

	protected _initInstanceListeners(instance: ITerminalInstance): void {
		instance.addDisposable(instance.onDisposed(this._onInstanceDisposed.fire, this._onInstanceDisposed));
		instance.addDisposable(instance.onTitleChanged(this._onInstanceTitleChanged.fire, this._onInstanceTitleChanged));
		instance.addDisposable(instance.onProcessIdReady(this._onInstanceProcessIdReady.fire, this._onInstanceProcessIdReady));
		instance.addDisposable(instance.onDimensionsChanged(() => this._onInstanceDimensionsChanged.fire(instance)));
		instance.addDisposable(instance.onMaximumDimensionsChanged(() => this._onInstanceMaximumDimensionsChanged.fire(instance)));
		instance.addDisposable(instance.onFocus(this._onActiveInstanceChanged.fire, this._onActiveInstanceChanged));
	}

	private _getTabForInstance(instance: ITerminalInstance): ITerminalTab | null {
		for (const tab of this._terminalTabs) {
			if (tab.terminalInstances.indexOf(instance) !== -1) {
				return tab;
			}
		}
		return null;
	}

	public showPanel(focus?: boolean): Promise<void> {
		return new Promise<void>((complete) => {
			const panel = this._panelService.getActivePanel();
			if (!panel || panel.getId() !== TERMINAL_PANEL_ID) {
				this._panelService.openPanel(TERMINAL_PANEL_ID, focus);
				if (focus) {
					// Do the focus call asynchronously as going through the
					// command palette will force editor focus
					setTimeout(() => {
						const instance = this.getActiveInstance();
						if (instance) {
							instance.focusWhenReady(true).then(() => complete(undefined));
						} else {
							complete(undefined);
						}
					}, 0);
				} else {
					complete(undefined);
				}
			} else {
				if (focus) {
					// Do the focus call asynchronously as going through the
					// command palette will force editor focus
					setTimeout(() => {
						const instance = this.getActiveInstance();
						if (instance) {
							instance.focusWhenReady(true).then(() => complete(undefined));
						} else {
							complete(undefined);
						}
					}, 0);
				} else {
					complete(undefined);
				}
			}
			return undefined;
		});
	}

	public abstract hidePanel(): void;

	public abstract focusFindWidget(): Promise<void>;
	public abstract hideFindWidget(): void;

	public abstract findNext(): void;
	public abstract findPrevious(): void;

	private _getIndexFromId(terminalId: number): number {
		let terminalIndex = -1;
		this.terminalInstances.forEach((terminalInstance, i) => {
			if (terminalInstance.id === terminalId) {
				terminalIndex = i;
			}
		});
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	public async manageWorkspaceShellPermissions(): Promise<void> {
		const allowItem: IQuickPickItem = { label: nls.localize('workbench.action.terminal.allowWorkspaceShell', "Allow Workspace Shell Configuration") };
		const disallowItem: IQuickPickItem = { label: nls.localize('workbench.action.terminal.disallowWorkspaceShell', "Disallow Workspace Shell Configuration") };
		const value = await this._quickInputService.pick([allowItem, disallowItem], { canPickMany: false });
		if (!value) {
			return;
		}
		this.configHelper.setWorkspaceShellAllowed(value === allowItem);
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

	protected _showNotEnoughSpaceToast(): void {
		this._notificationService.info(nls.localize('terminal.minWidth', "Not enough space to split terminal."));
	}

	protected _validateShellPaths(label: string, potentialPaths: string[]): Promise<[string, string] | null> {
		if (potentialPaths.length === 0) {
			return Promise.resolve(null);
		}
		const current = potentialPaths.shift();
		if (current! === '') {
			return this._validateShellPaths(label, potentialPaths);
		}
		return this._fileService.exists(URI.file(current!)).then(exists => {
			if (!exists) {
				return this._validateShellPaths(label, potentialPaths);
			}
			return [label, current] as [string, string];
		});
	}

	public preparePathForTerminalAsync(originalPath: string, executable: string, title: string): Promise<string> {
		return new Promise<string>(c => {
			if (!executable) {
				c(originalPath);
				return;
			}

			const hasSpace = originalPath.indexOf(' ') !== -1;

			const pathBasename = basename(executable, '.exe');
			const isPowerShell = pathBasename === 'pwsh' ||
				title === 'pwsh' ||
				pathBasename === 'powershell' ||
				title === 'powershell';

			if (isPowerShell && (hasSpace || originalPath.indexOf('\'') !== -1)) {
				c(`& '${originalPath.replace(/'/g, '\'\'')}'`);
				return;
			}

			if (isWindows) {
				// 17063 is the build number where wsl path was introduced.
				// Update Windows uriPath to be executed in WSL.
				const lowerExecutable = executable.toLowerCase();
				if (this._terminalNativeService.getWindowsBuildNumber() >= 17063 &&
					(lowerExecutable.indexOf('wsl') !== -1 || (lowerExecutable.indexOf('bash.exe') !== -1 && lowerExecutable.toLowerCase().indexOf('git') === -1))) {
					c(this._terminalNativeService.getWslPath(originalPath));
					return;
				} else if (hasSpace) {
					c('"' + originalPath + '"');
				} else {
					c(originalPath);
				}
				return;
			}
			c(escapeNonWindowsPath(originalPath));
		});
	}

	public selectDefaultWindowsShell(): Promise<void> {
		return this._detectWindowsShells().then(shells => {
			const options: IPickOptions<IQuickPickItem> = {
				placeHolder: nls.localize('terminal.integrated.chooseWindowsShell', "Select your preferred terminal shell, you can change this later in your settings")
			};
			const quickPickItems = shells.map(s => {
				return { label: s.label, description: s.path };
			});
			return this._quickInputService.pick(quickPickItems, options).then(async value => {
				if (!value) {
					return undefined;
				}
				const shell = value.description;
				const env = await this._remoteAgentService.getEnvironment();
				let platformKey: string;
				if (env) {
					platformKey = env.os === OperatingSystem.Windows ? 'windows' : (env.os === OperatingSystem.Macintosh ? 'osx' : 'linux');
				} else {
					platformKey = isWindows ? 'windows' : (isMacintosh ? 'osx' : 'linux');
				}
				await this._configurationService.updateValue(`terminal.integrated.shell.${platformKey}`, shell, ConfigurationTarget.USER).then(() => shell);
				return Promise.resolve();
			});
		});
	}

	private _detectWindowsShells(): Promise<IShellDefinition[]> {
		return new Promise(r => this._onRequestAvailableShells.fire(r));
	}
}
