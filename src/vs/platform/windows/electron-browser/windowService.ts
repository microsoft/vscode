/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';

export class WindowService implements IWindowService {

	_serviceBrand: any;

	constructor(
		private windowId: number,
		@IWindowsService private windowsService: IWindowsService
	) { }

	openFileFolderPicker(forceNewWindow?: boolean): TPromise<void> {
		return this.windowsService.openFileFolderPicker(this.windowId, forceNewWindow);
	}

	openFilePicker(forceNewWindow?: boolean, path?: string): TPromise<void> {
		return this.windowsService.openFilePicker(this.windowId, forceNewWindow, path);
	}

	openFolderPicker(forceNewWindow?: boolean): TPromise<void> {
		return this.windowsService.openFolderPicker(this.windowId, forceNewWindow);
	}
}