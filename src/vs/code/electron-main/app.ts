/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, BrowserWindow, contentTracing, dialog, protocol, session, Session, systemPreferences, WebFrameMain } from 'electron';
import { validatedIpcMain } from 'vs/base/parts/ipc/electron-main/ipcMain';
import { statSync } from 'fs';
import { hostname, release } from 'os';
import { VSBuffer } from 'vs/base/common/buffer';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { onUnexpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { isEqualOrParent, randomPath } from 'vs/base/common/extpath';
import { once } from 'vs/base/common/functional';
import { stripComments } from 'vs/base/common/json';
import { getPathLabel, mnemonicButtonLabel } from 'vs/base/common/labels';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isAbsolute, join, posix } from 'vs/base/common/path';
import { IProcessEnvironment, isLinux, isLinuxSnap, isMacintosh, isWindows, OS } from 'vs/base/common/platform';
import { assertType, withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { getMachineId } from 'vs/base/node/id';
import { registerContextMenuListener } from 'vs/base/parts/contextmenu/electron-main/contextmenu';
import { getDelayedChannel, ProxyChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/electron-main/ipc.electron';
import { Client as MessagePortClient } from 'vs/base/parts/ipc/electron-main/ipc.mp';
import { Server as NodeIPCServer } from 'vs/base/parts/ipc/node/ipc.net';
import { ProxyAuthHandler } from 'vs/code/electron-main/auth';
import { localize } from 'vs/nls';
import { IBackupMainService } from 'vs/platform/backup/electron-main/backup';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICredentialsMainService } from 'vs/platform/credentials/common/credentials';
import { ElectronExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/electron-main/extensionHostDebugIpc';
import { IDiagnosticsService } from 'vs/platform/diagnostics/common/diagnostics';
import { DiagnosticsMainService, IDiagnosticsMainService } from 'vs/platform/diagnostics/electron-main/diagnosticsMainService';
import { DialogMainService, IDialogMainService } from 'vs/platform/dialogs/electron-main/dialogMainService';
import { IEncryptionMainService } from 'vs/platform/encryption/common/encryptionService';
import { EncryptionMainService } from 'vs/platform/encryption/node/encryptionMainService';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { isLaunchedFromCli } from 'vs/platform/environment/node/argvHelper';
import { getResolvedShellEnv } from 'vs/platform/shell/node/shellEnv';
import { IExtensionUrlTrustService } from 'vs/platform/extensionManagement/common/extensionUrlTrust';
import { ExtensionUrlTrustService } from 'vs/platform/extensionManagement/node/extensionUrlTrustService';
import { IExtensionHostStarter, ipcExtensionHostStarterChannelName } from 'vs/platform/extensions/common/extensionHostStarter';
import { ExtensionHostStarter } from 'vs/platform/extensions/electron-main/extensionHostStarter';
import { IExternalTerminalMainService } from 'vs/platform/externalTerminal/common/externalTerminal';
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from 'vs/platform/externalTerminal/node/externalTerminalService';
import { LOCAL_FILE_SYSTEM_CHANNEL_NAME } from 'vs/platform/files/common/diskFileSystemProviderClient';
import { IFileService } from 'vs/platform/files/common/files';
import { DiskFileSystemProviderChannel } from 'vs/platform/files/electron-main/diskFileSystemProviderServer';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IIssueMainService, IssueMainService } from 'vs/platform/issue/electron-main/issueMainService';
import { IKeyboardLayoutMainService, KeyboardLayoutMainService } from 'vs/platform/keyboardLayout/electron-main/keyboardLayoutMainService';
import { ILaunchMainService, LaunchMainService } from 'vs/platform/launch/electron-main/launchMainService';
import { ILifecycleMainService, LifecycleMainPhase, ShutdownReason } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILoggerService, ILogService } from 'vs/platform/log/common/log';
import { LoggerChannel, LogLevelChannel } from 'vs/platform/log/common/logIpc';
import { IMenubarMainService, MenubarMainService } from 'vs/platform/menubar/electron-main/menubarMainService';
import { INativeHostMainService, NativeHostMainService } from 'vs/platform/native/electron-main/nativeHostMainService';
import { IProductService } from 'vs/platform/product/common/productService';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { SharedProcess } from 'vs/platform/sharedProcess/electron-main/sharedProcess';
import { ISignService } from 'vs/platform/sign/common/sign';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { StorageDatabaseChannel } from 'vs/platform/storage/electron-main/storageIpc';
import { ApplicationStorageMainService, IApplicationStorageMainService, IStorageMainService, StorageMainService } from 'vs/platform/storage/electron-main/storageMainService';
import { resolveCommonProperties } from 'vs/platform/telemetry/common/commonProperties';
import { ITelemetryService, machineIdKey, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { ITelemetryServiceConfig, TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { getPiiPathsFromEnvironment, getTelemetryLevel, isInternalTelemetry, NullTelemetryService, supportsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IUpdateService } from 'vs/platform/update/common/update';
import { UpdateChannel } from 'vs/platform/update/common/updateIpc';
import { DarwinUpdateService } from 'vs/platform/update/electron-main/updateService.darwin';
import { LinuxUpdateService } from 'vs/platform/update/electron-main/updateService.linux';
import { SnapUpdateService } from 'vs/platform/update/electron-main/updateService.snap';
import { Win32UpdateService } from 'vs/platform/update/electron-main/updateService.win32';
import { IOpenURLOptions, IURLService } from 'vs/platform/url/common/url';
import { URLHandlerChannelClient, URLHandlerRouter } from 'vs/platform/url/common/urlIpc';
import { NativeURLService } from 'vs/platform/url/common/urlService';
import { ElectronURLListener } from 'vs/platform/url/electron-main/electronUrlListener';
import { IWebviewManagerService } from 'vs/platform/webview/common/webviewManagerService';
import { WebviewMainService } from 'vs/platform/webview/electron-main/webviewMainService';
import { IWindowOpenable } from 'vs/platform/window/common/window';
import { IWindowsMainService, OpenContext } from 'vs/platform/windows/electron-main/windows';
import { ICodeWindow, WindowError } from 'vs/platform/window/electron-main/window';
import { WindowsMainService } from 'vs/platform/windows/electron-main/windowsMainService';
import { ActiveWindowManager } from 'vs/platform/windows/node/windowTracker';
import { hasWorkspaceFileExtension } from 'vs/platform/workspace/common/workspace';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspacesHistoryMainService, WorkspacesHistoryMainService } from 'vs/platform/workspaces/electron-main/workspacesHistoryMainService';
import { WorkspacesMainService } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { IWorkspacesManagementMainService, WorkspacesManagementMainService } from 'vs/platform/workspaces/electron-main/workspacesManagementMainService';
import { CredentialsNativeMainService } from 'vs/platform/credentials/electron-main/credentialsMainService';
import { IPolicyService } from 'vs/platform/policy/common/policy';
import { PolicyChannel } from 'vs/platform/policy/common/policyIpc';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';
import { DefaultExtensionsProfileInitHandler } from 'vs/platform/extensionManagement/electron-main/defaultExtensionsProfileInit';
import { RequestChannel } from 'vs/platform/request/common/requestIpc';
import { IRequestService } from 'vs/platform/request/common/request';
import { ExtensionsProfileScannerService, IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionsScannerService } from 'vs/platform/extensionManagement/node/extensionsScannerService';
import { UserDataTransientProfilesHandler } from 'vs/platform/userDataProfile/electron-main/userDataTransientProfilesHandler';
import { RunOnceScheduler, runWhenIdle } from 'vs/base/common/async';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';

/**
 * The main VS Code application. There will only ever be one instance,
 * even if the user starts many instances (e.g. from the command line).
 */
export class CodeApplication extends Disposable {

	private windowsMainService: IWindowsMainService | undefined;
	private nativeHostMainService: INativeHostMainService | undefined;

	constructor(
		private readonly mainProcessNodeIpcServer: NodeIPCServer,
		private readonly userEnv: IProcessEnvironment,
		@IInstantiationService private readonly mainInstantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStateMainService private readonly stateMainService: IStateMainService,
		@IFileService private readonly fileService: IFileService,
		@IProductService private readonly productService: IProductService,
		@IUserDataProfilesMainService private readonly userDataProfilesMainService: IUserDataProfilesMainService,
	) {
		super();

		this.configureSession();
		this.registerListeners();
	}

	private configureSession(): void {

		//#region Security related measures (https://electronjs.org/docs/tutorial/security)
		//
		// !!! DO NOT CHANGE without consulting the documentation !!!
		//

		const isUrlFromWebview = (requestingUrl: string | undefined) => requestingUrl?.startsWith(`${Schemas.vscodeWebview}://`);

		const allowedPermissionsInWebview = new Set([
			'clipboard-read',
			'clipboard-sanitized-write',
		]);

		session.defaultSession.setPermissionRequestHandler((_webContents, permission /* 'media' | 'geolocation' | 'notifications' | 'midiSysex' | 'pointerLock' | 'fullscreen' | 'openExternal' */, callback, details) => {
			if (isUrlFromWebview(details.requestingUrl)) {
				return callback(allowedPermissionsInWebview.has(permission));
			}

			return callback(false);
		});

		session.defaultSession.setPermissionCheckHandler((_webContents, permission /* 'media' */, _origin, details) => {
			if (isUrlFromWebview(details.requestingUrl)) {
				return allowedPermissionsInWebview.has(permission);
			}

			return false;
		});

		//#endregion

		//#region Request filtering

		// Block all SVG requests from unsupported origins
		const supportedSvgSchemes = new Set([Schemas.file, Schemas.vscodeFileResource, Schemas.vscodeRemoteResource, 'devtools']);

		// But allow them if the are made from inside an webview
		const isSafeFrame = (requestFrame: WebFrameMain | undefined): boolean => {
			for (let frame: WebFrameMain | null | undefined = requestFrame; frame; frame = frame.parent) {
				if (frame.url.startsWith(`${Schemas.vscodeWebview}://`)) {
					return true;
				}
			}
			return false;
		};

		const isSvgRequestFromSafeContext = (details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails): boolean => {
			return details.resourceType === 'xhr' || isSafeFrame(details.frame);
		};

		const isAllowedVsCodeFileRequest = (details: Electron.OnBeforeRequestListenerDetails) => {
			const frame = details.frame;
			if (!frame || !this.windowsMainService) {
				return false;
			}

			// Check to see if the request comes from one of the main windows (or shared process) and not from embedded content
			const windows = BrowserWindow.getAllWindows();
			for (const window of windows) {
				if (frame.processId === window.webContents.mainFrame.processId) {
					return true;
				}
			}

			return false;
		};

		const isAllowedWebviewRequest = (uri: URI, details: Electron.OnBeforeRequestListenerDetails): boolean => {
			// Only restrict top level page of webviews: index.html
			if (uri.path !== '/index.html') {
				return true;
			}

			const frame = details.frame;
			if (!frame || !this.windowsMainService) {
				return false;
			}

			// Check to see if the request comes from one of the main editor windows.
			for (const window of this.windowsMainService.getWindows()) {
				if (window.win) {
					if (frame.processId === window.win.webContents.mainFrame.processId) {
						return true;
					}
				}
			}

			return false;
		};

		session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
			const uri = URI.parse(details.url);
			if (uri.scheme === Schemas.vscodeWebview) {
				if (!isAllowedWebviewRequest(uri, details)) {
					this.logService.error('Blocked vscode-webview request', details.url);
					return callback({ cancel: true });
				}
			}

			if (uri.scheme === Schemas.vscodeFileResource) {
				if (!isAllowedVsCodeFileRequest(details)) {
					this.logService.error('Blocked vscode-file request', details.url);
					return callback({ cancel: true });
				}
			}

			// Block most svgs
			if (uri.path.endsWith('.svg')) {
				const isSafeResourceUrl = supportedSvgSchemes.has(uri.scheme);
				if (!isSafeResourceUrl) {
					return callback({ cancel: !isSvgRequestFromSafeContext(details) });
				}
			}

			return callback({ cancel: false });
		});

		// Configure SVG header content type properly
		// https://github.com/microsoft/vscode/issues/97564
		session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
			const responseHeaders = details.responseHeaders as Record<string, (string) | (string[])>;
			const contentTypes = (responseHeaders['content-type'] || responseHeaders['Content-Type']);

			if (contentTypes && Array.isArray(contentTypes)) {
				const uri = URI.parse(details.url);
				if (uri.path.endsWith('.svg')) {
					if (supportedSvgSchemes.has(uri.scheme)) {
						responseHeaders['Content-Type'] = ['image/svg+xml'];

						return callback({ cancel: false, responseHeaders });
					}
				}

				// remote extension schemes have the following format
				// http://127.0.0.1:<port>/vscode-remote-resource?path=
				if (!uri.path.endsWith(Schemas.vscodeRemoteResource) && contentTypes.some(contentType => contentType.toLowerCase().includes('image/svg'))) {
					return callback({ cancel: !isSvgRequestFromSafeContext(details) });
				}
			}

			return callback({ cancel: false });
		});

		//#endregion

		//#region Code Cache

		type SessionWithCodeCachePathSupport = Session & {
			/**
			 * Sets code cache directory. By default, the directory will be `Code Cache` under
			 * the respective user data folder.
			 */
			setCodeCachePath?(path: string): void;
		};

		const defaultSession = session.defaultSession as unknown as SessionWithCodeCachePathSupport;
		if (typeof defaultSession.setCodeCachePath === 'function' && this.environmentMainService.codeCachePath) {
			// Make sure to partition Chrome's code cache folder
			// in the same way as our code cache path to help
			// invalidate caches that we know are invalid
			// (https://github.com/microsoft/vscode/issues/120655)
			defaultSession.setCodeCachePath(join(this.environmentMainService.codeCachePath, 'chrome'));
		}

		//#endregion
	}

	private registerListeners(): void {

		// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
		setUnexpectedErrorHandler(error => this.onUnexpectedError(error));
		process.on('uncaughtException', error => onUnexpectedError(error));
		process.on('unhandledRejection', (reason: unknown) => onUnexpectedError(reason));

		// Dispose on shutdown
		this.lifecycleMainService.onWillShutdown(() => this.dispose());

		// Contextmenu via IPC support
		registerContextMenuListener();

		// Accessibility change event
		app.on('accessibility-support-changed', (event, accessibilitySupportEnabled) => {
			this.windowsMainService?.sendToAll('vscode:accessibilitySupportChanged', accessibilitySupportEnabled);
		});

		// macOS dock activate
		app.on('activate', (event, hasVisibleWindows) => {
			this.logService.trace('app#activate');

			// Mac only event: open new window when we get activated
			if (!hasVisibleWindows) {
				this.windowsMainService?.openEmptyWindow({ context: OpenContext.DOCK });
			}
		});

		//#region Security related measures (https://electronjs.org/docs/tutorial/security)
		//
		// !!! DO NOT CHANGE without consulting the documentation !!!
		//
		app.on('web-contents-created', (event, contents) => {

			contents.on('will-navigate', event => {
				this.logService.error('webContents#will-navigate: Prevented webcontent navigation');

				event.preventDefault();
			});

			contents.setWindowOpenHandler(({ url }) => {
				this.nativeHostMainService?.openExternal(undefined, url);

				return { action: 'deny' };
			});
		});

		//#endregion

		let macOpenFileURIs: IWindowOpenable[] = [];
		let runningTimeout: NodeJS.Timeout | undefined = undefined;
		app.on('open-file', (event, path) => {
			this.logService.trace('app#open-file: ', path);
			event.preventDefault();

			// Keep in array because more might come!
			macOpenFileURIs.push(this.getWindowOpenableFromPathSync(path));

			// Clear previous handler if any
			if (runningTimeout !== undefined) {
				clearTimeout(runningTimeout);
				runningTimeout = undefined;
			}

			// Handle paths delayed in case more are coming!
			runningTimeout = setTimeout(() => {
				this.windowsMainService?.open({
					context: OpenContext.DOCK /* can also be opening from finder while app is running */,
					cli: this.environmentMainService.args,
					urisToOpen: macOpenFileURIs,
					gotoLineMode: false,
					preferNewWindow: true /* dropping on the dock or opening from finder prefers to open in a new window */
				});

				macOpenFileURIs = [];
				runningTimeout = undefined;
			}, 100);
		});

		app.on('new-window-for-tab', () => {
			this.windowsMainService?.openEmptyWindow({ context: OpenContext.DESKTOP }); //macOS native tab "+" button
		});

		//#region Bootstrap IPC Handlers

		validatedIpcMain.handle('vscode:fetchShellEnv', event => {

			// Prefer to use the args and env from the target window
			// when resolving the shell env. It is possible that
			// a first window was opened from the UI but a second
			// from the CLI and that has implications for whether to
			// resolve the shell environment or not.
			//
			// Window can be undefined for e.g. the shared process
			// that is not part of our windows registry!
			const window = this.windowsMainService?.getWindowByWebContents(event.sender); // Note: this can be `undefined` for the shared process
			let args: NativeParsedArgs;
			let env: IProcessEnvironment;
			if (window?.config) {
				args = window.config;
				env = { ...process.env, ...window.config.userEnv };
			} else {
				args = this.environmentMainService.args;
				env = process.env;
			}

			// Resolve shell env
			return this.resolveShellEnvironment(args, env, false);
		});

		validatedIpcMain.handle('vscode:writeNlsFile', (event, path: unknown, data: unknown) => {
			const uri = this.validateNlsPath([path]);
			if (!uri || typeof data !== 'string') {
				throw new Error('Invalid operation (vscode:writeNlsFile)');
			}

			return this.fileService.writeFile(uri, VSBuffer.fromString(data));
		});

		validatedIpcMain.handle('vscode:readNlsFile', async (event, ...paths: unknown[]) => {
			const uri = this.validateNlsPath(paths);
			if (!uri) {
				throw new Error('Invalid operation (vscode:readNlsFile)');
			}

			return (await this.fileService.readFile(uri)).value.toString();
		});

		validatedIpcMain.on('vscode:toggleDevTools', event => event.sender.toggleDevTools());
		validatedIpcMain.on('vscode:openDevTools', event => event.sender.openDevTools());

		validatedIpcMain.on('vscode:reloadWindow', event => event.sender.reload());

		//#endregion
	}

	private validateNlsPath(pathSegments: unknown[]): URI | undefined {
		let path: string | undefined = undefined;

		for (const pathSegment of pathSegments) {
			if (typeof pathSegment === 'string') {
				if (typeof path !== 'string') {
					path = pathSegment;
				} else {
					path = join(path, pathSegment);
				}
			}
		}

		if (typeof path !== 'string' || !isAbsolute(path) || !isEqualOrParent(path, this.environmentMainService.cachedLanguagesPath, !isLinux)) {
			return undefined;
		}

		return URI.file(path);
	}

	private onUnexpectedError(error: Error): void {
		if (error) {

			// take only the message and stack property
			const friendlyError = {
				message: `[uncaught exception in main]: ${error.message}`,
				stack: error.stack
			};

			// handle on client side
			this.windowsMainService?.sendToFocused('vscode:reportError', JSON.stringify(friendlyError));
		}

		this.logService.error(`[uncaught exception in main]: ${error}`);
		if (error.stack) {
			this.logService.error(error.stack);
		}
	}

	async startup(): Promise<void> {
		this.logService.debug('Starting VS Code');
		this.logService.debug(`from: ${this.environmentMainService.appRoot}`);
		this.logService.debug('args:', this.environmentMainService.args);

		// Make sure we associate the program with the app user model id
		// This will help Windows to associate the running program with
		// any shortcut that is pinned to the taskbar and prevent showing
		// two icons in the taskbar for the same app.
		const win32AppUserModelId = this.productService.win32AppUserModelId;
		if (isWindows && win32AppUserModelId) {
			app.setAppUserModelId(win32AppUserModelId);
		}

		// Fix native tabs on macOS 10.13
		// macOS enables a compatibility patch for any bundle ID beginning with
		// "com.microsoft.", which breaks native tabs for VS Code when using this
		// identifier (from the official build).
		// Explicitly opt out of the patch here before creating any windows.
		// See: https://github.com/microsoft/vscode/issues/35361#issuecomment-399794085
		try {
			if (isMacintosh && this.configurationService.getValue('window.nativeTabs') === true && !systemPreferences.getUserDefault('NSUseImprovedLayoutPass', 'boolean')) {
				systemPreferences.setUserDefault('NSUseImprovedLayoutPass', 'boolean', true as any);
			}
		} catch (error) {
			this.logService.error(error);
		}

		// Main process server (electron IPC based)
		const mainProcessElectronServer = new ElectronIPCServer();
		this.lifecycleMainService.onWillShutdown(e => {
			if (e.reason === ShutdownReason.KILL) {
				// When we go down abnormally, make sure to free up
				// any IPC we accept from other windows to reduce
				// the chance of doing work after we go down. Kill
				// is special in that it does not orderly shutdown
				// windows.
				mainProcessElectronServer.dispose();
			}
		});

		// Resolve unique machine ID
		this.logService.trace('Resolving machine identifier...');
		const machineId = await this.resolveMachineId();
		this.logService.trace(`Resolved machine identifier: ${machineId}`);

		// Shared process
		const { sharedProcess, sharedProcessReady, sharedProcessClient } = this.setupSharedProcess(machineId);

		// Services
		const appInstantiationService = await this.initServices(machineId, sharedProcess, sharedProcessReady);

		// Setup Handlers
		this.setUpHandlers(appInstantiationService);

		// Ensure profile exists when passed in from CLI
		const profilePromise = this.userDataProfilesMainService.checkAndCreateProfileFromCli(this.environmentMainService.args);
		const profile = profilePromise ? await profilePromise : undefined;

		// Init Channels
		appInstantiationService.invokeFunction(accessor => this.initChannels(accessor, mainProcessElectronServer, sharedProcessClient));

		// Open Windows
		const windows = appInstantiationService.invokeFunction(accessor => this.openFirstWindow(accessor, profile, mainProcessElectronServer));

		// Post Open Windows Tasks
		appInstantiationService.invokeFunction(accessor => this.afterWindowOpen(accessor, sharedProcess));

		// Tracing: Stop tracing after windows are ready if enabled
		if (this.environmentMainService.args.trace) {
			appInstantiationService.invokeFunction(accessor => this.stopTracingEventually(accessor, windows));
		}

		// Set lifecycle phase to `Eventually` after a short delay and when idle (min 2.5sec, max 5sec)
		const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
			this._register(runWhenIdle(() => this.lifecycleMainService.phase = LifecycleMainPhase.Eventually, 2500));
		}, 2500));
		eventuallyPhaseScheduler.schedule();
	}

	private setUpHandlers(instantiationService: IInstantiationService): void {

		// Auth Handler
		this._register(instantiationService.createInstance(ProxyAuthHandler));

		// Default Extensions Profile Init Handler
		this._register(instantiationService.createInstance(DefaultExtensionsProfileInitHandler));

		// Transient profiles handler
		this._register(instantiationService.createInstance(UserDataTransientProfilesHandler));
	}

	private async resolveMachineId(): Promise<string> {

		// We cache the machineId for faster lookups on startup
		// and resolve it only once initially if not cached or we need to replace the macOS iBridge device
		let machineId = this.stateMainService.getItem<string>(machineIdKey);
		if (!machineId || (isMacintosh && machineId === '6c9d2bc8f91b89624add29c0abeae7fb42bf539fa1cdb2e3e57cd668fa9bcead')) {
			machineId = await getMachineId();

			this.stateMainService.setItem(machineIdKey, machineId);
		}

		return machineId;
	}

	private setupSharedProcess(machineId: string): { sharedProcess: SharedProcess; sharedProcessReady: Promise<MessagePortClient>; sharedProcessClient: Promise<MessagePortClient> } {
		const sharedProcess = this._register(this.mainInstantiationService.createInstance(SharedProcess, machineId, this.userEnv));

		const sharedProcessClient = (async () => {
			this.logService.trace('Main->SharedProcess#connect');

			const port = await sharedProcess.connect();

			this.logService.trace('Main->SharedProcess#connect: connection established');

			return new MessagePortClient(port, 'main');
		})();

		const sharedProcessReady = (async () => {
			await sharedProcess.whenReady();

			return sharedProcessClient;
		})();

		return { sharedProcess, sharedProcessReady, sharedProcessClient };
	}

	private async initServices(machineId: string, sharedProcess: SharedProcess, sharedProcessReady: Promise<MessagePortClient>): Promise<IInstantiationService> {
		const services = new ServiceCollection();

		// Update
		switch (process.platform) {
			case 'win32':
				services.set(IUpdateService, new SyncDescriptor(Win32UpdateService));
				break;

			case 'linux':
				if (isLinuxSnap) {
					services.set(IUpdateService, new SyncDescriptor(SnapUpdateService, [process.env['SNAP'], process.env['SNAP_REVISION']]));
				} else {
					services.set(IUpdateService, new SyncDescriptor(LinuxUpdateService));
				}
				break;

			case 'darwin':
				services.set(IUpdateService, new SyncDescriptor(DarwinUpdateService));
				break;
		}

		// Windows
		services.set(IWindowsMainService, new SyncDescriptor(WindowsMainService, [machineId, this.userEnv], false));

		// Dialogs
		services.set(IDialogMainService, new SyncDescriptor(DialogMainService, undefined, true));

		// Launch
		services.set(ILaunchMainService, new SyncDescriptor(LaunchMainService, undefined, false /* proxied to other processes */));

		// Diagnostics
		services.set(IDiagnosticsMainService, new SyncDescriptor(DiagnosticsMainService, undefined, false /* proxied to other processes */));
		services.set(IDiagnosticsService, ProxyChannel.toService(getDelayedChannel(sharedProcessReady.then(client => client.getChannel('diagnostics')))));

		// Issues
		services.set(IIssueMainService, new SyncDescriptor(IssueMainService, [this.userEnv]));

		// Encryption
		services.set(IEncryptionMainService, new SyncDescriptor(EncryptionMainService, [machineId]));

		// Keyboard Layout
		services.set(IKeyboardLayoutMainService, new SyncDescriptor(KeyboardLayoutMainService));

		// Native Host
		services.set(INativeHostMainService, new SyncDescriptor(NativeHostMainService, [sharedProcess], false /* proxied to other processes */));

		// Credentials
		services.set(ICredentialsMainService, new SyncDescriptor(CredentialsNativeMainService));

		// Webview Manager
		services.set(IWebviewManagerService, new SyncDescriptor(WebviewMainService));

		// Workspaces
		services.set(IWorkspacesService, new SyncDescriptor(WorkspacesMainService, undefined, false /* proxied to other processes */));
		services.set(IWorkspacesManagementMainService, new SyncDescriptor(WorkspacesManagementMainService, undefined, true));
		services.set(IWorkspacesHistoryMainService, new SyncDescriptor(WorkspacesHistoryMainService, undefined, false));

		// Menubar
		services.set(IMenubarMainService, new SyncDescriptor(MenubarMainService));

		// Extension URL Trust
		services.set(IExtensionUrlTrustService, new SyncDescriptor(ExtensionUrlTrustService));

		// Extension Host Starter
		services.set(IExtensionHostStarter, new SyncDescriptor(ExtensionHostStarter));

		// Storage
		services.set(IStorageMainService, new SyncDescriptor(StorageMainService));
		services.set(IApplicationStorageMainService, new SyncDescriptor(ApplicationStorageMainService));

		// External terminal
		if (isWindows) {
			services.set(IExternalTerminalMainService, new SyncDescriptor(WindowsExternalTerminalService));
		} else if (isMacintosh) {
			services.set(IExternalTerminalMainService, new SyncDescriptor(MacExternalTerminalService));
		} else if (isLinux) {
			services.set(IExternalTerminalMainService, new SyncDescriptor(LinuxExternalTerminalService));
		}

		// Backups
		const backupMainService = new BackupMainService(this.environmentMainService, this.configurationService, this.logService, this.stateMainService);
		services.set(IBackupMainService, backupMainService);

		// URL handling
		services.set(IURLService, new SyncDescriptor(NativeURLService, undefined, false /* proxied to other processes */));

		// Telemetry
		if (supportsTelemetry(this.productService, this.environmentMainService)) {
			const isInternal = isInternalTelemetry(this.productService, this.configurationService);
			const channel = getDelayedChannel(sharedProcessReady.then(client => client.getChannel('telemetryAppender')));
			const appender = new TelemetryAppenderClient(channel);
			const commonProperties = resolveCommonProperties(this.fileService, release(), hostname(), process.arch, this.productService.commit, this.productService.version, machineId, isInternal, this.environmentMainService.installSourcePath);
			const piiPaths = getPiiPathsFromEnvironment(this.environmentMainService);
			const config: ITelemetryServiceConfig = { appenders: [appender], commonProperties, piiPaths, sendErrorTelemetry: true };

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config], false));
		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}

		// Default Extensions Profile Init
		services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, undefined, true));
		services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, undefined, true));

		// Init services that require it
		await backupMainService.initialize();

		return this.mainInstantiationService.createChild(services);
	}

	private initChannels(accessor: ServicesAccessor, mainProcessElectronServer: ElectronIPCServer, sharedProcessClient: Promise<MessagePortClient>): void {

		// Channels registered to node.js are exposed to second instances
		// launching because that is the only way the second instance
		// can talk to the first instance. Electron IPC does not work
		// across apps until `requestSingleInstance` APIs are adopted.

		const launchChannel = ProxyChannel.fromService(accessor.get(ILaunchMainService), { disableMarshalling: true });
		this.mainProcessNodeIpcServer.registerChannel('launch', launchChannel);

		const diagnosticsChannel = ProxyChannel.fromService(accessor.get(IDiagnosticsMainService), { disableMarshalling: true });
		this.mainProcessNodeIpcServer.registerChannel('diagnostics', diagnosticsChannel);

		// Policies (main & shared process)
		const policyChannel = new PolicyChannel(accessor.get(IPolicyService));
		mainProcessElectronServer.registerChannel('policy', policyChannel);
		sharedProcessClient.then(client => client.registerChannel('policy', policyChannel));

		// Local Files
		const diskFileSystemProvider = this.fileService.getProvider(Schemas.file);
		assertType(diskFileSystemProvider instanceof DiskFileSystemProvider);
		const fileSystemProviderChannel = new DiskFileSystemProviderChannel(diskFileSystemProvider, this.logService, this.environmentMainService);
		mainProcessElectronServer.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, fileSystemProviderChannel);
		sharedProcessClient.then(client => client.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, fileSystemProviderChannel));

		// User Data Profiles
		const userDataProfilesService = ProxyChannel.fromService(accessor.get(IUserDataProfilesMainService));
		mainProcessElectronServer.registerChannel('userDataProfiles', userDataProfilesService);
		sharedProcessClient.then(client => client.registerChannel('userDataProfiles', userDataProfilesService));

		// Request
		const requestService = new RequestChannel(accessor.get(IRequestService));
		sharedProcessClient.then(client => client.registerChannel('request', requestService));

		// Update
		const updateChannel = new UpdateChannel(accessor.get(IUpdateService));
		mainProcessElectronServer.registerChannel('update', updateChannel);

		// Issues
		const issueChannel = ProxyChannel.fromService(accessor.get(IIssueMainService));
		mainProcessElectronServer.registerChannel('issue', issueChannel);

		// Encryption
		const encryptionChannel = ProxyChannel.fromService(accessor.get(IEncryptionMainService));
		mainProcessElectronServer.registerChannel('encryption', encryptionChannel);

		// Credentials
		const credentialsChannel = ProxyChannel.fromService(accessor.get(ICredentialsMainService));
		mainProcessElectronServer.registerChannel('credentials', credentialsChannel);

		// Signing
		const signChannel = ProxyChannel.fromService(accessor.get(ISignService));
		mainProcessElectronServer.registerChannel('sign', signChannel);

		// Keyboard Layout
		const keyboardLayoutChannel = ProxyChannel.fromService(accessor.get(IKeyboardLayoutMainService));
		mainProcessElectronServer.registerChannel('keyboardLayout', keyboardLayoutChannel);

		// Native host (main & shared process)
		this.nativeHostMainService = accessor.get(INativeHostMainService);
		const nativeHostChannel = ProxyChannel.fromService(this.nativeHostMainService);
		mainProcessElectronServer.registerChannel('nativeHost', nativeHostChannel);
		sharedProcessClient.then(client => client.registerChannel('nativeHost', nativeHostChannel));

		// Workspaces
		const workspacesChannel = ProxyChannel.fromService(accessor.get(IWorkspacesService));
		mainProcessElectronServer.registerChannel('workspaces', workspacesChannel);

		// Menubar
		const menubarChannel = ProxyChannel.fromService(accessor.get(IMenubarMainService));
		mainProcessElectronServer.registerChannel('menubar', menubarChannel);

		// URL handling
		const urlChannel = ProxyChannel.fromService(accessor.get(IURLService));
		mainProcessElectronServer.registerChannel('url', urlChannel);

		// Extension URL Trust
		const extensionUrlTrustChannel = ProxyChannel.fromService(accessor.get(IExtensionUrlTrustService));
		mainProcessElectronServer.registerChannel('extensionUrlTrust', extensionUrlTrustChannel);

		// Webview Manager
		const webviewChannel = ProxyChannel.fromService(accessor.get(IWebviewManagerService));
		mainProcessElectronServer.registerChannel('webview', webviewChannel);

		// Storage (main & shared process)
		const storageChannel = this._register(new StorageDatabaseChannel(this.logService, accessor.get(IStorageMainService)));
		mainProcessElectronServer.registerChannel('storage', storageChannel);
		sharedProcessClient.then(client => client.registerChannel('storage', storageChannel));

		// External Terminal
		const externalTerminalChannel = ProxyChannel.fromService(accessor.get(IExternalTerminalMainService));
		mainProcessElectronServer.registerChannel('externalTerminal', externalTerminalChannel);

		// Log Level (main & shared process)
		const logLevelChannel = new LogLevelChannel(accessor.get(ILogService));
		mainProcessElectronServer.registerChannel('logLevel', logLevelChannel);
		sharedProcessClient.then(client => client.registerChannel('logLevel', logLevelChannel));

		// Logger
		const loggerChannel = new LoggerChannel(accessor.get(ILoggerService),);
		mainProcessElectronServer.registerChannel('logger', loggerChannel);
		sharedProcessClient.then(client => client.registerChannel('logger', loggerChannel));

		// Extension Host Debug Broadcasting
		const electronExtensionHostDebugBroadcastChannel = new ElectronExtensionHostDebugBroadcastChannel(accessor.get(IWindowsMainService), accessor.get(IUserDataProfilesMainService));
		mainProcessElectronServer.registerChannel('extensionhostdebugservice', electronExtensionHostDebugBroadcastChannel);

		// Extension Host Starter
		const extensionHostStarterChannel = ProxyChannel.fromService(accessor.get(IExtensionHostStarter));
		mainProcessElectronServer.registerChannel(ipcExtensionHostStarterChannelName, extensionHostStarterChannel);
	}

	private openFirstWindow(accessor: ServicesAccessor, profile: IUserDataProfile | undefined, mainProcessElectronServer: ElectronIPCServer): ICodeWindow[] {
		const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);
		const urlService = accessor.get(IURLService);
		const nativeHostMainService = accessor.get(INativeHostMainService);

		// Signal phase: ready (services set)
		this.lifecycleMainService.phase = LifecycleMainPhase.Ready;

		// Check for initial URLs to handle from protocol link invocations
		const pendingWindowOpenablesFromProtocolLinks: IWindowOpenable[] = [];
		const pendingProtocolLinksToHandle = [

			// Windows/Linux: protocol handler invokes CLI with --open-url
			...this.environmentMainService.args['open-url'] ? this.environmentMainService.args._urls || [] : [],

			// macOS: open-url events
			...((<any>global).getOpenUrls() || []) as string[]

		].map(url => {
			try {
				return { uri: URI.parse(url), url };
			} catch {
				return undefined;
			}
		}).filter((obj): obj is { uri: URI; url: string } => {
			if (!obj) {
				return false;
			}

			// If URI should be blocked, filter it out
			if (this.shouldBlockURI(obj.uri)) {
				return false;
			}

			// Filter out any protocol link that wants to open as window so that
			// we open the right set of windows on startup and not restore the
			// previous workspace too.
			const windowOpenable = this.getWindowOpenableFromProtocolLink(obj.uri);
			if (windowOpenable) {
				pendingWindowOpenablesFromProtocolLinks.push(windowOpenable);

				return false;
			}

			return true;
		});

		// Create a URL handler to open file URIs in the active window
		// or open new windows. The URL handler will be invoked from
		// protocol invocations outside of VSCode.
		const app = this;
		const environmentService = this.environmentMainService;
		const productService = this.productService;
		const logService = this.logService;
		urlService.registerHandler({
			async handleURL(uri: URI, options?: IOpenURLOptions): Promise<boolean> {
				logService.trace('app#handleURL: ', uri.toString(true), options);

				if (uri.scheme === productService.urlProtocol && uri.path === 'workspace') {
					uri = uri.with({
						authority: 'file',
						path: URI.parse(uri.query).path,
						query: ''
					});
				}

				// If URI should be blocked, behave as if it's handled
				if (app.shouldBlockURI(uri)) {
					return true;
				}

				let shouldOpenInNewWindow = false;

				// We should handle the URI in a new window if the URL contains `windowId=_blank`
				const params = new URLSearchParams(uri.query);
				if (params.get('windowId') === '_blank') {
					params.delete('windowId');
					uri = uri.with({ query: params.toString() });
					shouldOpenInNewWindow = true;
				}

				// or if no window is open (macOS only)
				shouldOpenInNewWindow ||= isMacintosh && windowsMainService.getWindowCount() === 0;

				// Check for URIs to open in window
				const windowOpenableFromProtocolLink = app.getWindowOpenableFromProtocolLink(uri);
				logService.trace('app#handleURL: windowOpenableFromProtocolLink = ', windowOpenableFromProtocolLink);
				if (windowOpenableFromProtocolLink) {
					const [window] = windowsMainService.open({
						context: OpenContext.API,
						cli: { ...environmentService.args },
						urisToOpen: [windowOpenableFromProtocolLink],
						forceNewWindow: shouldOpenInNewWindow,
						gotoLineMode: true
						// remoteAuthority: will be determined based on windowOpenableFromProtocolLink
					});

					window.focus(); // this should help ensuring that the right window gets focus when multiple are opened

					return true;
				}

				if (shouldOpenInNewWindow) {
					const [window] = windowsMainService.open({
						context: OpenContext.API,
						cli: { ...environmentService.args },
						forceNewWindow: true,
						forceEmpty: true,
						gotoLineMode: true,
						remoteAuthority: getRemoteAuthority(uri)
					});

					await window.ready();

					return urlService.open(uri, options);
				}

				return false;
			}
		});

		// Create a URL handler which forwards to the last active window
		const activeWindowManager = this._register(new ActiveWindowManager({
			onDidOpenWindow: nativeHostMainService.onDidOpenWindow,
			onDidFocusWindow: nativeHostMainService.onDidFocusWindow,
			getActiveWindowId: () => nativeHostMainService.getActiveWindowId(-1)
		}));
		const activeWindowRouter = new StaticRouter(ctx => activeWindowManager.getActiveClientId().then(id => ctx === id));
		const urlHandlerRouter = new URLHandlerRouter(activeWindowRouter);
		const urlHandlerChannel = mainProcessElectronServer.getChannel('urlHandler', urlHandlerRouter);
		urlService.registerHandler(new URLHandlerChannelClient(urlHandlerChannel));

		// Watch Electron URLs and forward them to the UrlService
		this._register(new ElectronURLListener(pendingProtocolLinksToHandle, urlService, windowsMainService, this.environmentMainService, this.productService));

		// Open our first window
		const args = this.environmentMainService.args;
		const macOpenFiles: string[] = (<any>global).macOpenFiles;
		const context = isLaunchedFromCli(process.env) ? OpenContext.CLI : OpenContext.DESKTOP;
		const hasCliArgs = args._.length;
		const hasFolderURIs = !!args['folder-uri'];
		const hasFileURIs = !!args['file-uri'];
		const noRecentEntry = args['skip-add-to-recently-opened'] === true;
		const waitMarkerFileURI = args.wait && args.waitMarkerFilePath ? URI.file(args.waitMarkerFilePath) : undefined;
		const remoteAuthority = args.remote || undefined;

		// check for a pending window to open from URI
		// e.g. when running code with --open-uri from
		// a protocol handler
		if (pendingWindowOpenablesFromProtocolLinks.length > 0) {
			return windowsMainService.open({
				context,
				cli: args,
				urisToOpen: pendingWindowOpenablesFromProtocolLinks,
				gotoLineMode: true,
				initialStartup: true
				// remoteAuthority: will be determined based on pendingWindowOpenablesFromProtocolLinks
			});
		}

		// Start without file/folder arguments
		if (!hasCliArgs && !hasFolderURIs && !hasFileURIs) {

			// Force new window
			if (args['new-window'] || profile) {
				return windowsMainService.open({
					context,
					cli: args,
					forceNewWindow: true,
					forceEmpty: true,
					noRecentEntry,
					waitMarkerFileURI,
					initialStartup: true,
					remoteAuthority,
					profile
				});
			}

			// mac: open-file event received on startup
			if (macOpenFiles.length) {
				return windowsMainService.open({
					context: OpenContext.DOCK,
					cli: args,
					urisToOpen: macOpenFiles.map(file => this.getWindowOpenableFromPathSync(file)),
					noRecentEntry,
					waitMarkerFileURI,
					initialStartup: true,
					// remoteAuthority: will be determined based on macOpenFiles
				});
			}
		}

		// default: read paths from cli
		return windowsMainService.open({
			context,
			cli: args,
			forceNewWindow: args['new-window'] || (!hasCliArgs && args['unity-launch']),
			diffMode: args.diff,
			mergeMode: args.merge,
			noRecentEntry,
			waitMarkerFileURI,
			gotoLineMode: args.goto,
			initialStartup: true,
			remoteAuthority,
			profile
		});
	}

	private shouldBlockURI(uri: URI): boolean {
		if (uri.authority === Schemas.file && isWindows) {
			const res = dialog.showMessageBoxSync({
				title: this.productService.nameLong,
				type: 'question',
				buttons: [
					mnemonicButtonLabel(localize({ key: 'open', comment: ['&& denotes a mnemonic'] }, "&&Yes")),
					mnemonicButtonLabel(localize({ key: 'cancel', comment: ['&& denotes a mnemonic'] }, "&&No")),
				],
				defaultId: 0,
				cancelId: 1,
				message: localize('confirmOpenMessage', "An external application wants to open '{0}' in {1}. Do you want to open this file or folder?", getPathLabel(uri, { os: OS, tildify: this.environmentMainService }), this.productService.nameShort),
				detail: localize('confirmOpenDetail', "If you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should press 'No'"),
				noLink: true
			});

			if (res === 1) {
				return true;
			}
		}

		return false;
	}

	private getWindowOpenableFromProtocolLink(uri: URI): IWindowOpenable | undefined {
		if (!uri.path) {
			return undefined;
		}

		// File path
		if (uri.authority === Schemas.file) {
			const fileUri = URI.file(uri.fsPath);

			if (hasWorkspaceFileExtension(fileUri)) {
				return { workspaceUri: fileUri };
			}

			return { fileUri };
		}

		// Remote path
		else if (uri.authority === Schemas.vscodeRemote) {
			// Example conversion:
			// From: vscode://vscode-remote/wsl+ubuntu/mnt/c/GitDevelopment/monaco
			//   To: vscode-remote://wsl+ubuntu/mnt/c/GitDevelopment/monaco
			const secondSlash = uri.path.indexOf(posix.sep, 1 /* skip over the leading slash */);
			if (secondSlash !== -1) {
				const authority = uri.path.substring(1, secondSlash);
				const path = uri.path.substring(secondSlash);
				const remoteUri = URI.from({ scheme: Schemas.vscodeRemote, authority, path, query: uri.query, fragment: uri.fragment });

				if (hasWorkspaceFileExtension(path)) {
					return { workspaceUri: remoteUri };
				}

				if (/:[\d]+$/.test(path)) {
					// path with :line:column syntax
					return { fileUri: remoteUri };
				}

				return { folderUri: remoteUri };
			}
		}

		return undefined;
	}

	private getWindowOpenableFromPathSync(path: string): IWindowOpenable {
		try {
			const fileStat = statSync(path);
			if (fileStat.isDirectory()) {
				return { folderUri: URI.file(path) };
			}

			if (hasWorkspaceFileExtension(path)) {
				return { workspaceUri: URI.file(path) };
			}
		} catch (error) {
			// ignore errors
		}

		return { fileUri: URI.file(path) };
	}

	private afterWindowOpen(accessor: ServicesAccessor, sharedProcess: SharedProcess): void {
		const telemetryService = accessor.get(ITelemetryService);
		const updateService = accessor.get(IUpdateService);

		// Signal phase: after window open
		this.lifecycleMainService.phase = LifecycleMainPhase.AfterWindowOpen;

		// Observe shared process for errors
		this.handleSharedProcessErrors(telemetryService, sharedProcess);

		// Windows: mutex
		this.installMutex();

		// Remote Authorities
		protocol.registerHttpProtocol(Schemas.vscodeRemoteResource, (request, callback) => {
			callback({
				url: request.url.replace(/^vscode-remote-resource:/, 'http:'),
				method: request.method
			});
		});

		// Initialize update service
		if (updateService instanceof Win32UpdateService || updateService instanceof LinuxUpdateService || updateService instanceof DarwinUpdateService) {
			updateService.initialize();
		}

		// Start to fetch shell environment (if needed) after window has opened
		// Since this operation can take a long time, we want to warm it up while
		// the window is opening.
		// We also show an error to the user in case this fails.
		this.resolveShellEnvironment(this.environmentMainService.args, process.env, true);

		// Crash reporter
		this.updateCrashReporterEnablement();
	}

	private async installMutex(): Promise<void> {
		const win32MutexName = this.productService.win32MutexName;
		if (isWindows && win32MutexName) {
			try {
				const WindowsMutex = await import('windows-mutex');
				const mutex = new WindowsMutex.Mutex(win32MutexName);
				once(this.lifecycleMainService.onWillShutdown)(() => mutex.release());
			} catch (error) {
				this.logService.error(error);
			}
		}
	}

	private handleSharedProcessErrors(telemetryService: ITelemetryService, sharedProcess: SharedProcess): void {
		let willShutdown = false;
		once(this.lifecycleMainService.onWillShutdown)(() => willShutdown = true);

		this._register(sharedProcess.onDidError(({ type, details }) => {

			// Logging
			let message: string;
			switch (type) {
				case WindowError.UNRESPONSIVE:
					message = 'SharedProcess: detected unresponsive window';
					break;
				case WindowError.PROCESS_GONE:
					message = `SharedProcess: renderer process gone (detail: ${details?.reason ?? '<unknown>'}, code: ${details?.exitCode ?? '<unknown>'})`;
					break;
				case WindowError.LOAD:
					message = `SharedProcess: failed to load (detail: ${details?.reason ?? '<unknown>'}, code: ${details?.exitCode ?? '<unknown>'})`;
					break;
			}
			onUnexpectedError(new Error(message));

			// Telemetry
			type SharedProcessErrorClassification = {
				type: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The type of shared process crash to understand the nature of the crash better.' };
				reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The type of shared process crash to understand the nature of the crash better.' };
				code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The type of shared process crash to understand the nature of the crash better.' };
				visible: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether shared process window was visible or not.' };
				shuttingdown: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the application is shutting down when the crash happens.' };
				owner: 'bpasero';
				comment: 'Event which fires whenever an error occurs in the shared process';

			};
			type SharedProcessErrorEvent = {
				type: WindowError;
				reason: string | undefined;
				code: number | undefined;
				visible: boolean;
				shuttingdown: boolean;
			};
			telemetryService.publicLog2<SharedProcessErrorEvent, SharedProcessErrorClassification>('sharedprocesserror', {
				type,
				reason: details?.reason,
				code: details?.exitCode,
				visible: sharedProcess.isVisible(),
				shuttingdown: willShutdown
			});
		}));
	}

	private async resolveShellEnvironment(args: NativeParsedArgs, env: IProcessEnvironment, notifyOnError: boolean): Promise<typeof process.env> {
		try {
			return await getResolvedShellEnv(this.logService, args, env);
		} catch (error) {
			const errorMessage = toErrorMessage(error);
			if (notifyOnError) {
				this.windowsMainService?.sendToFocused('vscode:showResolveShellEnvError', errorMessage);
			} else {
				this.logService.error(errorMessage);
			}
		}

		return {};
	}

	private async updateCrashReporterEnablement(): Promise<void> {

		// If enable-crash-reporter argv is undefined then this is a fresh start,
		// based on `telemetry.enableCrashreporter` settings, generate a UUID which
		// will be used as crash reporter id and also update the json file.

		try {
			const argvContent = await this.fileService.readFile(this.environmentMainService.argvResource);
			const argvString = argvContent.value.toString();
			const argvJSON = JSON.parse(stripComments(argvString));
			const telemetryLevel = getTelemetryLevel(this.configurationService);
			const enableCrashReporter = telemetryLevel >= TelemetryLevel.CRASH;

			// Initial startup
			if (argvJSON['enable-crash-reporter'] === undefined) {
				const additionalArgvContent = [
					'',
					'	// Allows to disable crash reporting.',
					'	// Should restart the app if the value is changed.',
					`	"enable-crash-reporter": ${enableCrashReporter},`,
					'',
					'	// Unique id used for correlating crash reports sent from this instance.',
					'	// Do not edit this value.',
					`	"crash-reporter-id": "${generateUuid()}"`,
					'}'
				];
				const newArgvString = argvString.substring(0, argvString.length - 2).concat(',\n', additionalArgvContent.join('\n'));

				await this.fileService.writeFile(this.environmentMainService.argvResource, VSBuffer.fromString(newArgvString));
			}

			// Subsequent startup: update crash reporter value if changed
			else {
				const newArgvString = argvString.replace(/"enable-crash-reporter": .*,/, `"enable-crash-reporter": ${enableCrashReporter},`);
				if (newArgvString !== argvString) {
					await this.fileService.writeFile(this.environmentMainService.argvResource, VSBuffer.fromString(newArgvString));
				}
			}
		} catch (error) {
			this.logService.error(error);
		}
	}

	private stopTracingEventually(accessor: ServicesAccessor, windows: ICodeWindow[]): void {
		this.logService.info('Tracing: waiting for windows to get ready...');

		const dialogMainService = accessor.get(IDialogMainService);

		let recordingStopped = false;
		const stopRecording = async (timeout: boolean) => {
			if (recordingStopped) {
				return;
			}

			recordingStopped = true; // only once

			const path = await contentTracing.stopRecording(`${randomPath(this.environmentMainService.userHome.fsPath, this.productService.applicationName)}.trace.txt`);

			if (!timeout) {
				dialogMainService.showMessageBox({
					title: this.productService.nameLong,
					type: 'info',
					message: localize('trace.message', "Successfully created trace."),
					detail: localize('trace.detail', "Please create an issue and manually attach the following file:\n{0}", path),
					buttons: [mnemonicButtonLabel(localize({ key: 'trace.ok', comment: ['&& denotes a mnemonic'] }, "&&OK"))],
					defaultId: 0,
					noLink: true
				}, withNullAsUndefined(BrowserWindow.getFocusedWindow()));
			} else {
				this.logService.info(`Tracing: data recorded (after 30s timeout) to ${path}`);
			}
		};

		// Wait up to 30s before creating the trace anyways
		const timeoutHandle = setTimeout(() => stopRecording(true), 30000);

		// Wait for all windows to get ready and stop tracing then
		Promise.all(windows.map(window => window.ready())).then(() => {
			clearTimeout(timeoutHandle);
			stopRecording(false);
		});
	}
}
