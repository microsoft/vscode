/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { activeContrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER, ACTIVITY_BAR_FOREGROUND } from 'vs/workbench/common/theme';

registerThemingParticipant((theme, collector) => {
	const activityBarForegroundColor = theme.getColor(ACTIVITY_BAR_FOREGROUND);
	if (activityBarForegroundColor) {
		collector.addRule(`
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .action-label,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label {
				color: ${activityBarForegroundColor} !important;
			}
		`);
	}

	const activityBarActiveBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER);
	if (activityBarActiveBorderColor) {
		collector.addRule(`
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
				border-left-color: ${activityBarActiveBorderColor};
			}
		`);
	}

	const activityBarActiveFocusBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_FOCUS_BORDER);
	if (activityBarActiveFocusBorderColor) {
		collector.addRule(`
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus::before {
				visibility: hidden;
			}

			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
				visibility: visible;
				border-left-color: ${activityBarActiveFocusBorderColor};
			}
		`);
	}

	const activityBarActiveBackgroundColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND);
	if (activityBarActiveBackgroundColor) {
		collector.addRule(`
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
				z-index: 0;
				background-color: ${activityBarActiveBackgroundColor};
			}
		`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:before {
				content: "";
				position: absolute;
				top: 9px;
				left: 9px;
				height: 32px;
				width: 32px;
				z-index: 1;
			}

			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:before,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:before,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover:before {
				outline: 1px solid;
			}

			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover:before {
				outline: 1px dashed;
			}

			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}

			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:before,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover:before,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:before,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover:before,
			.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover:before {
				outline-color: ${outline};
			}
		`);
	}

	// Styling without outline color
	else {
		const focusBorderColor = theme.getColor(focusBorder);
		if (focusBorderColor) {
			collector.addRule(`
				.monaco-workbench .outletbar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
						border-left-color: ${focusBorderColor};
					}
				`);
		}
	}
});

