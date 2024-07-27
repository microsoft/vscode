/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, Display, screen } from 'electron';
import { arch, release, type } from 'os';
import { raceTimeout } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { IProcessEnvironment, isMacintosh } from 'vs/base/common/platform';
import { validatedIpcMain } from 'vs/base/parts/ipc/electron-main/ipcMain';
import { localize } from 'vs/nls';
import { IDialogMainService } from 'vs/platform/dialogs/electron-main/dialogMainService';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { IIssueMainService, OldIssueReporterData, OldIssueReporterWindowConfiguration } from 'vs/platform/issue/common/issue';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostMainService } from 'vs/platform/native/electron-main/nativeHostMainService';
import product from 'vs/platform/product/common/product';
import { IIPCObjectUrl, IProtocolMainService } from 'vs/platform/protocol/electron-main/protocol';
import { zoomLevelToZoomFactor } from 'vs/platform/window/common/window';
import { ICodeWindow, IWindowState } from 'vs/platform/window/electron-main/window';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';

interface IBrowserWindowOptions {
	backgroundColor: string | undefined;
	title: string;
	zoomLevel: number;
	alwaysOnTop: boolean;
}

type IStrictWindowState = Required<Pick<IWindowState, 'x' | 'y' | 'width' | 'height'>>;

export class IssueMainService implements IIssueMainService {

	declare readonly _serviceBrand: undefined;

	private static readonly DEFAULT_BACKGROUND_COLOR = '#1E1E1E';

	private issueReporterWindow: BrowserWindow | null = null;
	private issueReporterParentWindow: BrowserWindow | null = null;

	constructor(
		private userEnv: IProcessEnvironment,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IProtocolMainService private readonly protocolMainService: IProtocolMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
	) { }

	//#region Used by renderer

	async openReporter(data: OldIssueReporterData): Promise<void> {
		if (!this.issueReporterWindow) {
			this.issueReporterParentWindow = BrowserWindow.getFocusedWindow();
			if (this.issueReporterParentWindow) {
				const issueReporterDisposables = new DisposableStore();

				const issueReporterWindowConfigUrl = issueReporterDisposables.add(this.protocolMainService.createIPCObjectUrl<OldIssueReporterWindowConfiguration>());
				const position = this.getWindowPosition(this.issueReporterParentWindow, 700, 800);

				this.issueReporterWindow = this.createBrowserWindow(position, issueReporterWindowConfigUrl, {
					backgroundColor: data.styles.backgroundColor,
					title: localize('issueReporter', "Issue Reporter"),
					zoomLevel: data.zoomLevel,
					alwaysOnTop: false
				}, 'issue-reporter');

				// Store into config object URL
				issueReporterWindowConfigUrl.update({
					appRoot: this.environmentMainService.appRoot,
					windowId: this.issueReporterWindow.id,
					userEnv: this.userEnv,
					data,
					disableExtensions: !!this.environmentMainService.disableExtensions,
					os: {
						type: type(),
						arch: arch(),
						release: release(),
					},
					product,
					nls: {
						// VSCODE_GLOBALS: NLS
						messages: globalThis._VSCODE_NLS_MESSAGES,
						language: globalThis._VSCODE_NLS_LANGUAGE
					}
				});

				this.issueReporterWindow.loadURL(
					FileAccess.asBrowserUri(`vs/workbench/contrib/issue/electron-sandbox/issueReporter${this.environmentMainService.isBuilt ? '' : '-dev'}.html`).toString(true)
				);

				this.issueReporterWindow.on('close', () => {
					this.issueReporterWindow = null;
					issueReporterDisposables.dispose();
				});

				this.issueReporterParentWindow.on('closed', () => {
					if (this.issueReporterWindow) {
						this.issueReporterWindow.close();
						this.issueReporterWindow = null;
						issueReporterDisposables.dispose();
					}
				});
			}
		}

		else if (this.issueReporterWindow) {
			this.focusWindow(this.issueReporterWindow);
		}
	}

	//#endregion

	//#region used by issue reporter window
	async $reloadWithExtensionsDisabled(): Promise<void> {
		if (this.issueReporterParentWindow) {
			try {
				await this.nativeHostMainService.reload(this.issueReporterParentWindow.id, { disableExtensions: true });
			} catch (error) {
				this.logService.error(error);
			}
		}
	}

	async $showConfirmCloseDialog(): Promise<void> {
		if (this.issueReporterWindow) {
			const { response } = await this.dialogMainService.showMessageBox({
				type: 'warning',
				message: localize('confirmCloseIssueReporter', "Your input will not be saved. Are you sure you want to close this window?"),
				buttons: [
					localize({ key: 'yes', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
					localize('cancel', "Cancel")
				]
			}, this.issueReporterWindow);

			if (response === 0) {
				if (this.issueReporterWindow) {
					this.issueReporterWindow.destroy();
					this.issueReporterWindow = null;
				}
			}
		}
	}

	async $showClipboardDialog(): Promise<boolean> {
		if (this.issueReporterWindow) {
			const { response } = await this.dialogMainService.showMessageBox({
				type: 'warning',
				message: localize('issueReporterWriteToClipboard', "There is too much data to send to GitHub directly. The data will be copied to the clipboard, please paste it into the GitHub issue page that is opened."),
				buttons: [
					localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
					localize('cancel', "Cancel")
				]
			}, this.issueReporterWindow);

			return response === 0;
		}

		return false;
	}

	issueReporterWindowCheck(): ICodeWindow {
		if (!this.issueReporterParentWindow) {
			throw new Error('Issue reporter window not available');
		}
		const window = this.windowsMainService.getWindowById(this.issueReporterParentWindow.id);
		if (!window) {
			throw new Error('Window not found');
		}
		return window;
	}

	async $sendReporterMenu(extensionId: string, extensionName: string): Promise<OldIssueReporterData | undefined> {
		const window = this.issueReporterWindowCheck();
		const replyChannel = `vscode:triggerReporterMenu`;
		const cts = new CancellationTokenSource();
		window.sendWhenReady(replyChannel, cts.token, { replyChannel, extensionId, extensionName });
		const result = await raceTimeout(new Promise(resolve => validatedIpcMain.once(`vscode:triggerReporterMenuResponse:${extensionId}`, (_: unknown, data: OldIssueReporterData | undefined) => resolve(data))), 5000, () => {
			this.logService.error(`Error: Extension ${extensionId} timed out waiting for menu response`);
			cts.cancel();
		});
		return result as OldIssueReporterData | undefined;
	}

	async $closeReporter(): Promise<void> {
		this.issueReporterWindow?.close();
	}

	//#endregion

	private focusWindow(window: BrowserWindow): void {
		if (window.isMinimized()) {
			window.restore();
		}

		window.focus();
	}

	private createBrowserWindow<T>(position: IWindowState, ipcObjectUrl: IIPCObjectUrl<T>, options: IBrowserWindowOptions, windowKind: string): BrowserWindow {
		const window = new BrowserWindow({
			fullscreen: false,
			skipTaskbar: false,
			resizable: true,
			width: position.width,
			height: position.height,
			minWidth: 300,
			minHeight: 200,
			x: position.x,
			y: position.y,
			title: options.title,
			backgroundColor: options.backgroundColor || IssueMainService.DEFAULT_BACKGROUND_COLOR,
			webPreferences: {
				preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-sandbox/preload.js').fsPath,
				additionalArguments: [`--vscode-window-config=${ipcObjectUrl.resource.toString()}`],
				v8CacheOptions: this.environmentMainService.useCodeCache ? 'bypassHeatCheck' : 'none',
				enableWebSQL: false,
				spellcheck: false,
				zoomFactor: zoomLevelToZoomFactor(options.zoomLevel),
				sandbox: true
			},
			alwaysOnTop: options.alwaysOnTop,
			experimentalDarkMode: true
		} as BrowserWindowConstructorOptions & { experimentalDarkMode: boolean });

		window.setMenuBarVisibility(false);

		return window;
	}

	private getWindowPosition(parentWindow: BrowserWindow, defaultWidth: number, defaultHeight: number): IStrictWindowState {

		// We want the new window to open on the same display that the parent is in
		let displayToUse: Display | undefined;
		const displays = screen.getAllDisplays();

		// Single Display
		if (displays.length === 1) {
			displayToUse = displays[0];
		}

		// Multi Display
		else {

			// on mac there is 1 menu per window so we need to use the monitor where the cursor currently is
			if (isMacintosh) {
				const cursorPoint = screen.getCursorScreenPoint();
				displayToUse = screen.getDisplayNearestPoint(cursorPoint);
			}

			// if we have a last active window, use that display for the new window
			if (!displayToUse && parentWindow) {
				displayToUse = screen.getDisplayMatching(parentWindow.getBounds());
			}

			// fallback to primary display or first display
			if (!displayToUse) {
				displayToUse = screen.getPrimaryDisplay() || displays[0];
			}
		}

		const displayBounds = displayToUse.bounds;

		const state: IStrictWindowState = {
			width: defaultWidth,
			height: defaultHeight,
			x: displayBounds.x + (displayBounds.width / 2) - (defaultWidth / 2),
			y: displayBounds.y + (displayBounds.height / 2) - (defaultHeight / 2)
		};

		if (displayBounds.width > 0 && displayBounds.height > 0 /* Linux X11 sessions sometimes report wrong display bounds */) {
			if (state.x < displayBounds.x) {
				state.x = displayBounds.x; // prevent window from falling out of the screen to the left
			}

			if (state.y < displayBounds.y) {
				state.y = displayBounds.y; // prevent window from falling out of the screen to the top
			}

			if (state.x > (displayBounds.x + displayBounds.width)) {
				state.x = displayBounds.x; // prevent window from falling out of the screen to the right
			}

			if (state.y > (displayBounds.y + displayBounds.height)) {
				state.y = displayBounds.y; // prevent window from falling out of the screen to the bottom
			}

			if (state.width > displayBounds.width) {
				state.width = displayBounds.width; // prevent window from exceeding display bounds width
			}

			if (state.height > displayBounds.height) {
				state.height = displayBounds.height; // prevent window from exceeding display bounds height
			}
		}

		return state;
	}
}
