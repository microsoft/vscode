/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, contentTracing, Display, IpcMainEvent, screen } from 'electron';
import { arch, release, type } from 'os';
import { raceTimeout } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { randomPath } from 'vs/base/common/extpath';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { IProcessEnvironment, isMacintosh } from 'vs/base/common/platform';
import { listProcesses } from 'vs/base/node/ps';
import { validatedIpcMain } from 'vs/base/parts/ipc/electron-main/ipcMain';
import { localize } from 'vs/nls';
import { IDiagnosticsService, isRemoteDiagnosticError, PerformanceInfo, SystemInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { IDiagnosticsMainService } from 'vs/platform/diagnostics/electron-main/diagnosticsMainService';
import { IDialogMainService } from 'vs/platform/dialogs/electron-main/dialogMainService';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { IIssueMainService, IssueReporterData, IssueReporterWindowConfiguration, ProcessExplorerData, ProcessExplorerWindowConfiguration } from 'vs/platform/issue/common/issue';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostMainService } from 'vs/platform/native/electron-main/nativeHostMainService';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IIPCObjectUrl, IProtocolMainService } from 'vs/platform/protocol/electron-main/protocol';
import { IStateService } from 'vs/platform/state/node/state';
import { UtilityProcess } from 'vs/platform/utilityProcess/electron-main/utilityProcess';
import { zoomLevelToZoomFactor } from 'vs/platform/window/common/window';
import { ICodeWindow, IWindowState } from 'vs/platform/window/electron-main/window';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';

const processExplorerWindowState = 'issue.processExplorerWindowState';

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

	private processExplorerWindow: BrowserWindow | null = null;
	private processExplorerParentWindow: BrowserWindow | null = null;

	constructor(
		private userEnv: IProcessEnvironment,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService,
		@IDiagnosticsService private readonly diagnosticsService: IDiagnosticsService,
		@IDiagnosticsMainService private readonly diagnosticsMainService: IDiagnosticsMainService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IProtocolMainService private readonly protocolMainService: IProtocolMainService,
		@IProductService private readonly productService: IProductService,
		@IStateService private readonly stateService: IStateService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
	) {
		this.registerListeners();
	}

	//#region Register Listeners

	private registerListeners(): void {
		validatedIpcMain.on('vscode:listProcesses', async event => {
			const processes = [];

			try {
				processes.push({ name: localize('local', "Local"), rootProcess: await listProcesses(process.pid) });

				const remoteDiagnostics = await this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true });
				remoteDiagnostics.forEach(data => {
					if (isRemoteDiagnosticError(data)) {
						processes.push({
							name: data.hostName,
							rootProcess: data
						});
					} else {
						if (data.processes) {
							processes.push({
								name: data.hostName,
								rootProcess: data.processes
							});
						}
					}
				});
			} catch (e) {
				this.logService.error(`Listing processes failed: ${e}`);
			}

			this.safeSend(event, 'vscode:listProcessesResponse', processes);
		});

		validatedIpcMain.on('vscode:workbenchCommand', (_: unknown, commandInfo: { id: any; from: any; args: any }) => {
			const { id, from, args } = commandInfo;

			let parentWindow: BrowserWindow | null;
			switch (from) {
				case 'processExplorer':
					parentWindow = this.processExplorerParentWindow;
					break;
				default:
					// The issue reporter does not use this anymore.
					throw new Error(`Unexpected command source: ${from}`);
			}

			parentWindow?.webContents.send('vscode:runAction', { id, from, args });
		});

		validatedIpcMain.on('vscode:closeProcessExplorer', event => {
			this.processExplorerWindow?.close();
		});

		validatedIpcMain.on('vscode:pidToNameRequest', async event => {
			const mainProcessInfo = await this.diagnosticsMainService.getMainDiagnostics();

			const pidToNames: [number, string][] = [];
			for (const window of mainProcessInfo.windows) {
				pidToNames.push([window.pid, `window [${window.id}] (${window.title})`]);
			}

			for (const { pid, name } of UtilityProcess.getAll()) {
				pidToNames.push([pid, name]);
			}

			this.safeSend(event, 'vscode:pidToNameResponse', pidToNames);
		});
	}

	//#endregion

	//#region Used by renderer

	async openReporter(data: IssueReporterData): Promise<void> {
		if (!this.issueReporterWindow) {
			this.issueReporterParentWindow = BrowserWindow.getFocusedWindow();
			if (this.issueReporterParentWindow) {
				const issueReporterDisposables = new DisposableStore();

				const issueReporterWindowConfigUrl = issueReporterDisposables.add(this.protocolMainService.createIPCObjectUrl<IssueReporterWindowConfiguration>());
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
					product
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

	async openProcessExplorer(data: ProcessExplorerData): Promise<void> {
		if (!this.processExplorerWindow) {
			this.processExplorerParentWindow = BrowserWindow.getFocusedWindow();
			if (this.processExplorerParentWindow) {
				const processExplorerDisposables = new DisposableStore();

				const processExplorerWindowConfigUrl = processExplorerDisposables.add(this.protocolMainService.createIPCObjectUrl<ProcessExplorerWindowConfiguration>());

				const savedPosition = this.stateService.getItem<IWindowState>(processExplorerWindowState, undefined);
				const position = isStrictWindowState(savedPosition) ? savedPosition : this.getWindowPosition(this.processExplorerParentWindow, 800, 500);

				this.processExplorerWindow = this.createBrowserWindow(position, processExplorerWindowConfigUrl, {
					backgroundColor: data.styles.backgroundColor,
					title: localize('processExplorer', "Process Explorer"),
					zoomLevel: data.zoomLevel,
					alwaysOnTop: true
				}, 'process-explorer');

				// Store into config object URL
				processExplorerWindowConfigUrl.update({
					appRoot: this.environmentMainService.appRoot,
					windowId: this.processExplorerWindow.id,
					userEnv: this.userEnv,
					data,
					product
				});

				this.processExplorerWindow.loadURL(
					FileAccess.asBrowserUri(`vs/code/electron-sandbox/processExplorer/processExplorer${this.environmentMainService.isBuilt ? '' : '-dev'}.html`).toString(true)
				);

				this.processExplorerWindow.on('close', () => {
					this.processExplorerWindow = null;
					processExplorerDisposables.dispose();
				});

				this.processExplorerParentWindow.on('close', () => {
					if (this.processExplorerWindow) {
						this.processExplorerWindow.close();
						this.processExplorerWindow = null;

						processExplorerDisposables.dispose();
					}
				});

				const storeState = () => {
					if (!this.processExplorerWindow) {
						return;
					}
					const size = this.processExplorerWindow.getSize();
					const position = this.processExplorerWindow.getPosition();
					if (!size || !position) {
						return;
					}
					const state: IWindowState = {
						width: size[0],
						height: size[1],
						x: position[0],
						y: position[1]
					};
					this.stateService.setItem(processExplorerWindowState, state);
				};

				this.processExplorerWindow.on('moved', storeState);
				this.processExplorerWindow.on('resized', storeState);
			}
		}

		if (this.processExplorerWindow) {
			this.focusWindow(this.processExplorerWindow);
		}
	}

	async stopTracing(): Promise<void> {
		if (!this.environmentMainService.args.trace) {
			return; // requires tracing to be on
		}

		const path = await contentTracing.stopRecording(`${randomPath(this.environmentMainService.userHome.fsPath, this.productService.applicationName)}.trace.txt`);

		// Inform user to report an issue
		await this.dialogMainService.showMessageBox({
			type: 'info',
			message: localize('trace.message', "Successfully created the trace file"),
			detail: localize('trace.detail', "Please create an issue and manually attach the following file:\n{0}", path),
			buttons: [localize({ key: 'trace.ok', comment: ['&& denotes a mnemonic'] }, "&&OK")],
		}, BrowserWindow.getFocusedWindow() ?? undefined);

		// Show item in explorer
		this.nativeHostMainService.showItemInFolder(undefined, path);
	}

	async getSystemStatus(): Promise<string> {
		const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })]);

		return this.diagnosticsService.getDiagnostics(info, remoteData);
	}

	//#endregion

	//#region used by issue reporter window

	async $getSystemInfo(): Promise<SystemInfo> {
		const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })]);
		const msg = await this.diagnosticsService.getSystemInfo(info, remoteData);
		return msg;
	}

	async $getPerformanceInfo(): Promise<PerformanceInfo> {
		try {
			const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true })]);
			return await this.diagnosticsService.getPerformanceInfo(info, remoteData);
		} catch (error) {
			this.logService.warn('issueService#getPerformanceInfo ', error.message);

			throw error;
		}
	}

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

	async $sendReporterMenu(extensionId: string, extensionName: string): Promise<IssueReporterData | undefined> {
		const window = this.issueReporterWindowCheck();
		const replyChannel = `vscode:triggerReporterMenu`;
		const cts = new CancellationTokenSource();
		window.sendWhenReady(replyChannel, cts.token, { replyChannel, extensionId, extensionName });
		const result = await raceTimeout(new Promise(resolve => validatedIpcMain.once(`vscode:triggerReporterMenuResponse:${extensionId}`, (_: unknown, data: IssueReporterData | undefined) => resolve(data))), 5000, () => {
			this.logService.error(`Error: Extension ${extensionId} timed out waiting for menu response`);
			cts.cancel();
		});
		return result as IssueReporterData | undefined;
	}

	async $closeReporter(): Promise<void> {
		this.issueReporterWindow?.close();
	}

	async closeProcessExplorer(): Promise<void> {
		this.processExplorerWindow?.close();
	}

	//#endregion

	private focusWindow(window: BrowserWindow): void {
		if (window.isMinimized()) {
			window.restore();
		}

		window.focus();
	}

	private safeSend(event: IpcMainEvent, channel: string, ...args: unknown[]): void {
		if (!event.sender.isDestroyed()) {
			event.sender.send(channel, ...args);
		}
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

function isStrictWindowState(obj: unknown): obj is IStrictWindowState {
	if (typeof obj !== 'object' || obj === null) {
		return false;
	}
	return (
		'x' in obj &&
		'y' in obj &&
		'width' in obj &&
		'height' in obj
	);
}
