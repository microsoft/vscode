/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindowConstructorOptions, HandlerDetails, WebContents } from 'electron';
import { Event } from '../../../base/common/event.js';
import { IAuxiliaryWindow } from './auxiliaryWindow.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IWindowState } from '../../window/electron-main/window.js';

export interface IAuxiliaryBrowserWindowOptions extends BrowserWindowConstructorOptions {
	vscodeWindowState?: IWindowState;
	vscodeShowInactive?: boolean;
	vscodeShowHidden?: boolean;
	vscodeAlwaysOnTopLevel?: 'screen-saver';
	vscodeParentless?: boolean;
	vscodeVisibleOnAllWorkspaces?: boolean;
	vscodeVisibleOnFullScreen?: boolean;
}

export const IAuxiliaryWindowsMainService = createDecorator<IAuxiliaryWindowsMainService>('auxiliaryWindowsMainService');

export interface IAuxiliaryWindowsMainService {

	readonly _serviceBrand: undefined;

	readonly onDidMaximizeWindow: Event<IAuxiliaryWindow>;
	readonly onDidUnmaximizeWindow: Event<IAuxiliaryWindow>;
	readonly onDidChangeFullScreen: Event<{ window: IAuxiliaryWindow; fullscreen: boolean }>;
	readonly onDidChangeAlwaysOnTop: Event<{ window: IAuxiliaryWindow; alwaysOnTop: boolean }>;
	readonly onDidTriggerSystemContextMenu: Event<{ readonly window: IAuxiliaryWindow; readonly x: number; readonly y: number }>;

	createWindow(details: HandlerDetails): IAuxiliaryBrowserWindowOptions;
	registerWindow(webContents: WebContents): void;

	getWindowByWebContents(webContents: WebContents): IAuxiliaryWindow | undefined;

	getFocusedWindow(): IAuxiliaryWindow | undefined;
	getLastActiveWindow(): IAuxiliaryWindow | undefined;

	getWindows(): readonly IAuxiliaryWindow[];
}
