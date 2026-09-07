/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { EDITOR_GROUP_BORDER } from '../../../common/theme.js';
import './media/connectedEditorTabs.css';

registerThemingParticipant((theme, collector) => {
	const border = theme.getColor(EDITOR_GROUP_BORDER);
	const background = theme.getColor(editorBackground);
	if (border && background) {
		// Resolve alpha once so the cap, shoulder and separator joins cannot double the stroke.
		const stroke = border.isTransparent() ? border : border.makeOpaque(background);
		collector.addRule(`.monaco-workbench.modern-ui.modern-ui-tabs { --modern-ui-connected-tab-border: ${stroke}; }`);
	}
});
