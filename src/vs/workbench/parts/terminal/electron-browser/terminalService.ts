/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as pfs from 'vs/base/node/pfs';
import * as platform from 'vs/base/common/platform';
import product from 'vs/platform/node/product';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IQuickOpenService, IPickOpenEntry, IPickOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { ITerminalInstance, ITerminalService, IShellLaunchConfig, ITerminalConfigHelper, NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY } from 'vs/workbench/parts/terminal/common/terminal';
import { TerminalService as AbstractTerminalService } from 'vs/workbench/parts/terminal/common/terminalService';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import { TPromise } from 'vs/base/common/winjs.base';
import { IChoiceService } from "vs/platform/message/common/message";
import { Severity } from "vs/editor/common/standalone/standaloneBase";
import { IStorageService, StorageScope } from "vs/platform/storage/common/storage";
import { TERMINAL_DEFAULT_SHELL_WINDOWS } from "vs/workbench/parts/terminal/electron-browser/terminal";

export class TerminalService extends AbstractTerminalService implements ITerminalService {
	private _configHelper: TerminalConfigHelper;

	public get configHelper(): ITerminalConfigHelper { return this._configHelper; };

	constructor(
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IPanelService _panelService: IPanelService,
		@IPartService _partService: IPartService,
		@ILifecycleService _lifecycleService: ILifecycleService,
		@IInstantiationService private _instantiationService: IInstantiationService,
		@IWindowIPCService private _windowService: IWindowIPCService,
		@IQuickOpenService private _quickOpenService: IQuickOpenService,
		@IConfigurationEditingService private _configurationEditingService: IConfigurationEditingService,
		@IChoiceService private _choiceService: IChoiceService,
		@IStorageService private _storageService: IStorageService
	) {
		super(_contextKeyService, _configurationService, _panelService, _partService, _lifecycleService);

		this._configHelper = this._instantiationService.createInstance(TerminalConfigHelper, platform.platform);
	}

	public createInstance(shell: IShellLaunchConfig = {}, wasNewTerminalAction?: boolean): ITerminalInstance {
		let terminalInstance = this._instantiationService.createInstance(TerminalInstance,
			this._terminalFocusContextKey,
			this._configHelper,
			this._terminalContainer,
			shell);
		terminalInstance.addDisposable(terminalInstance.onTitleChanged(this._onInstanceTitleChanged.fire, this._onInstanceTitleChanged));
		terminalInstance.addDisposable(terminalInstance.onDisposed(this._onInstanceDisposed.fire, this._onInstanceDisposed));
		terminalInstance.addDisposable(terminalInstance.onDataForApi(this._onInstanceData.fire, this._onInstanceData));
		terminalInstance.addDisposable(terminalInstance.onProcessIdReady(this._onInstanceProcessIdReady.fire, this._onInstanceProcessIdReady));
		this.terminalInstances.push(terminalInstance);
		if (this.terminalInstances.length === 1) {
			// It's the first instance so it should be made active automatically
			this.setActiveInstanceByIndex(0);
		}
		this._onInstancesChanged.fire();
		this._suggestShellChange(wasNewTerminalAction);
		return terminalInstance;
	}

	private _suggestShellChange(wasNewTerminalAction?: boolean): void {
		// Only suggest on Windows since $SHELL works great for macOS/Linux
		if (!platform.isWindows) {
			return;
		}

		// Only suggest when the terminal instance is being created by an explicit user action to
		// launch a terminal, as opposed to something like tasks, debug, panel restore, etc.
		if (!wasNewTerminalAction) {
			return;
		}

		// Don't suggest if the user has explicitly opted out
		const neverSuggest = this._storageService.getBoolean(NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY, StorageScope.GLOBAL, false);
		if (neverSuggest) {
			return;
		}

		// Never suggest if the setting is non-default already (ie. they set the setting manually)
		if (this._configHelper.config.shell.windows !== TERMINAL_DEFAULT_SHELL_WINDOWS) {
			this._storageService.store(NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY, true);
			return;
		}

		const message = nls.localize('terminal.integrated.chooseWindowsShellInfo', "You can change the default terminal shell by selecting the customize button.");
		const options = [nls.localize('customize', "Customize"), nls.localize('cancel', "Cancel"), nls.localize('never again', "OK, Never Show Again")];
		this._choiceService.choose(Severity.Info, message, options).then(choice => {
			switch (choice) {
				case 0:
					return this.selectDefaultWindowsShell().then(shell => {
						if (!shell) {
							return TPromise.as(null);
						}
						// Launch a new instance with the newly selected shell
						const instance = this.createInstance({
							executable: shell,
							args: this._configHelper.config.shellArgs.windows
						});
						if (instance) {
							this.setActiveInstance(instance);
						}
						return TPromise.as(null);
					});
				case 1:
					return TPromise.as(null);
				case 2:
					this._storageService.store(NEVER_SUGGEST_SELECT_WINDOWS_SHELL_STORAGE_KEY, true);
				default:
					return TPromise.as(null);
			}
		});
	}

	public selectDefaultWindowsShell(): TPromise<string> {
		return this._detectWindowsShells().then(shells => {
			const options: IPickOptions = {
				placeHolder: nls.localize('terminal.integrated.chooseWindowsShell', "Select your preferred terminal shell, you can change this later in your settings")
			};
			return this._quickOpenService.pick(shells, options).then(value => {
				if (!value) {
					return null;
				}
				const shell = value.description;
				const configChange = { key: 'terminal.integrated.shell.windows', value: shell };
				return this._configurationEditingService.writeConfiguration(ConfigurationTarget.USER, configChange).then(() => shell);
			});
		});
	}

	private _detectWindowsShells(): TPromise<IPickOpenEntry[]> {
		const windir = process.env['windir'];
		const expectedLocations = {
			'Command Prompt': [
				`${windir}\\Sysnative\\cmd.exe`,
				`${windir}\\System32\\cmd.exe`
			],
			PowerShell: [
				`${windir}\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe`,
				`${windir}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
			],
			'WSL Bash': [`${windir}\\Sysnative\\bash.exe`],
			'Git Bash': [
				`${process.env['ProgramW6432']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramW6432']}\\Git\\usr\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\usr\\bin\\bash.exe`,
			]
		};
		const promises: TPromise<[string, string]>[] = [];
		Object.keys(expectedLocations).forEach(key => promises.push(this._validateShellPaths(key, expectedLocations[key])));
		return TPromise.join(promises).then(results => {
			return results.filter(result => !!result).map(result => {
				return <IPickOpenEntry>{
					label: result[0],
					description: result[1]
				};
			});
		});
	}

	private _validateShellPaths(label: string, potentialPaths: string[]): TPromise<[string, string]> {
		const current = potentialPaths.shift();
		return pfs.fileExists(current).then(exists => {
			if (!exists) {
				if (potentialPaths.length === 0) {
					return null;
				}
				return this._validateShellPaths(label, potentialPaths);
			}
			return [label, current];
		});
	}

	public getActiveOrCreateInstance(wasNewTerminalAction?: boolean): ITerminalInstance {
		const activeInstance = this.getActiveInstance();
		return activeInstance ? activeInstance : this.createInstance(undefined, wasNewTerminalAction);
	}

	protected _showTerminalCloseConfirmation(): boolean {
		const cancelId = 1;
		let message;
		if (this.terminalInstances.length === 1) {
			message = nls.localize('terminalService.terminalCloseConfirmationSingular', "There is an active terminal session, do you want to kill it?");
		} else {
			message = nls.localize('terminalService.terminalCloseConfirmationPlural', "There are {0} active terminal sessions, do you want to kill them?", this.terminalInstances.length);
		}
		const opts: Electron.ShowMessageBoxOptions = {
			title: product.nameLong,
			message,
			type: 'warning',
			buttons: [nls.localize('yes', "Yes"), nls.localize('cancel', "Cancel")],
			noLink: true,
			cancelId
		};
		return this._windowService.getWindow().showMessageBox(opts) === cancelId;
	}

	public setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void {
		this._configHelper.panelContainer = panelContainer;
		this._terminalContainer = terminalContainer;
		this._terminalInstances.forEach(terminalInstance => {
			terminalInstance.attachToElement(this._terminalContainer);
		});
	}
}
