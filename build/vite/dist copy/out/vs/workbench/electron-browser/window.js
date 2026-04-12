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
var NativeWindow_1;
import './media/window.css';
import { localize } from '../../nls.js';
import { URI } from '../../base/common/uri.js';
import { equals } from '../../base/common/objects.js';
import { EventType, EventHelper, addDisposableListener, ModifierKeyEmitter, getActiveElement, hasWindow, getWindowById, getWindows, $ } from '../../base/browser/dom.js';
import { Action, Separator } from '../../base/common/actions.js';
import { IFileService } from '../../platform/files/common/files.js';
import { EditorResourceAccessor, SideBySideEditor, pathsToEditors, isResourceEditorInput } from '../common/editor.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { WindowMinimumSize, hasNativeTitlebar } from '../../platform/window/common/window.js';
import { ITitleService } from '../services/title/browser/titleService.js';
import { IWorkbenchThemeService } from '../services/themes/common/workbenchThemeService.js';
import { ApplyZoomTarget, applyZoom } from '../../platform/window/electron-browser/window.js';
import { setFullscreen, getZoomLevel, onDidChangeZoomLevel, getZoomFactor } from '../../base/browser/browser.js';
import { ICommandService, CommandsRegistry } from '../../platform/commands/common/commands.js';
import { ipcRenderer, process } from '../../base/parts/sandbox/electron-browser/globals.js';
import { IWorkspaceEditingService } from '../services/workspaces/common/workspaceEditing.js';
import { IMenuService, MenuId, MenuItemAction, MenuRegistry } from '../../platform/actions/common/actions.js';
import { getFlatActionBarActions } from '../../platform/actions/browser/menuEntryActionViewItem.js';
import { RunOnceScheduler } from '../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { ILifecycleService } from '../services/lifecycle/common/lifecycle.js';
import { IIntegrityService } from '../services/integrity/common/integrity.js';
import { isWindows, isMacintosh } from '../../base/common/platform.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { INotificationService, NeverShowAgainScope, NotificationPriority, Severity } from '../../platform/notification/common/notification.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { INativeWorkbenchEnvironmentService } from '../services/environment/electron-browser/environmentService.js';
import { IAccessibilityService } from '../../platform/accessibility/common/accessibility.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { coalesce } from '../../base/common/arrays.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { Schemas } from '../../base/common/network.js';
import { INativeHostService } from '../../platform/native/common/native.js';
import { posix } from '../../base/common/path.js';
import { ITunnelService, extractLocalHostUriMetaDataForPortMapping, extractQueryLocalHostUriMetaDataForPortMapping } from '../../platform/tunnel/common/tunnel.js';
import { IWorkbenchLayoutService, positionFromString } from '../services/layout/browser/layoutService.js';
import { IWorkingCopyService } from '../services/workingCopy/common/workingCopyService.js';
import { IFilesConfigurationService } from '../services/filesConfiguration/common/filesConfigurationService.js';
import { Event } from '../../base/common/event.js';
import { IRemoteAuthorityResolverService } from '../../platform/remote/common/remoteAuthorityResolver.js';
import { IEditorGroupsService } from '../services/editor/common/editorGroupsService.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { whenEditorClosed } from '../browser/editor.js';
import { ISharedProcessService } from '../../platform/ipc/electron-browser/services.js';
import { IProgressService } from '../../platform/progress/common/progress.js';
import { toErrorMessage } from '../../base/common/errorMessage.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { dirname } from '../../base/common/resources.js';
import { IBannerService } from '../services/banner/browser/bannerService.js';
import { Codicon } from '../../base/common/codicons.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { IPreferencesService } from '../services/preferences/common/preferences.js';
import { IUtilityProcessWorkerWorkbenchService } from '../services/utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';
import { registerWindowDriver } from '../services/driver/browser/driver.js';
import { mainWindow } from '../../base/browser/window.js';
import { BaseWindow } from '../browser/window.js';
import { IHostService } from '../services/host/browser/host.js';
import { IStatusbarService, ShowTooltipCommand } from '../services/statusbar/browser/statusbar.js';
import { ActionBar } from '../../base/browser/ui/actionbar/actionbar.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { getWorkbenchContribution } from '../common/contributions.js';
import { DynamicWorkbenchSecurityConfiguration } from '../common/configuration.js';
import { nativeHoverDelegate } from '../../platform/hover/browser/hover.js';
import { WINDOW_ACTIVE_BORDER, WINDOW_INACTIVE_BORDER } from '../common/theme.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';
let NativeWindow = NativeWindow_1 = class NativeWindow extends BaseWindow {
    constructor(editorService, editorGroupService, configurationService, titleService, themeService, notificationService, commandService, keybindingService, telemetryService, workspaceEditingService, fileService, menuService, lifecycleService, integrityService, nativeEnvironmentService, accessibilityService, contextService, openerService, nativeHostService, tunnelService, layoutService, workingCopyService, filesConfigurationService, productService, remoteAuthorityResolverService, dialogService, storageService, logService, instantiationService, sharedProcessService, progressService, labelService, bannerService, uriIdentityService, preferencesService, utilityProcessWorkerWorkbenchService, hostService, contextMenuService) {
        super(mainWindow, undefined, hostService, nativeEnvironmentService, contextMenuService, layoutService);
        this.editorService = editorService;
        this.editorGroupService = editorGroupService;
        this.configurationService = configurationService;
        this.titleService = titleService;
        this.themeService = themeService;
        this.notificationService = notificationService;
        this.commandService = commandService;
        this.keybindingService = keybindingService;
        this.telemetryService = telemetryService;
        this.workspaceEditingService = workspaceEditingService;
        this.fileService = fileService;
        this.menuService = menuService;
        this.lifecycleService = lifecycleService;
        this.integrityService = integrityService;
        this.nativeEnvironmentService = nativeEnvironmentService;
        this.accessibilityService = accessibilityService;
        this.contextService = contextService;
        this.openerService = openerService;
        this.nativeHostService = nativeHostService;
        this.tunnelService = tunnelService;
        this.workingCopyService = workingCopyService;
        this.filesConfigurationService = filesConfigurationService;
        this.productService = productService;
        this.remoteAuthorityResolverService = remoteAuthorityResolverService;
        this.dialogService = dialogService;
        this.storageService = storageService;
        this.logService = logService;
        this.instantiationService = instantiationService;
        this.sharedProcessService = sharedProcessService;
        this.progressService = progressService;
        this.labelService = labelService;
        this.bannerService = bannerService;
        this.uriIdentityService = uriIdentityService;
        this.preferencesService = preferencesService;
        this.utilityProcessWorkerWorkbenchService = utilityProcessWorkerWorkbenchService;
        this.customTitleContextMenuDisposable = this._register(new DisposableStore());
        this.addRemoveFoldersScheduler = this._register(new RunOnceScheduler(() => this.doAddRemoveFolders(), 100));
        this.pendingFoldersToAdd = [];
        this.pendingFoldersToRemove = [];
        this.isDocumentedEdited = false;
        this.touchBarDisposables = this._register(new DisposableStore());
        //#region Window Zoom
        this.mapWindowIdToZoomStatusEntry = new Map();
        this.configuredWindowZoomLevel = this.resolveConfiguredWindowZoomLevel();
        this.registerListeners();
        this.create();
    }
    registerListeners() {
        // Layout
        this._register(addDisposableListener(mainWindow, EventType.RESIZE, () => this.layoutService.layout()));
        // React to editor input changes
        this._register(this.editorService.onDidActiveEditorChange(() => this.updateTouchbarMenu()));
        // Prevent opening a real URL inside the window
        for (const event of [EventType.DRAG_OVER, EventType.DROP]) {
            this._register(addDisposableListener(mainWindow.document.body, event, (e) => {
                EventHelper.stop(e);
            }));
        }
        // Support `runAction` event
        ipcRenderer.on('vscode:runAction', async (event, ...argsRaw) => {
            const request = argsRaw[0];
            const args = request.args || [];
            // If we run an action from the touchbar, we fill in the currently active resource
            // as payload because the touch bar items are context aware depending on the editor
            if (request.from === 'touchbar') {
                const activeEditor = this.editorService.activeEditor;
                if (activeEditor) {
                    const resource = EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
                    if (resource) {
                        args.push(resource);
                    }
                }
            }
            else {
                args.push({ from: request.from });
            }
            try {
                await this.commandService.executeCommand(request.id, ...args);
                this.telemetryService.publicLog2('workbenchActionExecuted', { id: request.id, from: request.from });
            }
            catch (error) {
                this.notificationService.error(error);
            }
        });
        // Support runKeybinding event
        ipcRenderer.on('vscode:runKeybinding', (event, ...argsRaw) => {
            const request = argsRaw[0];
            const activeElement = getActiveElement();
            if (activeElement) {
                this.keybindingService.dispatchByUserSettingsLabel(request.userSettingsLabel, activeElement);
            }
        });
        // Shared Process crash reported from main
        ipcRenderer.on('vscode:reportSharedProcessCrash', (event, ...argsRaw) => {
            this.notificationService.prompt(Severity.Error, localize('sharedProcessCrash', "A shared background process terminated unexpectedly. Please restart the application to recover."), [{
                    label: localize('restart', "Restart"),
                    run: () => this.nativeHostService.relaunch()
                }], {
                priority: NotificationPriority.URGENT
            });
        });
        // Support openFiles event for existing and new files
        ipcRenderer.on('vscode:openFiles', (event, ...argsRaw) => { this.onOpenFiles(argsRaw[0]); });
        // Support addRemoveFolders event for workspace management
        ipcRenderer.on('vscode:addRemoveFolders', (event, ...argsRaw) => this.onAddRemoveFoldersRequest(argsRaw[0]));
        // Message support
        ipcRenderer.on('vscode:showInfoMessage', (event, ...argsRaw) => this.notificationService.info(argsRaw[0]));
        // Shell Environment Issue Notifications
        ipcRenderer.on('vscode:showResolveShellEnvError', (event, ...argsRaw) => {
            const message = argsRaw[0];
            this.notificationService.prompt(Severity.Error, message, [{
                    label: localize('restart', "Restart"),
                    run: () => this.nativeHostService.relaunch()
                },
                {
                    label: localize('configure', "Configure"),
                    run: () => this.preferencesService.openUserSettings({ query: 'application.shellEnvironmentResolutionTimeout' })
                },
                {
                    label: localize('learnMore', "Learn More"),
                    run: () => this.openerService.open('https://go.microsoft.com/fwlink/?linkid=2149667')
                }]);
        });
        ipcRenderer.on('vscode:showCredentialsError', (event, ...argsRaw) => {
            const message = argsRaw[0];
            this.notificationService.prompt(Severity.Error, localize('keychainWriteError', "Writing login information to the keychain failed with error '{0}'.", message), [{
                    label: localize('troubleshooting', "Troubleshooting Guide"),
                    run: () => this.openerService.open('https://go.microsoft.com/fwlink/?linkid=2190713')
                }]);
        });
        ipcRenderer.on('vscode:showTranslatedBuildWarning', () => {
            this.notificationService.prompt(Severity.Warning, localize("runningTranslated", "You are running an emulated version of {0}. For better performance download the native arm64 version of {0} build for your machine.", this.productService.nameLong), [{
                    label: localize('downloadArmBuild', "Download"),
                    run: () => {
                        const quality = this.productService.quality;
                        const stableURL = 'https://code.visualstudio.com/docs/?dv=osx';
                        const insidersURL = 'https://code.visualstudio.com/docs/?dv=osx&build=insiders';
                        this.openerService.open(quality === 'stable' ? stableURL : insidersURL);
                    }
                }], {
                priority: NotificationPriority.URGENT
            });
        });
        ipcRenderer.on('vscode:showArgvParseWarning', () => {
            this.notificationService.prompt(Severity.Warning, localize("showArgvParseWarning", "The runtime arguments file 'argv.json' contains errors. Please correct them and restart."), [{
                    label: localize('showArgvParseWarningAction', "Open File"),
                    run: () => this.editorService.openEditor({ resource: this.nativeEnvironmentService.argvResource })
                }], {
                priority: NotificationPriority.URGENT
            });
        });
        // Fullscreen Events
        ipcRenderer.on('vscode:enterFullScreen', () => setFullscreen(true, mainWindow));
        ipcRenderer.on('vscode:leaveFullScreen', () => setFullscreen(false, mainWindow));
        // Proxy Login Dialog
        ipcRenderer.on('vscode:openProxyAuthenticationDialog', async (event, ...argsRaw) => {
            const payload = argsRaw[0];
            const rememberCredentialsKey = 'window.rememberProxyCredentials';
            const rememberCredentials = this.storageService.getBoolean(rememberCredentialsKey, -1 /* StorageScope.APPLICATION */);
            const result = await this.dialogService.input({
                type: 'warning',
                message: localize('proxyAuthRequired', "Proxy Authentication Required"),
                primaryButton: localize({ key: 'loginButton', comment: ['&& denotes a mnemonic'] }, "&&Log In"),
                inputs: [
                    { placeholder: localize('username', "Username"), value: payload.username },
                    { placeholder: localize('password', "Password"), type: 'password', value: payload.password }
                ],
                detail: localize('proxyDetail', "The proxy {0} requires a username and password.", `${payload.authInfo.host}:${payload.authInfo.port}`),
                checkbox: {
                    label: localize('rememberCredentials', "Remember my credentials"),
                    checked: rememberCredentials
                }
            });
            // Reply back to the channel without result to indicate
            // that the login dialog was cancelled
            if (!result.confirmed || !result.values) {
                ipcRenderer.send(payload.replyChannel);
            }
            // Other reply back with the picked credentials
            else {
                // Update state based on checkbox
                if (result.checkboxChecked) {
                    this.storageService.store(rememberCredentialsKey, true, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
                }
                else {
                    this.storageService.remove(rememberCredentialsKey, -1 /* StorageScope.APPLICATION */);
                }
                // Reply back to main side with credentials
                const [username, password] = result.values;
                ipcRenderer.send(payload.replyChannel, { username, password, remember: !!result.checkboxChecked });
            }
        });
        // Accessibility support changed event
        ipcRenderer.on('vscode:accessibilitySupportChanged', (event, ...argsRaw) => {
            const accessibilitySupportEnabled = argsRaw[0];
            this.accessibilityService.setAccessibilitySupport(accessibilitySupportEnabled ? 2 /* AccessibilitySupport.Enabled */ : 1 /* AccessibilitySupport.Disabled */);
        });
        // Allow to update security settings around allowed UNC Host
        ipcRenderer.on('vscode:configureAllowedUNCHost', async (event, ...argsRaw) => {
            const host = argsRaw[0];
            if (!isWindows) {
                return; // only supported on Windows
            }
            const allowedUncHosts = new Set();
            const configuredAllowedUncHosts = this.configurationService.getValue('security.allowedUNCHosts') ?? [];
            if (Array.isArray(configuredAllowedUncHosts)) {
                for (const configuredAllowedUncHost of configuredAllowedUncHosts) {
                    if (typeof configuredAllowedUncHost === 'string') {
                        allowedUncHosts.add(configuredAllowedUncHost);
                    }
                }
            }
            if (!allowedUncHosts.has(host)) {
                allowedUncHosts.add(host);
                await getWorkbenchContribution(DynamicWorkbenchSecurityConfiguration.ID).ready; // ensure this setting is registered
                this.configurationService.updateValue('security.allowedUNCHosts', [...allowedUncHosts.values()], 2 /* ConfigurationTarget.USER */);
            }
        });
        // Allow to update security settings around protocol handlers
        ipcRenderer.on('vscode:disablePromptForProtocolHandling', (event, ...argsRaw) => {
            const kind = argsRaw[0];
            const setting = kind === 'local' ? 'security.promptForLocalFileProtocolHandling' : 'security.promptForRemoteFileProtocolHandling';
            this.configurationService.updateValue(setting, false);
        });
        // Window Settings
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('window.zoomLevel') || (e.affectsConfiguration('window.zoomPerWindow') && this.configurationService.getValue('window.zoomPerWindow') === false)) {
                this.onDidChangeConfiguredWindowZoomLevel();
            }
            else if (e.affectsConfiguration('keyboard.touchbar.enabled') || e.affectsConfiguration('keyboard.touchbar.ignored')) {
                this.updateTouchbarMenu();
            }
            else if (e.affectsConfiguration('window.border')) {
                this.updateWindowBorder();
            }
        }));
        this._register(onDidChangeZoomLevel(targetWindowId => this.handleOnDidChangeZoomLevel(targetWindowId)));
        for (const part of this.editorGroupService.parts) {
            this.createWindowZoomStatusEntry(part);
        }
        this._register(this.editorGroupService.onDidCreateAuxiliaryEditorPart(part => this.createWindowZoomStatusEntry(part)));
        // Listen to visible editor changes (debounced in case a new editor opens immediately after)
        this._register(Event.debounce(this.editorService.onDidVisibleEditorsChange, () => undefined, 0, undefined, undefined, undefined, this._store)(() => this.maybeCloseWindow()));
        // Listen to editor closing (if we run with --wait)
        const filesToWait = this.nativeEnvironmentService.filesToWait;
        if (filesToWait) {
            this.trackClosedWaitFiles(filesToWait.waitMarkerFileUri, coalesce(filesToWait.paths.map(path => path.fileUri)));
        }
        // macOS OS integration: represented file name
        if (isMacintosh) {
            for (const part of this.editorGroupService.parts) {
                this.handleRepresentedFilename(part);
            }
            this._register(this.editorGroupService.onDidCreateAuxiliaryEditorPart(part => this.handleRepresentedFilename(part)));
        }
        // Document edited: indicate for dirty working copies
        this._register(this.workingCopyService.onDidChangeDirty(workingCopy => {
            const gotDirty = workingCopy.isDirty();
            if (gotDirty && !(workingCopy.capabilities & 2 /* WorkingCopyCapabilities.Untitled */) && this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource)) {
                return; // do not indicate dirty of working copies that are auto saved after short delay
            }
            this.updateDocumentEdited(gotDirty ? true : undefined);
        }));
        this.updateDocumentEdited(undefined);
        // Detect minimize / maximize
        this._register(Event.any(Event.map(Event.filter(this.nativeHostService.onDidMaximizeWindow, windowId => !!hasWindow(windowId)), windowId => ({ maximized: true, windowId })), Event.map(Event.filter(this.nativeHostService.onDidUnmaximizeWindow, windowId => !!hasWindow(windowId)), windowId => ({ maximized: false, windowId })))(e => this.layoutService.updateWindowMaximizedState(getWindowById(e.windowId).window, e.maximized)));
        this.layoutService.updateWindowMaximizedState(mainWindow, this.nativeEnvironmentService.window.maximized ?? false);
        // Detect panel position to determine minimum width
        this._register(this.layoutService.onDidChangePanelPosition(pos => this.onDidChangePanelPosition(positionFromString(pos))));
        this.onDidChangePanelPosition(this.layoutService.getPanelPosition());
        // Border
        this._register(this.themeService.onDidColorThemeChange(() => this.updateWindowBorder()));
        this._register(this.hostService.onDidChangeActiveWindow(() => this.updateWindowBorder()));
        this._register(this.hostService.onDidChangeFocus(() => this.updateWindowBorder()));
        // Lifecycle
        this._register(this.lifecycleService.onBeforeShutdown(e => this.onBeforeShutdown(e)));
        this._register(this.lifecycleService.onBeforeShutdownError(e => this.onBeforeShutdownError(e)));
        this._register(this.lifecycleService.onWillShutdown(e => this.onWillShutdown(e)));
    }
    handleRepresentedFilename(part) {
        const disposables = new DisposableStore();
        Event.once(part.onWillDispose)(() => disposables.dispose());
        this.editorGroupService.getScopedInstantiationService(part).invokeFunction(accessor => {
            const editorService = accessor.get(IEditorService);
            disposables.add(editorService.onDidActiveEditorChange(() => this.updateRepresentedFilename(editorService, part.windowId)));
        });
    }
    updateRepresentedFilename(editorService, targetWindowId) {
        const file = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: Schemas.file });
        // Represented Filename
        this.nativeHostService.setRepresentedFilename(file?.fsPath ?? '', { targetWindowId });
        // Custom title menu (main window only currently)
        if (targetWindowId === mainWindow.vscodeWindowId) {
            this.provideCustomTitleContextMenu(file?.fsPath);
        }
    }
    //#region Window Lifecycle
    onBeforeShutdown({ veto, reason }) {
        if (reason === 1 /* ShutdownReason.CLOSE */) {
            const confirmBeforeCloseSetting = this.configurationService.getValue('window.confirmBeforeClose');
            const confirmBeforeClose = confirmBeforeCloseSetting === 'always' || (confirmBeforeCloseSetting === 'keyboardOnly' && ModifierKeyEmitter.getInstance().isModifierPressed);
            if (confirmBeforeClose) {
                // When we need to confirm on close or quit, veto the shutdown
                // with a long running promise to figure out whether shutdown
                // can proceed or not.
                return veto((async () => {
                    let actualReason = reason;
                    if (reason === 1 /* ShutdownReason.CLOSE */ && !isMacintosh) {
                        const windowCount = await this.nativeHostService.getWindowCount();
                        if (windowCount === 1) {
                            actualReason = 2 /* ShutdownReason.QUIT */; // Windows/Linux: closing last window means to QUIT
                        }
                    }
                    let confirmed = true;
                    if (confirmBeforeClose) {
                        confirmed = await this.instantiationService.invokeFunction(accessor => NativeWindow_1.confirmOnShutdown(accessor, actualReason));
                    }
                    // Progress for long running shutdown
                    if (confirmed) {
                        this.progressOnBeforeShutdown(reason);
                    }
                    return !confirmed;
                })(), 'veto.confirmBeforeClose');
            }
        }
        // Progress for long running shutdown
        this.progressOnBeforeShutdown(reason);
    }
    progressOnBeforeShutdown(reason) {
        this.progressService.withProgress({
            location: 10 /* ProgressLocation.Window */, // use window progress to not be too annoying about this operation
            delay: 800, // delay so that it only appears when operation takes a long time
            title: this.toShutdownLabel(reason, false),
        }, () => {
            return Event.toPromise(Event.any(this.lifecycleService.onWillShutdown, // dismiss this dialog when we shutdown
            this.lifecycleService.onShutdownVeto, // or when shutdown was vetoed
            this.dialogService.onWillShowDialog // or when a dialog asks for input
            ));
        });
    }
    onBeforeShutdownError({ error, reason }) {
        this.dialogService.error(this.toShutdownLabel(reason, true), localize('shutdownErrorDetail', "Error: {0}", toErrorMessage(error)));
    }
    onWillShutdown({ reason, force, joiners }) {
        // Delay so that the dialog only appears after timeout
        const shutdownDialogScheduler = new RunOnceScheduler(() => {
            const pendingJoiners = joiners();
            this.progressService.withProgress({
                location: 20 /* ProgressLocation.Dialog */, // use a dialog to prevent the user from making any more interactions now
                buttons: [this.toForceShutdownLabel(reason)], // allow to force shutdown anyway
                cancellable: false, // do not allow to cancel
                sticky: true, // do not allow to dismiss
                title: this.toShutdownLabel(reason, false),
                detail: pendingJoiners.length > 0 ? localize('willShutdownDetail', "The following operations are still running: \n{0}", pendingJoiners.map(joiner => `- ${joiner.label}`).join('\n')) : undefined
            }, () => {
                return Event.toPromise(this.lifecycleService.onDidShutdown); // dismiss this dialog when we actually shutdown
            }, () => {
                force();
            });
        }, 1200);
        shutdownDialogScheduler.schedule();
        // Dispose scheduler when we actually shutdown
        Event.once(this.lifecycleService.onDidShutdown)(() => shutdownDialogScheduler.dispose());
    }
    toShutdownLabel(reason, isError) {
        if (isError) {
            switch (reason) {
                case 1 /* ShutdownReason.CLOSE */:
                    return localize('shutdownErrorClose', "An unexpected error prevented the window to close");
                case 2 /* ShutdownReason.QUIT */:
                    return localize('shutdownErrorQuit', "An unexpected error prevented the application to quit");
                case 3 /* ShutdownReason.RELOAD */:
                    return localize('shutdownErrorReload', "An unexpected error prevented the window to reload");
                case 4 /* ShutdownReason.LOAD */:
                    return localize('shutdownErrorLoad', "An unexpected error prevented to change the workspace");
            }
        }
        switch (reason) {
            case 1 /* ShutdownReason.CLOSE */:
                return localize('shutdownTitleClose', "Closing the window is taking a bit longer...");
            case 2 /* ShutdownReason.QUIT */:
                return localize('shutdownTitleQuit', "Quitting the application is taking a bit longer...");
            case 3 /* ShutdownReason.RELOAD */:
                return localize('shutdownTitleReload', "Reloading the window is taking a bit longer...");
            case 4 /* ShutdownReason.LOAD */:
                return localize('shutdownTitleLoad', "Changing the workspace is taking a bit longer...");
        }
    }
    toForceShutdownLabel(reason) {
        switch (reason) {
            case 1 /* ShutdownReason.CLOSE */:
                return localize('shutdownForceClose', "Close Anyway");
            case 2 /* ShutdownReason.QUIT */:
                return localize('shutdownForceQuit', "Quit Anyway");
            case 3 /* ShutdownReason.RELOAD */:
                return localize('shutdownForceReload', "Reload Anyway");
            case 4 /* ShutdownReason.LOAD */:
                return localize('shutdownForceLoad', "Change Anyway");
        }
    }
    //#endregion
    updateDocumentEdited(documentEdited) {
        let setDocumentEdited;
        if (typeof documentEdited === 'boolean') {
            setDocumentEdited = documentEdited;
        }
        else {
            setDocumentEdited = this.workingCopyService.hasDirty;
        }
        if ((!this.isDocumentedEdited && setDocumentEdited) || (this.isDocumentedEdited && !setDocumentEdited)) {
            this.isDocumentedEdited = setDocumentEdited;
            this.nativeHostService.setDocumentEdited(setDocumentEdited);
        }
    }
    getWindowMinimumWidth(panelPosition = this.layoutService.getPanelPosition()) {
        // if panel is on the side, then return the larger minwidth
        const panelOnSide = panelPosition === 0 /* Position.LEFT */ || panelPosition === 1 /* Position.RIGHT */;
        if (panelOnSide) {
            return WindowMinimumSize.WIDTH_WITH_VERTICAL_PANEL;
        }
        return WindowMinimumSize.WIDTH;
    }
    onDidChangePanelPosition(pos) {
        const minWidth = this.getWindowMinimumWidth(pos);
        this.nativeHostService.setMinimumSize(minWidth, undefined);
    }
    maybeCloseWindow() {
        const closeWhenEmpty = this.configurationService.getValue('window.closeWhenEmpty') || this.nativeEnvironmentService.args.wait;
        if (!closeWhenEmpty) {
            return; // return early if configured to not close when empty
        }
        // Close empty editor groups based on setting and environment
        for (const editorPart of this.editorGroupService.parts) {
            if (editorPart.groups.some(group => !group.isEmpty)) {
                continue; // not empty
            }
            if (editorPart === this.editorGroupService.mainPart && (this.contextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */ || // only for empty windows
                this.environmentService.isExtensionDevelopment || // not when developing an extension
                this.editorService.visibleEditors.length > 0 // not when there are still editors open in other windows
            )) {
                continue;
            }
            if (editorPart === this.editorGroupService.mainPart) {
                this.nativeHostService.closeWindow();
            }
            else {
                editorPart.removeGroup(editorPart.activeGroup);
            }
        }
    }
    provideCustomTitleContextMenu(filePath) {
        // Clear old menu
        this.customTitleContextMenuDisposable.clear();
        // Only provide a menu when we have a file path and custom titlebar
        if (!filePath || hasNativeTitlebar(this.configurationService)) {
            return;
        }
        // Split up filepath into segments
        const segments = filePath.split(posix.sep);
        for (let i = segments.length; i > 0; i--) {
            const isFile = (i === segments.length);
            let pathOffset = i;
            if (!isFile) {
                pathOffset++; // for segments which are not the file name we want to open the folder
            }
            const path = URI.file(segments.slice(0, pathOffset).join(posix.sep));
            let label;
            if (!isFile) {
                label = this.labelService.getUriBasenameLabel(dirname(path));
            }
            else {
                label = this.labelService.getUriBasenameLabel(path);
            }
            const commandId = `workbench.action.revealPathInFinder${i}`;
            this.customTitleContextMenuDisposable.add(CommandsRegistry.registerCommand(commandId, () => this.nativeHostService.showItemInFolder(path.fsPath)));
            this.customTitleContextMenuDisposable.add(MenuRegistry.appendMenuItem(MenuId.TitleBarTitleContext, { command: { id: commandId, title: label || posix.sep }, order: -i, group: '1_file' }));
        }
    }
    create() {
        // Handle open calls
        this.setupOpenHandlers();
        // Notify some services about lifecycle phases
        this.lifecycleService.when(2 /* LifecyclePhase.Ready */).then(() => this.nativeHostService.notifyReady());
        this.lifecycleService.when(3 /* LifecyclePhase.Restored */).then(() => {
            this.sharedProcessService.notifyRestored();
            this.utilityProcessWorkerWorkbenchService.notifyRestored();
        });
        // Check for situations that are worth warning the user about
        this.handleWarnings();
        // Touchbar menu (if enabled)
        this.updateTouchbarMenu();
        // Window border
        this.updateWindowBorder();
        // Smoke Test Driver
        if (this.environmentService.enableSmokeTestDriver) {
            registerWindowDriver(this.instantiationService);
        }
    }
    async handleWarnings() {
        // After restored phase is fine for the following ones
        await this.lifecycleService.when(3 /* LifecyclePhase.Restored */);
        // Integrity / Root warning
        (async () => {
            const isAdmin = await this.nativeHostService.isAdmin();
            const { isPure } = await this.integrityService.isPure();
            // Update to title
            this.titleService.updateProperties({ isPure, isAdmin });
            // Show warning message (unix only)
            if (isAdmin && !isWindows) {
                this.notificationService.warn(localize('runningAsRoot', "It is not recommended to run {0} as root user.", this.productService.nameShort));
            }
        })();
        // Installation Dir Warning
        if (this.environmentService.isBuilt && !this.environmentService.extensionDevelopmentLocationURI?.length) {
            let installLocationUri;
            if (isMacintosh) {
                // appRoot = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app
                installLocationUri = dirname(dirname(dirname(URI.file(this.nativeEnvironmentService.appRoot))));
            }
            else {
                // appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\resources\app
                // appRoot = /usr/share/code-insiders/resources/app
                installLocationUri = dirname(dirname(URI.file(this.nativeEnvironmentService.appRoot)));
            }
            for (const folder of this.contextService.getWorkspace().folders) {
                if (this.uriIdentityService.extUri.isEqualOrParent(folder.uri, installLocationUri)) {
                    this.bannerService.show({
                        id: 'appRootWarning.banner',
                        message: localize('appRootWarning.banner', "Files you store within the installation folder ('{0}') may be OVERWRITTEN or DELETED IRREVERSIBLY without warning at update time.", this.labelService.getUriLabel(installLocationUri)),
                        icon: Codicon.warning
                    });
                    break;
                }
            }
        }
        // macOS 11 warning
        if (isMacintosh) {
            const majorVersion = this.nativeEnvironmentService.os.release.split('.')[0];
            const eolReleases = new Map([
                ['20', 'macOS Big Sur'],
            ]);
            if (eolReleases.has(majorVersion)) {
                const message = localize('macoseolmessage', "{0} on {1} will soon stop receiving updates. Consider upgrading your macOS version.", this.productService.nameLong, eolReleases.get(majorVersion));
                this.notificationService.prompt(Severity.Warning, message, [{
                        label: localize('learnMore', "Learn More"),
                        run: () => this.openerService.open(URI.parse('https://aka.ms/vscode-faq-old-macOS'))
                    }], {
                    neverShowAgain: { id: 'macoseol', isSecondary: true, scope: NeverShowAgainScope.APPLICATION },
                    priority: NotificationPriority.URGENT,
                    sticky: true
                });
            }
        }
        // Slow shell environment progress indicator
        const shellEnv = process.shellEnv();
        this.progressService.withProgress({
            title: localize('resolveShellEnvironment', "Resolving shell environment..."),
            location: 10 /* ProgressLocation.Window */,
            delay: 1600,
            buttons: [localize('learnMore', "Learn More")]
        }, () => shellEnv, () => this.openerService.open('https://go.microsoft.com/fwlink/?linkid=2149667'));
    }
    async resolveExternalUri(uri, options) {
        let queryTunnel;
        if (options?.allowTunneling) {
            const portMappingRequest = extractLocalHostUriMetaDataForPortMapping(uri);
            const queryPortMapping = extractQueryLocalHostUriMetaDataForPortMapping(uri);
            if (queryPortMapping) {
                queryTunnel = await this.openTunnel(queryPortMapping.address, queryPortMapping.port);
                if (queryTunnel && (typeof queryTunnel !== 'string')) {
                    // If the tunnel was mapped to a different port, dispose it, because some services
                    // validate the port number in the query string.
                    if (queryTunnel.tunnelRemotePort !== queryPortMapping.port) {
                        queryTunnel.dispose();
                        queryTunnel = undefined;
                    }
                    else {
                        if (!portMappingRequest) {
                            const tunnel = queryTunnel;
                            return {
                                resolved: uri,
                                dispose: () => tunnel.dispose()
                            };
                        }
                    }
                }
            }
            if (portMappingRequest) {
                const tunnel = await this.openTunnel(portMappingRequest.address, portMappingRequest.port);
                if (tunnel && (typeof tunnel !== 'string')) {
                    const addressAsUri = URI.parse(tunnel.localAddress).with({ path: uri.path });
                    const resolved = addressAsUri.scheme.startsWith(uri.scheme) ? addressAsUri : uri.with({ authority: tunnel.localAddress });
                    return {
                        resolved,
                        dispose() {
                            tunnel.dispose();
                            if (queryTunnel && (typeof queryTunnel !== 'string')) {
                                queryTunnel.dispose();
                            }
                        }
                    };
                }
            }
        }
        if (!options?.openExternal) {
            const canHandleResource = await this.fileService.canHandleResource(uri);
            if (canHandleResource) {
                return {
                    resolved: URI.from({
                        scheme: this.productService.urlProtocol,
                        path: 'workspace',
                        query: uri.toString()
                    }),
                    dispose() { }
                };
            }
        }
        return undefined;
    }
    async openTunnel(address, port) {
        const remoteAuthority = this.environmentService.remoteAuthority;
        const addressProvider = remoteAuthority ? {
            getAddress: async () => {
                return (await this.remoteAuthorityResolverService.resolveAuthority(remoteAuthority)).authority;
            }
        } : undefined;
        const tunnel = await this.tunnelService.getExistingTunnel(address, port);
        if (!tunnel || (typeof tunnel === 'string')) {
            return this.tunnelService.openTunnel(addressProvider, address, port);
        }
        return tunnel;
    }
    setupOpenHandlers() {
        // Handle external open() calls
        this.openerService.setDefaultExternalOpener({
            openExternal: async (href) => {
                const success = await this.nativeHostService.openExternal(href, this.configurationService.getValue('workbench.externalBrowser'));
                if (!success) {
                    const fileCandidate = URI.parse(href);
                    if (fileCandidate.scheme === Schemas.file) {
                        // if opening failed, and this is a file, we can still try to reveal it
                        await this.nativeHostService.showItemInFolder(fileCandidate.fsPath);
                    }
                }
                return true;
            }
        });
        // Register external URI resolver
        this.openerService.registerExternalUriResolver({
            resolveExternalUri: async (uri, options) => {
                return this.resolveExternalUri(uri, options);
            }
        });
    }
    updateTouchbarMenu() {
        if (!isMacintosh) {
            return; // macOS only
        }
        // Dispose old
        this.touchBarDisposables.clear();
        this.touchBarMenu = undefined;
        // Create new (delayed)
        const scheduler = this.touchBarDisposables.add(new RunOnceScheduler(() => this.doUpdateTouchbarMenu(scheduler), 300));
        scheduler.schedule();
    }
    doUpdateTouchbarMenu(scheduler) {
        if (!this.touchBarMenu) {
            const scopedContextKeyService = this.editorService.activeEditorPane?.scopedContextKeyService || this.editorGroupService.activeGroup.scopedContextKeyService;
            this.touchBarMenu = this.menuService.createMenu(MenuId.TouchBarContext, scopedContextKeyService);
            this.touchBarDisposables.add(this.touchBarMenu);
            this.touchBarDisposables.add(this.touchBarMenu.onDidChange(() => scheduler.schedule()));
        }
        const disabled = this.configurationService.getValue('keyboard.touchbar.enabled') === false;
        const touchbarIgnored = this.configurationService.getValue('keyboard.touchbar.ignored');
        const ignoredItems = Array.isArray(touchbarIgnored) ? touchbarIgnored : [];
        // Fill actions into groups respecting order
        const actions = getFlatActionBarActions(this.touchBarMenu.getActions());
        // Convert into command action multi array
        const items = [];
        let group = [];
        if (!disabled) {
            for (const action of actions) {
                // Command
                if (action instanceof MenuItemAction) {
                    if (ignoredItems.indexOf(action.item.id) >= 0) {
                        continue; // ignored
                    }
                    group.push(action.item);
                }
                // Separator
                else if (action instanceof Separator) {
                    if (group.length) {
                        items.push(group);
                    }
                    group = [];
                }
            }
            if (group.length) {
                items.push(group);
            }
        }
        // Only update if the actions have changed
        if (!equals(this.lastInstalledTouchedBar, items)) {
            this.lastInstalledTouchedBar = items;
            this.nativeHostService.updateTouchBar(items);
        }
    }
    //#endregion
    //#region Window Border
    updateWindowBorder() {
        if (!isWindows) {
            return; // windows only
        }
        const theme = this.themeService.getColorTheme();
        let activeBorder = theme.getColor(WINDOW_ACTIVE_BORDER)?.toString();
        let inactiveBorder = theme.getColor(WINDOW_INACTIVE_BORDER)?.toString();
        const borderSetting = this.configurationService.getValue('window.border');
        if (borderSetting === 'off') {
            activeBorder = 'off';
            inactiveBorder = undefined;
        }
        else if (borderSetting === 'default') {
            activeBorder = activeBorder ?? 'default';
        }
        else if (borderSetting === 'system') {
            activeBorder = 'default';
            inactiveBorder = undefined;
        }
        else {
            activeBorder = borderSetting;
            inactiveBorder = undefined;
        }
        this.nativeHostService.updateWindowAccentColor(activeBorder, inactiveBorder);
    }
    //#endregion
    onAddRemoveFoldersRequest(request) {
        // Buffer all pending requests
        this.pendingFoldersToAdd.push(...request.foldersToAdd.map(folder => URI.revive(folder)));
        this.pendingFoldersToRemove.push(...request.foldersToRemove.map(folder => URI.revive(folder)));
        // Delay the adding of folders a bit to buffer in case more requests are coming
        if (!this.addRemoveFoldersScheduler.isScheduled()) {
            this.addRemoveFoldersScheduler.schedule();
        }
    }
    async doAddRemoveFolders() {
        const foldersToAdd = this.pendingFoldersToAdd.map(folder => ({ uri: folder }));
        const foldersToRemove = this.pendingFoldersToRemove.slice(0);
        this.pendingFoldersToAdd = [];
        this.pendingFoldersToRemove = [];
        if (foldersToAdd.length) {
            await this.workspaceEditingService.addFolders(foldersToAdd);
        }
        if (foldersToRemove.length) {
            await this.workspaceEditingService.removeFolders(foldersToRemove);
        }
    }
    async onOpenFiles(request) {
        const diffMode = !!(request.filesToDiff && (request.filesToDiff.length === 2));
        const mergeMode = !!(request.filesToMerge && (request.filesToMerge.length === 4));
        const inputs = coalesce(await pathsToEditors(mergeMode ? request.filesToMerge : diffMode ? request.filesToDiff : request.filesToOpenOrCreate, this.fileService, this.logService));
        if (inputs.length) {
            const openedEditorPanes = await this.openResources(inputs, diffMode, mergeMode);
            if (request.filesToWait) {
                // In wait mode, listen to changes to the editors and wait until the files
                // are closed that the user wants to wait for. When this happens we delete
                // the wait marker file to signal to the outside that editing is done.
                // However, it is possible that opening of the editors failed, as such we
                // check for whether editor panes got opened and otherwise delete the marker
                // right away.
                if (openedEditorPanes.length) {
                    return this.trackClosedWaitFiles(URI.revive(request.filesToWait.waitMarkerFileUri), coalesce(request.filesToWait.paths.map(path => URI.revive(path.fileUri))));
                }
                else {
                    return this.fileService.del(URI.revive(request.filesToWait.waitMarkerFileUri));
                }
            }
        }
    }
    async trackClosedWaitFiles(waitMarkerFile, resourcesToWaitFor) {
        // Wait for the resources to be closed in the text editor...
        await this.instantiationService.invokeFunction(accessor => whenEditorClosed(accessor, resourcesToWaitFor));
        // ...before deleting the wait marker file
        await this.fileService.del(waitMarkerFile);
    }
    async openResources(resources, diffMode, mergeMode) {
        const editors = [];
        if (mergeMode && isResourceEditorInput(resources[0]) && isResourceEditorInput(resources[1]) && isResourceEditorInput(resources[2]) && isResourceEditorInput(resources[3])) {
            const mergeEditor = {
                input1: { resource: resources[0].resource },
                input2: { resource: resources[1].resource },
                base: { resource: resources[2].resource },
                result: { resource: resources[3].resource },
                options: { pinned: true }
            };
            editors.push(mergeEditor);
        }
        else if (diffMode && isResourceEditorInput(resources[0]) && isResourceEditorInput(resources[1])) {
            const diffEditor = {
                original: { resource: resources[0].resource },
                modified: { resource: resources[1].resource },
                options: { pinned: true }
            };
            editors.push(diffEditor);
        }
        else {
            editors.push(...resources);
        }
        return this.editorService.openEditors(editors, undefined, { validateTrust: true });
    }
    resolveConfiguredWindowZoomLevel() {
        const windowZoomLevel = this.configurationService.getValue('window.zoomLevel');
        return typeof windowZoomLevel === 'number' ? windowZoomLevel : 0;
    }
    handleOnDidChangeZoomLevel(targetWindowId) {
        // Zoom status entry
        this.updateWindowZoomStatusEntry(targetWindowId);
        // Notify main process about a custom zoom level
        if (targetWindowId === mainWindow.vscodeWindowId) {
            const currentWindowZoomLevel = getZoomLevel(mainWindow);
            let notifyZoomLevel = undefined;
            if (this.configuredWindowZoomLevel !== currentWindowZoomLevel) {
                notifyZoomLevel = currentWindowZoomLevel;
            }
            ipcRenderer.invoke('vscode:notifyZoomLevel', notifyZoomLevel);
        }
    }
    createWindowZoomStatusEntry(part) {
        const disposables = new DisposableStore();
        Event.once(part.onWillDispose)(() => disposables.dispose());
        const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
        this.mapWindowIdToZoomStatusEntry.set(part.windowId, disposables.add(scopedInstantiationService.createInstance(ZoomStatusEntry)));
        disposables.add(toDisposable(() => this.mapWindowIdToZoomStatusEntry.delete(part.windowId)));
        this.updateWindowZoomStatusEntry(part.windowId);
    }
    updateWindowZoomStatusEntry(targetWindowId) {
        const targetWindow = getWindowById(targetWindowId);
        const entry = this.mapWindowIdToZoomStatusEntry.get(targetWindowId);
        if (entry && targetWindow) {
            const currentZoomLevel = getZoomLevel(targetWindow.window);
            let text = undefined;
            if (currentZoomLevel < this.configuredWindowZoomLevel) {
                text = '$(zoom-out)';
            }
            else if (currentZoomLevel > this.configuredWindowZoomLevel) {
                text = '$(zoom-in)';
            }
            entry.updateZoomEntry(text ?? false, targetWindowId);
        }
    }
    onDidChangeConfiguredWindowZoomLevel() {
        this.configuredWindowZoomLevel = this.resolveConfiguredWindowZoomLevel();
        let applyZoomLevel = false;
        for (const { window } of getWindows()) {
            if (getZoomLevel(window) !== this.configuredWindowZoomLevel) {
                applyZoomLevel = true;
                break;
            }
        }
        if (applyZoomLevel) {
            applyZoom(this.configuredWindowZoomLevel, ApplyZoomTarget.ALL_WINDOWS);
        }
        for (const [windowId] of this.mapWindowIdToZoomStatusEntry) {
            this.updateWindowZoomStatusEntry(windowId);
        }
    }
    //#endregion
    dispose() {
        super.dispose();
        for (const [, entry] of this.mapWindowIdToZoomStatusEntry) {
            entry.dispose();
        }
    }
};
NativeWindow = NativeWindow_1 = __decorate([
    __param(0, IEditorService),
    __param(1, IEditorGroupsService),
    __param(2, IConfigurationService),
    __param(3, ITitleService),
    __param(4, IWorkbenchThemeService),
    __param(5, INotificationService),
    __param(6, ICommandService),
    __param(7, IKeybindingService),
    __param(8, ITelemetryService),
    __param(9, IWorkspaceEditingService),
    __param(10, IFileService),
    __param(11, IMenuService),
    __param(12, ILifecycleService),
    __param(13, IIntegrityService),
    __param(14, INativeWorkbenchEnvironmentService),
    __param(15, IAccessibilityService),
    __param(16, IWorkspaceContextService),
    __param(17, IOpenerService),
    __param(18, INativeHostService),
    __param(19, ITunnelService),
    __param(20, IWorkbenchLayoutService),
    __param(21, IWorkingCopyService),
    __param(22, IFilesConfigurationService),
    __param(23, IProductService),
    __param(24, IRemoteAuthorityResolverService),
    __param(25, IDialogService),
    __param(26, IStorageService),
    __param(27, ILogService),
    __param(28, IInstantiationService),
    __param(29, ISharedProcessService),
    __param(30, IProgressService),
    __param(31, ILabelService),
    __param(32, IBannerService),
    __param(33, IUriIdentityService),
    __param(34, IPreferencesService),
    __param(35, IUtilityProcessWorkerWorkbenchService),
    __param(36, IHostService),
    __param(37, IContextMenuService)
], NativeWindow);
export { NativeWindow };
let ZoomStatusEntry = class ZoomStatusEntry extends Disposable {
    constructor(statusbarService, commandService, keybindingService) {
        super();
        this.statusbarService = statusbarService;
        this.commandService = commandService;
        this.keybindingService = keybindingService;
        this.disposable = this._register(new MutableDisposable());
        this.zoomLevelLabel = undefined;
    }
    updateZoomEntry(visibleOrText, targetWindowId) {
        if (typeof visibleOrText === 'string') {
            if (!this.disposable.value) {
                this.createZoomEntry(visibleOrText);
            }
            this.updateZoomLevelLabel(targetWindowId);
        }
        else {
            this.disposable.clear();
        }
    }
    createZoomEntry(visibleOrText) {
        const disposables = new DisposableStore();
        this.disposable.value = disposables;
        const container = $('.zoom-status');
        const left = $('.zoom-status-left');
        container.appendChild(left);
        const zoomOutAction = disposables.add(new Action('workbench.action.zoomOut', localize('zoomOut', "Zoom Out"), ThemeIcon.asClassName(Codicon.remove), true, () => this.commandService.executeCommand(zoomOutAction.id)));
        const zoomInAction = disposables.add(new Action('workbench.action.zoomIn', localize('zoomIn', "Zoom In"), ThemeIcon.asClassName(Codicon.plus), true, () => this.commandService.executeCommand(zoomInAction.id)));
        const zoomResetAction = disposables.add(new Action('workbench.action.zoomReset', localize('zoomReset', "Reset"), undefined, true, () => this.commandService.executeCommand(zoomResetAction.id)));
        zoomResetAction.tooltip = this.keybindingService.appendKeybinding(zoomResetAction.label, zoomResetAction.id);
        const zoomSettingsAction = disposables.add(new Action('workbench.action.openSettings', localize('zoomSettings', "Settings"), ThemeIcon.asClassName(Codicon.settingsGear), true, () => this.commandService.executeCommand(zoomSettingsAction.id, 'window.zoom')));
        const zoomLevelLabel = disposables.add(new Action('zoomLabel', undefined, undefined, false));
        this.zoomLevelLabel = zoomLevelLabel;
        disposables.add(toDisposable(() => this.zoomLevelLabel = undefined));
        const actionBarLeft = disposables.add(new ActionBar(left, { hoverDelegate: nativeHoverDelegate }));
        actionBarLeft.push(zoomOutAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(zoomOutAction.id)?.getLabel() });
        actionBarLeft.push(this.zoomLevelLabel, { icon: false, label: true });
        actionBarLeft.push(zoomInAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(zoomInAction.id)?.getLabel() });
        const right = $('.zoom-status-right');
        container.appendChild(right);
        const actionBarRight = disposables.add(new ActionBar(right, { hoverDelegate: nativeHoverDelegate }));
        actionBarRight.push(zoomResetAction, { icon: false, label: true });
        actionBarRight.push(zoomSettingsAction, { icon: true, label: false, keybinding: this.keybindingService.lookupKeybinding(zoomSettingsAction.id)?.getLabel() });
        const name = localize('status.windowZoom', "Window Zoom");
        disposables.add(this.statusbarService.addEntry({
            name,
            text: visibleOrText,
            tooltip: container,
            ariaLabel: name,
            command: ShowTooltipCommand,
            kind: 'prominent'
        }, 'status.windowZoom', 1 /* StatusbarAlignment.RIGHT */, 102));
    }
    updateZoomLevelLabel(targetWindowId) {
        if (this.zoomLevelLabel) {
            const targetWindow = getWindowById(targetWindowId, true).window;
            const zoomFactor = Math.round(getZoomFactor(targetWindow) * 100);
            const zoomLevel = getZoomLevel(targetWindow);
            this.zoomLevelLabel.label = `${zoomLevel}`;
            this.zoomLevelLabel.tooltip = localize('zoomNumber', "Zoom Level: {0} ({1}%)", zoomLevel, zoomFactor);
        }
    }
};
ZoomStatusEntry = __decorate([
    __param(0, IStatusbarService),
    __param(1, ICommandService),
    __param(2, IKeybindingService)
], ZoomStatusEntry);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2VsZWN0cm9uLWJyb3dzZXIvd2luZG93LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLG9CQUFvQixDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDeEMsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUN6SyxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBdUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN0SSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHNCQUFzQixFQUFvQyxnQkFBZ0IsRUFBRSxjQUFjLEVBQThELHFCQUFxQixFQUE2QixNQUFNLHFCQUFxQixDQUFDO0FBQy9PLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQTRJLGlCQUFpQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeE8sT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxlQUFl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