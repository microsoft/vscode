/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { MODERN_EDITOR_TAB_ACTIVE_BACKGROUND } from '../../../common/theme.js';
import './media/connectedEditorTabs.css';

registerThemingParticipant((theme, collector) => {
	const background = theme.getColor(MODERN_EDITOR_TAB_ACTIVE_BACKGROUND);
	const editorBackgroundColor = theme.getColor(editorBackground);
	if (background) {
		const surface = editorBackgroundColor ? background.makeOpaque(editorBackgroundColor) : background;
		collector.addRule(`.monaco-workbench.modern-ui.modern-ui-connected-editor-tabs { --modern-ui-connected-tab-surface: ${surface}; }`);
	}
});
