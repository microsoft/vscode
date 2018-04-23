/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { MainThreadDiaglogsShape, MainContext, IExtHostContext, MainThreadDialogOpenOptions, MainThreadDialogSaveOptions } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { forEach } from 'vs/base/common/collections';

@extHostNamedCustomer(MainContext.MainThreadDialogs)
export class MainThreadDialogs implements MainThreadDiaglogsShape {

	constructor(
		context: IExtHostContext,
		@IWindowService private readonly _windowService: IWindowService
	) {
		//
	}

	dispose(): void {
		//
	}

	$showOpenDialog(options: MainThreadDialogOpenOptions): Promise<string[]> {
		// TODO@joh what about remote dev setup?
		if (options.defaultUri && options.defaultUri.scheme !== 'file') {
			return Promise.reject(new Error('Not supported - Open-dialogs can only be opened on `file`-uris.'));
		}
		return new Promise<string[]>(resolve => {
			this._windowService.showOpenDialog(
				MainThreadDialogs._convertOpenOptions(options)
			).then(filenames => resolve(isFalsyOrEmpty(filenames) ? undefined : filenames));
		});
	}

	$showSaveDialog(options: MainThreadDialogSaveOptions): Promise<string> {
		// TODO@joh what about remote dev setup?
		if (options.defaultUri && options.defaultUri.scheme !== 'file') {
			return Promise.reject(new Error('Not supported - Save-dialogs can only be opened on `file`-uris.'));
		}
		return new Promise<string>(resolve => {
			this._windowService.showSaveDialog(
				MainThreadDialogs._convertSaveOptions(options)
			).then(filename => resolve(!filename ? undefined : filename));
		});
	}

	private static _convertOpenOptions(options: MainThreadDialogOpenOptions): Electron.OpenDialogOptions {
		const result: Electron.OpenDialogOptions = {
			properties: ['createDirectory']
		};
		if (options.openLabel) {
			result.buttonLabel = options.openLabel;
		}
		if (options.defaultUri) {
			result.defaultPath = URI.revive(options.defaultUri).fsPath;
		}
		if (!options.canSelectFiles && !options.canSelectFolders) {
			options.canSelectFiles = true;
		}
		if (options.canSelectFiles) {
			result.properties.push('openFile');
		}
		if (options.canSelectFolders) {
			result.properties.push('openDirectory');
		}
		if (options.canSelectMany) {
			result.properties.push('multiSelections');
		}
		if (options.filters) {
			result.filters = [];
			forEach(options.filters, entry => result.filters.push({ name: entry.key, extensions: entry.value }));
		}
		return result;
	}

	private static _convertSaveOptions(options: MainThreadDialogSaveOptions): Electron.SaveDialogOptions {
		const result: Electron.SaveDialogOptions = {

		};
		if (options.defaultUri) {
			result.defaultPath = URI.revive(options.defaultUri).fsPath;
		}
		if (options.saveLabel) {
			result.buttonLabel = options.saveLabel;
		}
		if (options.filters) {
			result.filters = [];
			forEach(options.filters, entry => result.filters.push({ name: entry.key, extensions: entry.value }));
		}
		return result;
	}
}
