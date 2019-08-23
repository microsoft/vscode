/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogService } from 'vs/platform/log/common/log';
import { IURLService } from 'vs/platform/url/common/url';
import { IProcessEnvironment, isMacintosh } from 'vs/base/common/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { OpenContext, IWindowSettings } from 'vs/platform/windows/common/windows';
import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { whenDeleted } from 'vs/base/node/pfs';
import { IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { BrowserWindow, ipcMain, Event as IpcEvent, app } from 'electron';
import { Event } from 'vs/base/common/event';
import { hasArgs } from 'vs/platform/environment/node/argv';
import { coalesce } from 'vs/base/common/arrays';
import { IDiagnosticInfoOptions, IDiagnosticInfo, IRemoteDiagnosticInfo, IRemoteDiagnosticError } from 'vs/platform/diagnostics/common/diagnostics';
import { IMainProcessInfo, IWindowInfo } from 'vs/platform/launch/common/launchService';

export const ID = 'launchService';
export const ILaunchService = createDecorator<ILaunchService>(ID);

export interface IStartArguments {
	args: ParsedArgs;
	userEnv: IProcessEnvironment;
}

export interface IRemoteDiagnosticOptions {
	includeProcesses?: boolean;
	includeWorkspaceMetadata?: boolean;
}

function parseOpenUrl(args: ParsedArgs): URI[] {
	if (args['open-url'] && args._urls && args._urls.length > 0) {
		// --open-url must contain -- followed by the url(s)
		// process.argv is used over args._ as args._ are resolved to file paths at this point
		return coalesce(args._urls
			.map(url => {
				try {
					return URI.parse(url);
				} catch (err) {
					return null;
				}
			}));
	}

	return [];
}

export interface ILaunchService {
	_serviceBrand: any;
	start(args: ParsedArgs, userEnv: IProcessEnvironment): Promise<void>;
	getMainProcessId(): Promise<number>;
	getMainProcessInfo(): Promise<IMainProcessInfo>;
	getLogsPath(): Promise<string>;
	getRemoteDiagnostics(options: IRemoteDiagnosticOptions): Promise<(IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]>;
}

export class LaunchChannel implements IServerChannel {

	constructor(private service: ILaunchService) { }

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg: any): Promise<any> {
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

			case 'get-remote-diagnostics':
				return this.service.getRemoteDiagnostics(arg);
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class LaunchChannelClient implements ILaunchService {

	_serviceBrand!: ServiceIdentifier<ILaunchService>;

	constructor(private channel: IChannel) { }

	start(args: ParsedArgs, userEnv: IProcessEnvironment): Promise<void> {
		return this.channel.call('start', { args, userEnv });
	}

	getMainProcessId(): Promise<number> {
		return this.channel.call('get-main-process-id', null);
	}

	getMainProcessInfo(): Promise<IMainProcessInfo> {
		return this.channel.call('get-main-process-info', null);
	}

	getLogsPath(): Promise<string> {
		return this.channel.call('get-logs-path', null);
	}

	getRemoteDiagnostics(options: IRemoteDiagnosticOptions): Promise<IRemoteDiagnosticInfo[]> {
		return this.channel.call('get-remote-diagnostics', options);
	}
}

export class LaunchService implements ILaunchService {

	_serviceBrand!: ServiceIdentifier<ILaunchService>;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IURLService private readonly urlService: IURLService,
		@IWorkspacesMainService private readonly workspacesMainService: IWorkspacesMainService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) { }

	start(args: ParsedArgs, userEnv: IProcessEnvironment): Promise<void> {
		this.logService.trace('Received data from other instance: ', args, userEnv);

		const urlsToOpen = parseOpenUrl(args);

		// Check early for open-url which is handled in URL service
		if (urlsToOpen.length) {
			let whenWindowReady: Promise<any> = Promise.resolve<any>(null);

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

			return Promise.resolve(undefined);
		}

		// Otherwise handle in windows service
		return this.startOpenWindow(args, userEnv);
	}

	private startOpenWindow(args: ParsedArgs, userEnv: IProcessEnvironment): Promise<void> {
		const context = !!userEnv['VSCODE_CLI'] ? OpenContext.CLI : OpenContext.DESKTOP;
		let usedWindows: ICodeWindow[] = [];

		const waitMarkerFileURI = args.wait && args.waitMarkerFilePath ? URI.file(args.waitMarkerFilePath) : undefined;

		// Special case extension development
		if (!!args.extensionDevelopmentPath) {
			this.windowsMainService.openExtensionDevelopmentHostWindow(args.extensionDevelopmentPath, { context, cli: args, userEnv, waitMarkerFileURI });
		}

		// Start without file/folder arguments
		else if (!hasArgs(args._) && !hasArgs(args['folder-uri']) && !hasArgs(args['file-uri'])) {
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
				usedWindows = this.windowsMainService.open({
					context,
					cli: args,
					userEnv,
					forceNewWindow: true,
					forceEmpty: true,
					waitMarkerFileURI
				});
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
				addMode: args.add,
				noRecentEntry: !!args['skip-add-to-recently-opened'],
				waitMarkerFileURI,
				gotoLineMode: args.goto
			});
		}

		// If the other instance is waiting to be killed, we hook up a window listener if one window
		// is being used and only then resolve the startup promise which will kill this second instance.
		// In addition, we poll for the wait marker file to be deleted to return.
		if (waitMarkerFileURI && usedWindows.length === 1 && usedWindows[0]) {
			return Promise.race([
				this.windowsMainService.waitForWindowCloseOrLoad(usedWindows[0].id),
				whenDeleted(waitMarkerFileURI.fsPath)
			]).then(() => undefined, () => undefined);
		}

		return Promise.resolve(undefined);
	}

	getMainProcessId(): Promise<number> {
		this.logService.trace('Received request for process ID from other instance.');

		return Promise.resolve(process.pid);
	}

	getMainProcessInfo(): Promise<IMainProcessInfo> {
		this.logService.trace('Received request for main process info from other instance.');

		const windows: IWindowInfo[] = [];
		BrowserWindow.getAllWindows().forEach(window => {
			const codeWindow = this.windowsMainService.getWindowById(window.id);
			if (codeWindow) {
				windows.push(this.codeWindowToInfo(codeWindow));
			} else {
				windows.push(this.browserWindowToInfo(window));
			}
		});

		return Promise.resolve({
			mainPID: process.pid,
			mainArguments: process.argv.slice(1),
			windows,
			screenReader: app.isAccessibilitySupportEnabled(),
			gpuFeatureStatus: app.getGPUFeatureStatus()
		});
	}

	getLogsPath(): Promise<string> {
		this.logService.trace('Received request for logs path from other instance.');

		return Promise.resolve(this.environmentService.logsPath);
	}

	getRemoteDiagnostics(options: IRemoteDiagnosticOptions): Promise<(IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]> {
		const windows = this.windowsMainService.getWindows();
		const promises: Promise<IDiagnosticInfo | IRemoteDiagnosticError | undefined>[] = windows.map(window => {
			return new Promise((resolve, reject) => {
				if (window.remoteAuthority) {
					const replyChannel = `vscode:getDiagnosticInfoResponse${window.id}`;
					const args: IDiagnosticInfoOptions = {
						includeProcesses: options.includeProcesses,
						folders: options.includeWorkspaceMetadata ? this.getFolderURIs(window) : undefined
					};

					window.sendWhenReady('vscode:getDiagnosticInfo', { replyChannel, args });

					ipcMain.once(replyChannel, (_: IpcEvent, data: IRemoteDiagnosticInfo) => {
						// No data is returned if getting the connection fails.
						if (!data) {
							resolve({ hostName: window.remoteAuthority!, errorMessage: `Unable to resolve connection to '${window.remoteAuthority}'.` });
						}

						resolve(data);
					});

					setTimeout(() => {
						resolve({ hostName: window.remoteAuthority!, errorMessage: `Fetching remote diagnostics for '${window.remoteAuthority}' timed out.` });
					}, 5000);
				} else {
					resolve();
				}
			});
		});

		return Promise.all(promises).then(diagnostics => diagnostics.filter((x): x is IRemoteDiagnosticInfo | IRemoteDiagnosticError => !!x));
	}

	private getFolderURIs(window: ICodeWindow): URI[] {
		const folderURIs: URI[] = [];

		if (window.openedFolderUri) {
			folderURIs.push(window.openedFolderUri);
		} else if (window.openedWorkspace) {
			// workspace folders can only be shown for local workspaces
			const workspaceConfigPath = window.openedWorkspace.configPath;
			const resolvedWorkspace = this.workspacesMainService.resolveLocalWorkspaceSync(workspaceConfigPath);
			if (resolvedWorkspace) {
				const rootFolders = resolvedWorkspace.folders;
				rootFolders.forEach(root => {
					folderURIs.push(root.uri);
				});
			} else {
				//TODO: can we add the workspace file here?
			}
		}

		return folderURIs;
	}

	private codeWindowToInfo(window: ICodeWindow): IWindowInfo {
		const folderURIs = this.getFolderURIs(window);
		return this.browserWindowToInfo(window.win, folderURIs, window.remoteAuthority);
	}

	private browserWindowToInfo(win: BrowserWindow, folderURIs: URI[] = [], remoteAuthority?: string): IWindowInfo {
		return {
			pid: win.webContents.getOSProcessId(),
			title: win.getTitle(),
			folderURIs,
			remoteAuthority
		};
	}
}
