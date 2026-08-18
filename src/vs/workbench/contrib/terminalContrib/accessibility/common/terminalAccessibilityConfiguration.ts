/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';

export const enum TerminalAccessibilitySettingId {
	AccessibleViewPreserveCursorPosition = 'terminal.integrated.accessibleViewPreserveCursorPosition',
	AccessibleViewFocusOnCommandExecution = 'terminal.integrated.accessibleViewFocusOnCommandExecution',
}

export const enum TerminalAccessibleViewPreserveCursorPosition {
	Always = 'always',
}

export interface ITerminalAccessibilityConfiguration {
	accessibleViewPreserveCursorPosition: boolean | TerminalAccessibleViewPreserveCursorPosition;
	accessibleViewFocusOnCommandExecution: number;
}

export const terminalAccessibilityConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition]: {
		markdownDescription: localize('terminal.integrated.accessibleViewPreserveCursorPosition', "Controls whether the cursor position is preserved in the terminal's accessible view."),
		type: ['boolean', 'string'],
		enum: [false, true, TerminalAccessibleViewPreserveCursorPosition.Always],
		enumDescriptions: [
			localize('terminal.integrated.accessibleViewPreserveCursorPosition.false', "Always position the cursor at the bottom of the buffer."),
			localize('terminal.integrated.accessibleViewPreserveCursorPosition.true', "Preserve the cursor position on reopen until new terminal content arrives."),
			localize('terminal.integrated.accessibleViewPreserveCursorPosition.always', "Always preserve the cursor position, including when new terminal content arrives.")
		],
		default: false,
	},
	[TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution]: {
		markdownDescription: localize('terminal.integrated.accessibleViewFocusOnCommandExecution', "Focus the terminal accessible view when a command is executed."),
		type: 'boolean',
		default: false
	},
};
