/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { keybindingLabelBackground, keybindingLabelForeground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const labelBackground = theme.getColor(keybindingLabelBackground);
	if (labelBackground) {
		collector.addRule(`
			.monaco-keybinding > .monaco-keybinding-key {
				background-color: ${labelBackground};
			}
		`);
	}

	const labelForeground = theme.getColor(keybindingLabelForeground);
	if (labelForeground) {
		collector.addRule(`
			.monaco-keybinding > .monaco-keybinding-key {
				color: ${labelForeground};
			}
		`);
	}
});
