/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toolbarActiveBackground, toolbarHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	collector.addRule(`
		.monaco-action-bar:not(.vertical) .action-label:not(.disabled):hover {
			background-color: ${theme.getColor(toolbarHoverBackground)};
		}
	`);

	collector.addRule(`
		.monaco-action-bar:not(.vertical) .action-item.active .action-label:not(.disabled),
		.monaco-action-bar:not(.vertical) .monaco-dropdown.active .action-label:not(.disabled) {
			background-color: ${theme.getColor(toolbarActiveBackground)};
		}
	`);
});
