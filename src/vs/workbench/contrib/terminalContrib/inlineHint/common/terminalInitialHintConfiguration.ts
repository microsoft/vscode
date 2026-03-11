/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';

export const enum TerminalInitialHintSettingId {
	Enabled = 'terminal.integrated.initialHint'
}

export const terminalInitialHintConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalInitialHintSettingId.Enabled]: {
		restricted: true,
		markdownDescription: localize('terminal.integrated.initialHint', "Controls if the first terminal without input will show a hint about available actions when it is focused. This will only show when {0} is disabled.", `\`#${TerminalSettingId.SendKeybindingsToShell}#\``),
		type: 'boolean',
		default: true
	}
};
