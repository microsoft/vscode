/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { INativeHostService } from 'vs/platform/native/common/native';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILabelService, Verbosity } from 'vs/platform/label/common/label';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWindowOpenable, IOpenWindowOptions, isFolderToOpen, isWorkspaceToOpen, IOpenEmptyWindowOptions } from 'vs/platform/window/common/window';
import { Disposable } from 'vs/base/common/lifecycle';
import { NativeHostService } from 'vs/platform/native/electron-sandbox/nativeHostService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IMainProcessService } from 'vs/platform/ipc/common/mainProcessService';
import { isAuxiliaryWindow } from 'vs/workbench/services/auxiliaryWindow/electron-sandbox/auxiliaryWindowService';
import { getActiveDocument, getWindowsCount, onDidRegisterWindow, trackFocus } from 'vs/base/browser/dom';
import { DomEmitter } from 'vs/base/browser/event';
import { memoize } from 'vs/base/common/decorators';

class WorkbenchNativeHostService extends NativeHostService {

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		super(environmentService.window.id, mainProcessService);
	}
}

class WorkbenchHostService extends Disposable implements IHostService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILabelService private readonly labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		super();
	}

	//#region Focus

	@memoize
	get onDidChangeFocus(): Event<boolean> {
		const emitter = this._register(new Emitter<boolean>());

		// Main window: track via native API
		this._register(Event.filter(this.nativeHostService.onDidFocusWindow, id => id === this.nativeHostService.windowId, this._store)(() => emitter.fire(this.hasFocus)));
		this._register(Event.filter(this.nativeHostService.onDidBlurWindow, id => id === this.nativeHostService.windowId, this._store)(() => emitter.fire(this.hasFocus)));

		// Aux windows: track via DOM APIs
		this._register(onDidRegisterWindow(({ window, disposables }) => {
			const focusTracker = disposables.add(trackFocus(window));
			const onVisibilityChange = disposables.add(new DomEmitter(window.document, 'visibilitychange'));

			disposables.add(focusTracker.onDidFocus(() => emitter.fire(this.hasFocus)));
			disposables.add(focusTracker.onDidBlur(() => emitter.fire(this.hasFocus)));
			disposables.add(onVisibilityChange.event(() => emitter.fire(this.hasFocus)));
		}));

		return emitter.event;
	}

	get hasFocus(): boolean {
		return getActiveDocument().hasFocus();
	}

	async hadLastFocus(): Promise<boolean> {
		const activeWindowId = await this.nativeHostService.getActiveWindowId();

		if (typeof activeWindowId === 'undefined') {
			return false;
		}

		return activeWindowId === this.nativeHostService.windowId;
	}

	//#endregion


	//#region Window

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;
	openWindow(arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: IOpenWindowOptions): Promise<void> {
		if (Array.isArray(arg1)) {
			return this.doOpenWindow(arg1, arg2);
		}

		return this.doOpenEmptyWindow(arg1);
	}

	private doOpenWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
		const remoteAuthority = this.environmentService.remoteAuthority;
		if (!!remoteAuthority) {
			toOpen.forEach(openable => openable.label = openable.label || this.getRecentLabel(openable));

			if (options?.remoteAuthority === undefined) {
				// set the remoteAuthority of the window the request came from.
				// It will be used when the input is neither file nor vscode-remote.
				options = options ? { ...options, remoteAuthority } : { remoteAuthority };
			}
		}

		return this.nativeHostService.openWindow(toOpen, options);
	}

	private getRecentLabel(openable: IWindowOpenable): string {
		if (isFolderToOpen(openable)) {
			return this.labelService.getWorkspaceLabel(openable.folderUri, { verbose: Verbosity.LONG });
		}

		if (isWorkspaceToOpen(openable)) {
			return this.labelService.getWorkspaceLabel({ id: '', configPath: openable.workspaceUri }, { verbose: Verbosity.LONG });
		}

		return this.labelService.getUriLabel(openable.fileUri);
	}

	private doOpenEmptyWindow(options?: IOpenEmptyWindowOptions): Promise<void> {
		const remoteAuthority = this.environmentService.remoteAuthority;
		if (!!remoteAuthority && options?.remoteAuthority === undefined) {
			// set the remoteAuthority of the window the request came from
			options = options ? { ...options, remoteAuthority } : { remoteAuthority };
		}
		return this.nativeHostService.openWindow(options);
	}

	toggleFullScreen(): Promise<void> {
		return this.nativeHostService.toggleFullScreen();
	}

	async moveTop(window: Window & typeof globalThis): Promise<void> {
		if (getWindowsCount() <= 1) {
			return; // does not apply when only one window is opened
		}

		return this.nativeHostService.moveWindowTop(isAuxiliaryWindow(window) ? { targetWindowId: await window.vscodeWindowId } : undefined);
	}

	//#endregion


	//#region Lifecycle

	focus(options?: { force: boolean }): Promise<void> {
		return this.nativeHostService.focusWindow(options);
	}

	restart(): Promise<void> {
		return this.nativeHostService.relaunch();
	}

	reload(options?: { disableExtensions?: boolean }): Promise<void> {
		return this.nativeHostService.reload(options);
	}

	close(): Promise<void> {
		return this.nativeHostService.closeWindow();
	}

	async withExpectedShutdown<T>(expectedShutdownTask: () => Promise<T>): Promise<T> {
		return await expectedShutdownTask();
	}

	//#endregion
}

registerSingleton(IHostService, WorkbenchHostService, InstantiationType.Delayed);
registerSingleton(INativeHostService, WorkbenchNativeHostService, InstantiationType.Delayed);
