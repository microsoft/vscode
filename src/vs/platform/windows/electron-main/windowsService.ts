/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowsService } from 'vs/platform/windows/common/windows';

// TODO@Joao: remove this dependency, move all implementation to this class
import { IWindowsMainService } from 'vs/code/electron-main/windows';

export class WindowsService implements IWindowsService {

	_serviceBrand: any;

	constructor(
		@IWindowsMainService private windowsMainService: IWindowsMainService
	) { }

	openFileFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		this.windowsMainService.openFileFolderPicker(forceNewWindow);
		return TPromise.as(null);
	}

	openFilePicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		this.windowsMainService.openFilePicker(forceNewWindow);
		return TPromise.as(null);
	}

	openFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		this.windowsMainService.openFolderPicker(forceNewWindow);
		return TPromise.as(null);
	}
}