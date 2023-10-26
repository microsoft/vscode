/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindowConstructorOptions, WebContents } from 'electron';
import { IAuxiliaryWindow } from 'vs/platform/auxiliaryWindow/electron-main/auxiliaryWindow';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IAuxiliaryWindowsMainService = createDecorator<IAuxiliaryWindowsMainService>('auxiliaryWindowsMainService');

export interface IAuxiliaryWindowsMainService {

	readonly _serviceBrand: undefined;

	createWindow(): BrowserWindowConstructorOptions;
	registerWindow(webContents: WebContents): void;

	getWindowById(windowId: number): IAuxiliaryWindow | undefined;

	getFocusedWindow(): IAuxiliaryWindow | undefined;
	getLastActiveWindow(): IAuxiliaryWindow | undefined;

	getWindows(): readonly IAuxiliaryWindow[];
}
