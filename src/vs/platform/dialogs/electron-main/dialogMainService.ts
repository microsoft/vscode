/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, dialog, FileFilter, MessageBoxOptions, MessageBoxReturnValue, OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from 'electron';
import { Queue } from 'vs/base/common/async';
import { hash } from 'vs/base/common/hash';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { Disposable, dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { normalizeNFC } from 'vs/base/common/normalization';
import { isMacintosh } from 'vs/base/common/platform';
import { Promises } from 'vs/base/node/pfs';
import { localize } from 'vs/nls';
import { INativeOpenDialogOptions, massageMessageBoxOptions } from 'vs/platform/dialogs/common/dialogs';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { WORKSPACE_FILTER } from 'vs/platform/workspace/common/workspace';

export const IDialogMainService = createDecorator<IDialogMainService>('dialogMainService');

export interface IDialogMainService {

	readonly _serviceBrand: undefined;

	pickFileFolder(options: INativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined>;
	pickFolder(options: INativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined>;
	pickFile(options: INativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined>;
	pickWorkspace(options: INativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined>;

	showMessageBox(options: MessageBoxOptions, window?: BrowserWindow): Promise<MessageBoxReturnValue>;
	showSaveDialog(options: SaveDialogOptions, window?: BrowserWindow): Promise<SaveDialogReturnValue>;
	showOpenDialog(options: OpenDialogOptions, window?: BrowserWindow): Promise<OpenDialogReturnValue>;
}

interface IInternalNativeOpenDialogOptions extends INativeOpenDialogOptions {
	readonly pickFolders?: boolean;
	readonly pickFiles?: boolean;

	readonly title: string;
	readonly buttonLabel?: string;
	readonly filters?: FileFilter[];
}

export class DialogMainService implements IDialogMainService {

	declare readonly _serviceBrand: undefined;

	private readonly windowFileDialogLocks = new Map<number, Set<number>>();
	private readonly windowDialogQueues = new Map<number, Queue<MessageBoxReturnValue | SaveDialogReturnValue | OpenDialogReturnValue>>();
	private readonly noWindowDialogueQueue = new Queue<MessageBoxReturnValue | SaveDialogReturnValue | OpenDialogReturnValue>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService
	) {
	}

	pickFileFolder(options: INativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined> {
		return this.doPick({ ...options, pickFolders: true, pickFiles: true, title: localize('open', "Open") }, window);
	}

	pickFolder(options: INativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined> {
		return this.doPick({ ...options, pickFolders: true, title: localize('openFolder', "Open Folder") }, window);
	}

	pickFile(options: INativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined> {
		return this.doPick({ ...options, pickFiles: true, title: localize('openFile', "Open File") }, window);
	}

	pickWorkspace(options: INativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined> {
		const title = localize('openWorkspaceTitle', "Open Workspace from File");
		const buttonLabel = mnemonicButtonLabel(localize({ key: 'openWorkspace', comment: ['&& denotes a mnemonic'] }, "&&Open"));
		const filters = WORKSPACE_FILTER;

		return this.doPick({ ...options, pickFiles: true, title, filters, buttonLabel }, window);
	}

	private async doPick(options: IInternalNativeOpenDialogOptions, window?: BrowserWindow): Promise<string[] | undefined> {

		// Ensure dialog options
		const dialogOptions: OpenDialogOptions = {
			title: options.title,
			buttonLabel: options.buttonLabel,
			filters: options.filters,
			defaultPath: options.defaultPath
		};

		// Ensure properties
		if (typeof options.pickFiles === 'boolean' || typeof options.pickFolders === 'boolean') {
			dialogOptions.properties = undefined; // let it override based on the booleans

			if (options.pickFiles && options.pickFolders) {
				dialogOptions.properties = ['multiSelections', 'openDirectory', 'openFile', 'createDirectory'];
			}
		}

		if (!dialogOptions.properties) {
			dialogOptions.properties = ['multiSelections', options.pickFolders ? 'openDirectory' : 'openFile', 'createDirectory'];
		}

		if (isMacintosh) {
			dialogOptions.properties.push('treatPackageAsDirectory'); // always drill into .app files
		}

		// Show Dialog
		const result = await this.showOpenDialog(dialogOptions, (window || BrowserWindow.getFocusedWindow()) ?? undefined);
		if (result && result.filePaths && result.filePaths.length > 0) {
			return result.filePaths;
		}

		return undefined;
	}

	private getWindowDialogQueue<T extends MessageBoxReturnValue | SaveDialogReturnValue | OpenDialogReturnValue>(window?: BrowserWindow): Queue<T> {

		// Queue message box requests per window so that one can show
		// after the other.
		if (window) {
			let windowDialogQueue = this.windowDialogQueues.get(window.id);
			if (!windowDialogQueue) {
				windowDialogQueue = new Queue<MessageBoxReturnValue | SaveDialogReturnValue | OpenDialogReturnValue>();
				this.windowDialogQueues.set(window.id, windowDialogQueue);
			}

			return windowDialogQueue as unknown as Queue<T>;
		} else {
			return this.noWindowDialogueQueue as unknown as Queue<T>;
		}
	}

	showMessageBox(rawOptions: MessageBoxOptions, window?: BrowserWindow): Promise<MessageBoxReturnValue> {
		return this.getWindowDialogQueue<MessageBoxReturnValue>(window).queue(async () => {
			const { options, buttonIndeces } = massageMessageBoxOptions(rawOptions, this.productService);

			let result: MessageBoxReturnValue | undefined = undefined;
			if (window) {
				result = await dialog.showMessageBox(window, options);
			} else {
				result = await dialog.showMessageBox(options);
			}

			return {
				response: buttonIndeces[result.response],
				checkboxChecked: result.checkboxChecked
			};
		});
	}

	async showSaveDialog(options: SaveDialogOptions, window?: BrowserWindow): Promise<SaveDialogReturnValue> {

		// Prevent duplicates of the same dialog queueing at the same time
		const fileDialogLock = this.acquireFileDialogLock(options, window);
		if (!fileDialogLock) {
			this.logService.error('[DialogMainService]: file save dialog is already or will be showing for the window with the same configuration');

			return { canceled: true };
		}

		try {
			return await this.getWindowDialogQueue<SaveDialogReturnValue>(window).queue(async () => {
				let result: SaveDialogReturnValue;
				if (window) {
					result = await dialog.showSaveDialog(window, options);
				} else {
					result = await dialog.showSaveDialog(options);
				}

				result.filePath = this.normalizePath(result.filePath);

				return result;
			});
		} finally {
			dispose(fileDialogLock);
		}
	}

	private normalizePath(path: string): string;
	private normalizePath(path: string | undefined): string | undefined;
	private normalizePath(path: string | undefined): string | undefined {
		if (path && isMacintosh) {
			path = normalizeNFC(path); // macOS only: normalize paths to NFC form
		}

		return path;
	}

	private normalizePaths(paths: string[]): string[] {
		return paths.map(path => this.normalizePath(path));
	}

	async showOpenDialog(options: OpenDialogOptions, window?: BrowserWindow): Promise<OpenDialogReturnValue> {

		// Ensure the path exists (if provided)
		if (options.defaultPath) {
			const pathExists = await Promises.exists(options.defaultPath);
			if (!pathExists) {
				options.defaultPath = undefined;
			}
		}

		// Prevent duplicates of the same dialog queueing at the same time
		const fileDialogLock = this.acquireFileDialogLock(options, window);
		if (!fileDialogLock) {
			this.logService.error('[DialogMainService]: file open dialog is already or will be showing for the window with the same configuration');

			return { canceled: true, filePaths: [] };
		}

		try {
			return await this.getWindowDialogQueue<OpenDialogReturnValue>(window).queue(async () => {
				let result: OpenDialogReturnValue;
				if (window) {
					result = await dialog.showOpenDialog(window, options);
				} else {
					result = await dialog.showOpenDialog(options);
				}

				result.filePaths = this.normalizePaths(result.filePaths);

				return result;
			});
		} finally {
			dispose(fileDialogLock);
		}
	}

	private acquireFileDialogLock(options: SaveDialogOptions | OpenDialogOptions, window?: BrowserWindow): IDisposable | undefined {

		// If no window is provided, allow as many dialogs as
		// needed since we consider them not modal per window
		if (!window) {
			return Disposable.None;
		}

		// If a window is provided, only allow a single dialog
		// at the same time because dialogs are modal and we
		// do not want to open one dialog after the other
		// (https://github.com/microsoft/vscode/issues/114432)
		// we figure this out by `hashing` the configuration
		// options for the dialog to prevent duplicates

		this.logService.trace('[DialogMainService]: request to acquire file dialog lock', options);

		let windowFileDialogLocks = this.windowFileDialogLocks.get(window.id);
		if (!windowFileDialogLocks) {
			windowFileDialogLocks = new Set();
			this.windowFileDialogLocks.set(window.id, windowFileDialogLocks);
		}

		const optionsHash = hash(options);
		if (windowFileDialogLocks.has(optionsHash)) {
			return undefined; // prevent duplicates, return
		}

		this.logService.trace('[DialogMainService]: new file dialog lock created', options);

		windowFileDialogLocks.add(optionsHash);

		return toDisposable(() => {
			this.logService.trace('[DialogMainService]: file dialog lock disposed', options);

			windowFileDialogLocks?.delete(optionsHash);

			// If the window has no more dialog locks, delete it from the set of locks
			if (windowFileDialogLocks?.size === 0) {
				this.windowFileDialogLocks.delete(window.id);
			}
		});
	}
}
