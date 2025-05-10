/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';

export const enum TerminalClipboardSettingId {
	EnableSmartPaste = 'terminal.integrated.EnableSmartPaste',
}

export interface ITerminalClipboardConfiguration {
	enableSmartPaste: boolean;
}

export const terminalClipboardConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalClipboardSettingId.EnableSmartPaste]: {
		markdownDescription: localize('terminal.integrated.enableSmartPaste', "Whether or not to allow smart paste to automatically wrap file path with double quotes"),
		type: 'boolean',
		default: false
	},
};
