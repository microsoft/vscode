/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';
import type { IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';
import product from 'vs/platform/product/common/product';

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
		markdownDescription: localize('stickyScroll.enabled', "Shows the current command at the top of the terminal."),
		type: 'boolean',
		default: product.quality !== 'stable'
	},
	[TerminalStickyScrollSettingId.MaxLineCount]: {
		markdownDescription: localize('stickyScroll.maxLineCount', "Defines the maximum number of sticky lines to show. Sticky scroll lines will never exceed 40% of the viewport regardless of this setting."),
		type: 'number',
		default: 5,
		minimum: 1,
		maximum: 10
	},
};
