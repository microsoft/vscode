/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';

export const enum TerminalStickyScrollSettingId {
	Enabled = 'terminal.integrated.stickyScroll.enabled',
	MaxLineCount = 'terminal.integrated.stickyScroll.maxLineCount',
}

export interface ITerminalStickyScrollConfiguration {
	enabled: boolean;
	maxLineCount: number;
}

export const terminalStickyScrollConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalStickyScrollSettingId.Enabled]: {
		markdownDescription: localize('stickyScroll.enabled', "Shows the current command at the top of the terminal. This feature requires [shell integration]({0}) to be activated. See {1}.", 'https://code.visualstudio.com/docs/terminal/shell-integration', `\`#${TerminalSettingId.ShellIntegrationEnabled}#\``),
		type: 'boolean',
		default: true
	},
	[TerminalStickyScrollSettingId.MaxLineCount]: {
		markdownDescription: localize('stickyScroll.maxLineCount', "Defines the maximum number of sticky lines to show. Sticky scroll lines will never exceed 40% of the viewport regardless of this setting."),
		type: 'number',
		default: 5,
		minimum: 1,
		maximum: 10
	},
};
