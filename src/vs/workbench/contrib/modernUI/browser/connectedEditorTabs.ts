/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { CONNECTED_EDITOR_TABS_SELECTOR } from '../../../browser/parts/editor/editor.js';
import { EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND } from '../../../common/theme.js';
import './media/connectedEditorTabs.css';

const connectedTabsSelector = `.monaco-workbench${CONNECTED_EDITOR_TABS_SELECTOR}`;

registerThemingParticipant((theme, collector) => {
	const background = theme.getColor(editorBackground);
	if (background) {
		collector.addRule(`${connectedTabsSelector} { --modern-ui-connected-tab-surface: ${background}; }`);
	}

	const stripColor = theme.getColor(EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND) ?? background;
	const stripBackground = background && stripColor ? stripColor.makeOpaque(background) : stripColor;
	if (stripBackground) {
		collector.addRule(`${connectedTabsSelector} { --modern-ui-connected-tab-strip-background: ${stripBackground}; }`);
	}
	const hoverBackground = theme.getColor(MODERN_EDITOR_TAB_HOVER_BACKGROUND);
	if (stripBackground && hoverBackground) {
		// Flatten against the strip, not the document, so the action mask and pill paint one surface.
		collector.addRule(`${connectedTabsSelector} { --modern-ui-connected-tab-upper-hover-background: ${hoverBackground.makeOpaque(stripBackground)}; }`);
	}
});
