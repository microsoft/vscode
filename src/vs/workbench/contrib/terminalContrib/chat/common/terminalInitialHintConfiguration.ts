/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';
import { IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';

export const enum TerminalInitialHintSettingId {
	Enabled = 'terminal.integrated.initialHint'
}

export const terminalInitialHintConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalInitialHintSettingId.Enabled]: {
		restricted: true,
		markdownDescription: localize('terminal.integrated.initialHint', "Controls if the first terminal without input will show a hint about available actions when it is focused."),
		type: 'boolean',
		default: true
	}
};
