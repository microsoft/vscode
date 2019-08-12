/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalService, TERMINAL_PANEL_ID, ITerminalInstance, IShellLaunchConfig, ITerminalConfigHelper, ITerminalNativeService } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalService as CommonTerminalService } from 'vs/workbench/contrib/terminal/common/terminalService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TerminalPanel } from 'vs/workbench/contrib/terminal/browser/terminalPanel';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TerminalTab } from 'vs/workbench/contrib/terminal/browser/terminalTab';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IBrowserTerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class TerminalService extends CommonTerminalService implements ITerminalService {
	private _configHelper: IBrowserTerminalConfigHelper;

	public get configHelper(): ITerminalConfigHelper { return this._configHelper; }

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IPanelService panelService: IPanelService,
		@IWorkbenchLayoutService private _layoutService: IWorkbenchLayoutService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IDialogService dialogService: IDialogService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IExtensionService extensionService: IExtensionService,
		@IFileService fileService: IFileService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ITerminalNativeService readonly terminalNativeService: ITerminalNativeService,
		@IQuickInputService readonly quickInputService: IQuickInputService,
		@IConfigurationService readonly configurationService: IConfigurationService
	) {
		super(contextKeyService, panelService, lifecycleService, storageService, notificationService, dialogService, extensionService, fileService, remoteAgentService, terminalNativeService, quickInputService, configurationService);
		this._configHelper = this._instantiationService.createInstance(TerminalConfigHelper, this.terminalNativeService.linuxDistro);
	}

	public createInstance(container: HTMLElement | undefined, shellLaunchConfig: IShellLaunchConfig): ITerminalInstance {
		const instance = this._instantiationService.createInstance(TerminalInstance, this._terminalFocusContextKey, this._configHelper, container, shellLaunchConfig);
		this._onInstanceCreated.fire(instance);
		return instance;
	}

	public createTerminal(shell: IShellLaunchConfig = {}): ITerminalInstance {
		if (shell.hideFromUser) {
			const instance = this.createInstance(undefined, shell);
			this._backgroundedTerminalInstances.push(instance);
			this._initInstanceListeners(instance);
			return instance;
		}
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
		return instance;
	}

	protected _showBackgroundTerminal(instance: ITerminalInstance): void {
		this._backgroundedTerminalInstances.splice(this._backgroundedTerminalInstances.indexOf(instance), 1);
		instance.shellLaunchConfig.hideFromUser = false;
		const terminalTab = this._instantiationService.createInstance(TerminalTab,
			this._terminalFocusContextKey,
			this.configHelper,
			this._terminalContainer,
			instance);
		this._terminalTabs.push(terminalTab);
		terminalTab.addDisposable(terminalTab.onDisposed(this._onTabDisposed.fire, this._onTabDisposed));
		terminalTab.addDisposable(terminalTab.onInstancesChanged(this._onInstancesChanged.fire, this._onInstancesChanged));
		if (this.terminalInstances.length === 1) {
			// It's the first instance so it should be made active automatically
			this.setActiveInstanceByIndex(0);
		}
		this._onInstancesChanged.fire();
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
		this._terminalTabs.forEach(tab => tab.attachToElement(terminalContainer));
	}

	public hidePanel(): void {
		const panel = this._panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this._layoutService.setPanelHidden(true);
		}
	}
}
