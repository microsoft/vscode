/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { IHostService } from './host.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWindowSettings, IWindowOpenable, IOpenWindowOptions, isFolderToOpen, isWorkspaceToOpen, isFileToOpen, IOpenEmptyWindowOptions, IPathData, IFileToOpen } from '../../../../platform/window/common/window.js';
import { isResourceEditorInput, pathsToEditors } from '../../../common/editor.js';
import { whenEditorClosed } from '../../../browser/editor.js';
import { IWorkspace, IWorkspaceProvider } from '../../../browser/web.api.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label.js';
import { EventType, ModifierKeyEmitter, addDisposableListener, addDisposableThrottledListener, detectFullscreen, disposableWindowInterval, getActiveDocument, getWindowId, onDidRegisterWindow, trackFocus } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { memoize } from '../../../../base/common/decorators.js';
import { parseLineAndColumnAware } from '../../../../base/common/extpath.js';
import { IWorkspaceFolderCreationData } from '../../../../platform/workspaces/common/workspaces.js';
import { IWorkspaceEditingService } from '../../workspaces/common/workspaceEditing.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILifecycleService, BeforeShutdownEvent, ShutdownReason } from '../../lifecycle/common/lifecycle.js';
import { BrowserLifecycleService } from '../../lifecycle/browser/lifecycleService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { getWorkspaceIdentifier } from '../../workspaces/browser/workspaces.js';
import { localize } from '../../../../nls.js';
import Severity from '../../../../base/common/severity.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { DomEmitter } from '../../../../base/browser/event.js';
import { isUndefined } from '../../../../base/common/types.js';
import { isTemporaryWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { Schemas } from '../../../../base/common/network.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { mainWindow, isAuxiliaryWindow } from '../../../../base/browser/window.js';
import { isIOS, isMacintosh } from '../../../../base/common/platform.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';

enum HostShutdownReason {

	/**
	 * An unknown shutdown reason.
	 */
	Unknown = 1,

	/**
	 * A shutdown that was potentially triggered by keyboard use.
	 */
	Keyboard = 2,

	/**
	 * An explicit shutdown via code.
	 */
	Api = 3
}

export class BrowserHostService extends Disposable implements IHostService {

	declare readonly _serviceBrand: undefined;

	private workspaceProvider: IWorkspaceProvider;

	private shutdownReason = HostShutdownReason.Unknown;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@ILabelService private readonly labelService: ILabelService,
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILifecycleService private readonly lifecycleService: BrowserLifecycleService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();

		if (environmentService.options?.workspaceProvider) {
			this.workspaceProvider = environmentService.options.workspaceProvider;
		} else {
			this.workspaceProvider = new class implements IWorkspaceProvider {
				readonly workspace = undefined;
				readonly trusted = undefined;
				async open() { return true; }
			};
		}

		this.registerListeners();
	}

	private registerListeners(): void {

		// Veto shutdown depending on `window.confirmBeforeClose` setting
		this._register(this.lifecycleService.onBeforeShutdown(e => this.onBeforeShutdown(e)));

		// Track modifier keys to detect keybinding usage
		this._register(ModifierKeyEmitter.getInstance().event(() => this.updateShutdownReasonFromEvent()));
	}

	private onBeforeShutdown(e: BeforeShutdownEvent): void {

		switch (this.shutdownReason) {

			// Unknown / Keyboard shows veto depending on setting
			case HostShutdownReason.Unknown:
			case HostShutdownReason.Keyboard: {
				const confirmBeforeClose = this.configurationService.getValue('window.confirmBeforeClose');
				if (confirmBeforeClose === 'always' || (confirmBeforeClose === 'keyboardOnly' && this.shutdownReason === HostShutdownReason.Keyboard)) {
					e.veto(true, 'veto.confirmBeforeClose');
				}
				break;
			}
			// Api never shows veto
			case HostShutdownReason.Api:
				break;
		}

		// Unset for next shutdown
		this.shutdownReason = HostShutdownReason.Unknown;
	}

	private updateShutdownReasonFromEvent(): void {
		if (this.shutdownReason === HostShutdownReason.Api) {
			return; // do not overwrite any explicitly set shutdown reason
		}

		if (ModifierKeyEmitter.getInstance().isModifierPressed) {
			this.shutdownReason = HostShutdownReason.Keyboard;
		} else {
			this.shutdownReason = HostShutdownReason.Unknown;
		}
	}

	//#region Focus

	@memoize
	get onDidChangeFocus(): Event<boolean> {
		const emitter = this._register(new Emitter<boolean>());

		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			const focusTracker = disposables.add(trackFocus(window));
			const visibilityTracker = disposables.add(new DomEmitter(window.document, 'visibilitychange'));

			Event.any(
				Event.map(focusTracker.onDidFocus, () => this.hasFocus, disposables),
				Event.map(focusTracker.onDidBlur, () => this.hasFocus, disposables),
				Event.map(visibilityTracker.event, () => this.hasFocus, disposables),
				Event.map(this.onDidChangeActiveWindow, () => this.hasFocus, disposables),
			)(focus => emitter.fire(focus));
		}, { window: mainWindow, disposables: this._store }));

		return Event.latch(emitter.event, undefined, this._store);
	}

	get hasFocus(): boolean {
		return getActiveDocument().hasFocus();
	}

	async hadLastFocus(): Promise<boolean> {
		return true;
	}

	async focus(targetWindow: Window): Promise<void> {
		targetWindow.focus();
	}

	//#endregion


	//#region Window

	@memoize
	get onDidChangeActiveWindow(): Event<number> {
		const emitter = this._register(new Emitter<number>());

		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			const windowId = getWindowId(window);

			// Emit via focus tracking
			const focusTracker = disposables.add(trackFocus(window));
			disposables.add(focusTracker.onDidFocus(() => emitter.fire(windowId)));

			// Emit via interval: immediately when opening an auxiliary window,
			// it is possible that document focus has not yet changed, so we
			// poll for a while to ensure we catch the event.
			if (isAuxiliaryWindow(window)) {
				disposables.add(disposableWindowInterval(window, () => {
					const hasFocus = window.document.hasFocus();
					if (hasFocus) {
						emitter.fire(windowId);
					}

					return hasFocus;
				}, 100, 20));
			}
		}, { window: mainWindow, disposables: this._store }));

		return Event.latch(emitter.event, undefined, this._store);
	}

	@memoize
	get onDidChangeFullScreen(): Event<{ windowId: number; fullscreen: boolean }> {
		const emitter = this._register(new Emitter<{ windowId: number; fullscreen: boolean }>());

		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			const windowId = getWindowId(window);
			const viewport = isIOS && window.visualViewport ? window.visualViewport /** Visual viewport */ : window /** Layout viewport */;

			// Fullscreen (Browser)
			for (const event of [EventType.FULLSCREEN_CHANGE, EventType.WK_FULLSCREEN_CHANGE]) {
				disposables.add(addDisposableListener(window.document, event, () => emitter.fire({ windowId, fullscreen: !!detectFullscreen(window) })));
			}

			// Fullscreen (Native)
			disposables.add(addDisposableThrottledListener(viewport, EventType.RESIZE, () => emitter.fire({ windowId, fullscreen: !!detectFullscreen(window) }), undefined, isMacintosh ? 2000 /* adjust for macOS animation */ : 800 /* can be throttled */));
		}, { window: mainWindow, disposables: this._store }));

		return emitter.event;
	}

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;
	openWindow(arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: IOpenWindowOptions): Promise<void> {
		if (Array.isArray(arg1)) {
			return this.doOpenWindow(arg1, arg2);
		}

		return this.doOpenEmptyWindow(arg1);
	}

	private async doOpenWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
		const payload = this.preservePayload(false /* not an empty window */, options);
		const fileOpenables: IFileToOpen[] = [];
		const foldersToAdd: IWorkspaceFolderCreationData[] = [];

		for (const openable of toOpen) {
			openable.label = openable.label || this.getRecentLabel(openable);

			// Folder
			if (isFolderToOpen(openable)) {
				if (options?.addMode) {
					foldersToAdd.push(({ uri: openable.folderUri }));
				} else {
					this.doOpen({ folderUri: openable.folderUri }, { reuse: this.shouldReuse(options, false /* no file */), payload });
				}
			}

			// Workspace
			else if (isWorkspaceToOpen(openable)) {
				this.doOpen({ workspaceUri: openable.workspaceUri }, { reuse: this.shouldReuse(options, false /* no file */), payload });
			}

			// File (handled later in bulk)
			else if (isFileToOpen(openable)) {
				fileOpenables.push(openable);
			}
		}

		// Handle Folders to Add
		if (foldersToAdd.length > 0) {
			this.withServices(accessor => {
				const workspaceEditingService: IWorkspaceEditingService = accessor.get(IWorkspaceEditingService);
				workspaceEditingService.addFolders(foldersToAdd);
			});
		}

		// Handle Files
		if (fileOpenables.length > 0) {
			this.withServices(async accessor => {
				const editorService = accessor.get(IEditorService);

				// Support mergeMode
				if (options?.mergeMode && fileOpenables.length === 4) {
					const editors = coalesce(await pathsToEditors(fileOpenables, this.fileService, this.logService));
					if (editors.length !== 4 || !isResourceEditorInput(editors[0]) || !isResourceEditorInput(editors[1]) || !isResourceEditorInput(editors[2]) || !isResourceEditorInput(editors[3])) {
						return; // invalid resources
					}

					// Same Window: open via editor service in current window
					if (this.shouldReuse(options, true /* file */)) {
						editorService.openEditor({
							input1: { resource: editors[0].resource },
							input2: { resource: editors[1].resource },
							base: { resource: editors[2].resource },
							result: { resource: editors[3].resource },
							options: { pinned: true }
						});
					}

					// New Window: open into empty window
					else {
						const environment = new Map<string, string>();
						environment.set('mergeFile1', editors[0].resource.toString());
						environment.set('mergeFile2', editors[1].resource.toString());
						environment.set('mergeFileBase', editors[2].resource.toString());
						environment.set('mergeFileResult', editors[3].resource.toString());

						this.doOpen(undefined, { payload: Array.from(environment.entries()) });
					}
				}

				// Support diffMode
				else if (options?.diffMode && fileOpenables.length === 2) {
					const editors = coalesce(await pathsToEditors(fileOpenables, this.fileService, this.logService));
					if (editors.length !== 2 || !isResourceEditorInput(editors[0]) || !isResourceEditorInput(editors[1])) {
						return; // invalid resources
					}

					// Same Window: open via editor service in current window
					if (this.shouldReuse(options, true /* file */)) {
						editorService.openEditor({
							original: { resource: editors[0].resource },
							modified: { resource: editors[1].resource },
							options: { pinned: true }
						});
					}

					// New Window: open into empty window
					else {
						const environment = new Map<string, string>();
						environment.set('diffFileSecondary', editors[0].resource.toString());
						environment.set('diffFilePrimary', editors[1].resource.toString());

						this.doOpen(undefined, { payload: Array.from(environment.entries()) });
					}
				}

				// Just open normally
				else {
					for (const openable of fileOpenables) {

						// Same Window: open via editor service in current window
						if (this.shouldReuse(options, true /* file */)) {
							let openables: IPathData<ITextEditorOptions>[] = [];

							// Support: --goto parameter to open on line/col
							if (options?.gotoLineMode) {
								const pathColumnAware = parseLineAndColumnAware(openable.fileUri.path);
								openables = [{
									fileUri: openable.fileUri.with({ path: pathColumnAware.path }),
									options: {
										selection: !isUndefined(pathColumnAware.line) ? { startLineNumber: pathColumnAware.line, startColumn: pathColumnAware.column || 1 } : undefined
									}
								}];
							} else {
								openables = [openable];
							}

							editorService.openEditors(coalesce(await pathsToEditors(openables, this.fileService, this.logService)), undefined, { validateTrust: true });
						}

						// New Window: open into empty window
						else {
							const environment = new Map<string, string>();
							environment.set('openFile', openable.fileUri.toString());

							if (options?.gotoLineMode) {
								environment.set('gotoLineMode', 'true');
							}

							this.doOpen(undefined, { payload: Array.from(environment.entries()) });
						}
					}
				}

				// Support wait mode
				const waitMarkerFileURI = options?.waitMarkerFileURI;
				if (waitMarkerFileURI) {
					(async () => {

						// Wait for the resources to be closed in the text editor...
						await this.instantiationService.invokeFunction(accessor => whenEditorClosed(accessor, fileOpenables.map(fileOpenable => fileOpenable.fileUri)));

						// ...before deleting the wait marker file
						await this.fileService.del(waitMarkerFileURI);
					})();
				}
			});
		}
	}

	private withServices(fn: (accessor: ServicesAccessor) => unknown): void {
		// Host service is used in a lot of contexts and some services
		// need to be resolved dynamically to avoid cyclic dependencies
		// (https://github.com/microsoft/vscode/issues/108522)
		this.instantiationService.invokeFunction(accessor => fn(accessor));
	}

	private preservePayload(isEmptyWindow: boolean, options?: IOpenWindowOptions): Array<unknown> | undefined {

		// Selectively copy payload: for now only extension debugging properties are considered
		const newPayload: Array<unknown> = new Array();
		if (!isEmptyWindow && this.environmentService.extensionDevelopmentLocationURI) {
			newPayload.push(['extensionDevelopmentPath', this.environmentService.extensionDevelopmentLocationURI.toString()]);

			if (this.environmentService.debugExtensionHost.debugId) {
				newPayload.push(['debugId', this.environmentService.debugExtensionHost.debugId]);
			}

			if (this.environmentService.debugExtensionHost.port) {
				newPayload.push(['inspect-brk-extensions', String(this.environmentService.debugExtensionHost.port)]);
			}
		}

		const newWindowProfile = options?.forceProfile
			? this.userDataProfilesService.profiles.find(profile => profile.name === options?.forceProfile)
			: undefined;
		if (newWindowProfile && !newWindowProfile.isDefault) {
			newPayload.push(['profile', newWindowProfile.name]);
		}

		return newPayload.length ? newPayload : undefined;
	}

	private getRecentLabel(openable: IWindowOpenable): string {
		if (isFolderToOpen(openable)) {
			return this.labelService.getWorkspaceLabel(openable.folderUri, { verbose: Verbosity.LONG });
		}

		if (isWorkspaceToOpen(openable)) {
			return this.labelService.getWorkspaceLabel(getWorkspaceIdentifier(openable.workspaceUri), { verbose: Verbosity.LONG });
		}

		return this.labelService.getUriLabel(openable.fileUri);
	}

	private shouldReuse(options: IOpenWindowOptions = Object.create(null), isFile: boolean): boolean {
		if (options.waitMarkerFileURI) {
			return true; // always handle --wait in same window
		}

		const windowConfig = this.configurationService.getValue<IWindowSettings | undefined>('window');
		const openInNewWindowConfig = isFile ? (windowConfig?.openFilesInNewWindow || 'off' /* default */) : (windowConfig?.openFoldersInNewWindow || 'default' /* default */);

		let openInNewWindow = (options.preferNewWindow || !!options.forceNewWindow) && !options.forceReuseWindow;
		if (!options.forceNewWindow && !options.forceReuseWindow && (openInNewWindowConfig === 'on' || openInNewWindowConfig === 'off')) {
			openInNewWindow = (openInNewWindowConfig === 'on');
		}

		return !openInNewWindow;
	}

	private async doOpenEmptyWindow(options?: IOpenEmptyWindowOptions): Promise<void> {
		return this.doOpen(undefined, {
			reuse: options?.forceReuseWindow,
			payload: this.preservePayload(true /* empty window */, options)
		});
	}

	private async doOpen(workspace: IWorkspace, options?: { reuse?: boolean; payload?: object }): Promise<void> {

		// When we are in a temporary workspace and are asked to open a local folder
		// we swap that folder into the workspace to avoid a window reload. Access
		// to local resources is only possible without a window reload because it
		// needs user activation.
		if (workspace && isFolderToOpen(workspace) && workspace.folderUri.scheme === Schemas.file && isTemporaryWorkspace(this.contextService.getWorkspace())) {
			this.withServices(async accessor => {
				const workspaceEditingService: IWorkspaceEditingService = accessor.get(IWorkspaceEditingService);

				await workspaceEditingService.updateFolders(0, this.contextService.getWorkspace().folders.length, [{ uri: workspace.folderUri }]);
			});

			return;
		}

		// We know that `workspaceProvider.open` will trigger a shutdown
		// with `options.reuse` so we handle this expected shutdown
		if (options?.reuse) {
			await this.handleExpectedShutdown(ShutdownReason.LOAD);
		}

		const opened = await this.workspaceProvider.open(workspace, options);
		if (!opened) {
			const { confirmed } = await this.dialogService.confirm({
				type: Severity.Warning,
				message: localize('unableToOpenExternal', "The browser interrupted the opening of a new tab or window. Press 'Open' to open it anyway."),
				primaryButton: localize({ key: 'open', comment: ['&& denotes a mnemonic'] }, "&&Open")
			});
			if (confirmed) {
				await this.workspaceProvider.open(workspace, options);
			}
		}
	}

	async toggleFullScreen(targetWindow: Window): Promise<void> {
		const target = this.layoutService.getContainer(targetWindow);

		// Chromium
		if (targetWindow.document.fullscreen !== undefined) {
			if (!targetWindow.document.fullscreen) {
				try {
					return await target.requestFullscreen();
				} catch (error) {
					this.logService.warn('toggleFullScreen(): requestFullscreen failed'); // https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
				}
			} else {
				try {
					return await targetWindow.document.exitFullscreen();
				} catch (error) {
					this.logService.warn('toggleFullScreen(): exitFullscreen failed');
				}
			}
		}

		// Safari and Edge 14 are all using webkit prefix
		if ((<any>targetWindow.document).webkitIsFullScreen !== undefined) {
			try {
				if (!(<any>targetWindow.document).webkitIsFullScreen) {
					(<any>target).webkitRequestFullscreen(); // it's async, but doesn't return a real promise.
				} else {
					(<any>targetWindow.document).webkitExitFullscreen(); // it's async, but doesn't return a real promise.
				}
			} catch {
				this.logService.warn('toggleFullScreen(): requestFullscreen/exitFullscreen failed');
			}
		}
	}

	async moveTop(targetWindow: Window): Promise<void> {
		// There seems to be no API to bring a window to front in browsers
	}

	async getCursorScreenPoint(): Promise<undefined> {
		return undefined;
	}

	//#endregion

	//#region Lifecycle

	async restart(): Promise<void> {
		this.reload();
	}

	async reload(): Promise<void> {
		await this.handleExpectedShutdown(ShutdownReason.RELOAD);

		mainWindow.location.reload();
	}

	async close(): Promise<void> {
		await this.handleExpectedShutdown(ShutdownReason.CLOSE);

		mainWindow.close();
	}

	async withExpectedShutdown<T>(expectedShutdownTask: () => Promise<T>): Promise<T> {
		const previousShutdownReason = this.shutdownReason;
		try {
			this.shutdownReason = HostShutdownReason.Api;
			return await expectedShutdownTask();
		} finally {
			this.shutdownReason = previousShutdownReason;
		}
	}

	private async handleExpectedShutdown(reason: ShutdownReason): Promise<void> {

		// Update shutdown reason in a way that we do
		// not show a dialog because this is a expected
		// shutdown.
		this.shutdownReason = HostShutdownReason.Api;

		// Signal shutdown reason to lifecycle
		return this.lifecycleService.withExpectedShutdown(reason);
	}

	//#endregion

	//#region Screenshots

	async getScreenshot(): Promise<ArrayBufferLike | undefined> {
		// Gets a screenshot from the browser. This gets the screenshot via the browser's display
		// media API which will typically offer a picker of all available screens and windows for
		// the user to select. Using the video stream provided by the display media API, this will
		// capture a single frame of the video and convert it to a JPEG image.
		const store = new DisposableStore();

		// Create a video element to play the captured screen source
		const video = document.createElement('video');
		store.add(toDisposable(() => video.remove()));
		let stream: MediaStream | undefined;
		try {
			// Create a stream from the screen source (capture screen without audio)
			stream = await navigator.mediaDevices.getDisplayMedia({
				audio: false,
				video: true
			});

			// Set the stream as the source of the video element
			video.srcObject = stream;
			video.play();

			// Wait for the video to load properly before capturing the screenshot
			await Promise.all([
				new Promise<void>(r => store.add(addDisposableListener(video, 'loadedmetadata', () => r()))),
				new Promise<void>(r => store.add(addDisposableListener(video, 'canplaythrough', () => r())))
			]);

			const canvas = document.createElement('canvas');
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				return undefined;
			}

			// Draw the portion of the video (x, y) with the specified width and height
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

			// Convert the canvas to a Blob (JPEG format), use .95 for quality
			const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95));
			if (!blob) {
				throw new Error('Failed to create blob from canvas');
			}

			// Convert the Blob to an ArrayBuffer
			return blob.arrayBuffer();

		} catch (error) {
			console.error('Error taking screenshot:', error);
			return undefined;
		} finally {
			store.dispose();
			if (stream) {
				for (const track of stream.getTracks()) {
					track.stop();
				}
			}
		}
	}

	//#endregion

	//#region Native Handle

	async getNativeWindowHandle(_windowId: number) {
		return undefined;
	}

	//#endregion
}

registerSingleton(IHostService, BrowserHostService, InstantiationType.Delayed);
