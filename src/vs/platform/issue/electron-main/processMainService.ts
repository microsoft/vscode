/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, BrowserWindowConstructorOptions, contentTracing, Display, IpcMainEvent, screen } from 'electron';
import { randomPath } from '../../../base/common/extpath.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { FileAccess } from '../../../base/common/network.js';
import { IProcessEnvironment, isMacintosh } from '../../../base/common/platform.js';
import { listProcesses } from '../../../base/node/ps.js';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { getNLSLanguage, getNLSMessages, localize } from '../../../nls.js';
import { IDiagnosticsService, isRemoteDiagnosticError, PerformanceInfo, SystemInfo } from '../../diagnostics/common/diagnostics.js';
import { IDiagnosticsMainService } from '../../diagnostics/electron-main/diagnosticsMainService.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ICSSDevelopmentService } from '../../cssDev/node/cssDevService.js';
import { IProcessMainService, ProcessExplorerData, ProcessExplorerWindowConfiguration } from '../common/issue.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { IIPCObjectUrl, IProtocolMainService } from '../../protocol/electron-main/protocol.js';
import { IStateService } from '../../state/node/state.js';
import { UtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
import { zoomLevelToZoomFactor } from '../../window/common/window.js';
import { IWindowState } from '../../window/electron-main/window.js';

const processExplorerWindowState = 'issue.processExplorerWindowState';

interface IBrowserWindowOptions {
	backgroundColor: string | undefined;
	title: string;
	zoomLevel: number;
	alwaysOnTop: boolean;
}

type IStrictWindowState = Required<Pick<IWindowState, 'x' | 'y' | 'width' | 'height'>>;

export class ProcessMainService implements IProcessMainService {

	declare readonly _serviceBrand: undefined;

	private static readonly DEFAULT_BACKGROUND_COLOR = '#1E1E1E';

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
		@ICSSDevelopmentService private readonly cssDevelopmentService: ICSSDevelopmentService
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
					product,
					nls: {
						messages: getNLSMessages(),
						language: getNLSLanguage()
					},
					cssModules: this.cssDevelopmentService.isEnabled ? await this.cssDevelopmentService.getCssModules() : undefined
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

	private focusWindow(window: BrowserWindow): void {
		if (window.isMinimized()) {
			window.restore();
		}

		window.focus();
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

	private createBrowserWindow<T>(position: IWindowState, ipcObjectUrl: IIPCObjectUrl<T>, options: IBrowserWindowOptions, windowKind: string): BrowserWindow {
		const browserWindowOptions: BrowserWindowConstructorOptions & { experimentalDarkMode: boolean } = {
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
			backgroundColor: options.backgroundColor || ProcessMainService.DEFAULT_BACKGROUND_COLOR,
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
		};
		const window = new BrowserWindow(browserWindowOptions);

		window.setMenuBarVisibility(false);

		return window;
	}

	private safeSend(event: IpcMainEvent, channel: string, ...args: unknown[]): void {
		if (!event.sender.isDestroyed()) {
			event.sender.send(channel, ...args);
		}
	}

	async closeProcessExplorer(): Promise<void> {
		this.processExplorerWindow?.close();
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
