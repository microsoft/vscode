/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { validatedIpcMain } from '../../../base/parts/ipc/electron-main/ipcMain.js';
import { Barrier, Promises, timeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { cwd } from '../../../base/common/process.js';
import { assertIsDefined } from '../../../base/common/types.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IStateService } from '../../state/node/state.js';
import { ICodeWindow, LoadReason, UnloadReason } from '../../window/electron-main/window.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IAuxiliaryWindow } from '../../auxiliaryWindow/electron-main/auxiliaryWindow.js';

export const ILifecycleMainService = createDecorator<ILifecycleMainService>('lifecycleMainService');

interface WindowLoadEvent {

	/**
	 * The window that is loaded to a new workspace.
	 */
	readonly window: ICodeWindow;

	/**
	 * The workspace the window is loaded into.
	 */
	readonly workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined;

	/**
	 * More details why the window loads to a new workspace.
	 */
	readonly reason: LoadReason;
}

export const enum ShutdownReason {

	/**
	 * The application exits normally.
	 */
	QUIT = 1,

	/**
	 * The application exits abnormally and is being
	 * killed with an exit code (e.g. from integration
	 * test run)
	 */
	KILL
}

export interface ShutdownEvent {

	/**
	 * More details why the application is shutting down.
	 */
	reason: ShutdownReason;

	/**
	 * Allows to join the shutdown. The promise can be a long running operation but it
	 * will block the application from closing.
	 */
	join(id: string, promise: Promise<void>): void;
}

export interface IRelaunchHandler {

	/**
	 * Allows a handler to deal with relaunching the application. The return
	 * value indicates if the relaunch is handled or not.
	 */
	handleRelaunch(options?: IRelaunchOptions): boolean;
}

export interface IRelaunchOptions {
	readonly addArgs?: string[];
	readonly removeArgs?: string[];
}

export interface ILifecycleMainService {

	readonly _serviceBrand: undefined;

	/**
	 * Will be true if the program was restarted (e.g. due to explicit request or update).
	 */
	readonly wasRestarted: boolean;

	/**
	 * Will be true if the program was requested to quit.
	 */
	readonly quitRequested: boolean;

	/**
	 * A flag indicating in what phase of the lifecycle we currently are.
	 */
	phase: LifecycleMainPhase;

	/**
	 * An event that fires when the application is about to shutdown before any window is closed.
	 * The shutdown can still be prevented by any window that vetos this event.
	 */
	readonly onBeforeShutdown: Event<void>;

	/**
	 * An event that fires after the onBeforeShutdown event has been fired and after no window has
	 * vetoed the shutdown sequence. At this point listeners are ensured that the application will
	 * quit without veto.
	 */
	readonly onWillShutdown: Event<ShutdownEvent>;

	/**
	 * An event that fires when a window is loading. This can either be a window opening for the
	 * first time or a window reloading or changing to another URL.
	 */
	readonly onWillLoadWindow: Event<WindowLoadEvent>;

	/**
	 * An event that fires before a window closes. This event is fired after any veto has been dealt
	 * with so that listeners know for sure that the window will close without veto.
	 */
	readonly onBeforeCloseWindow: Event<ICodeWindow>;

	/**
	 * Make a `ICodeWindow` known to the lifecycle main service.
	 */
	registerWindow(window: ICodeWindow): void;

	/**
	 * Make a `IAuxiliaryWindow` known to the lifecycle main service.
	 */
	registerAuxWindow(auxWindow: IAuxiliaryWindow): void;

	/**
	 * Reload a window. All lifecycle event handlers are triggered.
	 */
	reload(window: ICodeWindow, cli?: NativeParsedArgs): Promise<void>;

	/**
	 * Unload a window for the provided reason. All lifecycle event handlers are triggered.
	 */
	unload(window: ICodeWindow, reason: UnloadReason): Promise<boolean /* veto */>;

	/**
	 * Restart the application with optional arguments (CLI). All lifecycle event handlers are triggered.
	 */
	relaunch(options?: IRelaunchOptions): Promise<void>;

	/**
	 * Sets a custom handler for relaunching the application.
	 */
	setRelaunchHandler(handler: IRelaunchHandler): void;

	/**
	 * Shutdown the application normally. All lifecycle event handlers are triggered.
	 */
	quit(willRestart?: boolean): Promise<boolean /* veto */>;

	/**
	 * Forcefully shutdown the application and optionally set an exit code.
	 *
	 * This method should only be used in rare situations where it is important
	 * to set an exit code (e.g. running tests) or when the application is
	 * not in a healthy state and should terminate asap.
	 *
	 * This method does not fire the normal lifecycle events to the windows,
	 * that normally can be vetoed. Windows are destroyed without a chance
	 * of components to participate. The only lifecycle event handler that
	 * is triggered is `onWillShutdown` in the main process.
	 */
	kill(code?: number): Promise<void>;

	/**
	 * Returns a promise that resolves when a certain lifecycle phase
	 * has started.
	 */
	when(phase: LifecycleMainPhase): Promise<void>;
}

export const enum LifecycleMainPhase {

	/**
	 * The first phase signals that we are about to startup.
	 */
	Starting = 1,

	/**
	 * Services are ready and first window is about to open.
	 */
	Ready = 2,

	/**
	 * This phase signals a point in time after the window has opened
	 * and is typically the best place to do work that is not required
	 * for the window to open.
	 */
	AfterWindowOpen = 3,

	/**
	 * The last phase after a window has opened and some time has passed
	 * (2-5 seconds).
	 */
	Eventually = 4
}

export class LifecycleMainService extends Disposable implements ILifecycleMainService {

	declare readonly _serviceBrand: undefined;

	private static readonly QUIT_AND_RESTART_KEY = 'lifecycle.quitAndRestart';

	private readonly _onBeforeShutdown = this._register(new Emitter<void>());
	readonly onBeforeShutdown = this._onBeforeShutdown.event;

	private readonly _onWillShutdown = this._register(new Emitter<ShutdownEvent>());
	readonly onWillShutdown = this._onWillShutdown.event;

	private readonly _onWillLoadWindow = this._register(new Emitter<WindowLoadEvent>());
	readonly onWillLoadWindow = this._onWillLoadWindow.event;

	private readonly _onBeforeCloseWindow = this._register(new Emitter<ICodeWindow>());
	readonly onBeforeCloseWindow = this._onBeforeCloseWindow.event;

	private _quitRequested = false;
	get quitRequested(): boolean { return this._quitRequested; }

	private _wasRestarted: boolean = false;
	get wasRestarted(): boolean { return this._wasRestarted; }

	private _phase = LifecycleMainPhase.Starting;
	get phase(): LifecycleMainPhase { return this._phase; }

	private readonly windowToCloseRequest = new Set<number>();
	private oneTimeListenerTokenGenerator = 0;
	private windowCounter = 0;

	private pendingQuitPromise: Promise<boolean> | undefined = undefined;
	private pendingQuitPromiseResolve: { (veto: boolean): void } | undefined = undefined;

	private pendingWillShutdownPromise: Promise<void> | undefined = undefined;

	private readonly mapWindowIdToPendingUnload = new Map<number, Promise<boolean>>();

	private readonly phaseWhen = new Map<LifecycleMainPhase, Barrier>();

	private relaunchHandler: IRelaunchHandler | undefined = undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStateService private readonly stateService: IStateService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {
		super();

		this.resolveRestarted();
		this.when(LifecycleMainPhase.Ready).then(() => this.registerListeners());
	}

	private resolveRestarted(): void {
		this._wasRestarted = !!this.stateService.getItem(LifecycleMainService.QUIT_AND_RESTART_KEY);

		if (this._wasRestarted) {
			// remove the marker right after if found
			this.stateService.removeItem(LifecycleMainService.QUIT_AND_RESTART_KEY);
		}
	}

	private registerListeners(): void {

		// before-quit: an event that is fired if application quit was
		// requested but before any window was closed.
		const beforeQuitListener = () => {
			if (this._quitRequested) {
				return;
			}

			this.trace('Lifecycle#app.on(before-quit)');
			this._quitRequested = true;

			// Emit event to indicate that we are about to shutdown
			this.trace('Lifecycle#onBeforeShutdown.fire()');
			this._onBeforeShutdown.fire();

			// macOS: can run without any window open. in that case we fire
			// the onWillShutdown() event directly because there is no veto
			// to be expected.
			if (isMacintosh && this.windowCounter === 0) {
				this.fireOnWillShutdown(ShutdownReason.QUIT);
			}
		};
		electron.app.addListener('before-quit', beforeQuitListener);

		// window-all-closed: an event that only fires when the last window
		// was closed. We override this event to be in charge if app.quit()
		// should be called or not.
		const windowAllClosedListener = () => {
			this.trace('Lifecycle#app.on(window-all-closed)');

			// Windows/Linux: we quit when all windows have closed
			// Mac: we only quit when quit was requested
			if (this._quitRequested || !isMacintosh) {
				electron.app.quit();
			}
		};
		electron.app.addListener('window-all-closed', windowAllClosedListener);

		// will-quit: an event that is fired after all windows have been
		// closed, but before actually quitting.
		electron.app.once('will-quit', e => {
			this.trace('Lifecycle#app.on(will-quit) - begin');

			// Prevent the quit until the shutdown promise was resolved
			e.preventDefault();

			// Start shutdown sequence
			const shutdownPromise = this.fireOnWillShutdown(ShutdownReason.QUIT);

			// Wait until shutdown is signaled to be complete
			shutdownPromise.finally(() => {
				this.trace('Lifecycle#app.on(will-quit) - after fireOnWillShutdown');

				// Resolve pending quit promise now without veto
				this.resolvePendingQuitPromise(false /* no veto */);

				// Quit again, this time do not prevent this, since our
				// will-quit listener is only installed "once". Also
				// remove any listener we have that is no longer needed

				electron.app.removeListener('before-quit', beforeQuitListener);
				electron.app.removeListener('window-all-closed', windowAllClosedListener);

				this.trace('Lifecycle#app.on(will-quit) - calling app.quit()');

				electron.app.quit();
			});
		});
	}

	private fireOnWillShutdown(reason: ShutdownReason): Promise<void> {
		if (this.pendingWillShutdownPromise) {
			return this.pendingWillShutdownPromise; // shutdown is already running
		}

		const logService = this.logService;
		this.trace('Lifecycle#onWillShutdown.fire()');

		const joiners: Promise<void>[] = [];

		this._onWillShutdown.fire({
			reason,
			join(id, promise) {
				logService.trace(`Lifecycle#onWillShutdown - begin '${id}'`);
				joiners.push(promise.finally(() => {
					logService.trace(`Lifecycle#onWillShutdown - end '${id}'`);
				}));
			}
		});

		this.pendingWillShutdownPromise = (async () => {

			// Settle all shutdown event joiners
			try {
				await Promises.settled(joiners);
			} catch (error) {
				this.logService.error(error);
			}

			// Then, always make sure at the end
			// the state service is flushed.
			try {
				await this.stateService.close();
			} catch (error) {
				this.logService.error(error);
			}
		})();

		return this.pendingWillShutdownPromise;
	}

	set phase(value: LifecycleMainPhase) {
		if (value < this.phase) {
			throw new Error('Lifecycle cannot go backwards');
		}

		if (this._phase === value) {
			return;
		}

		this.trace(`lifecycle (main): phase changed (value: ${value})`);

		this._phase = value;

		const barrier = this.phaseWhen.get(this._phase);
		if (barrier) {
			barrier.open();
			this.phaseWhen.delete(this._phase);
		}
	}

	async when(phase: LifecycleMainPhase): Promise<void> {
		if (phase <= this._phase) {
			return;
		}

		let barrier = this.phaseWhen.get(phase);
		if (!barrier) {
			barrier = new Barrier();
			this.phaseWhen.set(phase, barrier);
		}

		await barrier.wait();
	}

	registerWindow(window: ICodeWindow): void {
		const windowListeners = new DisposableStore();

		// track window count
		this.windowCounter++;

		// Window Will Load
		windowListeners.add(window.onWillLoad(e => this._onWillLoadWindow.fire({ window, workspace: e.workspace, reason: e.reason })));

		// Window Before Closing: Main -> Renderer
		const win = assertIsDefined(window.win);
		windowListeners.add(Event.fromNodeEventEmitter<electron.Event>(win, 'close')(e => {

			// The window already acknowledged to be closed
			const windowId = window.id;
			if (this.windowToCloseRequest.has(windowId)) {
				this.windowToCloseRequest.delete(windowId);

				return;
			}

			this.trace(`Lifecycle#window.on('close') - window ID ${window.id}`);

			// Otherwise prevent unload and handle it from window
			e.preventDefault();
			this.unload(window, UnloadReason.CLOSE).then(veto => {
				if (veto) {
					this.windowToCloseRequest.delete(windowId);
					return;
				}

				this.windowToCloseRequest.add(windowId);

				// Fire onBeforeCloseWindow before actually closing
				this.trace(`Lifecycle#onBeforeCloseWindow.fire() - window ID ${windowId}`);
				this._onBeforeCloseWindow.fire(window);

				// No veto, close window now
				window.close();
			});
		}));
		windowListeners.add(Event.fromNodeEventEmitter<electron.Event>(win, 'closed')(() => {
			this.trace(`Lifecycle#window.on('closed') - window ID ${window.id}`);

			// update window count
			this.windowCounter--;

			// clear window listeners
			windowListeners.dispose();

			// if there are no more code windows opened, fire the onWillShutdown event, unless
			// we are on macOS where it is perfectly fine to close the last window and
			// the application continues running (unless quit was actually requested)
			if (this.windowCounter === 0 && (!isMacintosh || this._quitRequested)) {
				this.fireOnWillShutdown(ShutdownReason.QUIT);
			}
		}));
	}

	registerAuxWindow(auxWindow: IAuxiliaryWindow): void {
		const win = assertIsDefined(auxWindow.win);

		const windowListeners = new DisposableStore();
		windowListeners.add(Event.fromNodeEventEmitter<electron.Event>(win, 'close')(e => {
			this.trace(`Lifecycle#auxWindow.on('close') - window ID ${auxWindow.id}`);

			if (this._quitRequested) {
				this.trace(`Lifecycle#auxWindow.on('close') - preventDefault() because quit requested`);

				// When quit is requested, Electron will close all
				// auxiliary windows before closing the main windows.
				// This prevents us from storing the auxiliary window
				// state on shutdown and thus we prevent closing if
				// quit is requested.
				//
				// Interestingly, this will not prevent the application
				// from quitting because the auxiliary windows will still
				// close once the owning window closes.

				e.preventDefault();
			}
		}));
		windowListeners.add(Event.fromNodeEventEmitter<electron.Event>(win, 'closed')(() => {
			this.trace(`Lifecycle#auxWindow.on('closed') - window ID ${auxWindow.id}`);

			windowListeners.dispose();
		}));
	}

	async reload(window: ICodeWindow, cli?: NativeParsedArgs): Promise<void> {

		// Only reload when the window has not vetoed this
		const veto = await this.unload(window, UnloadReason.RELOAD);
		if (!veto) {
			window.reload(cli);
		}
	}

	unload(window: ICodeWindow, reason: UnloadReason): Promise<boolean /* veto */> {

		// Ensure there is only 1 unload running at the same time
		const pendingUnloadPromise = this.mapWindowIdToPendingUnload.get(window.id);
		if (pendingUnloadPromise) {
			return pendingUnloadPromise;
		}

		// Start unload and remember in map until finished
		const unloadPromise = this.doUnload(window, reason).finally(() => {
			this.mapWindowIdToPendingUnload.delete(window.id);
		});
		this.mapWindowIdToPendingUnload.set(window.id, unloadPromise);

		return unloadPromise;
	}

	private async doUnload(window: ICodeWindow, reason: UnloadReason): Promise<boolean /* veto */> {

		// Always allow to unload a window that is not yet ready
		if (!window.isReady) {
			return false;
		}

		this.trace(`Lifecycle#unload() - window ID ${window.id}`);

		// first ask the window itself if it vetos the unload
		const windowUnloadReason = this._quitRequested ? UnloadReason.QUIT : reason;
		const veto = await this.onBeforeUnloadWindowInRenderer(window, windowUnloadReason);
		if (veto) {
			this.trace(`Lifecycle#unload() - veto in renderer (window ID ${window.id})`);

			return this.handleWindowUnloadVeto(veto);
		}

		// finally if there are no vetos, unload the renderer
		await this.onWillUnloadWindowInRenderer(window, windowUnloadReason);

		return false;
	}

	private handleWindowUnloadVeto(veto: boolean): boolean {
		if (!veto) {
			return false; // no veto
		}

		// a veto resolves any pending quit with veto
		this.resolvePendingQuitPromise(true /* veto */);

		// a veto resets the pending quit request flag
		this._quitRequested = false;

		return true; // veto
	}

	private resolvePendingQuitPromise(veto: boolean): void {
		if (this.pendingQuitPromiseResolve) {
			this.pendingQuitPromiseResolve(veto);
			this.pendingQuitPromiseResolve = undefined;
			this.pendingQuitPromise = undefined;
		}
	}

	private onBeforeUnloadWindowInRenderer(window: ICodeWindow, reason: UnloadReason): Promise<boolean /* veto */> {
		return new Promise<boolean>(resolve => {
			const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
			const okChannel = `vscode:ok${oneTimeEventToken}`;
			const cancelChannel = `vscode:cancel${oneTimeEventToken}`;

			validatedIpcMain.once(okChannel, () => {
				resolve(false); // no veto
			});

			validatedIpcMain.once(cancelChannel, () => {
				resolve(true); // veto
			});

			window.send('vscode:onBeforeUnload', { okChannel, cancelChannel, reason });
		});
	}

	private onWillUnloadWindowInRenderer(window: ICodeWindow, reason: UnloadReason): Promise<void> {
		return new Promise<void>(resolve => {
			const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
			const replyChannel = `vscode:reply${oneTimeEventToken}`;

			validatedIpcMain.once(replyChannel, () => resolve());

			window.send('vscode:onWillUnload', { replyChannel, reason });
		});
	}

	quit(willRestart?: boolean): Promise<boolean /* veto */> {
		return this.doQuit(willRestart).then(veto => {
			if (!veto && willRestart) {
				// Windows: we are about to restart and as such we need to restore the original
				// current working directory we had on startup to get the exact same startup
				// behaviour. As such, we briefly change back to that directory and then when
				// Code starts it will set it back to the installation directory again.
				try {
					if (isWindows) {
						const currentWorkingDir = cwd();
						if (currentWorkingDir !== process.cwd()) {
							process.chdir(currentWorkingDir);
						}
					}
				} catch (err) {
					this.logService.error(err);
				}
			}

			return veto;
		});
	}

	private doQuit(willRestart?: boolean): Promise<boolean /* veto */> {
		this.trace(`Lifecycle#quit() - begin (willRestart: ${willRestart})`);

		if (this.pendingQuitPromise) {
			this.trace('Lifecycle#quit() - returning pending quit promise');

			return this.pendingQuitPromise;
		}

		// Remember if we are about to restart
		if (willRestart) {
			this.stateService.setItem(LifecycleMainService.QUIT_AND_RESTART_KEY, true);
		}

		this.pendingQuitPromise = new Promise(resolve => {

			// Store as field to access it from a window cancellation
			this.pendingQuitPromiseResolve = resolve;

			// Calling app.quit() will trigger the close handlers of each opened window
			// and only if no window vetoed the shutdown, we will get the will-quit event
			this.trace('Lifecycle#quit() - calling app.quit()');
			electron.app.quit();
		});

		return this.pendingQuitPromise;
	}

	private trace(msg: string): void {
		if (this.environmentMainService.args['enable-smoke-test-driver']) {
			this.logService.info(msg); // helps diagnose issues with exiting from smoke tests
		} else {
			this.logService.trace(msg);
		}
	}

	setRelaunchHandler(handler: IRelaunchHandler): void {
		this.relaunchHandler = handler;
	}

	async relaunch(options?: IRelaunchOptions): Promise<void> {
		this.trace('Lifecycle#relaunch()');

		const args = process.argv.slice(1);
		if (options?.addArgs) {
			args.push(...options.addArgs);
		}

		if (options?.removeArgs) {
			for (const a of options.removeArgs) {
				const idx = args.indexOf(a);
				if (idx >= 0) {
					args.splice(idx, 1);
				}
			}
		}

		const quitListener = () => {
			if (!this.relaunchHandler?.handleRelaunch(options)) {
				this.trace('Lifecycle#relaunch() - calling app.relaunch()');
				electron.app.relaunch({ args });
			}
		};
		electron.app.once('quit', quitListener);

		// `app.relaunch()` does not quit automatically, so we quit first,
		// check for vetoes and then relaunch from the `app.on('quit')` event
		const veto = await this.quit(true /* will restart */);
		if (veto) {
			electron.app.removeListener('quit', quitListener);
		}
	}

	async kill(code?: number): Promise<void> {
		this.trace('Lifecycle#kill()');

		// Give main process participants a chance to orderly shutdown
		await this.fireOnWillShutdown(ShutdownReason.KILL);

		// From extension tests we have seen issues where calling app.exit()
		// with an opened window can lead to native crashes (Linux). As such,
		// we should make sure to destroy any opened window before calling
		// `app.exit()`.
		//
		// Note: Electron implements a similar logic here:
		// https://github.com/electron/electron/blob/fe5318d753637c3903e23fc1ed1b263025887b6a/spec-main/window-helpers.ts#L5

		await Promise.race([

			// Still do not block more than 1s
			timeout(1000),

			// Destroy any opened window: we do not unload windows here because
			// there is a chance that the unload is veto'd or long running due
			// to a participant within the window. this is not wanted when we
			// are asked to kill the application.
			(async () => {
				for (const window of electron.BrowserWindow.getAllWindows()) {
					if (window && !window.isDestroyed()) {
						let whenWindowClosed: Promise<void>;
						if (window.webContents && !window.webContents.isDestroyed()) {
							whenWindowClosed = new Promise(resolve => window.once('closed', resolve));
						} else {
							whenWindowClosed = Promise.resolve();
						}

						window.destroy();
						await whenWindowClosed;
					}
				}
			})()
		]);

		// Now exit either after 1s or all windows destroyed
		electron.app.exit(code);
	}
}
