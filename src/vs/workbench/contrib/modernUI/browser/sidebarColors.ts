/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { getModernSideBarBackground } from '../../../common/theme.js';
import './media/sidebarColors.css';

registerThemingParticipant((theme, collector) => {
	const background = getModernSideBarBackground(theme);
	if (background) {
		collector.addRule(`.monaco-workbench.modern-ui { --modern-ui-opaque-sidebar-background: ${background}; }`);
	}
});
