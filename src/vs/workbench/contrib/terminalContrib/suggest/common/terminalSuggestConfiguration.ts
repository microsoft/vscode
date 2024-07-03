/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';
import type { IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';

export const enum TerminalSuggestSettingId {
	Enabled = 'terminal.integrated.suggest.enabled',
	QuickSuggestions = 'terminal.integrated.suggest.quickSuggestions',
	SuggestOnTriggerCharacters = 'terminal.integrated.suggest.suggestOnTriggerCharacters',
}

export const terminalSuggestConfigSection = 'terminal.integrated.suggest';

export interface ITerminalSuggestConfiguration {
	enabled: boolean;
	quickSuggestions: boolean;
	suggestOnTriggerCharacters: boolean;
}

export const terminalSuggestConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalSuggestSettingId.Enabled]: {
		restricted: true,
		markdownDescription: localize('suggest.enabled', "Enables experimental terminal Intellisense suggestions for supported shells ({0}) when {1} is set to {2}.\n\nIf shell integration is installed manually, {3} needs to be set to {4} before calling the shell integration script.", 'PowerShell', `\`#${TerminalSettingId.ShellIntegrationEnabled}#\``, '`true`', '`VSCODE_SUGGEST`', '`1`'),
		type: 'boolean',
		default: false,
	},
	[TerminalSuggestSettingId.QuickSuggestions]: {
		restricted: true,
		markdownDescription: localize('suggest.quickSuggestions', "Controls whether suggestions should automatically show up while typing. Also be aware of the {0}-setting which controls if suggestions are triggered by special characters.", `\`#${TerminalSuggestSettingId.SuggestOnTriggerCharacters}#\``),
		type: 'boolean',
		default: true,
	},
	[TerminalSuggestSettingId.SuggestOnTriggerCharacters]: {
		restricted: true,
		markdownDescription: localize('suggest.suggestOnTriggerCharacters', "Controls whether suggestions should automatically show up when typing trigger characters."),
		type: 'boolean',
		default: true,
	},
};
