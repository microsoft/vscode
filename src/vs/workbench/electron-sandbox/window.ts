/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/window.css';
import { localize } from '../../nls.js';
import { URI } from '../../base/common/uri.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { equals } from '../../base/common/objects.js';
import { EventType, EventHelper, addDisposableListener, ModifierKeyEmitter, getActiveElement, hasWindow, getWindowById, getWindows, $ } from '../../base/browser/dom.js';
import { Action, Separator, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from '../../base/common/actions.js';
import { IFileService } from '../../platform/files/common/files.js';
import { EditorResourceAccessor, IUntitledTextResourceEditorInput, SideBySideEditor, pathsToEditors, IResourceDiffEditorInput, IUntypedEditorInput, IEditorPane, isResourceEditorInput, IResourceMergeEditorInput } from '../common/editor.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { WindowMinimumSize, IOpenFileRequest, IAddRemoveFoldersRequest, INativeRunActionInWindowRequest, INativeRunKeybindingInWindowRequest, INativeOpenFileRequest, hasNativeTitlebar } from '../../platform/window/common/window.js';
import { ITitleService } from '../services/title/browser/titleService.js';
import { IWorkbenchThemeService } from '../services/themes/common/workbenchThemeService.js';
import { ApplyZoomTarget, applyZoom } from '../../platform/window/electron-sandbox/window.js';
import { setFullscreen, getZoomLevel, onDidChangeZoomLevel, getZoomFactor } from '../../base/browser/browser.js';
import { ICommandService, CommandsRegistry } from '../../platform/commands/common/commands.js';
import { IResourceEditorInput } from '../../platform/editor/common/editor.js';
import { ipcRenderer, process } from '../../base/parts/sandbox/electron-sandbox/globals.js';
import { IWorkspaceEditingService } from '../services/workspaces/common/workspaceEditing.js';
import { IMenuService, MenuId, IMenu, MenuItemAction, MenuRegistry } from '../../platform/actions/common/actions.js';
import { ICommandAction } from '../../platform/action/common/action.js';
import { getFlatActionBarActions } from '../../platform/actions/browser/menuEntryActionViewItem.js';
import { RunOnceScheduler } from '../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { LifecyclePhase, ILifecycleService, WillShutdownEvent, ShutdownReason, BeforeShutdownErrorEvent, BeforeShutdownEvent } from '../services/lifecycle/common/lifecycle.js';
import { IWorkspaceFolderCreationData } from '../../platform/workspaces/common/workspaces.js';
import { IIntegrityService } from '../services/integrity/common/integrity.js';
import { isWindows, isMacintosh } from '../../base/common/platform.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { INotificationService, NeverShowAgainScope, NotificationPriority, Severity } from '../../platform/notification/common/notification.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { INativeWorkbenchEnvironmentService } from '../services/environment/electron-sandbox/environmentService.js';
import { IAccessibilityService, AccessibilitySupport } from '../../platform/accessibility/common/accessibility.js';
import { WorkbenchState, IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { coalesce } from '../../base/common/arrays.js';
import { ConfigurationTarget, IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { IOpenerService, IResolvedExternalUri, OpenOptions } from '../../platform/opener/common/opener.js';
import { Schemas } from '../../base/common/network.js';
import { INativeHostService } from '../../platform/native/common/native.js';
import { posix } from '../../base/common/path.js';
import { ITunnelService, RemoteTunnel, extractLocalHostUriMetaDataForPortMapping, extractQueryLocalHostUriMetaDataForPortMapping } from '../../platform/tunnel/common/tunnel.js';
import { IWorkbenchLayoutService, positionFromString, Position } from '../services/layout/browser/layoutService.js';
import { IWorkingCopyService } from '../services/workingCopy/common/workingCopyService.js';
import { WorkingCopyCapabilities } from '../services/workingCopy/common/workingCopy.js';
import { IFilesConfigurationService } from '../services/filesConfiguration/common/filesConfigurationService.js';
import { Event } from '../../base/common/event.js';
import { IRemoteAuthorityResolverService } from '../../platform/remote/common/remoteAuthorityResolver.js';
import { IAddressProvider, IAddress } from '../../platform/remote/common/remoteAgentConnection.js';
import { IEditorGroupsService, IEditorPart } from '../services/editor/common/editorGroupsService.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { AuthInfo } from '../../base/parts/sandbox/electron-sandbox/electronTypes.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { whenEditorClosed } from '../browser/editor.js';
import { ISharedProcessService } from '../../platform/ipc/electron-sandbox/services.js';
import { IProgressService, ProgressLocation } from '../../platform/progress/common/progress.js';
import { toErrorMessage } from '../../base/common/errorMessage.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { dirname } from '../../base/common/resources.js';
import { IBannerService } from '../services/banner/browser/bannerService.js';
import { Codicon } from '../../base/common/codicons.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { IPreferencesService } from '../services/preferences/common/preferences.js';
import { IUtilityProcessWorkerWorkbenchService } from '../services/utilityProcess/electron-sandbox/utilityProcessWorkerWorkbenchService.js';
import { registerWindowDriver } from '../services/driver/electron-sandbox/driver.js';
import { mainWindow } from '../../base/browser/window.js';
import { BaseWindow } from '../browser/window.js';
import { IHostService } from '../services/host/browser/host.js';
import { IStatusbarService, ShowTooltipCommand, StatusbarAlignment } from '../services/statusbar/browser/statusbar.js';
import { ActionBar } from '../../base/browser/ui/actionbar/actionbar.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { getWorkbenchContribution } from '../common/contributions.js';
import { DynamicWorkbenchSecurityConfiguration } from '../common/configuration.js';
import { nativeHoverDelegate } from '../../platform/hover/browser/hover.js';

export class NativeWindow extends BaseWindow {

	private readonly customTitleContextMenuDisposable = this._register(new DisposableStore());

	private readonly addRemoveFoldersScheduler = this._register(new RunOnceScheduler(() => this.doAddRemoveFolders(), 100));
	private pendingFoldersToAdd: URI[] = [];
	private pendingFoldersToRemove: URI[] = [];

	private isDocumentedEdited = false;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITitleService private readonly titleService: ITitleService,
		@IWorkbenchThemeService protected themeService: IWorkbenchThemeService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@IFileService private readonly fileService: IFileService,
		@IMenuService private readonly menuService: IMenuService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IIntegrityService private readonly integrityService: IIntegrityService,
		@INativeWorkbenchEnvironmentService private readonly nativeEnvironmentService: INativeWorkbenchEnvironmentService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ISharedProcessService private readonly sharedProcessService: ISharedProcessService,
		@IProgressService private readonly progressService: IProgressService,
		@ILabelService private readonly labelService: ILabelService,
		@IBannerService private readonly bannerService: IBannerService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IUtilityProcessWorkerWorkbenchService private readonly utilityProcessWorkerWorkbenchService: IUtilityProcessWorkerWorkbenchService,
		@IHostService hostService: IHostService
	) {
		super(mainWindow, undefined, hostService, nativeEnvironmentService);

		this.configuredWindowZoomLevel = this.resolveConfiguredWindowZoomLevel();

		this.registerListeners();
		this.create();
	}

	protected registerListeners(): void {

		// Layout
		this._register(addDisposableListener(mainWindow, EventType.RESIZE, () => this.layoutService.layout()));

		// React to editor input changes
		this._register(this.editorService.onDidActiveEditorChange(() => this.updateTouchbarMenu()));

		// Prevent opening a real URL inside the window
		for (const event of [EventType.DRAG_OVER, EventType.DROP]) {
			this._register(addDisposableListener(mainWindow.document.body, event, (e: DragEvent) => {
				EventHelper.stop(e);
			}));
		}

		// Support `runAction` event
		ipcRenderer.on('vscode:runAction', async (event: unknown, request: INativeRunActionInWindowRequest) => {
			const args: unknown[] = request.args || [];

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
			} else {
				args.push({ from: request.from });
			}

			try {
				await this.commandService.executeCommand(request.id, ...args);

				this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: request.id, from: request.from });
			} catch (error) {
				this.notificationService.error(error);
			}
		});

		// Support runKeybinding event
		ipcRenderer.on('vscode:runKeybinding', (event: unknown, request: INativeRunKeybindingInWindowRequest) => {
			const activeElement = getActiveElement();
			if (activeElement) {
				this.keybindingService.dispatchByUserSettingsLabel(request.userSettingsLabel, activeElement);
			}
		});

		// Error reporting from main
		ipcRenderer.on('vscode:reportError', (event: unknown, error: string) => {
			if (error) {
				onUnexpectedError(JSON.parse(error));
			}
		});

		// Shared Process crash reported from main
		ipcRenderer.on('vscode:reportSharedProcessCrash', (event: unknown, error: string) => {
			this.notificationService.prompt(
				Severity.Error,
				localize('sharedProcessCrash', "A shared background process terminated unexpectedly. Please restart the application to recover."),
				[{
					label: localize('restart', "Restart"),
					run: () => this.nativeHostService.relaunch()
				}],
				{
					priority: NotificationPriority.URGENT
				}
			);
		});

		// Support openFiles event for existing and new files
		ipcRenderer.on('vscode:openFiles', (event: unknown, request: IOpenFileRequest) => { this.onOpenFiles(request); });

		// Support addRemoveFolders event for workspace management
		ipcRenderer.on('vscode:addRemoveFolders', (event: unknown, request: IAddRemoveFoldersRequest) => this.onAddRemoveFoldersRequest(request));

		// Message support
		ipcRenderer.on('vscode:showInfoMessage', (event: unknown, message: string) => this.notificationService.info(message));

		// Shell Environment Issue Notifications
		ipcRenderer.on('vscode:showResolveShellEnvError', (event: unknown, message: string) => {
			this.notificationService.prompt(
				Severity.Error,
				message,
				[{
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
				}]
			);
		});

		ipcRenderer.on('vscode:showCredentialsError', (event: unknown, message: string) => {
			this.notificationService.prompt(
				Severity.Error,
				localize('keychainWriteError', "Writing login information to the keychain failed with error '{0}'.", message),
				[{
					label: localize('troubleshooting', "Troubleshooting Guide"),
					run: () => this.openerService.open('https://go.microsoft.com/fwlink/?linkid=2190713')
				}]
			);
		});

		ipcRenderer.on('vscode:showTranslatedBuildWarning', () => {
			this.notificationService.prompt(
				Severity.Warning,
				localize("runningTranslated", "You are running an emulated version of {0}. For better performance download the native arm64 version of {0} build for your machine.", this.productService.nameLong),
				[{
					label: localize('downloadArmBuild', "Download"),
					run: () => {
						const quality = this.productService.quality;
						const stableURL = 'https://code.visualstudio.com/docs/?dv=osx';
						const insidersURL = 'https://code.visualstudio.com/docs/?dv=osx&build=insiders';
						this.openerService.open(quality === 'stable' ? stableURL : insidersURL);
					}
				}],
				{
					priority: NotificationPriority.URGENT
				}
			);
		});

		ipcRenderer.on('vscode:showArgvParseWarning', (event: unknown, message: string) => {
			this.notificationService.prompt(
				Severity.Warning,
				localize("showArgvParseWarning", "The runtime arguments file 'argv.json' contains errors. Please correct them and restart."),
				[{
					label: localize('showArgvParseWarningAction', "Open File"),
					run: () => this.editorService.openEditor({ resource: this.nativeEnvironmentService.argvResource })
				}],
				{
					priority: NotificationPriority.URGENT
				}
			);
		});

		// Fullscreen Events
		ipcRenderer.on('vscode:enterFullScreen', () => setFullscreen(true, mainWindow));
		ipcRenderer.on('vscode:leaveFullScreen', () => setFullscreen(false, mainWindow));

		// Proxy Login Dialog
		ipcRenderer.on('vscode:openProxyAuthenticationDialog', async (event: unknown, payload: { authInfo: AuthInfo; username?: string; password?: string; replyChannel: string }) => {
			const rememberCredentialsKey = 'window.rememberProxyCredentials';
			const rememberCredentials = this.storageService.getBoolean(rememberCredentialsKey, StorageScope.APPLICATION);
			const result = await this.dialogService.input({
				type: 'warning',
				message: localize('proxyAuthRequired', "Proxy Authentication Required"),
				primaryButton: localize({ key: 'loginButton', comment: ['&& denotes a mnemonic'] }, "&&Log In"),
				inputs:
					[
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
					this.storageService.store(rememberCredentialsKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				} else {
					this.storageService.remove(rememberCredentialsKey, StorageScope.APPLICATION);
				}

				// Reply back to main side with credentials
				const [username, password] = result.values;
				ipcRenderer.send(payload.replyChannel, { username, password, remember: !!result.checkboxChecked });
			}
		});

		// Accessibility support changed event
		ipcRenderer.on('vscode:accessibilitySupportChanged', (event: unknown, accessibilitySupportEnabled: boolean) => {
			this.accessibilityService.setAccessibilitySupport(accessibilitySupportEnabled ? AccessibilitySupport.Enabled : AccessibilitySupport.Disabled);
		});

		// Allow to update security settings around allowed UNC Host
		ipcRenderer.on('vscode:configureAllowedUNCHost', async (event: unknown, host: string) => {
			if (!isWindows) {
				return; // only supported on Windows
			}

			const allowedUncHosts = new Set<string>();

			const configuredAllowedUncHosts = this.configurationService.getValue<string[] | undefined>('security.allowedUNCHosts',) ?? [];
			if (Array.isArray(configuredAllowedUncHosts)) {
				for (const configuredAllowedUncHost of configuredAllowedUncHosts) {
					if (typeof configuredAllowedUncHost === 'string') {
						allowedUncHosts.add(configuredAllowedUncHost);
					}
				}
			}

			if (!allowedUncHosts.has(host)) {
				allowedUncHosts.add(host);

				await getWorkbenchContribution<DynamicWorkbenchSecurityConfiguration>(DynamicWorkbenchSecurityConfiguration.ID).ready; // ensure this setting is registered
				this.configurationService.updateValue('security.allowedUNCHosts', [...allowedUncHosts.values()], ConfigurationTarget.USER);
			}
		});

		// Allow to update security settings around protocol handlers
		ipcRenderer.on('vscode:disablePromptForProtocolHandling', (event: unknown, kind: 'local' | 'remote') => {
			const setting = kind === 'local' ? 'security.promptForLocalFileProtocolHandling' : 'security.promptForRemoteFileProtocolHandling';
			this.configurationService.updateValue(setting, false);
		});

		// Window Zoom
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.zoomLevel') || (e.affectsConfiguration('window.zoomPerWindow') && this.configurationService.getValue('window.zoomPerWindow') === false)) {
				this.onDidChangeConfiguredWindowZoomLevel();
			} else if (e.affectsConfiguration('keyboard.touchbar.enabled') || e.affectsConfiguration('keyboard.touchbar.ignored')) {
				this.updateTouchbarMenu();
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
			if (gotDirty && !(workingCopy.capabilities & WorkingCopyCapabilities.Untitled) && this.filesConfigurationService.hasShortAutoSaveDelay(workingCopy.resource)) {
				return; // do not indicate dirty of working copies that are auto saved after short delay
			}

			this.updateDocumentEdited(gotDirty ? true : undefined);
		}));

		this.updateDocumentEdited(undefined);

		// Detect minimize / maximize
		this._register(Event.any(
			Event.map(Event.filter(this.nativeHostService.onDidMaximizeWindow, windowId => !!hasWindow(windowId)), windowId => ({ maximized: true, windowId })),
			Event.map(Event.filter(this.nativeHostService.onDidUnmaximizeWindow, windowId => !!hasWindow(windowId)), windowId => ({ maximized: false, windowId }))
		)(e => this.layoutService.updateWindowMaximizedState(getWindowById(e.windowId)!.window, e.maximized)));
		this.layoutService.updateWindowMaximizedState(mainWindow, this.nativeEnvironmentService.window.maximized ?? false);

		// Detect panel position to determine minimum width
		this._register(this.layoutService.onDidChangePanelPosition(pos => this.onDidChangePanelPosition(positionFromString(pos))));
		this.onDidChangePanelPosition(this.layoutService.getPanelPosition());

		// Lifecycle
		this._register(this.lifecycleService.onBeforeShutdown(e => this.onBeforeShutdown(e)));
		this._register(this.lifecycleService.onBeforeShutdownError(e => this.onBeforeShutdownError(e)));
		this._register(this.lifecycleService.onWillShutdown(e => this.onWillShutdown(e)));
	}

	private handleRepresentedFilename(part: IEditorPart): void {
		const disposables = new DisposableStore();
		Event.once(part.onWillDispose)(() => disposables.dispose());

		const scopedEditorService = this.editorGroupService.getScopedInstantiationService(part).invokeFunction(accessor => accessor.get(IEditorService));
		disposables.add(scopedEditorService.onDidActiveEditorChange(() => this.updateRepresentedFilename(scopedEditorService, part.windowId)));
	}

	private updateRepresentedFilename(editorService: IEditorService, targetWindowId: number): void {
		const file = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY, filterByScheme: Schemas.file });

		// Represented Filename
		this.nativeHostService.setRepresentedFilename(file?.fsPath ?? '', { targetWindowId });

		// Custom title menu (main window only currently)
		if (targetWindowId === mainWindow.vscodeWindowId) {
			this.provideCustomTitleContextMenu(file?.fsPath);
		}
	}

	//#region Window Lifecycle

	private onBeforeShutdown({ veto, reason }: BeforeShutdownEvent): void {
		if (reason === ShutdownReason.CLOSE) {
			const confirmBeforeCloseSetting = this.configurationService.getValue<'always' | 'never' | 'keyboardOnly'>('window.confirmBeforeClose');

			const confirmBeforeClose = confirmBeforeCloseSetting === 'always' || (confirmBeforeCloseSetting === 'keyboardOnly' && ModifierKeyEmitter.getInstance().isModifierPressed);
			if (confirmBeforeClose) {

				// When we need to confirm on close or quit, veto the shutdown
				// with a long running promise to figure out whether shutdown
				// can proceed or not.

				return veto((async () => {
					let actualReason: ShutdownReason = reason;
					if (reason === ShutdownReason.CLOSE && !isMacintosh) {
						const windowCount = await this.nativeHostService.getWindowCount();
						if (windowCount === 1) {
							actualReason = ShutdownReason.QUIT; // Windows/Linux: closing last window means to QUIT
						}
					}

					let confirmed = true;
					if (confirmBeforeClose) {
						confirmed = await this.instantiationService.invokeFunction(accessor => NativeWindow.confirmOnShutdown(accessor, actualReason));
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

	private progressOnBeforeShutdown(reason: ShutdownReason): void {
		this.progressService.withProgress({
			location: ProgressLocation.Window, 	// use window progress to not be too annoying about this operation
			delay: 800,							// delay so that it only appears when operation takes a long time
			title: this.toShutdownLabel(reason, false),
		}, () => {
			return Event.toPromise(Event.any(
				this.lifecycleService.onWillShutdown, 	// dismiss this dialog when we shutdown
				this.lifecycleService.onShutdownVeto, 	// or when shutdown was vetoed
				this.dialogService.onWillShowDialog		// or when a dialog asks for input
			));
		});
	}

	private onBeforeShutdownError({ error, reason }: BeforeShutdownErrorEvent): void {
		this.dialogService.error(this.toShutdownLabel(reason, true), localize('shutdownErrorDetail', "Error: {0}", toErrorMessage(error)));
	}

	private onWillShutdown({ reason, force, joiners }: WillShutdownEvent): void {

		// Delay so that the dialog only appears after timeout
		const shutdownDialogScheduler = new RunOnceScheduler(() => {
			const pendingJoiners = joiners();

			this.progressService.withProgress({
				location: ProgressLocation.Dialog, 				// use a dialog to prevent the user from making any more interactions now
				buttons: [this.toForceShutdownLabel(reason)],	// allow to force shutdown anyway
				cancellable: false,								// do not allow to cancel
				sticky: true,									// do not allow to dismiss
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

	private toShutdownLabel(reason: ShutdownReason, isError: boolean): string {
		if (isError) {
			switch (reason) {
				case ShutdownReason.CLOSE:
					return localize('shutdownErrorClose', "An unexpected error prevented the window to close");
				case ShutdownReason.QUIT:
					return localize('shutdownErrorQuit', "An unexpected error prevented the application to quit");
				case ShutdownReason.RELOAD:
					return localize('shutdownErrorReload', "An unexpected error prevented the window to reload");
				case ShutdownReason.LOAD:
					return localize('shutdownErrorLoad', "An unexpected error prevented to change the workspace");
			}
		}

		switch (reason) {
			case ShutdownReason.CLOSE:
				return localize('shutdownTitleClose', "Closing the window is taking a bit longer...");
			case ShutdownReason.QUIT:
				return localize('shutdownTitleQuit', "Quitting the application is taking a bit longer...");
			case ShutdownReason.RELOAD:
				return localize('shutdownTitleReload', "Reloading the window is taking a bit longer...");
			case ShutdownReason.LOAD:
				return localize('shutdownTitleLoad', "Changing the workspace is taking a bit longer...");
		}
	}

	private toForceShutdownLabel(reason: ShutdownReason): string {
		switch (reason) {
			case ShutdownReason.CLOSE:
				return localize('shutdownForceClose', "Close Anyway");
			case ShutdownReason.QUIT:
				return localize('shutdownForceQuit', "Quit Anyway");
			case ShutdownReason.RELOAD:
				return localize('shutdownForceReload', "Reload Anyway");
			case ShutdownReason.LOAD:
				return localize('shutdownForceLoad', "Change Anyway");
		}
	}

	//#endregion

	private updateDocumentEdited(documentEdited: true | undefined): void {
		let setDocumentEdited: boolean;
		if (typeof documentEdited === 'boolean') {
			setDocumentEdited = documentEdited;
		} else {
			setDocumentEdited = this.workingCopyService.hasDirty;
		}

		if ((!this.isDocumentedEdited && setDocumentEdited) || (this.isDocumentedEdited && !setDocumentEdited)) {
			this.isDocumentedEdited = setDocumentEdited;

			this.nativeHostService.setDocumentEdited(setDocumentEdited);
		}
	}

	private getWindowMinimumWidth(panelPosition: Position = this.layoutService.getPanelPosition()): number {

		// if panel is on the side, then return the larger minwidth
		const panelOnSide = panelPosition === Position.LEFT || panelPosition === Position.RIGHT;
		if (panelOnSide) {
			return WindowMinimumSize.WIDTH_WITH_VERTICAL_PANEL;
		}

		return WindowMinimumSize.WIDTH;
	}

	private onDidChangePanelPosition(pos: Position): void {
		const minWidth = this.getWindowMinimumWidth(pos);

		this.nativeHostService.setMinimumSize(minWidth, undefined);
	}

	private maybeCloseWindow(): void {
		const closeWhenEmpty = this.configurationService.getValue('window.closeWhenEmpty') || this.nativeEnvironmentService.args.wait;
		if (!closeWhenEmpty) {
			return; // return early if configured to not close when empty
		}

		// Close empty editor groups based on setting and environment
		for (const editorPart of this.editorGroupService.parts) {
			if (editorPart.groups.some(group => !group.isEmpty)) {
				continue; // not empty
			}

			if (editorPart === this.editorGroupService.mainPart && (
				this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ||	// only for empty windows
				this.environmentService.isExtensionDevelopment ||					// not when developing an extension
				this.editorService.visibleEditors.length > 0						// not when there are still editors open in other windows
			)) {
				continue;
			}

			if (editorPart === this.editorGroupService.mainPart) {
				this.nativeHostService.closeWindow();
			} else {
				editorPart.removeGroup(editorPart.activeGroup);
			}
		}
	}

	private provideCustomTitleContextMenu(filePath: string | undefined): void {

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

			let label: string;
			if (!isFile) {
				label = this.labelService.getUriBasenameLabel(dirname(path));
			} else {
				label = this.labelService.getUriBasenameLabel(path);
			}

			const commandId = `workbench.action.revealPathInFinder${i}`;
			this.customTitleContextMenuDisposable.add(CommandsRegistry.registerCommand(commandId, () => this.nativeHostService.showItemInFolder(path.fsPath)));
			this.customTitleContextMenuDisposable.add(MenuRegistry.appendMenuItem(MenuId.TitleBarTitleContext, { command: { id: commandId, title: label || posix.sep }, order: -i, group: '1_file' }));
		}
	}

	protected create(): void {

		// Handle open calls
		this.setupOpenHandlers();

		// Notify some services about lifecycle phases
		this.lifecycleService.when(LifecyclePhase.Ready).then(() => this.nativeHostService.notifyReady());
		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			this.sharedProcessService.notifyRestored();
			this.utilityProcessWorkerWorkbenchService.notifyRestored();
		});

		// Check for situations that are worth warning the user about
		this.handleWarnings();

		// Touchbar menu (if enabled)
		this.updateTouchbarMenu();

		// Smoke Test Driver
		if (this.environmentService.enableSmokeTestDriver) {
			this.setupDriver();
		}
	}

	private async handleWarnings(): Promise<void> {

		// After restored phase is fine for the following ones
		await this.lifecycleService.when(LifecyclePhase.Restored);

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
		if (this.environmentService.isBuilt) {
			let installLocationUri: URI;
			if (isMacintosh) {
				// appRoot = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app
				installLocationUri = dirname(dirname(dirname(URI.file(this.nativeEnvironmentService.appRoot))));
			} else {
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

		// macOS 10.15 warning
		if (isMacintosh) {
			const majorVersion = this.nativeEnvironmentService.os.release.split('.')[0];
			const eolReleases = new Map<string, string>([
				['19', 'macOS Catalina'],
			]);

			if (eolReleases.has(majorVersion)) {
				const message = localize('macoseolmessage', "{0} on {1} will soon stop receiving updates. Consider upgrading your macOS version.", this.productService.nameLong, eolReleases.get(majorVersion));

				this.notificationService.prompt(
					Severity.Warning,
					message,
					[{
						label: localize('learnMore', "Learn More"),
						run: () => this.openerService.open(URI.parse('https://aka.ms/vscode-faq-old-macOS'))
					}],
					{
						neverShowAgain: { id: 'macoseol', isSecondary: true, scope: NeverShowAgainScope.APPLICATION },
						priority: NotificationPriority.URGENT,
						sticky: true
					}
				);
			}
		}

		// Slow shell environment progress indicator
		const shellEnv = process.shellEnv();
		this.progressService.withProgress({
			title: localize('resolveShellEnvironment', "Resolving shell environment..."),
			location: ProgressLocation.Window,
			delay: 1600,
			buttons: [localize('learnMore', "Learn More")]
		}, () => shellEnv, () => this.openerService.open('https://go.microsoft.com/fwlink/?linkid=2149667'));
	}

	private setupDriver(): void {
		const that = this;
		let pendingQuit = false;

		registerWindowDriver(this.instantiationService, {
			async exitApplication(): Promise<void> {
				if (pendingQuit) {
					that.logService.info('[driver] not handling exitApplication() due to pending quit() call');
					return;
				}

				that.logService.info('[driver] handling exitApplication()');

				pendingQuit = true;
				return that.nativeHostService.quit();
			}
		});
	}

	async resolveExternalUri(uri: URI, options?: OpenOptions): Promise<IResolvedExternalUri | undefined> {
		let queryTunnel: RemoteTunnel | string | undefined;
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
					} else {
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

	private async openTunnel(address: string, port: number): Promise<RemoteTunnel | string | undefined> {
		const remoteAuthority = this.environmentService.remoteAuthority;
		const addressProvider: IAddressProvider | undefined = remoteAuthority ? {
			getAddress: async (): Promise<IAddress> => {
				return (await this.remoteAuthorityResolverService.resolveAuthority(remoteAuthority)).authority;
			}
		} : undefined;

		const tunnel = await this.tunnelService.getExistingTunnel(address, port);
		if (!tunnel || (typeof tunnel === 'string')) {
			return this.tunnelService.openTunnel(addressProvider, address, port);
		}

		return tunnel;
	}

	private setupOpenHandlers(): void {

		// Handle external open() calls
		this.openerService.setDefaultExternalOpener({
			openExternal: async (href: string) => {
				const success = await this.nativeHostService.openExternal(href, this.configurationService.getValue<string>('workbench.externalBrowser'));
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
			resolveExternalUri: async (uri: URI, options?: OpenOptions) => {
				return this.resolveExternalUri(uri, options);
			}
		});
	}

	//#region Touchbar

	private touchBarMenu: IMenu | undefined;
	private readonly touchBarDisposables = this._register(new DisposableStore());
	private lastInstalledTouchedBar: ICommandAction[][] | undefined;

	private updateTouchbarMenu(): void {
		if (!isMacintosh) {
			return; // macOS only
		}

		// Dispose old
		this.touchBarDisposables.clear();
		this.touchBarMenu = undefined;

		// Create new (delayed)
		const scheduler: RunOnceScheduler = this.touchBarDisposables.add(new RunOnceScheduler(() => this.doUpdateTouchbarMenu(scheduler), 300));
		scheduler.schedule();
	}

	private doUpdateTouchbarMenu(scheduler: RunOnceScheduler): void {
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
		const items: ICommandAction[][] = [];
		let group: ICommandAction[] = [];
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

	private onAddRemoveFoldersRequest(request: IAddRemoveFoldersRequest): void {

		// Buffer all pending requests
		this.pendingFoldersToAdd.push(...request.foldersToAdd.map(folder => URI.revive(folder)));
		this.pendingFoldersToRemove.push(...request.foldersToRemove.map(folder => URI.revive(folder)));

		// Delay the adding of folders a bit to buffer in case more requests are coming
		if (!this.addRemoveFoldersScheduler.isScheduled()) {
			this.addRemoveFoldersScheduler.schedule();
		}
	}

	private async doAddRemoveFolders(): Promise<void> {
		const foldersToAdd: IWorkspaceFolderCreationData[] = this.pendingFoldersToAdd.map(folder => ({ uri: folder }));
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

	private async onOpenFiles(request: INativeOpenFileRequest): Promise<void> {
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
				} else {
					return this.fileService.del(URI.revive(request.filesToWait.waitMarkerFileUri));
				}
			}
		}
	}

	private async trackClosedWaitFiles(waitMarkerFile: URI, resourcesToWaitFor: URI[]): Promise<void> {

		// Wait for the resources to be closed in the text editor...
		await this.instantiationService.invokeFunction(accessor => whenEditorClosed(accessor, resourcesToWaitFor));

		// ...before deleting the wait marker file
		await this.fileService.del(waitMarkerFile);
	}

	private async openResources(resources: Array<IResourceEditorInput | IUntitledTextResourceEditorInput>, diffMode: boolean, mergeMode: boolean): Promise<readonly IEditorPane[]> {
		const editors: IUntypedEditorInput[] = [];

		if (mergeMode && isResourceEditorInput(resources[0]) && isResourceEditorInput(resources[1]) && isResourceEditorInput(resources[2]) && isResourceEditorInput(resources[3])) {
			const mergeEditor: IResourceMergeEditorInput = {
				input1: { resource: resources[0].resource },
				input2: { resource: resources[1].resource },
				base: { resource: resources[2].resource },
				result: { resource: resources[3].resource },
				options: { pinned: true }
			};
			editors.push(mergeEditor);
		} else if (diffMode && isResourceEditorInput(resources[0]) && isResourceEditorInput(resources[1])) {
			const diffEditor: IResourceDiffEditorInput = {
				original: { resource: resources[0].resource },
				modified: { resource: resources[1].resource },
				options: { pinned: true }
			};
			editors.push(diffEditor);
		} else {
			editors.push(...resources);
		}

		return this.editorService.openEditors(editors, undefined, { validateTrust: true });
	}

	//#region Window Zoom

	private readonly mapWindowIdToZoomStatusEntry = new Map<number, ZoomStatusEntry>();

	private configuredWindowZoomLevel: number;

	private resolveConfiguredWindowZoomLevel(): number {
		const windowZoomLevel = this.configurationService.getValue('window.zoomLevel');

		return typeof windowZoomLevel === 'number' ? windowZoomLevel : 0;
	}

	private handleOnDidChangeZoomLevel(targetWindowId: number): void {

		// Zoom status entry
		this.updateWindowZoomStatusEntry(targetWindowId);

		// Notify main process about a custom zoom level
		if (targetWindowId === mainWindow.vscodeWindowId) {
			const currentWindowZoomLevel = getZoomLevel(mainWindow);

			let notifyZoomLevel: number | undefined = undefined;
			if (this.configuredWindowZoomLevel !== currentWindowZoomLevel) {
				notifyZoomLevel = currentWindowZoomLevel;
			}

			ipcRenderer.invoke('vscode:notifyZoomLevel', notifyZoomLevel);
		}
	}

	private createWindowZoomStatusEntry(part: IEditorPart): void {
		const disposables = new DisposableStore();
		Event.once(part.onWillDispose)(() => disposables.dispose());

		const scopedInstantiationService = this.editorGroupService.getScopedInstantiationService(part);
		this.mapWindowIdToZoomStatusEntry.set(part.windowId, disposables.add(scopedInstantiationService.createInstance(ZoomStatusEntry)));
		disposables.add(toDisposable(() => this.mapWindowIdToZoomStatusEntry.delete(part.windowId)));

		this.updateWindowZoomStatusEntry(part.windowId);
	}

	private updateWindowZoomStatusEntry(targetWindowId: number): void {
		const targetWindow = getWindowById(targetWindowId);
		const entry = this.mapWindowIdToZoomStatusEntry.get(targetWindowId);
		if (entry && targetWindow) {
			const currentZoomLevel = getZoomLevel(targetWindow.window);

			let text: string | undefined = undefined;
			if (currentZoomLevel < this.configuredWindowZoomLevel) {
				text = '$(zoom-out)';
			} else if (currentZoomLevel > this.configuredWindowZoomLevel) {
				text = '$(zoom-in)';
			}

			entry.updateZoomEntry(text ?? false, targetWindowId);
		}
	}

	private onDidChangeConfiguredWindowZoomLevel(): void {
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

	override dispose(): void {
		super.dispose();

		for (const [, entry] of this.mapWindowIdToZoomStatusEntry) {
			entry.dispose();
		}
	}
}

class ZoomStatusEntry extends Disposable {

	private readonly disposable = this._register(new MutableDisposable<DisposableStore>());

	private zoomLevelLabel: Action | undefined = undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ICommandService private readonly commandService: ICommandService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super();
	}

	updateZoomEntry(visibleOrText: false | string, targetWindowId: number): void {
		if (typeof visibleOrText === 'string') {
			if (!this.disposable.value) {
				this.createZoomEntry(visibleOrText);
			}

			this.updateZoomLevelLabel(targetWindowId);
		} else {
			this.disposable.clear();
		}
	}

	private createZoomEntry(visibleOrText: string): void {
		const disposables = new DisposableStore();
		this.disposable.value = disposables;

		const container = $('.zoom-status');

		const left = $('.zoom-status-left');
		container.appendChild(left);

		const zoomOutAction: Action = disposables.add(new Action('workbench.action.zoomOut', localize('zoomOut', "Zoom Out"), ThemeIcon.asClassName(Codicon.remove), true, () => this.commandService.executeCommand(zoomOutAction.id)));
		const zoomInAction: Action = disposables.add(new Action('workbench.action.zoomIn', localize('zoomIn', "Zoom In"), ThemeIcon.asClassName(Codicon.plus), true, () => this.commandService.executeCommand(zoomInAction.id)));
		const zoomResetAction: Action = disposables.add(new Action('workbench.action.zoomReset', localize('zoomReset', "Reset"), undefined, true, () => this.commandService.executeCommand(zoomResetAction.id)));
		zoomResetAction.tooltip = localize('zoomResetLabel', "{0} ({1})", zoomResetAction.label, this.keybindingService.lookupKeybinding(zoomResetAction.id)?.getLabel());
		const zoomSettingsAction: Action = disposables.add(new Action('workbench.action.openSettings', localize('zoomSettings', "Settings"), ThemeIcon.asClassName(Codicon.settingsGear), true, () => this.commandService.executeCommand(zoomSettingsAction.id, 'window.zoom')));
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
		}, 'status.windowZoom', StatusbarAlignment.RIGHT, 102));
	}

	private updateZoomLevelLabel(targetWindowId: number): void {
		if (this.zoomLevelLabel) {
			const targetWindow = getWindowById(targetWindowId, true).window;
			const zoomFactor = Math.round(getZoomFactor(targetWindow) * 100);
			const zoomLevel = getZoomLevel(targetWindow);

			this.zoomLevelLabel.label = `${zoomLevel}`;
			this.zoomLevelLabel.tooltip = localize('zoomNumber', "Zoom Level: {0} ({1}%)", zoomLevel, zoomFactor);
		}
	}
}
