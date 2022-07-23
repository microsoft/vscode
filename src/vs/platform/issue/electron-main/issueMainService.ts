/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, contentTracing, Display, IpcMainEvent, screen } from 'electron';
import { validatedIpcMain } from 'vs/base/parts/ipc/electron-main/ipcMain';
import { arch, release, type } from 'os';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { IProcessEnvironment, isMacintosh } from 'vs/base/common/platform';
import { listProcesses } from 'vs/base/node/ps';
import { localize } from 'vs/nls';
import { IDiagnosticsService, isRemoteDiagnosticError, PerformanceInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { IDiagnosticsMainService } from 'vs/platform/diagnostics/electron-main/diagnosticsMainService';
import { IDialogMainService } from 'vs/platform/dialogs/electron-main/dialogMainService';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonIssueService, IssueReporterData, IssueReporterWindowConfiguration, ProcessExplorerData, ProcessExplorerWindowConfiguration } from 'vs/platform/issue/common/issue';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostMainService } from 'vs/platform/native/electron-main/nativeHostMainService';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IIPCObjectUrl, IProtocolMainService } from 'vs/platform/protocol/electron-main/protocol';
import { zoomLevelToZoomFactor } from 'vs/platform/window/common/window';
import { IWindowState } from 'vs/platform/window/electron-main/window';
import { randomPath } from 'vs/base/common/extpath';
import { withNullAsUndefined } from 'vs/base/common/types';

export const IIssueMainService = createDecorator<IIssueMainService>('issueMainService');

interface IBrowserWindowOptions {
	backgroundColor: string | undefined;
	title: string;
	zoomLevel: number;
	alwaysOnTop: boolean;
}

export interface IIssueMainService extends ICommonIssueService {
	stopTracing(): Promise<void>;
}

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
		@IProductService private readonly productService: IProductService
	) {
		this.registerListeners();
	}

	private registerListeners(): void {
		validatedIpcMain.on('vscode:issueSystemInfoRequest', async event => {
			const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })]);
			const msg = await this.diagnosticsService.getSystemInfo(info, remoteData);

			this.safeSend(event, 'vscode:issueSystemInfoResponse', msg);
		});

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

		validatedIpcMain.on('vscode:issueReporterClipboard', async event => {
			const messageOptions = {
				title: this.productService.nameLong,
				message: localize('issueReporterWriteToClipboard', "There is too much data to send to GitHub directly. The data will be copied to the clipboard, please paste it into the GitHub issue page that is opened."),
				type: 'warning',
				buttons: [
					mnemonicButtonLabel(localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK")),
					mnemonicButtonLabel(localize({ key: 'cancel', comment: ['&& denotes a mnemonic'] }, "&&Cancel")),
				],
				defaultId: 0,
				cancelId: 1,
				noLink: true
			};

			if (this.issueReporterWindow) {
				const result = await this.dialogMainService.showMessageBox(messageOptions, this.issueReporterWindow);
				this.safeSend(event, 'vscode:issueReporterClipboardResponse', result.response === 0);
			}
		});

		validatedIpcMain.on('vscode:issuePerformanceInfoRequest', async event => {
			const performanceInfo = await this.getPerformanceInfo();
			this.safeSend(event, 'vscode:issuePerformanceInfoResponse', performanceInfo);
		});

		validatedIpcMain.on('vscode:issueReporterConfirmClose', async () => {
			const messageOptions = {
				title: this.productService.nameLong,
				message: localize('confirmCloseIssueReporter', "Your input will not be saved. Are you sure you want to close this window?"),
				type: 'warning',
				buttons: [
					mnemonicButtonLabel(localize({ key: 'yes', comment: ['&& denotes a mnemonic'] }, "&&Yes")),
					mnemonicButtonLabel(localize({ key: 'cancel', comment: ['&& denotes a mnemonic'] }, "&&Cancel")),
				],
				defaultId: 0,
				cancelId: 1,
				noLink: true
			};

			if (this.issueReporterWindow) {
				const result = await this.dialogMainService.showMessageBox(messageOptions, this.issueReporterWindow);
				if (result.response === 0) {
					if (this.issueReporterWindow) {
						this.issueReporterWindow.destroy();
						this.issueReporterWindow = null;
					}
				}
			}
		});

		validatedIpcMain.on('vscode:workbenchCommand', (_: unknown, commandInfo: { id: any; from: any; args: any }) => {
			const { id, from, args } = commandInfo;

			let parentWindow: BrowserWindow | null;
			switch (from) {
				case 'issueReporter':
					parentWindow = this.issueReporterParentWindow;
					break;
				case 'processExplorer':
					parentWindow = this.processExplorerParentWindow;
					break;
				default:
					throw new Error(`Unexpected command source: ${from}`);
			}

			parentWindow?.webContents.send('vscode:runAction', { id, from, args });
		});

		validatedIpcMain.on('vscode:openExternal', (_: unknown, arg: string) => {
			this.nativeHostMainService.openExternal(undefined, arg);
		});

		validatedIpcMain.on('vscode:closeIssueReporter', event => {
			this.issueReporterWindow?.close();
		});

		validatedIpcMain.on('vscode:closeProcessExplorer', event => {
			this.processExplorerWindow?.close();
		});

		validatedIpcMain.on('vscode:windowsInfoRequest', async event => {
			const mainProcessInfo = await this.diagnosticsMainService.getMainDiagnostics();
			this.safeSend(event, 'vscode:windowsInfoResponse', mainProcessInfo.windows);
		});
	}

	private safeSend(event: IpcMainEvent, channel: string, ...args: unknown[]): void {
		if (!event.sender.isDestroyed()) {
			event.sender.send(channel, ...args);
		}
	}

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
					FileAccess.asBrowserUri('vs/code/electron-sandbox/issue/issueReporter.html', require).toString(true)
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

		if (this.issueReporterWindow) {
			this.focusWindow(this.issueReporterWindow);
		}
	}

	async openProcessExplorer(data: ProcessExplorerData): Promise<void> {
		if (!this.processExplorerWindow) {
			this.processExplorerParentWindow = BrowserWindow.getFocusedWindow();
			if (this.processExplorerParentWindow) {
				const processExplorerDisposables = new DisposableStore();

				const processExplorerWindowConfigUrl = processExplorerDisposables.add(this.protocolMainService.createIPCObjectUrl<ProcessExplorerWindowConfiguration>());
				const position = this.getWindowPosition(this.processExplorerParentWindow, 800, 500);

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
					FileAccess.asBrowserUri('vs/code/electron-sandbox/processExplorer/processExplorer.html', require).toString(true)
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
			}
		}

		if (this.processExplorerWindow) {
			this.focusWindow(this.processExplorerWindow);
		}
	}

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
				preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload.js', require).fsPath,
				additionalArguments: [`--vscode-window-config=${ipcObjectUrl.resource.toString()}`, `--vscode-window-kind=${windowKind}`],
				v8CacheOptions: this.environmentMainService.useCodeCache ? 'bypassHeatCheck' : 'none',
				enableWebSQL: false,
				spellcheck: false,
				zoomFactor: zoomLevelToZoomFactor(options.zoomLevel),
				sandbox: true,
				contextIsolation: true
			},
			alwaysOnTop: options.alwaysOnTop,
			experimentalDarkMode: true
		} as BrowserWindowConstructorOptions & { experimentalDarkMode: boolean });

		window.setMenuBarVisibility(false);

		return window;
	}

	async getSystemStatus(): Promise<string> {
		const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: false, includeWorkspaceMetadata: false })]);

		return this.diagnosticsService.getDiagnostics(info, remoteData);
	}

	private getWindowPosition(parentWindow: BrowserWindow, defaultWidth: number, defaultHeight: number): IWindowState {

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

		const state: IWindowState = {
			width: defaultWidth,
			height: defaultHeight
		};

		const displayBounds = displayToUse.bounds;
		state.x = displayBounds.x + (displayBounds.width / 2) - (state.width! / 2);
		state.y = displayBounds.y + (displayBounds.height / 2) - (state.height! / 2);

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

			if (state.width! > displayBounds.width) {
				state.width = displayBounds.width; // prevent window from exceeding display bounds width
			}

			if (state.height! > displayBounds.height) {
				state.height = displayBounds.height; // prevent window from exceeding display bounds height
			}
		}

		return state;
	}

	private async getPerformanceInfo(): Promise<PerformanceInfo> {
		try {
			const [info, remoteData] = await Promise.all([this.diagnosticsMainService.getMainDiagnostics(), this.diagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true })]);
			return await this.diagnosticsService.getPerformanceInfo(info, remoteData);
		} catch (error) {
			this.logService.warn('issueService#getPerformanceInfo ', error.message);

			throw error;
		}
	}

	async stopTracing(): Promise<void> {
		if (!this.environmentMainService.args.trace) {
			return; // requires tracing to be on
		}

		const path = await contentTracing.stopRecording(`${randomPath(this.environmentMainService.userHome.fsPath, this.productService.applicationName)}.trace.txt`);

		// Inform user to report an issue
		await this.dialogMainService.showMessageBox({
			title: this.productService.nameLong,
			type: 'info',
			message: localize('trace.message', "Successfully created the trace file"),
			detail: localize('trace.detail', "Please create an issue and manually attach the following file:\n{0}", path),
			buttons: [mnemonicButtonLabel(localize({ key: 'trace.ok', comment: ['&& denotes a mnemonic'] }, "&&OK"))],
			defaultId: 0,
			noLink: true
		}, withNullAsUndefined(BrowserWindow.getFocusedWindow()));

		// Show item in explorer
		this.nativeHostMainService.showItemInFolder(undefined, path);
	}
}
