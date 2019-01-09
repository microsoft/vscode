/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as pfs from 'vs/base/node/pfs';
import * as platform from 'vs/base/common/platform';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ITerminalInstance, ITerminalService, IShellLaunchConfig, ITerminalConfigHelper, NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY, TERMINAL_PANEL_ID, ITerminalProcessExtHostProxy } from 'vs/workbench/parts/terminal/common/terminal';
import { TerminalService as AbstractTerminalService } from 'vs/workbench/parts/terminal/common/terminalService';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import Severity from 'vs/base/common/severity';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { getDefaultShell } from 'vs/workbench/parts/terminal/node/terminal';
import { TerminalPanel } from 'vs/workbench/parts/terminal/electron-browser/terminalPanel';
import { TerminalTab } from 'vs/workbench/parts/terminal/browser/terminalTab';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ipcRenderer as ipc } from 'electron';
import { IOpenFileRequest, IWindowService } from 'vs/platform/windows/common/windows';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { IQuickInputService, IQuickPickItem, IPickOptions } from 'vs/platform/quickinput/common/quickInput';
import { coalesce } from 'vs/base/common/arrays';

export class TerminalService extends AbstractTerminalService implements ITerminalService {
	private _configHelper: TerminalConfigHelper;
	public get configHelper(): ITerminalConfigHelper { return this._configHelper; }

	protected _terminalTabs: TerminalTab[];
	protected get _terminalInstances(): ITerminalInstance[] {
		return this._terminalTabs.reduce((p, c) => p.concat(c.terminalInstances), <ITerminalInstance[]>[]);
	}

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IWindowService private readonly _windowService: IWindowService,
	) {
		super(contextKeyService, panelService, partService, lifecycleService, storageService);

		this._terminalTabs = [];
		this._configHelper = this._instantiationService.createInstance(TerminalConfigHelper);
		ipc.on('vscode:openFiles', (_event: any, request: IOpenFileRequest) => {
			// if the request to open files is coming in from the integrated terminal (identified though
			// the termProgram variable) and we are instructed to wait for editors close, wait for the
			// marker file to get deleted and then focus back to the integrated terminal.
			if (request.termProgram === 'vscode' && request.filesToWait) {
				pfs.whenDeleted(request.filesToWait.waitMarkerFilePath).then(() => {
					if (this.terminalInstances.length > 0) {
						this.getActiveInstance().focus();
					}
				});
			}
		});
		ipc.on('vscode:osResume', () => {
			const activeTab = this.getActiveTab();
			if (!activeTab) {
				return;
			}
			activeTab.terminalInstances.forEach(instance => instance.forceRedraw());
		});
	}

	public createTerminal(shell: IShellLaunchConfig = {}, wasNewTerminalAction?: boolean): ITerminalInstance {
		const terminalTab = this._instantiationService.createInstance(TerminalTab,
			this._terminalFocusContextKey,
			this._configHelper,
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

	public createTerminalRenderer(name: string): ITerminalInstance {
		return this.createTerminal({ name, isRendererOnly: true });
	}

	public createInstance(terminalFocusContextKey: IContextKey<boolean>, configHelper: ITerminalConfigHelper, container: HTMLElement | undefined, shellLaunchConfig: IShellLaunchConfig, doCreateProcess: boolean): ITerminalInstance {
		const instance = this._instantiationService.createInstance(TerminalInstance, terminalFocusContextKey, configHelper, container, shellLaunchConfig);
		this._onInstanceCreated.fire(instance);
		return instance;
	}

	public requestExtHostProcess(proxy: ITerminalProcessExtHostProxy, shellLaunchConfig: IShellLaunchConfig, activeWorkspaceRootUri: URI, cols: number, rows: number): void {
		// Ensure extension host is ready before requesting a process
		this._extensionService.whenInstalledExtensionsRegistered().then(() => {
			// TODO: MainThreadTerminalService is not ready at this point, fix this
			setTimeout(() => {
				this._onInstanceRequestExtHostProcess.fire({ proxy, shellLaunchConfig, activeWorkspaceRootUri, cols, rows });
			}, 500);
		});
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
		if (this._configHelper.config.shell.windows !== getDefaultShell(platform.Platform.Windows)) {
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
							args: this._configHelper.config.shellArgs.windows
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

	public selectDefaultWindowsShell(): Promise<string> {
		return this._detectWindowsShells().then(shells => {
			const options: IPickOptions<IQuickPickItem> = {
				placeHolder: nls.localize('terminal.integrated.chooseWindowsShell', "Select your preferred terminal shell, you can change this later in your settings")
			};
			return this._quickInputService.pick(shells, options).then(value => {
				if (!value) {
					return null;
				}
				const shell = value.description;
				return this._configurationService.updateValue('terminal.integrated.shell.windows', shell, ConfigurationTarget.USER).then(() => shell);
			});
		});
	}

	private _detectWindowsShells(): Promise<IQuickPickItem[]> {
		// Determine the correct System32 path. We want to point to Sysnative
		// when the 32-bit version of VS Code is running on a 64-bit machine.
		// The reason for this is because PowerShell's important PSReadline
		// module doesn't work if this is not the case. See #27915.
		const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		const system32Path = `${process.env['windir']}\\${is32ProcessOn64Windows ? 'Sysnative' : 'System32'}`;

		let useWSLexe = false;

		if (TerminalInstance.getWindowsBuildNumber() >= 16299) {
			useWSLexe = true;
		}

		const expectedLocations = {
			'Command Prompt': [`${system32Path}\\cmd.exe`],
			PowerShell: [`${system32Path}\\WindowsPowerShell\\v1.0\\powershell.exe`],
			'WSL Bash': [`${system32Path}\\${useWSLexe ? 'wsl.exe' : 'bash.exe'}`],
			'Git Bash': [
				`${process.env['ProgramW6432']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramW6432']}\\Git\\usr\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\usr\\bin\\bash.exe`,
				`${process.env['LocalAppData']}\\Programs\\Git\\bin\\bash.exe`,
			]
		};
		const promises: PromiseLike<[string, string]>[] = [];
		Object.keys(expectedLocations).forEach(key => promises.push(this._validateShellPaths(key, expectedLocations[key])));
		return Promise.all(promises)
			.then(coalesce)
			.then(results => {
				return results.map(result => {
					return <IQuickPickItem>{
						label: result[0],
						description: result[1]
					};
				});
			});
	}

	private _validateShellPaths(label: string, potentialPaths: string[]): Promise<[string, string]> {
		const current = potentialPaths.shift();
		return pfs.fileExists(current).then(exists => {
			if (!exists) {
				if (potentialPaths.length === 0) {
					return null;
				}
				return this._validateShellPaths(label, potentialPaths);
			}
			return [label, current] as [string, string];
		});
	}

	public getActiveOrCreateInstance(wasNewTerminalAction?: boolean): ITerminalInstance {
		const activeInstance = this.getActiveInstance();
		return activeInstance ? activeInstance : this.createTerminal(undefined, wasNewTerminalAction);
	}

	protected _showTerminalCloseConfirmation(): Promise<boolean> {
		let message;
		if (this.terminalInstances.length === 1) {
			message = nls.localize('terminalService.terminalCloseConfirmationSingular', "There is an active terminal session, do you want to kill it?");
		} else {
			message = nls.localize('terminalService.terminalCloseConfirmationPlural', "There are {0} active terminal sessions, do you want to kill them?", this.terminalInstances.length);
		}

		return this._dialogService.confirm({
			message,
			type: 'warning',
		}).then(res => !res.confirmed);
	}

	protected _showNotEnoughSpaceToast(): void {
		this._notificationService.info(nls.localize('terminal.minWidth', "Not enough space to split terminal."));
	}

	public setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void {
		this._configHelper.panelContainer = panelContainer;
		this._terminalContainer = terminalContainer;
		this._terminalTabs.forEach(tab => tab.attachToElement(this._terminalContainer));
	}
}
