/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari, setFullscreen } from '../../base/browser/browser.js';
import { addDisposableListener, EventHelper, EventType, getActiveWindow, getWindow, getWindowById, getWindows, getWindowsCount, windowOpenNoOpener, windowOpenPopup, windowOpenWithSuccess } from '../../base/browser/dom.js';
import { DomEmitter } from '../../base/browser/event.js';
import { HidDeviceData, requestHidDevice, requestSerialPort, requestUsbDevice, SerialPortData, UsbDeviceData } from '../../base/browser/deviceAccess.js';
import { timeout } from '../../base/common/async.js';
import { Event } from '../../base/common/event.js';
import { Disposable, IDisposable, dispose, toDisposable } from '../../base/common/lifecycle.js';
import { matchesScheme, Schemas } from '../../base/common/network.js';
import { isIOS, isMacintosh } from '../../base/common/platform.js';
import Severity from '../../base/common/severity.js';
import { URI } from '../../base/common/uri.js';
import { localize } from '../../nls.js';
import { CommandsRegistry } from '../../platform/commands/common/commands.js';
import { IDialogService, IPromptButton } from '../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../platform/label/common/label.js';
import { IOpenerService } from '../../platform/opener/common/opener.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IBrowserWorkbenchEnvironmentService } from '../services/environment/browser/environmentService.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';
import { BrowserLifecycleService } from '../services/lifecycle/browser/lifecycleService.js';
import { ILifecycleService, ShutdownReason } from '../services/lifecycle/common/lifecycle.js';
import { IHostService } from '../services/host/browser/host.js';
import { registerWindowDriver } from '../services/driver/browser/driver.js';
import { CodeWindow, isAuxiliaryWindow, mainWindow } from '../../base/browser/window.js';
import { createSingleCallFunction } from '../../base/common/functional.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../services/environment/common/environmentService.js';
import { MarkdownString } from '../../base/common/htmlContent.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';

export abstract class BaseWindow extends Disposable {

	private static TIMEOUT_HANDLES = Number.MIN_SAFE_INTEGER; // try to not compete with the IDs of native `setTimeout`
	private static readonly TIMEOUT_DISPOSABLES = new Map<number, Set<IDisposable>>();

	constructor(
		targetWindow: CodeWindow,
		dom = { getWindowsCount, getWindows }, /* for testing */
		@IHostService protected readonly hostService: IHostService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService protected readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		this.enableWindowFocusOnElementFocus(targetWindow);
		this.enableMultiWindowAwareTimeout(targetWindow, dom);

		this.registerFullScreenListeners(targetWindow.vscodeWindowId);
		this.registerContextMenuListeners(targetWindow);
	}

	//#region focus handling in multi-window applications

	protected enableWindowFocusOnElementFocus(targetWindow: CodeWindow): void {
		const originalFocus = targetWindow.HTMLElement.prototype.focus;

		const that = this;
		targetWindow.HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions | undefined): void {

			// Ensure the window the element belongs to is focused
			// in scenarios where auxiliary windows are present
			that.onElementFocus(getWindow(this));

			// Pass to original focus() method
			originalFocus.apply(this, [options]);
		};
	}

	private onElementFocus(targetWindow: CodeWindow): void {
		const activeWindow = getActiveWindow();
		if (activeWindow !== targetWindow && activeWindow.document.hasFocus()) {

			// Call original focus()
			targetWindow.focus();

			// In Electron, `window.focus()` fails to bring the window
			// to the front if multiple windows exist in the same process
			// group (floating windows). As such, we ask the host service
			// to focus the window which can take care of bringin the
			// window to the front.
			//
			// To minimise disruption by bringing windows to the front
			// by accident, we only do this if the window is not already
			// focused and the active window is not the target window
			// but has focus. This is an indication that multiple windows
			// are opened in the same process group while the target window
			// is not focused.

			if (
				!this.environmentService.extensionTestsLocationURI &&
				!targetWindow.document.hasFocus()
			) {
				this.hostService.focus(targetWindow);
			}
		}
	}

	//#endregion

	//#region timeout handling in multi-window applications

	protected enableMultiWindowAwareTimeout(targetWindow: Window, dom = { getWindowsCount, getWindows }): void {

		// Override `setTimeout` and `clearTimeout` on the provided window to make
		// sure timeouts are dispatched to all opened windows. Some browsers may decide
		// to throttle timeouts in minimized windows, so with this we can ensure the
		// timeout is scheduled without being throttled (unless all windows are minimized).

		const originalSetTimeout = targetWindow.setTimeout;
		Object.defineProperty(targetWindow, 'vscodeOriginalSetTimeout', { get: () => originalSetTimeout });

		const originalClearTimeout = targetWindow.clearTimeout;
		Object.defineProperty(targetWindow, 'vscodeOriginalClearTimeout', { get: () => originalClearTimeout });

		targetWindow.setTimeout = function (this: unknown, handler: TimerHandler, timeout = 0, ...args: unknown[]): number {
			if (dom.getWindowsCount() === 1 || typeof handler === 'string' || timeout === 0 /* immediates are never throttled */) {
				return originalSetTimeout.apply(this, [handler, timeout, ...args]);
			}

			const timeoutDisposables = new Set<IDisposable>();
			const timeoutHandle = BaseWindow.TIMEOUT_HANDLES++;
			BaseWindow.TIMEOUT_DISPOSABLES.set(timeoutHandle, timeoutDisposables);

			const handlerFn = createSingleCallFunction(handler, () => {
				dispose(timeoutDisposables);
				BaseWindow.TIMEOUT_DISPOSABLES.delete(timeoutHandle);
			});

			for (const { window, disposables } of dom.getWindows()) {
				if (isAuxiliaryWindow(window) && window.document.visibilityState === 'hidden') {
					continue; // skip over hidden windows (but never over main window)
				}

				// we track didClear in case the browser does not properly clear the timeout
				// this can happen for timeouts on unfocused windows
				let didClear = false;

				const handle = (window as { vscodeOriginalSetTimeout?: typeof window.setTimeout }).vscodeOriginalSetTimeout?.apply(this, [(...args: unknown[]) => {
					if (didClear) {
						return;
					}
					handlerFn(...args);
				}, timeout, ...args]);

				const timeoutDisposable = toDisposable(() => {
					didClear = true;
					(window as { vscodeOriginalClearTimeout?: typeof window.clearTimeout }).vscodeOriginalClearTimeout?.apply(this, [handle]);
					timeoutDisposables.delete(timeoutDisposable);
				});

				disposables.add(timeoutDisposable);
				timeoutDisposables.add(timeoutDisposable);
			}

			return timeoutHandle;
		};

		targetWindow.clearTimeout = function (this: unknown, timeoutHandle: number | undefined): void {
			const timeoutDisposables = typeof timeoutHandle === 'number' ? BaseWindow.TIMEOUT_DISPOSABLES.get(timeoutHandle) : undefined;
			if (timeoutDisposables) {
				dispose(timeoutDisposables);
				BaseWindow.TIMEOUT_DISPOSABLES.delete(timeoutHandle!);
			} else {
				originalClearTimeout.apply(this, [timeoutHandle]);
			}
		};
	}

	//#endregion

	//#region Confirm on Shutdown

	static async confirmOnShutdown(accessor: ServicesAccessor, reason: ShutdownReason): Promise<boolean> {
		const dialogService = accessor.get(IDialogService);
		const configurationService = accessor.get(IConfigurationService);

		const message = reason === ShutdownReason.QUIT ?
			(isMacintosh ? localize('quitMessageMac', "Are you sure you want to quit?") : localize('quitMessage', "Are you sure you want to exit?")) :
			localize('closeWindowMessage', "Are you sure you want to close the window?");
		const primaryButton = reason === ShutdownReason.QUIT ?
			(isMacintosh ? localize({ key: 'quitButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Quit") : localize({ key: 'exitButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Exit")) :
			localize({ key: 'closeWindowButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Close Window");

		const res = await dialogService.confirm({
			message,
			primaryButton,
			checkbox: {
				label: localize('doNotAskAgain', "Do not ask me again")
			}
		});

		// Update setting if checkbox checked
		if (res.confirmed && res.checkboxChecked) {
			await configurationService.updateValue('window.confirmBeforeClose', 'never');
		}

		return res.confirmed;
	}

	//#endregion

	private registerFullScreenListeners(targetWindowId: number): void {
		this._register(this.hostService.onDidChangeFullScreen(({ windowId, fullscreen }) => {
			if (windowId === targetWindowId) {
				const targetWindow = getWindowById(targetWindowId);
				if (targetWindow) {
					setFullscreen(fullscreen, targetWindow.window);
				}
			}
		}));
	}

	private registerContextMenuListeners(targetWindow: Window): void {
		if (targetWindow !== mainWindow) {
			// we only need to listen in the main window as the code
			// will go by the active container and update accordingly
			return;
		}

		const update = (visible: boolean) => this.layoutService.activeContainer.classList.toggle('context-menu-visible', visible);
		this._register(this.contextMenuService.onDidShowContextMenu(() => update(true)));
		this._register(this.contextMenuService.onDidHideContextMenu(() => update(false)));
	}
}

export class BrowserWindow extends BaseWindow {

	constructor(
		@IOpenerService private readonly openerService: IOpenerService,
		@ILifecycleService private readonly lifecycleService: BrowserLifecycleService,
		@IDialogService private readonly dialogService: IDialogService,
		@ILabelService private readonly labelService: ILabelService,
		@IProductService private readonly productService: IProductService,
		@IBrowserWorkbenchEnvironmentService private readonly browserEnvironmentService: IBrowserWorkbenchEnvironmentService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHostService hostService: IHostService,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super(mainWindow, undefined, hostService, browserEnvironmentService, contextMenuService, layoutService);

		this.registerListeners();
		this.create();
	}

	private registerListeners(): void {

		// Lifecycle
		this._register(this.lifecycleService.onWillShutdown(() => this.onWillShutdown()));

		// Layout
		const viewport = isIOS && mainWindow.visualViewport ? mainWindow.visualViewport /** Visual viewport */ : mainWindow /** Layout viewport */;
		this._register(addDisposableListener(viewport, EventType.RESIZE, () => {
			this.layoutService.layout();

			// Sometimes the keyboard appearing scrolls the whole workbench out of view, as a workaround scroll back into view #121206
			if (isIOS) {
				mainWindow.scrollTo(0, 0);
			}
		}));

		// Prevent the back/forward gestures in macOS
		this._register(addDisposableListener(this.layoutService.mainContainer, EventType.WHEEL, e => e.preventDefault(), { passive: false }));

		// Prevent native context menus in web
		this._register(addDisposableListener(this.layoutService.mainContainer, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true)));

		// Prevent default navigation on drop
		this._register(addDisposableListener(this.layoutService.mainContainer, EventType.DROP, e => EventHelper.stop(e, true)));
	}

	private onWillShutdown(): void {

		// Try to detect some user interaction with the workbench
		// when shutdown has happened to not show the dialog e.g.
		// when navigation takes a longer time.
		Event.toPromise(Event.any(
			Event.once(new DomEmitter(mainWindow.document.body, EventType.KEY_DOWN, true).event),
			Event.once(new DomEmitter(mainWindow.document.body, EventType.MOUSE_DOWN, true).event)
		)).then(async () => {

			// Delay the dialog in case the user interacted
			// with the page before it transitioned away
			await timeout(3000);

			// This should normally not happen, but if for some reason
			// the workbench was shutdown while the page is still there,
			// inform the user that only a reload can bring back a working
			// state.
			await this.dialogService.prompt({
				type: Severity.Error,
				message: localize('shutdownError', "An unexpected error occurred that requires a reload of this page."),
				detail: localize('shutdownErrorDetail', "The workbench was unexpectedly disposed while running."),
				buttons: [
					{
						label: localize({ key: 'reload', comment: ['&& denotes a mnemonic'] }, "&&Reload"),
						run: () => mainWindow.location.reload() // do not use any services at this point since they are likely not functional at this point
					}
				]
			});
		});
	}

	private create(): void {

		// Handle open calls
		this.setupOpenHandlers();

		// Label formatting
		this.registerLabelFormatters();

		// Commands
		this.registerCommands();

		// Smoke Test Driver
		this.setupDriver();
	}

	private setupDriver(): void {
		if (this.environmentService.enableSmokeTestDriver) {
			registerWindowDriver(this.instantiationService);
		}
	}

	private setupOpenHandlers(): void {

		// We need to ignore the `beforeunload` event while
		// we handle external links to open specifically for
		// the case of application protocols that e.g. invoke
		// vscode itself. We do not want to open these links
		// in a new window because that would leave a blank
		// window to the user, but using `window.location.href`
		// will trigger the `beforeunload`.
		this.openerService.setDefaultExternalOpener({
			openExternal: async (href: string) => {
				let isAllowedOpener = false;
				if (this.browserEnvironmentService.options?.openerAllowedExternalUrlPrefixes) {
					for (const trustedPopupPrefix of this.browserEnvironmentService.options.openerAllowedExternalUrlPrefixes) {
						if (href.startsWith(trustedPopupPrefix)) {
							isAllowedOpener = true;
							break;
						}
					}
				}

				// HTTP(s): open in new window and deal with potential popup blockers
				if (matchesScheme(href, Schemas.http) || matchesScheme(href, Schemas.https)) {
					if (isSafari) {
						const opened = windowOpenWithSuccess(href, !isAllowedOpener);
						if (!opened) {
							await this.dialogService.prompt({
								type: Severity.Warning,
								message: localize('unableToOpenExternal', "The browser blocked opening a new tab or window. Press 'Retry' to try again."),
								custom: {
									markdownDetails: [{ markdown: new MarkdownString(localize('unableToOpenWindowDetail', "Please allow pop-ups for this website in your [browser settings]({0}).", 'https://aka.ms/allow-vscode-popup'), true) }]
								},
								buttons: [
									{
										label: localize({ key: 'retry', comment: ['&& denotes a mnemonic'] }, "&&Retry"),
										run: () => isAllowedOpener ? windowOpenPopup(href) : windowOpenNoOpener(href)
									}
								],
								cancelButton: true
							});
						}
					} else {
						if (isAllowedOpener) {
							windowOpenPopup(href);
						} else {
							windowOpenNoOpener(href);
						}
					}
				}

				// Anything else: set location to trigger protocol handler in the browser
				// but make sure to signal this as an expected unload and disable unload
				// handling explicitly to prevent the workbench from going down.
				else {
					const invokeProtocolHandler = () => {
						this.lifecycleService.withExpectedShutdown({ disableShutdownHandling: true }, () => mainWindow.location.href = href);
					};

					invokeProtocolHandler();

					const showProtocolUrlOpenedDialog = async () => {
						const { downloadUrl } = this.productService;
						let detail: string;

						const buttons: IPromptButton<void>[] = [
							{
								label: localize({ key: 'openExternalDialogButtonRetry.v2', comment: ['&& denotes a mnemonic'] }, "&&Try Again"),
								run: () => invokeProtocolHandler()
							}
						];

						if (downloadUrl !== undefined) {
							detail = localize(
								'openExternalDialogDetail.v2',
								"We launched {0} on your computer.\n\nIf {1} did not launch, try again or install it below.",
								this.productService.nameLong,
								this.productService.nameLong
							);

							buttons.push({
								label: localize({ key: 'openExternalDialogButtonInstall.v3', comment: ['&& denotes a mnemonic'] }, "&&Install"),
								run: async () => {
									await this.openerService.open(URI.parse(downloadUrl));

									// Re-show the dialog so that the user can come back after installing and try again
									showProtocolUrlOpenedDialog();
								}
							});
						} else {
							detail = localize(
								'openExternalDialogDetailNoInstall',
								"We launched {0} on your computer.\n\nIf {1} did not launch, try again below.",
								this.productService.nameLong,
								this.productService.nameLong
							);
						}

						// While this dialog shows, closing the tab will not display a confirmation dialog
						// to avoid showing the user two dialogs at once
						await this.hostService.withExpectedShutdown(() => this.dialogService.prompt({
							type: Severity.Info,
							message: localize('openExternalDialogTitle', "All done. You can close this tab now."),
							detail,
							buttons,
							cancelButton: true
						}));
					};

					// We cannot know whether the protocol handler succeeded.
					// Display guidance in case it did not, e.g. the app is not installed locally.
					if (matchesScheme(href, this.productService.urlProtocol)) {
						await showProtocolUrlOpenedDialog();
					}
				}

				return true;
			}
		});
	}

	private registerLabelFormatters(): void {
		this._register(this.labelService.registerFormatter({
			scheme: Schemas.vscodeUserData,
			priority: true,
			formatting: {
				label: '(Settings) ${path}',
				separator: '/',
			}
		}));
	}

	private registerCommands(): void {

		// Allow extensions to request USB devices in Web
		CommandsRegistry.registerCommand('workbench.experimental.requestUsbDevice', async (_accessor: ServicesAccessor, options?: { filters?: unknown[] }): Promise<UsbDeviceData | undefined> => {
			return requestUsbDevice(options);
		});

		// Allow extensions to request Serial devices in Web
		CommandsRegistry.registerCommand('workbench.experimental.requestSerialPort', async (_accessor: ServicesAccessor, options?: { filters?: unknown[] }): Promise<SerialPortData | undefined> => {
			return requestSerialPort(options);
		});

		// Allow extensions to request HID devices in Web
		CommandsRegistry.registerCommand('workbench.experimental.requestHidDevice', async (_accessor: ServicesAccessor, options?: { filters?: unknown[] }): Promise<HidDeviceData | undefined> => {
			return requestHidDevice(options);
		});
	}
}
