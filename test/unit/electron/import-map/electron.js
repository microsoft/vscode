/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { electron } from './testGlobals.js';

const { ipcMain, screen, BrowserWindow, app, nativeTheme, dialog } = electron

export { ipcMain, screen, BrowserWindow, app, nativeTheme, dialog }
