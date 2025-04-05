/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';

export const enum TerminalHistoryCommandId {
	ClearPreviousSessionHistory = 'workbench.action.terminal.clearPreviousSessionHistory',
	GoToRecentDirectory = 'workbench.action.terminal.goToRecentDirectory',
	RunRecentCommand = 'workbench.action.terminal.runRecentCommand',
}

export const defaultTerminalHistoryCommandsToSkipShell = [
	TerminalHistoryCommandId.GoToRecentDirectory,
	TerminalHistoryCommandId.RunRecentCommand
];

export const enum TerminalHistorySettingId {
	ShellIntegrationCommandHistory = 'terminal.integrated.shellIntegration.history',
}

export const terminalHistoryConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalHistorySettingId.ShellIntegrationCommandHistory]: {
		restricted: true,
		markdownDescription: localize('terminal.integrated.shellIntegration.history', "Controls the number of recently used commands to keep in the terminal command history. Set to 0 to disable terminal command history."),
		type: 'number',
		default: 100
	},
};
