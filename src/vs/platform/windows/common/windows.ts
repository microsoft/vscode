/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IWindowsService = createDecorator<IWindowsService>('windowsService');

export interface IWindowsService {

	_serviceBrand: any;

	openFileFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void>;
	openFilePicker(windowId: number, forceNewWindow?: boolean): TPromise<void>;
	openFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void>;
}

export const IWindowService = createDecorator<IWindowService>('windowService');

export interface IWindowService {

	_serviceBrand: any;

	openFileFolderPicker(forceNewWindow?: boolean): TPromise<void>;
	openFilePicker(forceNewWindow?: boolean): TPromise<void>;
	openFolderPicker(forceNewWindow?: boolean): TPromise<void>;
}