/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { exec } from 'child_process';
import { app, BrowserWindow, clipboard, Display, Menu, MessageBoxOptions, MessageBoxReturnValue, OpenDialogOptions, OpenDialogReturnValue, powerMonitor, SaveDialogOptions, SaveDialogReturnValue, screen, shell, webContents } from 'electron';
import { arch, cpus, freemem, loadavg, platform, release, totalmem, type } from 'os';
import { promisify } from 'util';
import { memoize } from '../../../base/common/decorators.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { matchesSomeScheme, Schemas } from '../../../base/common/network.js';
import { dirname, join, posix, resolve, win32 } from '../../../base/common/path.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { AddFirstParameterToFunctions } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { realpath } from '../../../base/node/extpath.js';
import { virtualMachineHint } from '../../../base/node/id.js';
import { Promises, SymlinkSupport } from '../../../base/node/pfs.js';
import { findFreePort } from '../../../base/node/ports.js';
import { localize } from '../../../nls.js';
import { ISerializableCommandAction } from '../../action/common/action.js';
import { INativeOpenDialogOptions } from '../../dialogs/common/dialogs.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { ICommonNativeHostService, INativeHostOptions, IOSProperties, IOSStatistics } from '../common/native.js';
import { IProductService } from '../../product/common/productService.js';
import { IPartsSplash } from '../../theme/common/themeService.js';
import { IThemeMainService } from '../../theme/electron-main/themeMainService.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IColorScheme, IOpenedAuxiliaryWindow, IOpenedMainWindow, IOpenEmptyWindowOptions, IOpenWindowOptions, IPoint, IRectangle, IWindowOpenable, useWindowControlsOverlay } from '../../window/common/window.js';
import { IWindowsMainService, OpenContext } from '../../windows/electron-main/windows.js';
import { isWorkspaceIdentifier, toWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IWorkspacesManagementMainService } from '../../workspaces/electron-main/workspacesManagementMainService.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { hasWSLFeatureInstalled } from '../../remote/node/wsl.js';
import { WindowProfiler } from '../../profiling/electron-main/windowProfiling.js';
import { IV8Profile } from '../../profiling/common/profiling.js';
import { IAuxiliaryWindowsMainService } from '../../auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';
import { CancellationError } from '../../../base/common/errors.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IProxyAuthService } from './auth.js';
import { AuthInfo, Credentials, IRequestService } from '../../request/common/request.js';

export interface INativeHostMainService extends AddFirstParameterToFunctions<ICommonNativeHostService, Promise<unknown> /* only methods, not events */, number | undefined /* window ID */> { }

export const INativeHostMainService = createDecorator<INativeHostMainService>('nativeHostMainService');

export class NativeHostMainService extends Disposable implements INativeHostMainService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IAuxiliaryWindowsMainService private readonly auxiliaryWindowsMainService: IAuxiliaryWindowsMainService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IThemeMainService private readonly themeMainService: IThemeMainService,
		@IWorkspacesManagementMainService private readonly workspacesManagementMainService: IWorkspacesManagementMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IProxyAuthService private readonly proxyAuthService: IProxyAuthService
	) {
		super();
	}


	//#region Properties

	get windowId(): never { throw new Error('Not implemented in electron-main'); }

	//#endregion


	//#region Events

	readonly onDidOpenMainWindow = Event.map(this.windowsMainService.onDidOpenWindow, window => window.id);

	readonly onDidTriggerWindowSystemContextMenu = Event.any(
		Event.map(this.windowsMainService.onDidTriggerSystemContextMenu, ({ window, x, y }) => ({ windowId: window.id, x, y })),
		Event.map(this.auxiliaryWindowsMainService.onDidTriggerSystemContextMenu, ({ window, x, y }) => ({ windowId: window.id, x, y }))
	);

	readonly onDidMaximizeWindow = Event.any(
		Event.map(this.windowsMainService.onDidMaximizeWindow, window => window.id),
		Event.map(this.auxiliaryWindowsMainService.onDidMaximizeWindow, window => window.id)
	);
	readonly onDidUnmaximizeWindow = Event.any(
		Event.map(this.windowsMainService.onDidUnmaximizeWindow, window => window.id),
		Event.map(this.auxiliaryWindowsMainService.onDidUnmaximizeWindow, window => window.id)
	);

	readonly onDidChangeWindowFullScreen = Event.any(
		Event.map(this.windowsMainService.onDidChangeFullScreen, e => ({ windowId: e.window.id, fullscreen: e.fullscreen })),
		Event.map(this.auxiliaryWindowsMainService.onDidChangeFullScreen, e => ({ windowId: e.window.id, fullscreen: e.fullscreen }))
	);

	readonly onDidBlurMainWindow = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-blur', (event, window: BrowserWindow) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId));
	readonly onDidFocusMainWindow = Event.any(
		Event.map(Event.filter(Event.map(this.windowsMainService.onDidChangeWindowsCount, () => this.windowsMainService.getLastActiveWindow()), window => !!window), window => window!.id),
		Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-focus', (event, window: BrowserWindow) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId))
	);

	readonly onDidBlurMainOrAuxiliaryWindow = Event.any(
		this.onDidBlurMainWindow,
		Event.map(Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-blur', (event, window: BrowserWindow) => this.auxiliaryWindowsMainService.getWindowByWebContents(window.webContents)), window => !!window), window => window!.id)
	);
	readonly onDidFocusMainOrAuxiliaryWindow = Event.any(
		this.onDidFocusMainWindow,
		Event.map(Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-focus', (event, window: BrowserWindow) => this.auxiliaryWindowsMainService.getWindowByWebContents(window.webContents)), window => !!window), window => window!.id)
	);

	readonly onDidResumeOS = Event.fromNodeEventEmitter(powerMonitor, 'resume');

	readonly onDidChangeColorScheme = this.themeMainService.onDidChangeColorScheme;

	private readonly _onDidChangePassword = this._register(new Emitter<{ account: string; service: string }>());
	readonly onDidChangePassword = this._onDidChangePassword.event;

	readonly onDidChangeDisplay = Event.debounce(Event.any(
		Event.filter(Event.fromNodeEventEmitter(screen, 'display-metrics-changed', (event: Electron.Event, display: Display, changedMetrics?: string[]) => changedMetrics), changedMetrics => {
			// Electron will emit 'display-metrics-changed' events even when actually
			// going fullscreen, because the dock hides. However, we do not want to
			// react on this event as there is no change in display bounds.
			return !(Array.isArray(changedMetrics) && changedMetrics.length === 1 && changedMetrics[0] === 'workArea');
		}),
		Event.fromNodeEventEmitter(screen, 'display-added'),
		Event.fromNodeEventEmitter(screen, 'display-removed')
	), () => { }, 100);

	//#endregion


	//#region Window

	getWindows(windowId: number | undefined, options: { includeAuxiliaryWindows: true }): Promise<Array<IOpenedMainWindow | IOpenedAuxiliaryWindow>>;
	getWindows(windowId: number | undefined, options: { includeAuxiliaryWindows: false }): Promise<Array<IOpenedMainWindow>>;
	async getWindows(windowId: number | undefined, options: { includeAuxiliaryWindows: boolean }): Promise<Array<IOpenedMainWindow | IOpenedAuxiliaryWindow>> {
		const mainWindows = this.windowsMainService.getWindows().map(window => ({
			id: window.id,
			workspace: window.openedWorkspace ?? toWorkspaceIdentifier(window.backupPath, window.isExtensionDevelopmentHost),
			title: window.win?.getTitle() ?? '',
			filename: window.getRepresentedFilename(),
			dirty: window.isDocumentEdited()
		}));

		const auxiliaryWindows = [];
		if (options.includeAuxiliaryWindows) {
			auxiliaryWindows.push(...this.auxiliaryWindowsMainService.getWindows().map(window => ({
				id: window.id,
				parentId: window.parentId,
				title: window.win?.getTitle() ?? '',
				filename: window.getRepresentedFilename()
			})));
		}

		return [...mainWindows, ...auxiliaryWindows];
	}

	async getWindowCount(windowId: number | undefined): Promise<number> {
		return this.windowsMainService.getWindowCount();
	}

	async getActiveWindowId(windowId: number | undefined): Promise<number | undefined> {
		const activeWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
		if (activeWindow) {
			return activeWindow.id;
		}

		return undefined;
	}

	async getActiveWindowPosition(): Promise<IRectangle | undefined> {
		const activeWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
		if (activeWindow) {
			return activeWindow.getBounds();
		}
		return undefined;
	}

	openWindow(windowId: number | undefined, options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(windowId: number | undefined, toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;
	openWindow(windowId: number | undefined, arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: IOpenWindowOptions): Promise<void> {
		if (Array.isArray(arg1)) {
			return this.doOpenWindow(windowId, arg1, arg2);
		}

		return this.doOpenEmptyWindow(windowId, arg1);
	}

	private async doOpenWindow(windowId: number | undefined, toOpen: IWindowOpenable[], options: IOpenWindowOptions = Object.create(null)): Promise<void> {
		if (toOpen.length > 0) {
			await this.windowsMainService.open({
				context: OpenContext.API,
				contextWindowId: windowId,
				urisToOpen: toOpen,
				cli: this.environmentMainService.args,
				forceNewWindow: options.forceNewWindow,
				forceReuseWindow: options.forceReuseWindow,
				preferNewWindow: options.preferNewWindow,
				diffMode: options.diffMode,
				mergeMode: options.mergeMode,
				addMode: options.addMode,
				gotoLineMode: options.gotoLineMode,
				noRecentEntry: options.noRecentEntry,
				waitMarkerFileURI: options.waitMarkerFileURI,
				remoteAuthority: options.remoteAuthority || undefined,
				forceProfile: options.forceProfile,
				forceTempProfile: options.forceTempProfile,
			});
		}
	}

	private async doOpenEmptyWindow(windowId: number | undefined, options?: IOpenEmptyWindowOptions): Promise<void> {
		await this.windowsMainService.openEmptyWindow({
			context: OpenContext.API,
			contextWindowId: windowId
		}, options);
	}

	async isFullScreen(windowId: number | undefined, options?: INativeHostOptions): Promise<boolean> {
		const window = this.windowById(options?.targetWindowId, windowId);
		return window?.isFullScreen ?? false;
	}

	async toggleFullScreen(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.toggleFullScreen();
	}

	async handleTitleDoubleClick(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.handleTitleDoubleClick();
	}

	async getCursorScreenPoint(windowId: number | undefined): Promise<{ readonly point: IPoint; readonly display: IRectangle }> {
		const point = screen.getCursorScreenPoint();
		const display = screen.getDisplayNearestPoint(point);

		return { point, display: display.bounds };
	}

	async isMaximized(windowId: number | undefined, options?: INativeHostOptions): Promise<boolean> {
		const window = this.windowById(options?.targetWindowId, windowId);
		return window?.win?.isMaximized() ?? false;
	}

	async maximizeWindow(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.win?.maximize();
	}

	async unmaximizeWindow(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.win?.unmaximize();
	}

	async minimizeWindow(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.win?.minimize();
	}

	async moveWindowTop(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.win?.moveTop();
	}

	async positionWindow(windowId: number | undefined, position: IRectangle, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		if (window?.win) {
			if (window.win.isFullScreen()) {
				const fullscreenLeftFuture = Event.toPromise(Event.once(Event.fromNodeEventEmitter(window.win, 'leave-full-screen')));
				window.win.setFullScreen(false);
				await fullscreenLeftFuture;
			}

			window.win.setBounds(position);
		}
	}

	async updateWindowControls(windowId: number | undefined, options: INativeHostOptions & { height?: number; backgroundColor?: string; foregroundColor?: string }): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.updateWindowControls(options);
	}

	async focusWindow(windowId: number | undefined, options?: INativeHostOptions & { force?: boolean }): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.focus({ force: options?.force ?? false });
	}

	async setMinimumSize(windowId: number | undefined, width: number | undefined, height: number | undefined): Promise<void> {
		const window = this.codeWindowById(windowId);
		if (window?.win) {
			const [windowWidth, windowHeight] = window.win.getSize();
			const [minWindowWidth, minWindowHeight] = window.win.getMinimumSize();
			const [newMinWindowWidth, newMinWindowHeight] = [width ?? minWindowWidth, height ?? minWindowHeight];
			const [newWindowWidth, newWindowHeight] = [Math.max(windowWidth, newMinWindowWidth), Math.max(windowHeight, newMinWindowHeight)];

			if (minWindowWidth !== newMinWindowWidth || minWindowHeight !== newMinWindowHeight) {
				window.win.setMinimumSize(newMinWindowWidth, newMinWindowHeight);
			}
			if (windowWidth !== newWindowWidth || windowHeight !== newWindowHeight) {
				window.win.setSize(newWindowWidth, newWindowHeight);
			}
		}
	}

	async saveWindowSplash(windowId: number | undefined, splash: IPartsSplash): Promise<void> {
		this.themeMainService.saveWindowSplash(windowId, splash);
	}

	//#endregion


	//#region macOS Shell Command

	async installShellCommand(windowId: number | undefined): Promise<void> {
		const { source, target } = await this.getShellCommandLink();

		// Only install unless already existing
		try {
			const { symbolicLink } = await SymlinkSupport.stat(source);
			if (symbolicLink && !symbolicLink.dangling) {
				const linkTargetRealPath = await realpath(source);
				if (target === linkTargetRealPath) {
					return;
				}
			}

			// Different source, delete it first
			await fs.promises.unlink(source);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error; // throw on any error but file not found
			}
		}

		try {
			await fs.promises.symlink(target, source);
		} catch (error) {
			if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
				throw error;
			}

			const { response } = await this.showMessageBox(windowId, {
				type: 'info',
				message: localize('warnEscalation', "{0} will now prompt with 'osascript' for Administrator privileges to install the shell command.", this.productService.nameShort),
				buttons: [
					localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
					localize('cancel', "Cancel")
				]
			});

			if (response === 1 /* Cancel */) {
				throw new CancellationError();
			}

			try {
				const command = `osascript -e "do shell script \\"mkdir -p /usr/local/bin && ln -sf \'${target}\' \'${source}\'\\" with administrator privileges"`;
				await promisify(exec)(command);
			} catch (error) {
				throw new Error(localize('cantCreateBinFolder', "Unable to install the shell command '{0}'.", source));
			}
		}
	}

	async uninstallShellCommand(windowId: number | undefined): Promise<void> {
		const { source } = await this.getShellCommandLink();

		try {
			await fs.promises.unlink(source);
		} catch (error) {
			switch (error.code) {
				case 'EACCES': {
					const { response } = await this.showMessageBox(windowId, {
						type: 'info',
						message: localize('warnEscalationUninstall', "{0} will now prompt with 'osascript' for Administrator privileges to uninstall the shell command.", this.productService.nameShort),
						buttons: [
							localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
							localize('cancel', "Cancel")
						]
					});

					if (response === 1 /* Cancel */) {
						throw new CancellationError();
					}

					try {
						const command = `osascript -e "do shell script \\"rm \'${source}\'\\" with administrator privileges"`;
						await promisify(exec)(command);
					} catch (error) {
						throw new Error(localize('cantUninstall', "Unable to uninstall the shell command '{0}'.", source));
					}
					break;
				}
				case 'ENOENT':
					break; // ignore file not found
				default:
					throw error;
			}
		}
	}

	private async getShellCommandLink(): Promise<{ readonly source: string; readonly target: string }> {
		const target = resolve(this.environmentMainService.appRoot, 'bin', 'code');
		const source = `/usr/local/bin/${this.productService.applicationName}`;

		// Ensure source exists
		const sourceExists = await Promises.exists(target);
		if (!sourceExists) {
			throw new Error(localize('sourceMissing', "Unable to find shell script in '{0}'", target));
		}

		return { source, target };
	}

	//#endregion

	//#region Dialog

	async showMessageBox(windowId: number | undefined, options: MessageBoxOptions & INativeHostOptions): Promise<MessageBoxReturnValue> {
		const window = this.windowById(options?.targetWindowId, windowId);
		return this.dialogMainService.showMessageBox(options, window?.win ?? undefined);
	}

	async showSaveDialog(windowId: number | undefined, options: SaveDialogOptions & INativeHostOptions): Promise<SaveDialogReturnValue> {
		const window = this.windowById(options?.targetWindowId, windowId);
		return this.dialogMainService.showSaveDialog(options, window?.win ?? undefined);
	}

	async showOpenDialog(windowId: number | undefined, options: OpenDialogOptions & INativeHostOptions): Promise<OpenDialogReturnValue> {
		const window = this.windowById(options?.targetWindowId, windowId);
		return this.dialogMainService.showOpenDialog(options, window?.win ?? undefined);
	}

	async pickFileFolderAndOpen(windowId: number | undefined, options: INativeOpenDialogOptions): Promise<void> {
		const paths = await this.dialogMainService.pickFileFolder(options);
		if (paths) {
			await this.doOpenPicked(await Promise.all(paths.map(async path => (await SymlinkSupport.existsDirectory(path)) ? { folderUri: URI.file(path) } : { fileUri: URI.file(path) })), options, windowId);
		}
	}

	async pickFolderAndOpen(windowId: number | undefined, options: INativeOpenDialogOptions): Promise<void> {
		const paths = await this.dialogMainService.pickFolder(options);
		if (paths) {
			await this.doOpenPicked(paths.map(path => ({ folderUri: URI.file(path) })), options, windowId);
		}
	}

	async pickFileAndOpen(windowId: number | undefined, options: INativeOpenDialogOptions): Promise<void> {
		const paths = await this.dialogMainService.pickFile(options);
		if (paths) {
			await this.doOpenPicked(paths.map(path => ({ fileUri: URI.file(path) })), options, windowId);
		}
	}

	async pickWorkspaceAndOpen(windowId: number | undefined, options: INativeOpenDialogOptions): Promise<void> {
		const paths = await this.dialogMainService.pickWorkspace(options);
		if (paths) {
			await this.doOpenPicked(paths.map(path => ({ workspaceUri: URI.file(path) })), options, windowId);
		}
	}

	private async doOpenPicked(openable: IWindowOpenable[], options: INativeOpenDialogOptions, windowId: number | undefined): Promise<void> {
		await this.windowsMainService.open({
			context: OpenContext.DIALOG,
			contextWindowId: windowId,
			cli: this.environmentMainService.args,
			urisToOpen: openable,
			forceNewWindow: options.forceNewWindow,
			/* remoteAuthority will be determined based on openable */
		});
	}

	//#endregion


	//#region OS

	async showItemInFolder(windowId: number | undefined, path: string): Promise<void> {
		shell.showItemInFolder(path);
	}

	async setRepresentedFilename(windowId: number | undefined, path: string, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.setRepresentedFilename(path);
	}

	async setDocumentEdited(windowId: number | undefined, edited: boolean, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		window?.setDocumentEdited(edited);
	}

	async openExternal(windowId: number | undefined, url: string, defaultApplication?: string): Promise<boolean> {
		this.environmentMainService.unsetSnapExportedVariables();
		try {
			if (matchesSomeScheme(url, Schemas.http, Schemas.https)) {
				this.openExternalBrowser(url, defaultApplication);
			} else {
				shell.openExternal(url);
			}
		} finally {
			this.environmentMainService.restoreSnapExportedVariables();
		}

		return true;
	}

	private async openExternalBrowser(url: string, defaultApplication?: string): Promise<void> {
		const configuredBrowser = defaultApplication ?? this.configurationService.getValue<string>('workbench.externalBrowser');
		if (!configuredBrowser) {
			return shell.openExternal(url);
		}

		if (configuredBrowser.includes(posix.sep) || configuredBrowser.includes(win32.sep)) {
			const browserPathExists = await Promises.exists(configuredBrowser);
			if (!browserPathExists) {
				this.logService.error(`Configured external browser path does not exist: ${configuredBrowser}`);
				return shell.openExternal(url);
			}
		}

		try {
			const { default: open } = await import('open');
			const res = await open(url, {
				app: {
					// Use `open.apps` helper to allow cross-platform browser
					// aliases to be looked up properly. Fallback to the
					// configured value if not found.
					name: Object.hasOwn(open.apps, configuredBrowser) ? open.apps[(configuredBrowser as keyof typeof open['apps'])] : configuredBrowser
				}
			});

			res.stderr?.once('data', (data: Buffer) => {
				this.logService.error(`Error openening external URL '${url}' using browser '${configuredBrowser}': ${data.toString()}`);
				return shell.openExternal(url);
			});
		} catch (error) {
			this.logService.error(`Unable to open external URL '${url}' using browser '${configuredBrowser}' due to ${error}.`);
			return shell.openExternal(url);
		}
	}

	moveItemToTrash(windowId: number | undefined, fullPath: string): Promise<void> {
		return shell.trashItem(fullPath);
	}

	async isAdmin(): Promise<boolean> {
		let isAdmin: boolean;
		if (isWindows) {
			isAdmin = (await import('native-is-elevated')).default();
		} else {
			isAdmin = process.getuid?.() === 0;
		}

		return isAdmin;
	}

	async writeElevated(windowId: number | undefined, source: URI, target: URI, options?: { unlock?: boolean }): Promise<void> {
		const sudoPrompt = await import('@vscode/sudo-prompt');

		return new Promise<void>((resolve, reject) => {
			const sudoCommand: string[] = [`"${this.cliPath}"`];
			if (options?.unlock) {
				sudoCommand.push('--file-chmod');
			}

			sudoCommand.push('--file-write', `"${source.fsPath}"`, `"${target.fsPath}"`);

			const promptOptions = {
				name: this.productService.nameLong.replace('-', ''),
				icns: (isMacintosh && this.environmentMainService.isBuilt) ? join(dirname(this.environmentMainService.appRoot), `${this.productService.nameShort}.icns`) : undefined
			};

			sudoPrompt.exec(sudoCommand.join(' '), promptOptions, (error?, stdout?, stderr?) => {
				if (stdout) {
					this.logService.trace(`[sudo-prompt] received stdout: ${stdout}`);
				}

				if (stderr) {
					this.logService.trace(`[sudo-prompt] received stderr: ${stderr}`);
				}

				if (error) {
					reject(error);
				} else {
					resolve(undefined);
				}
			});
		});
	}

	async isRunningUnderARM64Translation(): Promise<boolean> {
		if (isLinux || isWindows) {
			return false;
		}

		return app.runningUnderARM64Translation;
	}

	@memoize
	private get cliPath(): string {

		// Windows
		if (isWindows) {
			if (this.environmentMainService.isBuilt) {
				return join(dirname(process.execPath), 'bin', `${this.productService.applicationName}.cmd`);
			}

			return join(this.environmentMainService.appRoot, 'scripts', 'code-cli.bat');
		}

		// Linux
		if (isLinux) {
			if (this.environmentMainService.isBuilt) {
				return join(dirname(process.execPath), 'bin', `${this.productService.applicationName}`);
			}

			return join(this.environmentMainService.appRoot, 'scripts', 'code-cli.sh');
		}

		// macOS
		if (this.environmentMainService.isBuilt) {
			return join(this.environmentMainService.appRoot, 'bin', 'code');
		}

		return join(this.environmentMainService.appRoot, 'scripts', 'code-cli.sh');
	}

	async getOSStatistics(): Promise<IOSStatistics> {
		return {
			totalmem: totalmem(),
			freemem: freemem(),
			loadavg: loadavg()
		};
	}

	async getOSProperties(): Promise<IOSProperties> {
		return {
			arch: arch(),
			platform: platform(),
			release: release(),
			type: type(),
			cpus: cpus()
		};
	}

	async getOSVirtualMachineHint(): Promise<number> {
		return virtualMachineHint.value();
	}

	async getOSColorScheme(): Promise<IColorScheme> {
		return this.themeMainService.getColorScheme();
	}

	// WSL
	async hasWSLFeatureInstalled(): Promise<boolean> {
		return isWindows && hasWSLFeatureInstalled();
	}

	//#endregion


	//#region Process

	async getProcessId(windowId: number | undefined): Promise<number | undefined> {
		const window = this.windowById(undefined, windowId);
		return window?.win?.webContents.getOSProcessId();
	}

	async killProcess(windowId: number | undefined, pid: number, code: string): Promise<void> {
		process.kill(pid, code);
	}

	//#endregion


	//#region Clipboard

	async readClipboardText(windowId: number | undefined, type?: 'selection' | 'clipboard'): Promise<string> {
		return clipboard.readText(type);
	}

	async readImage(): Promise<Uint8Array> {
		return clipboard.readImage().toPNG();
	}

	async writeClipboardText(windowId: number | undefined, text: string, type?: 'selection' | 'clipboard'): Promise<void> {
		return clipboard.writeText(text, type);
	}

	async readClipboardFindText(windowId: number | undefined,): Promise<string> {
		return clipboard.readFindText();
	}

	async writeClipboardFindText(windowId: number | undefined, text: string): Promise<void> {
		return clipboard.writeFindText(text);
	}

	async writeClipboardBuffer(windowId: number | undefined, format: string, buffer: VSBuffer, type?: 'selection' | 'clipboard'): Promise<void> {
		return clipboard.writeBuffer(format, Buffer.from(buffer.buffer), type);
	}

	async readClipboardBuffer(windowId: number | undefined, format: string): Promise<VSBuffer> {
		return VSBuffer.wrap(clipboard.readBuffer(format));
	}

	async hasClipboard(windowId: number | undefined, format: string, type?: 'selection' | 'clipboard'): Promise<boolean> {
		return clipboard.has(format, type);
	}

	//#endregion


	//#region macOS Touchbar

	async newWindowTab(): Promise<void> {
		await this.windowsMainService.open({
			context: OpenContext.API,
			cli: this.environmentMainService.args,
			forceNewTabbedWindow: true,
			forceEmpty: true,
			remoteAuthority: this.environmentMainService.args.remote || undefined
		});
	}

	async showPreviousWindowTab(): Promise<void> {
		Menu.sendActionToFirstResponder('selectPreviousTab:');
	}

	async showNextWindowTab(): Promise<void> {
		Menu.sendActionToFirstResponder('selectNextTab:');
	}

	async moveWindowTabToNewWindow(): Promise<void> {
		Menu.sendActionToFirstResponder('moveTabToNewWindow:');
	}

	async mergeAllWindowTabs(): Promise<void> {
		Menu.sendActionToFirstResponder('mergeAllWindows:');
	}

	async toggleWindowTabsBar(): Promise<void> {
		Menu.sendActionToFirstResponder('toggleTabBar:');
	}

	async updateTouchBar(windowId: number | undefined, items: ISerializableCommandAction[][]): Promise<void> {
		const window = this.codeWindowById(windowId);
		window?.updateTouchBar(items);
	}

	//#endregion


	//#region Lifecycle

	async notifyReady(windowId: number | undefined): Promise<void> {
		const window = this.codeWindowById(windowId);
		window?.setReady();
	}

	async relaunch(windowId: number | undefined, options?: IRelaunchOptions): Promise<void> {
		return this.lifecycleMainService.relaunch(options);
	}

	async reload(windowId: number | undefined, options?: { disableExtensions?: boolean }): Promise<void> {
		const window = this.codeWindowById(windowId);
		if (window) {

			// Special case: support `transient` workspaces by preventing
			// the reload and rather go back to an empty window. Transient
			// workspaces should never restore, even when the user wants
			// to reload.
			// For: https://github.com/microsoft/vscode/issues/119695
			if (isWorkspaceIdentifier(window.openedWorkspace)) {
				const configPath = window.openedWorkspace.configPath;
				if (configPath.scheme === Schemas.file) {
					const workspace = await this.workspacesManagementMainService.resolveLocalWorkspace(configPath);
					if (workspace?.transient) {
						return this.openWindow(window.id, { forceReuseWindow: true });
					}
				}
			}

			// Proceed normally to reload the window
			return this.lifecycleMainService.reload(window, options?.disableExtensions !== undefined ? { _: [], 'disable-extensions': options.disableExtensions } : undefined);
		}
	}

	async closeWindow(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		return window?.win?.close();
	}

	async quit(windowId: number | undefined): Promise<void> {

		// If the user selected to exit from an extension development host window, do not quit, but just
		// close the window unless this is the last window that is opened.
		const window = this.windowsMainService.getLastActiveWindow();
		if (window?.isExtensionDevelopmentHost && this.windowsMainService.getWindowCount() > 1 && window.win) {
			window.win.close();
		}

		// Otherwise: normal quit
		else {
			this.lifecycleMainService.quit();
		}
	}

	async exit(windowId: number | undefined, code: number): Promise<void> {
		await this.lifecycleMainService.kill(code);
	}

	//#endregion


	//#region Connectivity

	async resolveProxy(windowId: number | undefined, url: string): Promise<string | undefined> {
		if (this.environmentMainService.extensionTestsLocationURI) {
			const testProxy = this.configurationService.getValue<string>('integration-test.http.proxy');
			if (testProxy) {
				return testProxy;
			}
		}
		const window = this.codeWindowById(windowId);
		const session = window?.win?.webContents?.session;

		return session?.resolveProxy(url);
	}

	async lookupAuthorization(_windowId: number | undefined, authInfo: AuthInfo): Promise<Credentials | undefined> {
		return this.proxyAuthService.lookupAuthorization(authInfo);
	}

	async lookupKerberosAuthorization(_windowId: number | undefined, url: string): Promise<string | undefined> {
		return this.requestService.lookupKerberosAuthorization(url);
	}

	async loadCertificates(_windowId: number | undefined): Promise<string[]> {
		return this.requestService.loadCertificates();
	}

	findFreePort(windowId: number | undefined, startPort: number, giveUpAfter: number, timeout: number, stride = 1): Promise<number> {
		return findFreePort(startPort, giveUpAfter, timeout, stride);
	}

	//#endregion


	//#region Development

	async openDevTools(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);

		let mode: 'bottom' | undefined = undefined;
		if (isLinux && useWindowControlsOverlay(this.configurationService)) {
			mode = 'bottom'; // TODO@bpasero WCO and devtools collide with default option 'right'
		}
		window?.win?.webContents.openDevTools(mode ? { mode } : undefined);
	}

	async toggleDevTools(windowId: number | undefined, options?: INativeHostOptions): Promise<void> {
		const window = this.windowById(options?.targetWindowId, windowId);
		const webContents = window?.win?.webContents;
		if (!webContents) {
			return;
		}

		if (isLinux && useWindowControlsOverlay(this.configurationService) && !webContents.isDevToolsOpened()) {
			webContents.openDevTools({ mode: 'bottom' }); // TODO@bpasero WCO and devtools collide with default option 'right'
		} else {
			webContents.toggleDevTools();
		}
	}

	//#endregion

	// #region Performance

	async profileRenderer(windowId: number | undefined, session: string, duration: number): Promise<IV8Profile> {
		const window = this.codeWindowById(windowId);
		if (!window || !window.win) {
			throw new Error();
		}

		const profiler = new WindowProfiler(window.win, session, this.logService);
		const result = await profiler.inspect(duration);
		return result;
	}

	// #endregion

	//#region Registry (windows)

	async windowsGetStringRegKey(windowId: number | undefined, hive: 'HKEY_CURRENT_USER' | 'HKEY_LOCAL_MACHINE' | 'HKEY_CLASSES_ROOT' | 'HKEY_USERS' | 'HKEY_CURRENT_CONFIG', path: string, name: string): Promise<string | undefined> {
		if (!isWindows) {
			return undefined;
		}

		const Registry = await import('@vscode/windows-registry');
		try {
			return Registry.GetStringRegKey(hive, path, name);
		} catch {
			return undefined;
		}
	}

	//#endregion

	private windowById(windowId: number | undefined, fallbackCodeWindowId?: number): ICodeWindow | IAuxiliaryWindow | undefined {
		return this.codeWindowById(windowId) ?? this.auxiliaryWindowById(windowId) ?? this.codeWindowById(fallbackCodeWindowId);
	}

	private codeWindowById(windowId: number | undefined): ICodeWindow | undefined {
		if (typeof windowId !== 'number') {
			return undefined;
		}

		return this.windowsMainService.getWindowById(windowId);
	}

	private auxiliaryWindowById(windowId: number | undefined): IAuxiliaryWindow | undefined {
		if (typeof windowId !== 'number') {
			return undefined;
		}

		const contents = webContents.fromId(windowId);
		if (!contents) {
			return undefined;
		}

		return this.auxiliaryWindowsMainService.getWindowByWebContents(contents);
	}
}
