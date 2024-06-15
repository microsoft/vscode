/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';
import type { IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';

export const enum TerminalAccessibilitySettingId {
	AccessibleViewPreserveCursorPosition = 'terminal.integrated.accessibleViewPreserveCursorPosition',
	AccessibleViewFocusOnCommandExecution = 'terminal.integrated.accessibleViewFocusOnCommandExecution',
}

export interface ITerminalAccessibilityConfiguration {
	accessibleViewPreserveCursorPosition: boolean;
	accessibleViewFocusOnCommandExecution: number;
}

export const terminalAccessibilityConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition]: {
		markdownDescription: localize('terminal.integrated.accessibleViewPreserveCursorPosition', "Preserve the cursor position on reopen of the terminal's accessible view rather than setting it to the bottom of the buffer."),
		type: 'boolean',
		default: false
	},
	[TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution]: {
		markdownDescription: localize('terminal.integrated.accessibleViewFocusOnCommandExecution', "Focus the terminal accessible view when a command is executed."),
		type: 'boolean',
		default: false
	},
};
