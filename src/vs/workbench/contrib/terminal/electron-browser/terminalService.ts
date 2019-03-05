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
import { ITerminalInstance, ITerminalService, IShellLaunchConfig, ITerminalConfigHelper } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalService as BrowserTerminalService } from 'vs/workbench/contrib/terminal/browser/terminalService';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { getDefaultShell, linuxDistro, getWindowsBuildNumber, getWslPath } from 'vs/workbench/contrib/terminal/node/terminal';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ipcRenderer as ipc } from 'electron';
import { IOpenFileRequest, IWindowService } from 'vs/platform/windows/common/windows';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IQuickInputService, IQuickPickItem, IPickOptions } from 'vs/platform/quickinput/common/quickInput';
import { coalesce } from 'vs/base/common/arrays';
import { IFileService } from 'vs/platform/files/common/files';
import { escapeNonWindowsPath } from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { basename } from 'vs/base/common/path';

export class TerminalService extends BrowserTerminalService implements ITerminalService {
	private _configHelper: TerminalConfigHelper;
	public get configHelper(): ITerminalConfigHelper { return this._configHelper; }

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@INotificationService notificationService: INotificationService,
		@IDialogService dialogService: IDialogService,
		@IExtensionService extensionService: IExtensionService,
		@IWindowService windowService: IWindowService,
		@IFileService fileService: IFileService
	) {
		super(contextKeyService, panelService, partService, lifecycleService, storageService, notificationService, dialogService, instantiationService, windowService, extensionService, fileService);

		this._configHelper = this._instantiationService.createInstance(TerminalConfigHelper, linuxDistro);
		ipc.on('vscode:openFiles', (_event: any, request: IOpenFileRequest) => {
			// if the request to open files is coming in from the integrated terminal (identified though
			// the termProgram variable) and we are instructed to wait for editors close, wait for the
			// marker file to get deleted and then focus back to the integrated terminal.
			if (request.termProgram === 'vscode' && request.filesToWait) {
				pfs.whenDeleted(request.filesToWait.waitMarkerFilePath).then(() => {
					if (this.terminalInstances.length > 0) {
						const terminal = this.getActiveInstance();
						if (terminal) {
							terminal.focus();
						}
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

	public createInstance(terminalFocusContextKey: IContextKey<boolean>, configHelper: ITerminalConfigHelper, container: HTMLElement | undefined, shellLaunchConfig: IShellLaunchConfig, doCreateProcess: boolean): ITerminalInstance {
		const instance = this._instantiationService.createInstance(TerminalInstance, terminalFocusContextKey, configHelper, container, shellLaunchConfig);
		this._onInstanceCreated.fire(instance);
		return instance;
	}

	protected _getDefaultShell(p: platform.Platform): string {
		return getDefaultShell(p);
	}

	public selectDefaultWindowsShell(): Promise<string | undefined> {
		return this._detectWindowsShells().then(shells => {
			const options: IPickOptions<IQuickPickItem> = {
				placeHolder: nls.localize('terminal.integrated.chooseWindowsShell', "Select your preferred terminal shell, you can change this later in your settings")
			};
			return this._quickInputService.pick(shells, options).then(value => {
				if (!value) {
					return undefined;
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

		if (getWindowsBuildNumber() >= 16299) {
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

	public setContainers(panelContainer: HTMLElement, terminalContainer: HTMLElement): void {
		this._configHelper.panelContainer = panelContainer;
		this._terminalContainer = terminalContainer;
		this._terminalTabs.forEach(tab => tab.attachToElement(this._terminalContainer));
	}

	public preparePathForTerminalAsync(originalPath: string, executable: string, title: string): Promise<string> {
		return new Promise<string>(c => {
			const exe = executable;
			if (!exe) {
				c(originalPath);
				return;
			}

			const hasSpace = originalPath.indexOf(' ') !== -1;

			const pathBasename = basename(exe, '.exe');
			const isPowerShell = pathBasename === 'pwsh' ||
				title === 'pwsh' ||
				pathBasename === 'powershell' ||
				title === 'powershell';

			if (isPowerShell && (hasSpace || originalPath.indexOf('\'') !== -1)) {
				c(`& '${originalPath.replace(/'/g, '\'\'')}'`);
				return;
			}

			if (platform.isWindows) {
				// 17063 is the build number where wsl path was introduced.
				// Update Windows uriPath to be executed in WSL.
				if (((exe.indexOf('wsl') !== -1) || ((exe.indexOf('bash.exe') !== -1) && (exe.indexOf('git') === -1))) && (getWindowsBuildNumber() >= 17063)) {
					c(getWslPath(originalPath));
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
}
