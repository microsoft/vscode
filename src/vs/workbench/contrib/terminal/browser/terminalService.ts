/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { ITerminalService, TERMINAL_PANEL_ID, ITerminalInstance, IShellLaunchConfig, NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY, ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalService as CommonTerminalService } from 'vs/workbench/contrib/terminal/common/terminalService';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { TerminalPanel } from 'vs/workbench/contrib/terminal/browser/terminalPanel';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { TerminalTab } from 'vs/workbench/contrib/terminal/browser/terminalTab';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IBrowserTerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminal';

export abstract class TerminalService extends CommonTerminalService implements ITerminalService {
	protected _configHelper: IBrowserTerminalConfigHelper;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IPanelService panelService: IPanelService,
		@IWorkbenchLayoutService private _layoutService: IWorkbenchLayoutService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IDialogService dialogService: IDialogService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IWindowService private _windowService: IWindowService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
	) {
		super(contextKeyService, panelService, lifecycleService, storageService, notificationService, dialogService, extensionService, fileService);
	}

	protected abstract _getDefaultShell(p: platform.Platform): string;

	public createInstance(terminalFocusContextKey: IContextKey<boolean>, configHelper: ITerminalConfigHelper, container: HTMLElement | undefined, shellLaunchConfig: IShellLaunchConfig, doCreateProcess: boolean): ITerminalInstance {
		const instance = this._instantiationService.createInstance(TerminalInstance, terminalFocusContextKey, configHelper, container, shellLaunchConfig);
		this._onInstanceCreated.fire(instance);
		return instance;
	}

	public createTerminal(shell: IShellLaunchConfig = {}, wasNewTerminalAction?: boolean): ITerminalInstance {
		const terminalTab = this._instantiationService.createInstance(TerminalTab,
			this._terminalFocusContextKey,
			this.configHelper,
			this._terminalContainer,
			shell);
		this._terminalTabs.push(terminalTab);
		const instance = terminalTab.terminalInstances[0];
		terminalTab.addDisposable(terminalTab.onDisposed(this._onTabDisposed.fire, this._onTabDisposed));
		terminalTab.addDisposable(terminalTab.onInstancesChanged(this._onInstancesChanged.fire, this._onInstancesChanged));
		this._initInstanceListeners(instance);
		if (this.terminalInstances.length === 1) {
			// It's the first instance so it should be made active automatically
			this.setActiveInstanceByIndex(0);
		}
		this._onInstancesChanged.fire();
		this._suggestShellChange(wasNewTerminalAction);
		return instance;
	}

	private _suggestShellChange(wasNewTerminalAction?: boolean): void {
		// Only suggest on Windows since $SHELL works great for macOS/Linux
		if (!platform.isWindows) {
			return;
		}

		if (this._windowService.getConfiguration().remoteAuthority) {
			// Don't suggest if the opened workspace is remote
			return;
		}

		// Only suggest when the terminal instance is being created by an explicit user action to
		// launch a terminal, as opposed to something like tasks, debug, panel restore, etc.
		if (!wasNewTerminalAction) {
			return;
		}

		if (this._windowService.getConfiguration().remoteAuthority) {
			// Don't suggest if the opened workspace is remote
			return;
		}

		// Don't suggest if the user has explicitly opted out
		const neverSuggest = this._storageService.getBoolean(NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY, StorageScope.GLOBAL, false);
		if (neverSuggest) {
			return;
		}

		// Never suggest if the setting is non-default already (ie. they set the setting manually)
		if (this.configHelper.config.shell.windows !== this._getDefaultShell(platform.Platform.Windows)) {
			this._storageService.store(NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY, true, StorageScope.GLOBAL);
			return;
		}

		this._notificationService.prompt(
			Severity.Info,
			nls.localize('terminal.integrated.chooseWindowsShellInfo', "You can change the default terminal shell by selecting the customize button."),
			[{
				label: nls.localize('customize', "Customize"),
				run: () => {
					this.selectDefaultWindowsShell().then(shell => {
						if (!shell) {
							return Promise.resolve(null);
						}
						// Launch a new instance with the newly selected shell
						const instance = this.createTerminal({
							executable: shell,
							args: this.configHelper.config.shellArgs.windows
						});
						if (instance) {
							this.setActiveInstance(instance);
						}
						return Promise.resolve(null);
					});
				}
			},
			{
				label: nls.localize('never again', "Don't Show Again"),
				isSecondary: true,
				run: () => this._storageService.store(NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY, true, StorageScope.GLOBAL)
			}]
		);
	}

	public focusFindWidget(): Promise<void> {
		return this.showPanel(false).then(() => {
			const panel = this._panelService.getActivePanel() as TerminalPanel;
			panel.focusFindWidget();
			this._findWidgetVisible.set(true);
		});
	}

	public hideFindWidget(): void {
		const panel = this._panelService.getActivePanel() as TerminalPanel;
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			panel.hideFindWidget();
			this._findWidgetVisible.reset();
			panel.focus();
		}
	}

	public findNext(): void {
		const panel = this._panelService.getActivePanel() as TerminalPanel;
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			panel.showFindWidget();
			panel.getFindWidget().find(false);
		}
	}

	public findPrevious(): void {
		const panel = this._panelService.getActivePanel() as TerminalPanel;
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			panel.showFindWidget();
			panel.getFindWidget().find(true);
		}
	}

	public setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void {
		this._configHelper.panelContainer = panelContainer;
		this._terminalContainer = terminalContainer;
		this._terminalTabs.forEach(tab => tab.attachToElement(this._terminalContainer));
	}

	public hidePanel(): void {
		const panel = this._panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this._layoutService.setPanelHidden(true);
		}
	}
}