/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { getModernSideBarBackground, MODERN_SIDE_BAR_BORDER } from '../../../common/theme.js';
import './media/sidebarColors.css';

registerThemingParticipant((theme, collector) => {
	const background = getModernSideBarBackground(theme);
	if (background) {
		collector.addRule(`.monaco-workbench.modern-ui { --modern-ui-opaque-sidebar-background: ${background}; }`);
	}

	// The parts only draw a docked border when the legacy side bar border is set,
	// so supply the inner-edge geometry for the Modern UI border override.
	if (theme.getColor(MODERN_SIDE_BAR_BORDER)) {
		collector.addRule(`
			.monaco-workbench.modern-ui:not(.floating-panels) :is(.part.sidebar, .part.auxiliarybar).left {
				border-right-style: solid !important;
				border-right-width: 1px !important;
			}
			.monaco-workbench.modern-ui:not(.floating-panels) :is(.part.sidebar, .part.auxiliarybar).right {
				border-left-style: solid !important;
				border-left-width: 1px !important;
			}
		`);
	}
});
