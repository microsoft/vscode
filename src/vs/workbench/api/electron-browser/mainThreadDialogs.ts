/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { MainThreadDiaglogsShape, MainContext, IExtHostContext, MainThreadDialogOpenOptions, MainThreadDialogSaveOptions } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IWindowService } from 'vs/platform/windows/common/windows';

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

	$showOpenDialog(options: MainThreadDialogOpenOptions): TPromise<string[]> {
		// TODO@joh what about remote dev setup?
		if (options.defaultResource && options.defaultResource.scheme !== 'file') {
			return TPromise.wrapError(new Error('bad path'));
		}
		return new TPromise<string[]>(resolve => {
			this._windowService.showOpenDialog(
				MainThreadDialogs._convertOpenOptions(options),
				filenames => resolve(isFalsyOrEmpty(filenames) ? undefined : filenames)
			);
		});
	}

	$showSaveDialog(options: MainThreadDialogSaveOptions): TPromise<string> {
		// TODO@joh what about remote dev setup?
		if (options.defaultResource && options.defaultResource.scheme !== 'file') {
			return TPromise.wrapError(new Error('bad path'));
		}
		return new TPromise<string>(resolve => {
			this._windowService.showSaveDialog(
				MainThreadDialogs._convertSaveOptions(options),
				filename => resolve(!filename ? undefined : filename)
			);
		});
	}

	private static _convertOpenOptions(options: MainThreadDialogOpenOptions): Electron.OpenDialogOptions {
		const result: Electron.OpenDialogOptions = {
			properties: ['createDirectory']
		};
		if (options.openLabel) {
			result.buttonLabel = options.openLabel;
		}
		if (options.defaultResource) {
			result.defaultPath = options.defaultResource.fsPath;
		}
		if (!options.openFiles && !options.openFolders) {
			options.openFiles = true;
		}
		if (options.openFiles) {
			result.properties.push('openFile');
		}
		if (options.openFolders) {
			result.properties.push('openDirectory');
		}
		if (options.openMany) {
			result.properties.push('multiSelections');
		}
		return result;
	}

	private static _convertSaveOptions(options: MainThreadDialogSaveOptions): Electron.SaveDialogOptions {
		const result: Electron.SaveDialogOptions = {

		};
		if (options.defaultResource) {
			result.defaultPath = options.defaultResource.fsPath;
		}
		if (options.saveLabel) {
			result.buttonLabel = options.saveLabel;
		}
		return result;
	}
}
