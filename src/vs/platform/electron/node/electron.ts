/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MessageBoxOptions, MessageBoxReturnValue, OpenDevToolsOptions } from 'electron';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IElectronService = createDecorator<IElectronService>('electronService');

export interface IElectronService {

	_serviceBrand: undefined;

	// Window
	windowCount(): Promise<number>;
	openEmptyWindow(options?: { reuse?: boolean }): Promise<void>;

	// Dialogs
	showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;

	// OS
	showItemInFolder(path: string): Promise<void>;
	relaunch(options?: { addArgs?: string[], removeArgs?: string[] }): Promise<void>;

	// Development
	openDevTools(options?: OpenDevToolsOptions): Promise<void>;
	toggleDevTools(): Promise<void>;
}
