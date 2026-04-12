/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CodeApplication_1;
import { app, powerMonitor, protocol, session, systemPreferences } from 'electron';
import { addUNCHostToAllowlist, disableUNCAccessRestrictions } from '../../base/node/unc.js';
import { validatedIpcMain } from '../../base/parts/ipc/electron-main/ipcMain.js';
import { hostname, release } from 'os';
import { initWindowsVersionInfo } from '../../base/node/windowsVersion.js';
import { VSBuffer } from '../../base/common/buffer.js';
import { toErrorMessage } from '../../base/common/errorMessage.js';
import { Event } from '../../base/common/event.js';
import { parse } from '../../base/common/jsonc.js';
import { getPathLabel } from '../../base/common/labels.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../base/common/lifecycle.js';
import { Schemas, VSCODE_AUTHORITY } from '../../base/common/network.js';
import { join, posix } from '../../base/common/path.js';
import { isLinux, isLinuxSnap, isMacintosh, isWindows, OS } from '../../base/common/platform.js';
import { assertType } from '../../base/common/types.js';
import { URI } from '../../base/common/uri.js';
import { generateUuid } from '../../base/common/uuid.js';
import { registerContextMenuListener } from '../../base/parts/contextmenu/electron-main/contextmenu.js';
import { getDelayedChannel, ProxyChannel, StaticRouter } from '../../base/parts/ipc/common/ipc.js';
import { Server as ElectronIPCServer } from '../../base/parts/ipc/electron-main/ipc.electron.js';
import { Client as MessagePortClient } from '../../base/parts/ipc/electron-main/ipc.mp.js';
import { IProxyAuthService, ProxyAuthService } from '../../platform/native/electron-main/auth.js';
import { localize } from '../../nls.js';
import { IBackupMainService } from '../../platform/backup/electron-main/backup.js';
import { BackupMainService } from '../../platform/backup/electron-main/backupMainService.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { ElectronExtensionHostDebugBroadcastChannel } from '../../platform/debug/electron-main/extensionHostDebugIpc.js';
import { IDiagnosticsService } from '../../platform/diagnostics/common/diagnostics.js';
import { DiagnosticsMainService, IDiagnosticsMainService } from '../../platform/diagnostics/electron-main/diagnosticsMainService.js';
import { DialogMainService, IDialogMainService } from '../../platform/dialogs/electron-main/dialogMainService.js';
import { IEncryptionMainService } from '../../platform/encryption/common/encryptionService.js';
import { EncryptionMainService } from '../../platform/encryption/electron-main/encryptionMainService.js';
import { NativeBrowserElementsMainService, INativeBrowserElementsMainService } from '../../platform/browserElements/electron-main/nativeBrowserElementsMainService.js';
import { ipcBrowserViewChannelName } from '../../platform/browserView/common/browserView.js';
import { ipcBrowserViewGroupChannelName } from '../../platform/browserView/common/browserViewGroup.js';
import { BrowserViewMainService, IBrowserViewMainService } from '../../platform/browserView/electron-main/browserViewMainService.js';
import { BrowserViewGroupMainService, IBrowserViewGroupMainService } from '../../platform/browserView/electron-main/browserViewGroupMainService.js';
import { IEnvironmentMainService } from '../../platform/environment/electron-main/environmentMainService.js';
import { isLaunchedFromCli } from '../../platform/environment/node/argvHelper.js';
import { getResolvedShellEnv } from '../../platform/shell/node/shellEnv.js';
import { IExtensionHostStarter, ipcExtensionHostStarterChannelName } from '../../platform/extensions/common/extensionHostStarter.js';
import { ExtensionHostStarter } from '../../platform/extensions/electron-main/extensionHostStarter.js';
import { IExternalTerminalMainService } from '../../platform/externalTerminal/electron-main/externalTerminal.js';
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from '../../platform/externalTerminal/node/externalTerminalService.js';
import { ISandboxHelperMainService } from '../../platform/sandbox/electron-main/sandboxHelperService.js';
import { SandboxHelperService } from '../../platform/sandbox/node/sandboxHelper.js';
import { LOCAL_FILE_SYSTEM_CHANNEL_NAME } from '../../platform/files/common/diskFileSystemProviderClient.js';
import { IFileService } from '../../platform/files/common/files.js';
import { DiskFileSystemProviderChannel } from '../../platform/files/electron-main/diskFileSystemProviderServer.js';
import { DiskFileSystemProvider } from '../../platform/files/node/diskFileSystemProvider.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ProcessMainService } from '../../platform/process/electron-main/processMainService.js';
import { IKeyboardLayoutMainService, KeyboardLayoutMainService } from '../../platform/keyboardLayout/electron-main/keyboardLayoutMainService.js';
import { ILaunchMainService, LaunchMainService } from '../../platform/launch/electron-main/launchMainService.js';
import { ILifecycleMainService } from '../../platform/lifecycle/electron-main/lifecycleMainService.js';
import { ILoggerService, ILogService } from '../../platform/log/common/log.js';
import { IMenubarMainService, MenubarMainService } from '../../platform/menubar/electron-main/menubarMainService.js';
import { INativeHostMainService, NativeHostMainService } from '../../platform/native/electron-main/nativeHostMainService.js';
import { IMeteredConnectionService } from '../../platform/meteredConnection/common/meteredConnection.js';
import { METERED_CONNECTION_CHANNEL } from '../../platform/meteredConnection/common/meteredConnectionIpc.js';
import { MeteredConnectionChannel } from '../../platform/meteredConnection/electron-main/meteredConnectionChannel.js';
import { MeteredConnectionMainService } from '../../platform/meteredConnection/electron-main/meteredConnectionMainService.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { getRemoteAuthority } from '../../platform/remote/common/remoteHosts.js';
import { SharedProcess } from '../../platform/sharedProcess/electron-main/sharedProcess.js';
import { ISignService } from '../../platform/sign/common/sign.js';
import { IStateService } from '../../platform/state/node/state.js';
import { StorageDatabaseChannel } from '../../platform/storage/electron-main/storageIpc.js';
import { ApplicationStorageMainService, IApplicationStorageMainService, IStorageMainService, StorageMainService } from '../../platform/storage/electron-main/storageMainService.js';
import { resolveCommonProperties } from '../../platform/telemetry/common/commonProperties.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { TelemetryAppenderClient } from '../../platform/telemetry/common/telemetryIpc.js';
import { TelemetryService } from '../../platform/telemetry/common/telemetryService.js';
import { getPiiPathsFromEnvironment, getTelemetryLevel, isInternalTelemetry, NullTelemetryService, supportsTelemetry } from '../../platform/telemetry/common/telemetryUtils.js';
import { IUpdateService } from '../../platform/update/common/update.js';
import { UpdateChannel } from '../../platform/update/common/updateIpc.js';
import { DarwinUpdateService } from '../../platform/update/electron-main/updateService.darwin.js';
import { LinuxUpdateService } from '../../platform/update/electron-main/updateService.linux.js';
import { SnapUpdateService } from '../../platform/update/electron-main/updateService.snap.js';
import { Win32UpdateService } from '../../platform/update/electron-main/updateService.win32.js';
import { IURLService } from '../../platform/url/common/url.js';
import { URLHandlerChannelClient, URLHandlerRouter } from '../../platform/url/common/urlIpc.js';
import { NativeURLService } from '../../platform/url/common/urlService.js';
import { ElectronURLListener } from '../../platform/url/electron-main/electronUrlListener.js';
import { IWebviewManagerService } from '../../platform/webview/common/webviewManagerService.js';
import { WebviewMainService } from '../../platform/webview/electron-main/webviewMainService.js';
import { isFolderToOpen, isWorkspaceToOpen } from '../../platform/window/common/window.js';
import { getAllWindowsExcludingOffscreen, IWindowsMainService } from '../../platform/windows/electron-main/windows.js';
import { WindowsMainService } from '../../platform/windows/electron-main/windowsMainService.js';
import { ActiveWindowManager } from '../../platform/windows/node/windowTracker.js';
import { hasWorkspaceFileExtension } from '../../platform/workspace/common/workspace.js';
import { IWorkspacesService } from '../../platform/workspaces/common/workspaces.js';
import { IWorkspacesHistoryMainService, WorkspacesHistoryMainService } from '../../platform/workspaces/electron-main/workspacesHistoryMainService.js';
import { WorkspacesMainService } from '../../platform/workspaces/electron-main/workspacesMainService.js';
import { IWorkspacesManagementMainService, WorkspacesManagementMainService } from '../../platform/workspaces/electron-main/workspacesManagementMainService.js';
import { IPolicyService } from '../../platform/policy/common/policy.js';
import { PolicyChannel } from '../../platform/policy/common/policyIpc.js';
import { IUserDataProfilesMainService } from '../../platform/userDataProfile/electron-main/userDataProfile.js';
import { IExtensionsProfileScannerService } from '../../platform/extensionManagement/common/extensionsProfileScannerService.js';
import { IExtensionsScannerService } from '../../platform/extensionManagement/common/extensionsScannerService.js';
import { ExtensionsScannerService } from '../../platform/extensionManagement/node/extensionsScannerService.js';
import { UserDataProfilesHandler } from '../../platform/userDataProfile/electron-main/userDataProfilesHandler.js';
import { ProfileStorageChangesListenerChannel } from '../../platform/userDataProfile/electron-main/userDataProfileStorageIpc.js';
import { Promises, RunOnceScheduler, runWhenGlobalIdle } from '../../base/common/async.js';
import { CancellationToken } from '../../base/common/cancellation.js';
import { resolveMachineId, resolveSqmId, resolveDevDeviceId, validateDevDeviceId } from '../../platform/telemetry/electron-main/telemetryUtils.js';
import { ExtensionsProfileScannerService } from '../../platform/extensionManagement/node/extensionsProfileScannerService.js';
import { LoggerChannel } from '../../platform/log/electron-main/logIpc.js';
import { ILoggerMainService } from '../../platform/log/electron-main/loggerService.js';
import { IUtilityProcessWorkerMainService, UtilityProcessWorkerMainService } from '../../platform/utilityProcess/electron-main/utilityProcessWorkerMainService.js';
import { ipcUtilityProcessWorkerChannelName } from '../../platform/utilityProcess/common/utilityProcessWorkerService.js';
import { ILocalPtyService, TerminalIpcChannels } from '../../platform/terminal/common/terminal.js';
import { ElectronPtyHostStarter } from '../../platform/terminal/electron-main/electronPtyHostStarter.js';
import { PtyHostService } from '../../platform/terminal/node/ptyHostService.js';
import { ElectronAgentHostStarter } from '../../platform/agentHost/electron-main/electronAgentHostStarter.js';
import { AgentHostProcessManager } from '../../platform/agentHost/node/agentHostService.js';
import { AgentHostEnabledSettingId } from '../../platform/agentHost/common/agentService.js';
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, NodeRemoteResourceRouter } from '../../platform/remote/common/electronRemoteResources.js';
import { Lazy } from '../../base/common/lazy.js';
import { IAuxiliaryWindowsMainService } from '../../platform/auxiliaryWindow/electron-main/auxiliaryWindows.js';
import { AuxiliaryWindowsMainService } from '../../platform/auxiliaryWindow/electron-main/auxiliaryWindowsMainService.js';
import { normalizeNFC } from '../../base/common/normalization.js';
import { ICSSDevelopmentService, CSSDevelopmentService } from '../../platform/cssDev/node/cssDevService.js';
import { INativeMcpDiscoveryHelperService, NativeMcpDiscoveryHelperChannelName } from '../../platform/mcp/common/nativeMcpDiscoveryHelper.js';
import { NativeMcpDiscoveryHelperService } from '../../platform/mcp/node/nativeMcpDiscoveryHelperService.js';
import { IMcpGatewayService, McpGatewayChannelName } from '../../platform/mcp/common/mcpGateway.js';
import { McpGatewayService } from '../../platform/mcp/node/mcpGatewayService.js';
import { McpGatewayChannel } from '../../platform/mcp/node/mcpGatewayChannel.js';
import { IWebContentExtractorService } from '../../platform/webContentExtractor/common/webContentExtractor.js';
import { NativeWebContentExtractorService } from '../../platform/webContentExtractor/electron-main/webContentExtractorService.js';
import ErrorTelemetry from '../../platform/telemetry/electron-main/errorTelemetry.js';
/**
 * The main VS Code application. There will only ever be one instance,
 * even if the user starts many instances (e.g. from the command line).
 */
let CodeApplication = class CodeApplication extends Disposable {
    static { CodeApplication_1 = this; }
    static { this.SECURITY_PROTOCOL_HANDLING_CONFIRMATION_SETTING_KEY = {
        [Schemas.file]: 'security.promptForLocalFileProtocolHandling',
        [Schemas.vscodeRemote]: 'security.promptForRemoteFileProtocolHandling'
    }; }
    constructor(mainProcessNodeIpcServer, userEnv, mainInstantiationService, logService, loggerService, environmentMainService, lifecycleMainService, configurationService, stateService, fileService, productService, userDataProfilesMainService) {
        super();
        this.mainProcessNodeIpcServer = mainProcessNodeIpcServer;
        this.userEnv = userEnv;
        this.mainInstantiationService = mainInstantiationService;
        this.logService = logService;
        this.loggerService = loggerService;
        this.environmentMainService = environmentMainService;
        this.lifecycleMainService = lifecycleMainService;
        this.configurationService = configurationService;
        this.stateService = stateService;
        this.fileService = fileService;
        this.productService = productService;
        this.userDataProfilesMainService = userDataProfilesMainService;
        this.configureSession();
        this.registerListeners();
    }
    configureSession() {
        //#region Security related measures (https://electronjs.org/docs/tutorial/security)
        //
        // !!! DO NOT CHANGE without consulting the documentation !!!
        //
        const isUrlFromWindow = (requestingUrl) => requestingUrl?.startsWith(`${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}`);
        const isUrlFromWebview = (requestingUrl) => requestingUrl?.startsWith(`${Schemas.vscodeWebview}://`);
        const alwaysAllowedPermissions = new Set(['pointerLock', 'notifications']);
        const allowedPermissionsInWebview = new Set([
            ...alwaysAllowedPermissions,
            'clipboard-read',
            'clipboard-sanitized-write',
            // TODO(deepak1556): Should be removed once migration is complete
            // https://github.com/microsoft/vscode/issues/239228
            'deprecated-sync-clipboard-read',
        ]);
        const allowedPermissionsInCore = new Set([
            ...alwaysAllowedPermissions,
            'media',
            'local-fonts',
            // TODO(deepak1556): Should be removed once migration is complete
            // https://github.com/microsoft/vscode/issues/239228
            'deprecated-sync-clipboard-read',
        ]);
        session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
            if (isUrlFromWebview(details.requestingUrl)) {
                return callback(allowedPermissionsInWebview.has(permission));
            }
            if (isUrlFromWindow(details.requestingUrl)) {
                return callback(allowedPermissionsInCore.has(permission));
            }
            return callback(false);
        });
        session.defaultSession.setPermissionCheckHandler((_webContents, permission, _origin, details) => {
            if (isUrlFromWebview(details.requestingUrl)) {
                return allowedPermissionsInWebview.has(permission);
            }
            if (isUrlFromWindow(details.requestingUrl)) {
                return allowedPermissionsInCore.has(permission);
            }
            return false;
        });
        //#endregion
        //#region Request filtering
        // Block all SVG requests from unsupported origins
        const supportedSvgSchemes = new Set([Schemas.file, Schemas.vscodeFileResource, Schemas.vscodeRemoteResource, Schemas.vscodeManagedRemoteResource, 'devtools']);
        // But allow them if they are made from inside an webview
        const isSafeFrame = (requestFrame) => {
            for (let frame = requestFrame; frame; frame = frame.parent) {
                if (frame.url.startsWith(`${Schemas.vscodeWebview}://`)) {
                    return true;
                }
            }
            return false;
        };
        const isSvgRequestFromSafeContext = (details) => {
            return details.resourceType === 'xhr' || isSafeFrame(details.frame);
        };
        const isAllowedVsCodeFileRequest = (details) => {
            const frame = details.frame;
            if (!frame || !this.windowsMainService) {
                return false;
            }
            // Check to see if the request comes from one of the main windows (or shared process) and not from embedded content
            const windows = getAllWindowsExcludingOffscreen();
            for (const window of windows) {
                if (frame.processId === window.webContents.mainFrame.processId) {
                    return true;
                }
            }
            return false;
        };
        const isAllowedWebviewRequest = (uri, details) => {
            if (uri.path !== '/index.html') {
                return true; // Only restrict top level page of webviews: index.html
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
            const responseHeaders = details.responseHeaders;
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
        //#region Allow CORS for the PRSS CDN
        // https://github.com/microsoft/vscode-remote-release/issues/9246
        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            if (details.url.startsWith('https://vscode.download.prss.microsoft.com/')) {
                const responseHeaders = details.responseHeaders ?? Object.create(null);
                if (responseHeaders['Access-Control-Allow-Origin'] === undefined) {
                    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
                    return callback({ cancel: false, responseHeaders });
                }
            }
            return callback({ cancel: false });
        });
        const defaultSession = session.defaultSession;
        if (typeof defaultSession.setCodeCachePath === 'function' && this.environmentMainService.codeCachePath) {
            // Make sure to partition Chrome's code cache folder
            // in the same way as our code cache path to help
            // invalidate caches that we know are invalid
            // (https://github.com/microsoft/vscode/issues/120655)
            defaultSession.setCodeCachePath(join(this.environmentMainService.codeCachePath, 'chrome'));
        }
        //#endregion
        //#region UNC Host Allowlist (Windows)
        if (isWindows) {
            if (this.configurationService.getValue('security.restrictUNCAccess') === false) {
                disableUNCAccessRestrictions();
            }
            else {
                addUNCHostToAllowlist(this.configurationService.getValue('security.allowedUNCHosts'));
            }
        }
        //#endregion
    }
    registerListeners() {
        // Dispose on shutdown
        Event.once(this.lifecycleMainService.onWillShutdown)(() => this.dispose());
        // Contextmenu via IPC support
        registerContextMenuListener();
        // Accessibility change event
        app.on('accessibility-support-changed', (event, accessibilitySupportEnabled) => {
            this.windowsMainService?.sendToAll('vscode:accessibilitySupportChanged', accessibilitySupportEnabled);
        });
        // macOS dock activate
        app.on('activate', async (event, hasVisibleWindows) => {
            this.logService.trace('app#activate');
            // Mac only event: open new window when we get activated
            if (!hasVisibleWindows) {
                await this.windowsMainService?.openEmptyWindow({ context: 1 /* OpenContext.DOCK */ });
            }
        });
        //#region Security related measures (https://electronjs.org/docs/tutorial/security)
        //
        // !!! DO NOT CHANGE without consulting the documentation !!!
        //
        app.on('web-contents-created', (event, contents) => {
            // Auxiliary Window: delegate to `AuxiliaryWindow` class
            if (contents?.opener?.url.startsWith(`${Schemas.vscodeFileResource}://${VSCODE_AUTHORITY}/`)) {
                this.logService.trace('[aux window]  app.on("web-contents-created"): Registering auxiliary window');
                this.auxiliaryWindowsMainService?.registerWindow(contents);
            }
            // Handle any in-page navigation
            contents.on('will-navigate', event => {
                if (BrowserViewMainService.isBrowserViewWebContents(contents)) {
                    return; // Allow navigation in integrated browser views
                }
                this.logService.error('webContents#will-navigate: Prevented webcontent navigation');
                event.preventDefault(); // Prevent any in-page navigation
            });
            // All Windows: only allow about:blank auxiliary windows to open
            // For all other URLs, delegate to the OS.
            contents.setWindowOpenHandler(details => {
                // about:blank windows can open as window witho our default options
                if (details.url === 'about:blank') {
                    this.logService.trace('[aux window] webContents#setWindowOpenHandler: Allowing auxiliary window to open on about:blank');
                    return {
                        action: 'allow',
                        overrideBrowserWindowOptions: this.auxiliaryWindowsMainService?.createWindow(details)
                    };
                }
                // Any other URL: delegate to OS
                else {
                    this.logService.trace(`webContents#setWindowOpenHandler: Prevented opening window with URL ${details.url}}`);
                    this.nativeHostMainService?.openExternal(undefined, details.url);
                    return { action: 'deny' };
                }
            });
        });
        //#endregion
        let macOpenFileURIs = [];
        let runningTimeout = undefined;
        app.on('open-file', (event, path) => {
            path = normalizeNFC(path); // macOS only: normalize paths to NFC form
            this.logService.trace('app#open-file: ', path);
            event.preventDefault();
            // Keep in array because more might come!
            macOpenFileURIs.push(hasWorkspaceFileExtension(path) ? { workspaceUri: URI.file(path) } : { fileUri: URI.file(path) });
            // Clear previous handler if any
            if (runningTimeout !== undefined) {
                clearTimeout(runningTimeout);
                runningTimeout = undefined;
            }
            // Handle paths delayed in case more are coming!
            runningTimeout = setTimeout(async () => {
                await this.windowsMainService?.open({
                    context: 1 /* OpenContext.DOCK */ /* can also be opening from finder while app is running */,
                    cli: this.environmentMainService.args,
                    urisToOpen: macOpenFileURIs,
                    gotoLineMode: false,
                    preferNewWindow: true /* dropping on the dock or opening from finder prefers to open in a new window */
                });
                macOpenFileURIs = [];
                runningTimeout = undefined;
            }, 100);
        });
        app.on('new-window-for-tab', async () => {
            await this.windowsMainService?.openEmptyWindow({ context: 4 /* OpenContext.DESKTOP */ }); //macOS native tab "+" button
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
            let args;
            let env;
            if (window?.config) {
                args = window.config;
                env = { ...process.env, ...window.config.userEnv };
            }
            else {
                args = this.environmentMainService.args;
                env = process.env;
            }
            // Resolve shell env
            return this.resolveShellEnvironment(args, env, false);
        });
        validatedIpcMain.on('vscode:toggleDevTools', event => event.sender.toggleDevTools());
        validatedIpcMain.on('vscode:openDevTools', event => event.sender.openDevTools());
        validatedIpcMain.on('vscode:reloadWindow', event => event.sender.reload());
        validatedIpcMain.handle('vscode:notifyZoomLevel', async (event, zoomLevel) => {
            const window = this.windowsMainService?.getWindowByWebContents(event.sender);
            if (window) {
                window.notifyZoomLevel(zoomLevel);
            }
        });
        //#endregion
    }
    async startup() {
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
                systemPreferences.setUserDefault('NSUseImprovedLayoutPass', 'boolean', true);
            }
        }
        catch (error) {
            this.logService.error(error);
        }
        // Main process server (electron IPC based)
        const mainProcessElectronServer = new ElectronIPCServer();
        Event.once(this.lifecycleMainService.onWillShutdown)(e => {
            if (e.reason === 2 /* ShutdownReason.KILL */) {
                // When we go down abnormally, make sure to free up
                // any IPC we accept from other windows to reduce
                // the chance of doing work after we go down. Kill
                // is special in that it does not orderly shutdown
                // windows.
                mainProcessElectronServer.dispose();
            }
        });
        // Resolve unique machine ID
        const [machineId, sqmId, devDeviceId] = await Promise.all([
            resolveMachineId(this.stateService, this.logService),
            resolveSqmId(this.stateService, this.logService),
            resolveDevDeviceId(this.stateService, this.logService)
        ]);
        // Shared process
        const { sharedProcessReady, sharedProcessClient } = this.setupSharedProcess(machineId, sqmId, devDeviceId);
        // Services
        const appInstantiationService = await this.initServices(machineId, sqmId, devDeviceId, sharedProcessReady);
        // Error telemetry
        appInstantiationService.invokeFunction(accessor => this._register(new ErrorTelemetry(accessor.get(ILogService), accessor.get(ITelemetryService))));
        // Metered connection telemetry
        appInstantiationService.invokeFunction(accessor => {
            accessor.get(IMeteredConnectionService).setTelemetryService(accessor.get(ITelemetryService));
        });
        // Auth Handler
        appInstantiationService.invokeFunction(accessor => accessor.get(IProxyAuthService));
        // Transient profiles handler
        this._register(appInstantiationService.createInstance(UserDataProfilesHandler));
        // Init Channels
        appInstantiationService.invokeFunction(accessor => this.initChannels(accessor, mainProcessElectronServer, sharedProcessClient));
        // Setup Protocol URL Handlers
        const initialProtocolUrls = await appInstantiationService.invokeFunction(accessor => this.setupProtocolUrlHandlers(accessor, mainProcessElectronServer));
        // Setup vscode-remote-resource protocol handler
        this.setupManagedRemoteResourceUrlHandler(mainProcessElectronServer);
        // Signal phase: ready - before opening first window
        this.lifecycleMainService.phase = 2 /* LifecycleMainPhase.Ready */;
        // Open Windows
        await appInstantiationService.invokeFunction(accessor => this.openFirstWindow(accessor, initialProtocolUrls));
        // Signal phase: after window open
        this.lifecycleMainService.phase = 3 /* LifecycleMainPhase.AfterWindowOpen */;
        // Post Open Windows Tasks
        this.afterWindowOpen(appInstantiationService);
        // Set lifecycle phase to `Eventually` after a short delay and when idle (min 2.5sec, max 5sec)
        const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
            this._register(runWhenGlobalIdle(() => {
                // Signal phase: eventually
                this.lifecycleMainService.phase = 4 /* LifecycleMainPhase.Eventually */;
                // Eventually Post Open Window Tasks
                this.eventuallyAfterWindowOpen();
            }, 2500));
        }, 2500));
        eventuallyPhaseScheduler.schedule();
    }
    async setupProtocolUrlHandlers(accessor, mainProcessElectronServer) {
        const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);
        const urlService = accessor.get(IURLService);
        const nativeHostMainService = this.nativeHostMainService = accessor.get(INativeHostMainService);
        const dialogMainService = accessor.get(IDialogMainService);
        // Install URL handlers that deal with protocl URLs either
        // from this process by opening windows and/or by forwarding
        // the URLs into a window process to be handled there.
        const app = this;
        urlService.registerHandler({
            async handleURL(uri, options) {
                return app.handleProtocolUrl(windowsMainService, dialogMainService, urlService, uri, options);
            }
        });
        const activeWindowManager = this._register(new ActiveWindowManager({
            onDidOpenMainWindow: nativeHostMainService.onDidOpenMainWindow,
            onDidFocusMainWindow: nativeHostMainService.onDidFocusMainWindow,
            getActiveWindowId: () => nativeHostMainService.getActiveWindowId(-1)
        }));
        const activeWindowRouter = new StaticRouter(ctx => activeWindowManager.getActiveClientId().then(id => ctx === id));
        const urlHandlerRouter = new URLHandlerRouter(activeWindowRouter, this.logService);
        const urlHandlerChannel = mainProcessElectronServer.getChannel('urlHandler', urlHandlerRouter);
        urlService.registerHandler(new URLHandlerChannelClient(urlHandlerChannel));
        const initialProtocolUrls = await this.resolveInitialProtocolUrls(windowsMainService, dialogMainService);
        this._register(new ElectronURLListener(initialProtocolUrls?.urls, urlService, windowsMainService, this.environmentMainService, this.productService, this.logService));
        return initialProtocolUrls;
    }
    setupManagedRemoteResourceUrlHandler(mainProcessElectronServer) {
        const notFound = () => ({ statusCode: 404, data: 'Not found' });
        const remoteResourceChannel = new Lazy(() => mainProcessElectronServer.getChannel(NODE_REMOTE_RESOURCE_CHANNEL_NAME, new NodeRemoteResourceRouter()));
        protocol.registerBufferProtocol(Schemas.vscodeManagedRemoteResource, (request, callback) => {
            const url = URI.parse(request.url);
            if (!url.authority.startsWith('window:')) {
                return callback(notFound());
            }
            remoteResourceChannel.value.call(NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, [url]).then(r => callback({ ...r, data: Buffer.from(r.body, 'base64') }), err => {
                this.logService.warn('error dispatching remote resource call', err);
                callback({ statusCode: 500, data: String(err) });
            });
        });
    }
    async resolveInitialProtocolUrls(windowsMainService, dialogMainService) {
        /**
         * Protocol URL handling on startup is complex, refer to
         * {@link IInitialProtocolUrls} for an explainer.
         */
        // Windows/Linux: protocol handler invokes CLI with --open-url
        const protocolUrlsFromCommandLine = this.environmentMainService.args['open-url'] ? this.environmentMainService.args._urls || [] : [];
        if (protocolUrlsFromCommandLine.length > 0) {
            this.logService.trace('app#resolveInitialProtocolUrls() protocol urls from command line:', protocolUrlsFromCommandLine);
        }
        // macOS: open-url events that were received before the app is ready
        const protocolUrlsFromEvent = (global.getOpenUrls?.() || []);
        if (protocolUrlsFromEvent.length > 0) {
            this.logService.trace(`app#resolveInitialProtocolUrls() protocol urls from macOS 'open-url' event:`, protocolUrlsFromEvent);
        }
        if (protocolUrlsFromCommandLine.length + protocolUrlsFromEvent.length === 0) {
            return undefined;
        }
        const protocolUrls = [
            ...protocolUrlsFromCommandLine,
            ...protocolUrlsFromEvent
        ].map(url => {
            try {
                return { uri: URI.parse(url), originalUrl: url };
            }
            catch {
                this.logService.trace('app#resolveInitialProtocolUrls() protocol url failed to parse:', url);
                return undefined;
            }
        });
        const openables = [];
        const urls = [];
        for (const protocolUrl of protocolUrls) {
            if (!protocolUrl) {
                continue; // invalid
            }
            const windowOpenable = this.getWindowOpenableFromProtocolUrl(protocolUrl.uri);
            if (windowOpenable) {
                if (process.isEmbeddedApp) {
                    this.logService.trace('app#resolveInitialProtocolUrls() agents app skipping window openable:', protocolUrl.uri.toString(true));
                    continue; // Agents app: skip all window openables (file/folder/workspace)
                }
                if (await this.shouldBlockOpenable(windowOpenable, windowsMainService, dialogMainService)) {
                    this.logService.trace('app#resolveInitialProtocolUrls() protocol url was blocked:', protocolUrl.uri.toString(true));
                    continue; // blocked
                }
                else {
                    this.logService.trace('app#resolveInitialProtocolUrls() protocol url will be handled as window to open:', protocolUrl.uri.toString(true), windowOpenable);
                    openables.push(windowOpenable); // handled as window to open
                }
            }
            else {
                this.logService.trace('app#resolveInitialProtocolUrls() protocol url will be passed to active window for handling:', protocolUrl.uri.toString(true));
                urls.push(protocolUrl); // handled within active window
            }
        }
        return { urls, openables };
    }
    async shouldBlockOpenable(openable, windowsMainService, dialogMainService) {
        let openableUri;
        let message;
        if (isWorkspaceToOpen(openable)) {
            openableUri = openable.workspaceUri;
            message = localize('confirmOpenMessageWorkspace', "An external application wants to open '{0}' in {1}. Do you want to open this workspace file?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
        }
        else if (isFolderToOpen(openable)) {
            openableUri = openable.folderUri;
            message = localize('confirmOpenMessageFolder', "An external application wants to open '{0}' in {1}. Do you want to open this folder?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
        }
        else {
            openableUri = openable.fileUri;
            message = localize('confirmOpenMessageFileOrFolder', "An external application wants to open '{0}' in {1}. Do you want to open this file or folder?", openableUri.scheme === Schemas.file ? getPathLabel(openableUri, { os: OS, tildify: this.environmentMainService }) : openableUri.toString(true), this.productService.nameShort);
        }
        if (openableUri.scheme !== Schemas.file && openableUri.scheme !== Schemas.vscodeRemote) {
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            //
            // NOTE: we currently only ask for confirmation for `file` and `vscode-remote`
            // authorities here. There is an additional confirmation for `extension.id`
            // authorities from within the window.
            //
            // IF YOU ARE PLANNING ON ADDING ANOTHER AUTHORITY HERE, MAKE SURE TO ALSO
            // ADD IT TO THE CONFIRMATION CODE BELOW OR INSIDE THE WINDOW!
            //
            // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            return false;
        }
        const askForConfirmation = this.configurationService.getValue(CodeApplication_1.SECURITY_PROTOCOL_HANDLING_CONFIRMATION_SETTING_KEY[openableUri.scheme]);
        if (askForConfirmation === false) {
            return false; // not blocked via settings
        }
        const { response, checkboxChecked } = await dialogMainService.showMessageBox({
            type: 'warning',
            buttons: [
                localize({ key: 'open', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
                localize({ key: 'cancel', comment: ['&& denotes a mnemonic'] }, "&&No")
            ],
            message,
            detail: localize('confirmOpenDetail', "If you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should press 'No'"),
            checkboxLabel: openableUri.scheme === Schemas.file ? localize('doNotAskAgainLocal', "Allow opening local paths without asking") : localize('doNotAskAgainRemote', "Allow opening remote paths without asking"),
            cancelId: 1
        });
        if (response !== 0) {
            return true; // blocked by user choice
        }
        if (checkboxChecked) {
            // Due to https://github.com/microsoft/vscode/issues/195436, we can only
            // update settings from within a window. But we do not know if a window
            // is about to open or can already handle the request, so we have to send
            // to any current window and any newly opening window.
            const request = { channel: 'vscode:disablePromptForProtocolHandling', args: openableUri.scheme === Schemas.file ? 'local' : 'remote' };
            windowsMainService.sendToFocused(request.channel, request.args);
            windowsMainService.sendToOpeningWindow(request.channel, request.args);
        }
        return false; // not blocked by user choice
    }
    getWindowOpenableFromProtocolUrl(uri) {
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
            let authority;
            let path;
            if (secondSlash !== -1) {
                authority = uri.path.substring(1, secondSlash);
                path = uri.path.substring(secondSlash);
            }
            else {
                authority = uri.path.substring(1);
                path = '/';
            }
            let query = uri.query;
            const params = new URLSearchParams(uri.query);
            if (params.get('windowId') === '_blank') {
                // Make sure to unset any `windowId=_blank` here
                // https://github.com/microsoft/vscode/issues/191902
                params.delete('windowId');
                query = params.toString();
            }
            const remoteUri = URI.from({ scheme: Schemas.vscodeRemote, authority, path, query, fragment: uri.fragment });
            if (hasWorkspaceFileExtension(path)) {
                return { workspaceUri: remoteUri };
            }
            if (/:[\d]+$/.test(path)) {
                // path with :line:column syntax
                return { fileUri: remoteUri };
            }
            return { folderUri: remoteUri };
        }
        return undefined;
    }
    async handleProtocolUrl(windowsMainService, dialogMainService, urlService, uri, options) {
        this.logService.trace('app#handleProtocolUrl():', uri.toString(true), options);
        // Agents app: ensure the agents window is open, then let other handlers process the URL.
        if (process.isEmbeddedApp) {
            this.logService.trace('app#handleProtocolUrl() agents app handling protocol URL:', uri.toString(true));
            // Skip window openables (file/folder/workspace) for security
            const windowOpenable = this.getWindowOpenableFromProtocolUrl(uri);
            if (windowOpenable) {
                this.logService.trace('app#handleProtocolUrl() agents app skipping window openable:', uri.toString(true));
                return true;
            }
            // Ensure agents window is open to receive the URL
            const windows = await windowsMainService.openAgentsWindow({ context: 6 /* OpenContext.LINK */, cli: this.environmentMainService.args });
            const window = windows.at(0);
            window?.focus();
            await window?.ready();
            // Return false to let subsequent handlers (e.g., URLHandlerChannelClient) forward the URL
            return false;
        }
        // Support 'workspace' URLs (https://github.com/microsoft/vscode/issues/124263)
        if (uri.scheme === this.productService.urlProtocol && uri.path === 'workspace') {
            uri = uri.with({
                authority: Schemas.file,
                path: URI.parse(uri.query).path,
                query: ''
            });
        }
        let shouldOpenInNewWindow = false;
        // We should handle the URI in a new window if the URL contains `windowId=_blank`
        const params = new URLSearchParams(uri.query);
        if (params.get('windowId') === '_blank') {
            this.logService.trace(`app#handleProtocolUrl() found 'windowId=_blank' as parameter, setting shouldOpenInNewWindow=true:`, uri.toString(true));
            params.delete('windowId');
            uri = uri.with({ query: params.toString() });
            shouldOpenInNewWindow = true;
        }
        // or if no window is open (macOS only)
        else if (isMacintosh && windowsMainService.getWindowCount() === 0) {
            this.logService.trace(`app#handleProtocolUrl() running on macOS with no window open, setting shouldOpenInNewWindow=true:`, uri.toString(true));
            shouldOpenInNewWindow = true;
        }
        // Pass along whether the application is being opened via a Continue On flow
        const continueOn = params.get('continueOn');
        if (continueOn !== null) {
            this.logService.trace(`app#handleProtocolUrl() found 'continueOn' as parameter:`, uri.toString(true));
            params.delete('continueOn');
            uri = uri.with({ query: params.toString() });
            this.environmentMainService.continueOn = continueOn ?? undefined;
        }
        // Extract session parameter to open a specific chat session in the target window
        const session = params.get('session');
        if (session !== null) {
            this.logService.trace(`app#handleProtocolUrl() found 'session' as parameter:`, uri.toString(true));
            params.delete('session');
            uri = uri.with({ query: params.toString() });
        }
        // Check if the protocol URL is a window openable to open...
        const windowOpenableFromProtocolUrl = this.getWindowOpenableFromProtocolUrl(uri);
        if (windowOpenableFromProtocolUrl) {
            if (await this.shouldBlockOpenable(windowOpenableFromProtocolUrl, windowsMainService, dialogMainService)) {
                this.logService.trace('app#handleProtocolUrl() protocol url was blocked:', uri.toString(true));
                return true; // If openable should be blocked, behave as if it's handled
            }
            else {
                this.logService.trace('app#handleProtocolUrl() opening protocol url as window:', windowOpenableFromProtocolUrl, uri.toString(true));
                const window = (await windowsMainService.open({
                    context: 6 /* OpenContext.LINK */,
                    cli: { ...this.environmentMainService.args },
                    urisToOpen: [windowOpenableFromProtocolUrl],
                    forceNewWindow: shouldOpenInNewWindow,
                    gotoLineMode: true
                    // remoteAuthority: will be determined based on windowOpenableFromProtocolUrl
                })).at(0);
                window?.focus(); // this should help ensuring that the right window gets focus when multiple are opened
                // Open chat session in the target window if requested
                if (window && session) {
                    window.sendWhenReady('vscode:openChatSession', CancellationToken.None, session);
                }
                return true;
            }
        }
        // ...or if we should open in a new window and then handle it within that window
        if (shouldOpenInNewWindow) {
            this.logService.trace('app#handleProtocolUrl() opening empty window and passing in protocol url:', uri.toString(true));
            const window = (await windowsMainService.open({
                context: 6 /* OpenContext.LINK */,
                cli: { ...this.environmentMainService.args },
                forceNewWindow: true,
                forceEmpty: true,
                gotoLineMode: true,
                remoteAuthority: getRemoteAuthority(uri)
            })).at(0);
            await window?.ready();
            return urlService.open(uri, options);
        }
        this.logService.trace('app#handleProtocolUrl(): not handled', uri.toString(true), options);
        return false;
    }
    setupSharedProcess(machineId, sqmId, devDeviceId) {
        const sharedProcess = this._register(this.mainInstantiationService.createInstance(SharedProcess, machineId, sqmId, devDeviceId));
        this._register(sharedProcess.onDidCrash(() => this.windowsMainService?.sendToFocused('vscode:reportSharedProcessCrash')));
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
        return { sharedProcessReady, sharedProcessClient };
    }
    async initServices(machineId, sqmId, devDeviceId, sharedProcessReady) {
        const services = new ServiceCollection();
        // Update
        switch (process.platform) {
            case 'win32':
                services.set(IUpdateService, new SyncDescriptor(Win32UpdateService));
                break;
            case 'linux':
                if (isLinuxSnap) {
                    services.set(IUpdateService, new SyncDescriptor(SnapUpdateService, [process.env['SNAP'], process.env['SNAP_REVISION']]));
                }
                else {
                    services.set(IUpdateService, new SyncDescriptor(LinuxUpdateService));
                }
                break;
            case 'darwin':
                services.set(IUpdateService, new SyncDescriptor(DarwinUpdateService));
                break;
        }
        // Windows
        services.set(IWindowsMainService, new SyncDescriptor(WindowsMainService, [machineId, sqmId, devDeviceId, this.userEnv], false));
        services.set(IAuxiliaryWindowsMainService, new SyncDescriptor(AuxiliaryWindowsMainService, undefined, false));
        // Dialogs
        const dialogMainService = new DialogMainService(this.logService, this.productService);
        services.set(IDialogMainService, dialogMainService);
        // Launch
        services.set(ILaunchMainService, new SyncDescriptor(LaunchMainService, undefined, false /* proxied to other processes */));
        // Diagnostics
        services.set(IDiagnosticsMainService, new SyncDescriptor(DiagnosticsMainService, undefined, false /* proxied to other processes */));
        services.set(IDiagnosticsService, ProxyChannel.toService(getDelayedChannel(sharedProcessReady.then(client => client.getChannel('diagnostics')))));
        // Encryption
        services.set(IEncryptionMainService, new SyncDescriptor(EncryptionMainService));
        // Browser Elements
        services.set(INativeBrowserElementsMainService, new SyncDescriptor(NativeBrowserElementsMainService, undefined, false /* proxied to other processes */));
        // Browser View
        services.set(IBrowserViewMainService, new SyncDescriptor(BrowserViewMainService, undefined, false /* proxied to other processes */));
        services.set(IBrowserViewGroupMainService, new SyncDescriptor(BrowserViewGroupMainService, undefined, false /* proxied to other processes */));
        // Keyboard Layout
        services.set(IKeyboardLayoutMainService, new SyncDescriptor(KeyboardLayoutMainService));
        // Native Host
        services.set(INativeHostMainService, new SyncDescriptor(NativeHostMainService, undefined, false /* proxied to other processes */));
        // Metered Connection
        const meteredConnectionService = new MeteredConnectionMainService(this.configurationService);
        services.set(IMeteredConnectionService, meteredConnectionService);
        // Web Contents Extractor
        services.set(IWebContentExtractorService, new SyncDescriptor(NativeWebContentExtractorService, undefined, false /* proxied to other processes */));
        // Webview Manager
        services.set(IWebviewManagerService, new SyncDescriptor(WebviewMainService));
        // Menubar
        services.set(IMenubarMainService, new SyncDescriptor(MenubarMainService));
        // Extension Host Starter
        services.set(IExtensionHostStarter, new SyncDescriptor(ExtensionHostStarter));
        // Storage
        services.set(IStorageMainService, new SyncDescriptor(StorageMainService));
        services.set(IApplicationStorageMainService, new SyncDescriptor(ApplicationStorageMainService));
        // Terminal
        const ptyHostStarter = new ElectronPtyHostStarter({
            graceTime: 60000 /* LocalReconnectConstants.GraceTime */,
            shortGraceTime: 6000 /* LocalReconnectConstants.ShortGraceTime */,
            scrollback: this.configurationService.getValue("terminal.integrated.persistentSessionScrollback" /* TerminalSettingId.PersistentSessionScrollback */) ?? 100
        }, this.configurationService, this.environmentMainService, this.lifecycleMainService, this.logService);
        const ptyHostService = new PtyHostService(ptyHostStarter, this.configurationService, this.logService, this.loggerService);
        services.set(ILocalPtyService, ptyHostService);
        // Agent Host
        if (this.configurationService.getValue(AgentHostEnabledSettingId)) {
            const agentHostStarter = new ElectronAgentHostStarter(this.environmentMainService, this.lifecycleMainService, this.logService);
            this._register(new AgentHostProcessManager(agentHostStarter, this.logService, this.loggerService));
        }
        // External terminal
        if (isWindows) {
            services.set(IExternalTerminalMainService, new SyncDescriptor(WindowsExternalTerminalService));
        }
        else if (isMacintosh) {
            services.set(IExternalTerminalMainService, new SyncDescriptor(MacExternalTerminalService));
        }
        else if (isLinux) {
            services.set(IExternalTerminalMainService, new SyncDescriptor(LinuxExternalTerminalService));
        }
        services.set(ISandboxHelperMainService, new SyncDescriptor(SandboxHelperService));
        // Backups
        const backupMainService = new BackupMainService(this.environmentMainService, this.configurationService, this.logService, this.stateService);
        services.set(IBackupMainService, backupMainService);
        // Workspaces
        const workspacesManagementMainService = new WorkspacesManagementMainService(this.environmentMainService, this.logService, this.userDataProfilesMainService, backupMainService, dialogMainService);
        services.set(IWorkspacesManagementMainService, workspacesManagementMainService);
        services.set(IWorkspacesService, new SyncDescriptor(WorkspacesMainService, undefined, false /* proxied to other processes */));
        services.set(IWorkspacesHistoryMainService, new SyncDescriptor(WorkspacesHistoryMainService, undefined, false));
        // URL handling
        services.set(IURLService, new SyncDescriptor(NativeURLService, undefined, false /* proxied to other processes */));
        // Telemetry
        if (supportsTelemetry(this.productService, this.environmentMainService)) {
            const isInternal = isInternalTelemetry(this.productService, this.configurationService);
            const channel = getDelayedChannel(sharedProcessReady.then(client => client.getChannel('telemetryAppender')));
            const appender = new TelemetryAppenderClient(channel);
            const commonProperties = resolveCommonProperties(release(), hostname(), process.arch, this.productService.commit, this.productService.version, machineId, sqmId, devDeviceId, isInternal, this.productService.date, this.productService.telemetryAppName);
            const piiPaths = getPiiPathsFromEnvironment(this.environmentMainService);
            const config = { appenders: [appender], commonProperties, piiPaths, sendErrorTelemetry: true };
            services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config], false));
        }
        else {
            services.set(ITelemetryService, NullTelemetryService);
        }
        // Default Extensions Profile Init
        services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, undefined, true));
        services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, undefined, true));
        // Utility Process Worker
        services.set(IUtilityProcessWorkerMainService, new SyncDescriptor(UtilityProcessWorkerMainService, undefined, true));
        // Proxy Auth
        services.set(IProxyAuthService, new SyncDescriptor(ProxyAuthService));
        // MCP
        services.set(INativeMcpDiscoveryHelperService, new SyncDescriptor(NativeMcpDiscoveryHelperService));
        services.set(IMcpGatewayService, new SyncDescriptor(McpGatewayService));
        // Dev Only: CSS service (for ESM)
        services.set(ICSSDevelopmentService, new SyncDescriptor(CSSDevelopmentService, undefined, true));
        // Init services that require it
        await Promises.settled([
            backupMainService.initialize(),
            workspacesManagementMainService.initialize()
        ]);
        return this.mainInstantiationService.createChild(services);
    }
    initChannels(accessor, mainProcessElectronServer, sharedProcessClient) {
        // Channels registered to node.js are exposed to second instances
        // launching because that is the only way the second instance
        // can talk to the first instance. Electron IPC does not work
        // across apps until `requestSingleInstance` APIs are adopted.
        const disposables = this._register(new DisposableStore());
        const launchChannel = ProxyChannel.fromService(accessor.get(ILaunchMainService), disposables, { disableMarshalling: true });
        this.mainProcessNodeIpcServer.registerChannel('launch', launchChannel);
        const diagnosticsChannel = ProxyChannel.fromService(accessor.get(IDiagnosticsMainService), disposables, { disableMarshalling: true });
        this.mainProcessNodeIpcServer.registerChannel('diagnostics', diagnosticsChannel);
        // Policies (main & shared process)
        const policyChannel = disposables.add(new PolicyChannel(accessor.get(IPolicyService)));
        mainProcessElectronServer.registerChannel('policy', policyChannel);
        sharedProcessClient.then(client => client.registerChannel('policy', policyChannel));
        // Local Files
        const diskFileSystemProvider = this.fileService.getProvider(Schemas.file);
        assertType(diskFileSystemProvider instanceof DiskFileSystemProvider);
        const fileSystemProviderChannel = disposables.add(new DiskFileSystemProviderChannel(diskFileSystemProvider, this.logService, this.environmentMainService));
        mainProcessElectronServer.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, fileSystemProviderChannel);
        sharedProcessClient.then(client => client.registerChannel(LOCAL_FILE_SYSTEM_CHANNEL_NAME, fileSystemProviderChannel));
        // User Data Profiles
        const userDataProfilesService = ProxyChannel.fromService(accessor.get(IUserDataProfilesMainService), disposables);
        mainProcessElectronServer.registerChannel('userDataProfiles', userDataProfilesService);
        sharedProcessClient.then(client => client.registerChannel('userDataProfiles', userDataProfilesService));
        // Update
        const updateChannel = new UpdateChannel(accessor.get(IUpdateService));
        mainProcessElectronServer.registerChannel('update', updateChannel);
        // Metered Connection
        const meteredConnectionChannel = new MeteredConnectionChannel(accessor.get(IMeteredConnectionService));
        mainProcessElectronServer.registerChannel(METERED_CONNECTION_CHANNEL, meteredConnectionChannel);
        sharedProcessClient.then(client => client.registerChannel(METERED_CONNECTION_CHANNEL, meteredConnectionChannel));
        // Process
        const processChannel = ProxyChannel.fromService(new ProcessMainService(this.logService, accessor.get(IDiagnosticsService), accessor.get(IDiagnosticsMainService)), disposables);
        mainProcessElectronServer.registerChannel('process', processChannel);
        // Encryption
        const encryptionChannel = ProxyChannel.fromService(accessor.get(IEncryptionMainService), disposables);
        mainProcessElectronServer.registerChannel('encryption', encryptionChannel);
        // Browser Elements
        const browserElementsChannel = ProxyChannel.fromService(accessor.get(INativeBrowserElementsMainService), disposables);
        mainProcessElectronServer.registerChannel('browserElements', browserElementsChannel);
        sharedProcessClient.then(client => client.registerChannel('browserElements', browserElementsChannel));
        // Browser View
        const browserViewChannel = ProxyChannel.fromService(accessor.get(IBrowserViewMainService), disposables);
        mainProcessElectronServer.registerChannel(ipcBrowserViewChannelName, browserViewChannel);
        sharedProcessClient.then(client => client.registerChannel(ipcBrowserViewChannelName, browserViewChannel));
        // Browser View Group
        const browserViewGroupChannel = ProxyChannel.fromService(accessor.get(IBrowserViewGroupMainService), disposables);
        mainProcessElectronServer.registerChannel(ipcBrowserViewGroupChannelName, browserViewGroupChannel);
        sharedProcessClient.then(client => client.registerChannel(ipcBrowserViewGroupChannelName, browserViewGroupChannel));
        // Signing
        const signChannel = ProxyChannel.fromService(accessor.get(ISignService), disposables);
        mainProcessElectronServer.registerChannel('sign', signChannel);
        // Keyboard Layout
        const keyboardLayoutChannel = ProxyChannel.fromService(accessor.get(IKeyboardLayoutMainService), disposables);
        mainProcessElectronServer.registerChannel('keyboardLayout', keyboardLayoutChannel);
        // Native host (main & shared process)
        this.nativeHostMainService = accessor.get(INativeHostMainService);
        const nativeHostChannel = ProxyChannel.fromService(this.nativeHostMainService, disposables);
        mainProcessElectronServer.registerChannel('nativeHost', nativeHostChannel);
        sharedProcessClient.then(client => client.registerChannel('nativeHost', nativeHostChannel));
        // Web Content Extractor
        const webContentExtractorChannel = ProxyChannel.fromService(accessor.get(IWebContentExtractorService), disposables);
        mainProcessElectronServer.registerChannel('webContentExtractor', webContentExtractorChannel);
        // Workspaces
        const workspacesChannel = ProxyChannel.fromService(accessor.get(IWorkspacesService), disposables);
        mainProcessElectronServer.registerChannel('workspaces', workspacesChannel);
        // Menubar
        const menubarChannel = ProxyChannel.fromService(accessor.get(IMenubarMainService), disposables);
        mainProcessElectronServer.registerChannel('menubar', menubarChannel);
        // URL handling
        const urlChannel = ProxyChannel.fromService(accessor.get(IURLService), disposables);
        mainProcessElectronServer.registerChannel('url', urlChannel);
        // Webview Manager
        const webviewChannel = ProxyChannel.fromService(accessor.get(IWebviewManagerService), disposables);
        mainProcessElectronServer.registerChannel('webview', webviewChannel);
        // Storage (main & shared process)
        const storageChannel = disposables.add((new StorageDatabaseChannel(this.logService, accessor.get(IStorageMainService))));
        mainProcessElectronServer.registerChannel('storage', storageChannel);
        sharedProcessClient.then(client => client.registerChannel('storage', storageChannel));
        // Profile Storage Changes Listener (shared process)
        const profileStorageListener = disposables.add((new ProfileStorageChangesListenerChannel(accessor.get(IStorageMainService), accessor.get(IUserDataProfilesMainService), this.logService)));
        sharedProcessClient.then(client => client.registerChannel('profileStorageListener', profileStorageListener));
        // Terminal
        const ptyHostChannel = ProxyChannel.fromService(accessor.get(ILocalPtyService), disposables);
        mainProcessElectronServer.registerChannel(TerminalIpcChannels.LocalPty, ptyHostChannel);
        // External Terminal
        const externalTerminalChannel = ProxyChannel.fromService(accessor.get(IExternalTerminalMainService), disposables);
        mainProcessElectronServer.registerChannel('externalTerminal', externalTerminalChannel);
        // Sandbox Helper
        const sandboxHelperChannel = ProxyChannel.fromService(accessor.get(ISandboxHelperMainService), disposables);
        mainProcessElectronServer.registerChannel('sandboxHelper', sandboxHelperChannel);
        // MCP
        const mcpDiscoveryChannel = ProxyChannel.fromService(accessor.get(INativeMcpDiscoveryHelperService), disposables);
        mainProcessElectronServer.registerChannel(NativeMcpDiscoveryHelperChannelName, mcpDiscoveryChannel);
        const mcpGatewayChannel = this._register(new McpGatewayChannel(mainProcessElectronServer, accessor.get(IMcpGatewayService), accessor.get(ILoggerMainService)));
        mainProcessElectronServer.registerChannel(McpGatewayChannelName, mcpGatewayChannel);
        // Logger
        const loggerChannel = new LoggerChannel(accessor.get(ILoggerMainService));
        mainProcessElectronServer.registerChannel('logger', loggerChannel);
        sharedProcessClient.then(client => client.registerChannel('logger', loggerChannel));
        // Extension Host Debug Broadcasting
        const electronExtensionHostDebugBroadcastChannel = new ElectronExtensionHostDebugBroadcastChannel(accessor.get(IWindowsMainService));
        mainProcessElectronServer.registerChannel('extensionhostdebugservice', electronExtensionHostDebugBroadcastChannel);
        // Extension Host Starter
        const extensionHostStarterChannel = ProxyChannel.fromService(accessor.get(IExtensionHostStarter), disposables);
        mainProcessElectronServer.registerChannel(ipcExtensionHostStarterChannelName, extensionHostStarterChannel);
        // Utility Process Worker
        const utilityProcessWorkerChannel = ProxyChannel.fromService(accessor.get(IUtilityProcessWorkerMainService), disposables);
        mainProcessElectronServer.registerChannel(ipcUtilityProcessWorkerChannelName, utilityProcessWorkerChannel);
    }
    async openFirstWindow(accessor, initialProtocolUrls) {
        const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);
        this.auxiliaryWindowsMainService = accessor.get(IAuxiliaryWindowsMainService);
        const context = isLaunchedFromCli(process.env) ? 0 /* OpenContext.CLI */ : 4 /* OpenContext.DESKTOP */;
        const args = this.environmentMainService.args;
        // Handle agents window first based on context
        if (process.isEmbeddedApp || (args['agents'] && this.productService.quality !== 'stable')) {
            return windowsMainService.openAgentsWindow({
                context,
                cli: args,
                initialStartup: true
            });
        }
        // Then check for windows from protocol links to open
        if (initialProtocolUrls) {
            // Openables can open as windows directly
            if (initialProtocolUrls.openables.length > 0) {
                return windowsMainService.open({
                    context,
                    cli: args,
                    urisToOpen: initialProtocolUrls.openables,
                    gotoLineMode: true,
                    initialStartup: true
                    // remoteAuthority: will be determined based on openables
                });
            }
            // Protocol links with `windowId=_blank` on startup
            // should be handled in a special way:
            // We take the first one of these and open an empty
            // window for it. This ensures we are not restoring
            // all windows of the previous session.
            // If there are any more URLs like these, they will
            // be handled from the URL listeners installed later.
            if (initialProtocolUrls.urls.length > 0) {
                for (const protocolUrl of initialProtocolUrls.urls) {
                    const params = new URLSearchParams(protocolUrl.uri.query);
                    if (params.get('windowId') === '_blank') {
                        // It is important here that we remove `windowId=_blank` from
                        // this URL because here we open an empty window for it.
                        params.delete('windowId');
                        protocolUrl.originalUrl = protocolUrl.uri.toString(true);
                        protocolUrl.uri = protocolUrl.uri.with({ query: params.toString() });
                        return windowsMainService.open({
                            context,
                            cli: args,
                            forceNewWindow: true,
                            forceEmpty: true,
                            gotoLineMode: true,
                            initialStartup: true
                            // remoteAuthority: will be determined based on openables
                        });
                    }
                }
            }
        }
        const macOpenFiles = global.macOpenFiles ?? [];
        const hasCliArgs = args._.length;
        const hasFolderURIs = !!args['folder-uri'];
        const hasFileURIs = !!args['file-uri'];
        const noRecentEntry = args['skip-add-to-recently-opened'] === true;
        const waitMarkerFileURI = args.wait && args.waitMarkerFilePath ? URI.file(args.waitMarkerFilePath) : undefined;
        const remoteAuthority = args.remote || undefined;
        const forceProfile = args.profile;
        const forceTempProfile = args['profile-temp'];
        // Started without file/folder arguments
        if (!hasCliArgs && !hasFolderURIs && !hasFileURIs) {
            // Force new window
            if (args['new-window'] || forceProfile || forceTempProfile) {
                return windowsMainService.open({
                    context,
                    cli: args,
                    forceNewWindow: true,
                    forceEmpty: true,
                    noRecentEntry,
                    waitMarkerFileURI,
                    initialStartup: true,
                    remoteAuthority,
                    forceProfile,
                    forceTempProfile
                });
            }
            // mac: open-file event received on startup
            if (macOpenFiles.length) {
                return windowsMainService.open({
                    context: 1 /* OpenContext.DOCK */,
                    cli: args,
                    urisToOpen: macOpenFiles.map(path => {
                        path = normalizeNFC(path); // macOS only: normalize paths to NFC form
                        return (hasWorkspaceFileExtension(path) ? { workspaceUri: URI.file(path) } : { fileUri: URI.file(path) });
                    }),
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
            forceNewWindow: args['new-window'],
            diffMode: args.diff,
            mergeMode: args.merge,
            noRecentEntry,
            waitMarkerFileURI,
            gotoLineMode: args.goto,
            initialStartup: true,
            remoteAuthority,
            forceProfile,
            forceTempProfile
        });
    }
    afterWindowOpen(instantiationService) {
        // Accurate Windows version info
        if (isWindows) {
            initWindowsVersionInfo();
        }
        // Windows: mutex
        this.installMutex();
        // Remote Authorities
        protocol.registerHttpProtocol(Schemas.vscodeRemoteResource, (request, callback) => {
            callback({
                url: request.url.replace(/^vscode-remote-resource:/, 'http:'),
                method: request.method
            });
        });
        // Start to fetch shell environment (if needed) after window has opened
        // Since this operation can take a long time, we want to warm it up while
        // the window is opening.
        // We also show an error to the user in case this fails.
        this.resolveShellEnvironment(this.environmentMainService.args, process.env, true);
        // Crash reporter
        this.updateCrashReporterEnablement();
        // macOS: rosetta translation warning
        if (isMacintosh && app.runningUnderARM64Translation) {
            this.windowsMainService?.sendToFocused('vscode:showTranslatedBuildWarning');
        }
        // Power telemetry
        instantiationService.invokeFunction(accessor => {
            const telemetryService = accessor.get(ITelemetryService);
            const getPowerEventData = () => ({
                idleState: powerMonitor.getSystemIdleState(60),
                idleTime: powerMonitor.getSystemIdleTime(),
                thermalState: powerMonitor.getCurrentThermalState(),
                onBattery: powerMonitor.isOnBatteryPower()
            });
            this._register(Event.fromNodeEventEmitter(powerMonitor, 'suspend')(() => {
                telemetryService.publicLog2('power.suspend', getPowerEventData());
            }));
            this._register(Event.fromNodeEventEmitter(powerMonitor, 'resume')(() => {
                telemetryService.publicLog2('power.resume', getPowerEventData());
            }));
        });
        // GPU crash telemetry for skia graphite out of order recording failures
        // Refs https://github.com/microsoft/vscode/issues/284162
        if (isMacintosh) {
            instantiationService.invokeFunction(accessor => {
                const telemetryService = accessor.get(ITelemetryService);
                const initialGpuFeatureStatus = app.getGPUFeatureStatus();
                const skiaGraphiteEnabled = initialGpuFeatureStatus['skia_graphite'];
                if (skiaGraphiteEnabled === 'enabled') {
                    const gpuInfoUpdate = Event.fromNodeEventEmitter(app, 'gpu-info-update');
                    const pendingGpuInfoListener = this._register(new MutableDisposable());
                    this._register(Event.fromNodeEventEmitter(app, 'child-process-gone', (event, details) => ({ event, details }))(({ details }) => {
                        if (details.type === 'GPU' && details.reason === 'crashed') {
                            // Wait for gpu-info-update which fires after the GPU process
                            // restarts and the feature status is refreshed. At the time
                            // child-process-gone fires, getGPUFeatureStatus() still
                            // returns the pre-crash status.
                            pendingGpuInfoListener.value = Event.once(gpuInfoUpdate)(() => {
                                const currentGpuFeatureStatus = app.getGPUFeatureStatus();
                                const currentRasterizationStatus = currentGpuFeatureStatus['rasterization'];
                                if (currentRasterizationStatus !== 'enabled') {
                                    // Get last 10 GPU log messages (only the message field)
                                    let gpuLogMessages = [];
                                    const customApp = app;
                                    if (typeof customApp.getGPULogMessages === 'function') {
                                        gpuLogMessages = customApp.getGPULogMessages().slice(-10).map(log => log.message);
                                    }
                                    telemetryService.publicLog2('gpu.crash.fallback', {
                                        gpuFeatureStatus: JSON.stringify(currentGpuFeatureStatus),
                                        gpuLogMessages: JSON.stringify(gpuLogMessages)
                                    });
                                }
                            });
                        }
                    }));
                }
            });
        }
        {
            const customApp = app;
            instantiationService.invokeFunction(accessor => {
                const telemetryService = accessor.get(ITelemetryService);
                this._register(Event.fromNodeEventEmitter(customApp, 'network-process-launched', (_event, details) => details)(details => {
                    this.logService.info(`[network process] launched with pid ${details.pid}`);
                    telemetryService.publicLog2('networkProcess.launched', {});
                }));
                this._register(Event.fromNodeEventEmitter(customApp, 'network-process-gone', (_event, details) => details)(details => {
                    this.logService.info(`[network process] gone - pid: ${details.pid}, exitCode: ${details.exitCode}, crashed: ${details.crashed}, crashedPreIPC: ${details.crashedPreIPC}`);
                    telemetryService.publicLog2('networkProcess.gone', {
                        exitCode: details.exitCode,
                        crashed: details.crashed,
                        crashedPreIPC: details.crashedPreIPC
                    });
                }));
            });
        }
    }
    async installMutex() {
        const win32MutexName = this.productService.win32MutexName;
        if (isWindows && win32MutexName) {
            try {
                const WindowsMutex = await import('@vscode/windows-mutex');
                const mutex = new WindowsMutex.Mutex(win32MutexName);
                Event.once(this.lifecycleMainService.onWillShutdown)(() => mutex.release());
            }
            catch (error) {
                this.logService.error(error);
            }
        }
    }
    async resolveShellEnvironment(args, env, notifyOnError) {
        try {
            return await getResolvedShellEnv(this.configurationService, this.logService, args, env);
        }
        catch (error) {
            const errorMessage = toErrorMessage(error);
            if (notifyOnError) {
                this.windowsMainService?.sendToFocused('vscode:showResolveShellEnvError', errorMessage);
            }
            else {
                this.logService.error(errorMessage);
            }
        }
        return {};
    }
    async updateCrashReporterEnablement() {
        // If enable-crash-reporter argv is undefined then this is a fresh start,
        // based on `telemetry.enableCrashreporter` settings, generate a UUID which
        // will be used as crash reporter id and also update the json file.
        try {
            const argvContent = await this.fileService.readFile(this.environmentMainService.argvResource);
            const argvString = argvContent.value.toString();
            const argvJSON = parse(argvString);
            const telemetryLevel = getTelemetryLevel(this.configurationService);
            const enableCrashReporter = telemetryLevel >= 1 /* TelemetryLevel.CRASH */;
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
        }
        catch (error) {
            this.logService.error(error);
            // Inform the user via notification
            this.windowsMainService?.sendToFocused('vscode:showArgvParseWarning');
        }
    }
    eventuallyAfterWindowOpen() {
        // Validate Device ID is up to date (delay this as it has shown significant perf impact)
        // Refs: https://github.com/microsoft/vscode/issues/234064
        validateDevDeviceId(this.stateService, this.logService);
    }
};
CodeApplication = CodeApplication_1 = __decorate([
    __param(2, IInstantiationService),
    __param(3, ILogService),
    __param(4, ILoggerService),
    __param(5, IEnvironmentMainService),
    __param(6, ILifecycleMainService),
    __param(7, IConfigurationService),
    __param(8, IStateService),
    __param(9, IFileService),
    __param(10, IProductService),
    __param(11, IUserDataProfilesMainService)
], CodeApplication);
export { CodeApplication };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvY29kZS9lbGVjdHJvbi1tYWluL2FwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBNkIsWUFBWSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQVcsaUJBQWlCLEVBQWdCLE1BQU0sVUFBVSxDQUFDO0FBQ3JJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSw0QkFBNEIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzdGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3ZDLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ25ELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNuRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDekUsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN4RCxPQUFPLEVBQXFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFB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