/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISettingsUtils = createDecorator<ISettingsUtils>('settingsUtils');

export interface ISettingsUtils {
	readonly _serviceBrand: undefined;

	getAutoAcceptConsole(): Promise<boolean>;
	getAutoAcceptConsoleAllowAnything(): Promise<boolean>;
	getAutoAcceptTerminal(): Promise<boolean>;
	getAutoAcceptTerminalAllowAnything(): Promise<boolean>;
	getAutoDeleteFiles(): Promise<boolean>;
	getAutoRunFiles(): Promise<boolean>;
	getAutoRunFilesAllowAnything(): Promise<boolean>;
	getAutomationList(listName: string): Promise<string[]>;
	getAutoAcceptConsoleAllowList(): Promise<string[]>;
	getAutoAcceptConsoleDenyList(): Promise<string[]>;
	getAutoAcceptTerminalAllowList(): Promise<string[]>;
	getAutoAcceptTerminalDenyList(): Promise<string[]>;
	getAutoRunFilesAllowList(): Promise<string[]>;
	getAutoRunFilesDenyList(): Promise<string[]>;
}
