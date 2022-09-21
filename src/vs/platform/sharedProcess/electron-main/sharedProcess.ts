/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, Event as ElectronEvent, IpcMainEvent, MessagePortMain } from 'electron';
import { validatedIpcMain } from 'vs/base/parts/ipc/electron-main/ipcMain';
import { Barrier } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { FileAccess } from 'vs/base/common/network';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { assertIsDefined } from 'vs/base/common/types';
import { connect as connectMessagePort } from 'vs/base/parts/ipc/electron-main/ipc.mp';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { IProtocolMainService } from 'vs/platform/protocol/electron-main/protocol';
import { ISharedProcess, ISharedProcessConfiguration } from 'vs/platform/sharedProcess/node/sharedProcess';
import { ISharedProcessWorkerConfiguration } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { IThemeMainService } from 'vs/platform/theme/electron-main/themeMainService';
import { WindowError } from 'vs/platform/window/electron-main/window';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IPolicyService } from 'vs/platform/policy/common/policy';

export class SharedProcess extends Disposable implements ISharedProcess {

	private readonly firstWindowConnectionBarrier = new Barrier();

	private window: BrowserWindow | undefined = undefined;
	private windowCloseListener: ((event: ElectronEvent) => void) | undefined = undefined;

	private readonly _onDidError = this._register(new Emitter<{ type: WindowError; details?: { reason: string; exitCode: number } }>());
	readonly onDidError = Event.buffer(this._onDidError.event); // buffer until we have a listener!

	constructor(
		private readonly machineId: string,
		private userEnv: IProcessEnvironment,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly logService: ILogService,
		@IPolicyService private readonly policyService: IPolicyService,
		@IThemeMainService private readonly themeMainService: IThemeMainService,
		@IProtocolMainService private readonly protocolMainService: IProtocolMainService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Shared process connections from workbench windows
		validatedIpcMain.on('vscode:createSharedProcessMessageChannel', (e, nonce: string) => this.onWindowConnection(e, nonce));

		// Shared process worker relay
		validatedIpcMain.on('vscode:relaySharedProcessWorkerMessageChannel', (e, configuration: ISharedProcessWorkerConfiguration) => this.onWorkerConnection(e, configuration));

		// Lifecycle
		this._register(this.lifecycleMainService.onWillShutdown(() => this.onWillShutdown()));
	}

	private async onWindowConnection(e: IpcMainEvent, nonce: string): Promise<void> {
		this.logService.trace('SharedProcess: on vscode:createSharedProcessMessageChannel');

		// release barrier if this is the first window connection
		if (!this.firstWindowConnectionBarrier.isOpen()) {
			this.firstWindowConnectionBarrier.open();
		}

		// await the shared process to be overall ready
		// we do not just wait for IPC ready because the
		// workbench window will communicate directly
		await this.whenReady();

		// connect to the shared process window
		const port = await this.connect();

		// Check back if the requesting window meanwhile closed
		// Since shared process is delayed on startup there is
		// a chance that the window close before the shared process
		// was ready for a connection.
		if (e.sender.isDestroyed()) {
			return port.close();
		}

		// send the port back to the requesting window
		e.sender.postMessage('vscode:createSharedProcessMessageChannelResult', nonce, [port]);
	}

	private onWorkerConnection(e: IpcMainEvent, configuration: ISharedProcessWorkerConfiguration): void {
		this.logService.trace('SharedProcess: onWorkerConnection', configuration);

		const disposables = new DisposableStore();

		const disposeWorker = (reason: string) => {
			if (!this.isAlive()) {
				return; // the shared process is already gone, no need to dispose anything
			}

			this.logService.trace(`SharedProcess: disposing worker (reason: '${reason}')`, configuration);

			// Only once!
			disposables.dispose();

			// Send this into the shared process who owns workers
			this.send('vscode:electron-main->shared-process=disposeWorker', configuration);
		};

		// Ensure the sender is a valid target to send to
		const receiverWindow = BrowserWindow.fromId(configuration.reply.windowId);
		if (!receiverWindow || receiverWindow.isDestroyed() || receiverWindow.webContents.isDestroyed() || !configuration.reply.channel) {
			disposeWorker('unavailable');

			return;
		}

		// Attach to lifecycle of receiver to manage worker lifecycle
		disposables.add(Event.filter(this.lifecycleMainService.onWillLoadWindow, e => e.window.win === receiverWindow)(() => disposeWorker('load')));
		disposables.add(Event.fromNodeEventEmitter(receiverWindow, 'closed')(() => disposeWorker('closed')));

		// The shared process window asks us to relay a `MessagePort`
		// from a shared process worker to the target window. It needs
		// to be send via `postMessage` to transfer the port.
		receiverWindow.webContents.postMessage(configuration.reply.channel, configuration.reply.nonce, e.ports);
	}

	private onWillShutdown(): void {
		const window = this.window;
		if (!window) {
			return; // possibly too early before created
		}

		// Signal exit to shared process when shutting down
		this.send('vscode:electron-main->shared-process=exit');

		// Shut the shared process down when we are quitting
		//
		// Note: because we veto the window close, we must first remove our veto.
		// Otherwise the application would never quit because the shared process
		// window is refusing to close!
		//
		if (this.windowCloseListener) {
			window.removeListener('close', this.windowCloseListener);
			this.windowCloseListener = undefined;
		}

		// Electron seems to crash on Windows without this setTimeout :|
		setTimeout(() => {
			try {
				window.close();
			} catch (err) {
				// ignore, as electron is already shutting down
			}

			this.window = undefined;
		}, 0);
	}

	private send(channel: string, ...args: any[]): void {
		if (!this.isAlive()) {
			this.logService.warn(`Sending IPC message to channel '${channel}' for shared process window that is destroyed`);
			return;
		}

		try {
			this.window?.webContents.send(channel, ...args);
		} catch (error) {
			this.logService.warn(`Error sending IPC message to channel '${channel}' of shared process: ${toErrorMessage(error)}`);
		}
	}

	private _whenReady: Promise<void> | undefined = undefined;
	whenReady(): Promise<void> {
		if (!this._whenReady) {
			// Overall signal that the shared process window was loaded and
			// all services within have been created.
			this._whenReady = new Promise<void>(resolve => validatedIpcMain.once('vscode:shared-process->electron-main=init-done', () => {
				this.logService.trace('SharedProcess: Overall ready');

				resolve();
			}));
		}

		return this._whenReady;
	}

	private _whenIpcReady: Promise<void> | undefined = undefined;
	private get whenIpcReady() {
		if (!this._whenIpcReady) {
			this._whenIpcReady = (async () => {

				// Always wait for first window asking for connection
				await this.firstWindowConnectionBarrier.wait();

				// Create window for shared process
				this.createWindow();

				// Listeners
				this.registerWindowListeners();

				// Wait for window indicating that IPC connections are accepted
				await new Promise<void>(resolve => validatedIpcMain.once('vscode:shared-process->electron-main=ipc-ready', () => {
					this.logService.trace('SharedProcess: IPC ready');

					resolve();
				}));
			})();
		}

		return this._whenIpcReady;
	}

	private createWindow(): void {
		const configObjectUrl = this._register(this.protocolMainService.createIPCObjectUrl<ISharedProcessConfiguration>());

		// shared process is a hidden window by default
		this.window = new BrowserWindow({
			show: false,
			backgroundColor: this.themeMainService.getBackgroundColor(),
			webPreferences: {
				preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload.js', require).fsPath,
				additionalArguments: [`--vscode-window-config=${configObjectUrl.resource.toString()}`, '--vscode-window-kind=shared-process'],
				v8CacheOptions: this.environmentMainService.useCodeCache ? 'bypassHeatCheck' : 'none',
				nodeIntegration: true,
				nodeIntegrationInWorker: true,
				contextIsolation: false,
				enableWebSQL: false,
				spellcheck: false,
				images: false,
				webgl: false
			}
		});

		// Store into config object URL
		configObjectUrl.update({
			machineId: this.machineId,
			windowId: this.window.id,
			appRoot: this.environmentMainService.appRoot,
			codeCachePath: this.environmentMainService.codeCachePath,
			profiles: this.userDataProfilesService.profiles,
			userEnv: this.userEnv,
			args: this.environmentMainService.args,
			logLevel: this.logService.getLevel(),
			product,
			policiesData: this.policyService.serialize()
		});

		// Load with config
		this.window.loadURL(FileAccess.asBrowserUri('vs/code/electron-browser/sharedProcess/sharedProcess.html', require).toString(true));
	}

	private registerWindowListeners(): void {
		if (!this.window) {
			return;
		}

		// Prevent the window from closing
		this.windowCloseListener = (e: ElectronEvent) => {
			this.logService.trace('SharedProcess#close prevented');

			// We never allow to close the shared process unless we get explicitly disposed()
			e.preventDefault();

			// Still hide the window though if visible
			if (this.window?.isVisible()) {
				this.window.hide();
			}
		};

		this.window.on('close', this.windowCloseListener);

		// Crashes & Unresponsive & Failed to load
		// We use `onUnexpectedError` explicitly because the error handler
		// will send the error to the active window to log in devtools too
		this.window.webContents.on('render-process-gone', (event, details) => this._onDidError.fire({ type: WindowError.PROCESS_GONE, details }));
		this.window.on('unresponsive', () => this._onDidError.fire({ type: WindowError.UNRESPONSIVE }));
		this.window.webContents.on('did-fail-load', (event, exitCode, reason) => this._onDidError.fire({ type: WindowError.LOAD, details: { reason, exitCode } }));
	}

	async connect(): Promise<MessagePortMain> {

		// Wait for shared process being ready to accept connection
		await this.whenIpcReady;

		// Connect and return message port
		const window = assertIsDefined(this.window);
		return connectMessagePort(window);
	}

	async toggle(): Promise<void> {

		// wait for window to be created
		await this.whenIpcReady;

		if (!this.window) {
			return; // possibly disposed already
		}

		if (this.window.isVisible()) {
			this.window.webContents.closeDevTools();
			this.window.hide();
		} else {
			this.window.show();
			this.window.webContents.openDevTools();
		}
	}

	isVisible(): boolean {
		return this.window?.isVisible() ?? false;
	}

	private isAlive(): boolean {
		const window = this.window;
		if (!window) {
			return false;
		}

		return !window.isDestroyed() && !window.webContents.isDestroyed();
	}
}
