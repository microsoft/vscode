/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from '../../../../../base/common/collections.js';
import { localize } from '../../../../../nls.js';
import type { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';

export const enum TerminalCommandGuideSettingId {
	ShowCommandGuide = 'terminal.integrated.shellIntegration.showCommandGuide',
}

export const terminalCommandGuideConfigSection = 'terminal.integrated.shellIntegration';

export interface ITerminalCommandGuideConfiguration {
	showCommandGuide: boolean;
}

export const terminalCommandGuideConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalCommandGuideSettingId.ShowCommandGuide]: {
		restricted: true,
		markdownDescription: localize('showCommandGuide', "Whether to show the command guide when hovering over a command in the terminal."),
		type: 'boolean',
		default: true,
	},
};
