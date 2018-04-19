/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogService } from 'vs/platform/log/common/log';
import { IURLService } from 'vs/platform/url/common/url';
import { IProcessEnvironment, isMacintosh } from 'vs/base/common/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { OpenContext, IWindowSettings } from 'vs/platform/windows/common/windows';
import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { whenDeleted } from 'vs/base/node/pfs';
import { IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import URI from 'vs/base/common/uri';

export const ID = 'launchService';
export const ILaunchService = createDecorator<ILaunchService>(ID);

export interface IStartArguments {
	args: ParsedArgs;
	userEnv: IProcessEnvironment;
}

export interface IWindowInfo {
	pid: number;
	title: string;
	folders: string[];
}

export interface IMainProcessInfo {
	mainPID: number;
	mainArguments: string[];
	windows: IWindowInfo[];
}

function parseOpenUrl(args: ParsedArgs): URI[] {
	if (args['open-url'] && args._urls && args._urls.length > 0) {
		// --open-url must contain -- followed by the url(s)
		// process.argv is used over args._ as args._ are resolved to file paths at this point
		return args._urls
			.map(url => {
				try {
					return URI.parse(url);
				} catch (err) {
					return null;
				}
			})
			.filter(uri => !!uri);
	}

	return [];
}

export interface ILaunchService {
	_serviceBrand: any;
	start(args: ParsedArgs, userEnv: IProcessEnvironment): TPromise<void>;
	getMainProcessId(): TPromise<number>;
	getMainProcessInfo(): TPromise<IMainProcessInfo>;
	getLogsPath(): TPromise<string>;
}

export interface ILaunchChannel extends IChannel {
	call(command: 'start', arg: IStartArguments): TPromise<void>;
	call(command: 'get-main-process-id', arg: null): TPromise<any>;
	call(command: 'get-main-process-info', arg: null): TPromise<any>;
	call(command: 'get-logs-path', arg: null): TPromise<string>;
	call(command: string, arg: any): TPromise<any>;
}

export class LaunchChannel implements ILaunchChannel {

	constructor(private service: ILaunchService) { }

	public call(command: string, arg: any): TPromise<any> {
		switch (command) {
			case 'start':
				const { args, userEnv } = arg as IStartArguments;
				return this.service.start(args, userEnv);

			case 'get-main-process-id':
				return this.service.getMainProcessId();

			case 'get-main-process-info':
				return this.service.getMainProcessInfo();

			case 'get-logs-path':
				return this.service.getLogsPath();
		}

		return undefined;
	}
}

export class LaunchChannelClient implements ILaunchService {

	_serviceBrand: any;

	constructor(private channel: ILaunchChannel) { }

	public start(args: ParsedArgs, userEnv: IProcessEnvironment): TPromise<void> {
		return this.channel.call('start', { args, userEnv });
	}

	public getMainProcessId(): TPromise<number> {
		return this.channel.call('get-main-process-id', null);
	}

	public getMainProcessInfo(): TPromise<IMainProcessInfo> {
		return this.channel.call('get-main-process-info', null);
	}

	public getLogsPath(): TPromise<string> {
		return this.channel.call('get-logs-path', null);
	}
}

export class LaunchService implements ILaunchService {

	_serviceBrand: any;

	constructor(
		@ILogService private logService: ILogService,
		@IWindowsMainService private windowsMainService: IWindowsMainService,
		@IURLService private urlService: IURLService,
		@IWorkspacesMainService private workspacesMainService: IWorkspacesMainService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) { }

	public start(args: ParsedArgs, userEnv: IProcessEnvironment): TPromise<void> {
		this.logService.trace('Received data from other instance: ', args, userEnv);

		const urlsToOpen = parseOpenUrl(args);

		// Check early for open-url which is handled in URL service
		if (urlsToOpen.length) {
			let whenWindowReady = TPromise.as<any>(null);

			// Create a window if there is none
			if (this.windowsMainService.getWindowCount() === 0) {
				const window = this.windowsMainService.openNewWindow(OpenContext.DESKTOP)[0];
				whenWindowReady = window.ready();
			}

			// Make sure a window is open, ready to receive the url event
			whenWindowReady.then(() => {
				for (const url of urlsToOpen) {
					this.urlService.open(url);
				}
			});

			return TPromise.as(null);
		}

		// Otherwise handle in windows service
		return this.startOpenWindow(args, userEnv);
	}

	private startOpenWindow(args: ParsedArgs, userEnv: IProcessEnvironment): TPromise<void> {
		const context = !!userEnv['VSCODE_CLI'] ? OpenContext.CLI : OpenContext.DESKTOP;
		let usedWindows: ICodeWindow[];

		// Special case extension development
		if (!!args.extensionDevelopmentPath) {
			this.windowsMainService.openExtensionDevelopmentHostWindow({ context, cli: args, userEnv });
		}

		// Start without file/folder arguments
		else if (args._.length === 0) {
			let openNewWindow = false;

			// Force new window
			if (args['new-window'] || args['unity-launch']) {
				openNewWindow = true;
			}

			// Force reuse window
			else if (args['reuse-window']) {
				openNewWindow = false;
			}

			// Otherwise check for settings
			else {
				const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
				const openWithoutArgumentsInNewWindowConfig = (windowConfig && windowConfig.openWithoutArgumentsInNewWindow) || 'default' /* default */;
				switch (openWithoutArgumentsInNewWindowConfig) {
					case 'on':
						openNewWindow = true;
						break;
					case 'off':
						openNewWindow = false;
						break;
					default:
						openNewWindow = !isMacintosh; // prefer to restore running instance on macOS
				}
			}

			if (openNewWindow) {
				usedWindows = this.windowsMainService.open({ context, cli: args, userEnv, forceNewWindow: true, forceEmpty: true });
			} else {
				usedWindows = [this.windowsMainService.focusLastActive(args, context)];
			}
		}

		// Start with file/folder arguments
		else {
			usedWindows = this.windowsMainService.open({
				context,
				cli: args,
				userEnv,
				forceNewWindow: args['new-window'],
				preferNewWindow: !args['reuse-window'] && !args.wait,
				forceReuseWindow: args['reuse-window'],
				diffMode: args.diff,
				addMode: args.add
			});
		}

		// If the other instance is waiting to be killed, we hook up a window listener if one window
		// is being used and only then resolve the startup promise which will kill this second instance.
		// In addition, we poll for the wait marker file to be deleted to return.
		if (args.wait && usedWindows.length === 1 && usedWindows[0]) {
			return TPromise.any([
				this.windowsMainService.waitForWindowCloseOrLoad(usedWindows[0].id),
				whenDeleted(args.waitMarkerFilePath)
			]).then(() => void 0, () => void 0);
		}

		return TPromise.as(null);
	}

	public getMainProcessId(): TPromise<number> {
		this.logService.trace('Received request for process ID from other instance.');

		return TPromise.as(process.pid);
	}

	public getMainProcessInfo(): TPromise<IMainProcessInfo> {
		this.logService.trace('Received request for main process info from other instance.');

		return TPromise.wrap({
			mainPID: process.pid,
			mainArguments: process.argv,
			windows: this.windowsMainService.getWindows().map(window => {
				return this.getWindowInfo(window);
			})
		} as IMainProcessInfo);
	}

	public getLogsPath(): TPromise<string> {
		this.logService.trace('Received request for logs path from other instance.');

		return TPromise.as(this.environmentService.logsPath);
	}

	private getWindowInfo(window: ICodeWindow): IWindowInfo {
		const folders: string[] = [];

		if (window.openedFolderPath) {
			folders.push(window.openedFolderPath);
		} else if (window.openedWorkspace) {
			const rootFolders = this.workspacesMainService.resolveWorkspaceSync(window.openedWorkspace.configPath).folders;
			rootFolders.forEach(root => {
				if (root.uri.scheme === Schemas.file) { // todo@remote signal remote folders?
					folders.push(root.uri.fsPath);
				}
			});
		}

		return {
			pid: window.win.webContents.getOSProcessId(),
			title: window.win.getTitle(),
			folders
		} as IWindowInfo;
	}
}
