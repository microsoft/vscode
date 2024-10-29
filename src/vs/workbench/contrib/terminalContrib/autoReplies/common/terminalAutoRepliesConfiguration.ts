/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';

export const enum TerminalAutoRepliesSettingId {
	AutoReplies = 'terminal.integrated.autoReplies',
}

export interface ITerminalAutoRepliesConfiguration {
	autoReplies: { [key: string]: string };
}

export const terminalAutoRepliesConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalAutoRepliesSettingId.AutoReplies]: {
		markdownDescription: localize('terminal.integrated.autoReplies', "A set of messages that, when encountered in the terminal, will be automatically responded to. Provided the message is specific enough, this can help automate away common responses.\n\nRemarks:\n\n- Use {0} to automatically respond to the terminate batch job prompt on Windows.\n- The message includes escape sequences so the reply might not happen with styled text.\n- Each reply can only happen once every second.\n- Use {1} in the reply to mean the enter key.\n- To unset a default key, set the value to null.\n- Restart VS Code if new don't apply.", '`"Terminate batch job (Y/N)": "Y\\r"`', '`"\\r"`'),
		type: 'object',
		additionalProperties: {
			oneOf: [{
				type: 'string',
				description: localize('terminal.integrated.autoReplies.reply', "The reply to send to the process.")
			},
			{ type: 'null' }]
		},
		default: {}
	},
};
