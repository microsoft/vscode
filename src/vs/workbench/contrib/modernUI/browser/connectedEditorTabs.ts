/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { CONNECTED_EDITOR_TABS_SELECTOR } from '../../../browser/parts/editor/editor.js';
import { EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND, EDITOR_GROUP_HEADER_TABS_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND } from '../../../common/theme.js';
import './media/connectedEditorTabs.css';

const connectedTabsSelector = `.monaco-workbench.modern-ui-tabs${CONNECTED_EDITOR_TABS_SELECTOR}`;
const connectedEditorTabsSelector = `${connectedTabsSelector}.modern-ui`;

registerThemingParticipant((theme, collector) => {
	const background = theme.getColor(editorBackground);
	if (background) {
		collector.addRule(`${connectedTabsSelector} { --modern-ui-connected-tab-surface: ${background}; }`);
	}

	const defaultStripColor = theme.getColor(EDITOR_GROUP_HEADER_TABS_BACKGROUND) ?? background;
	const defaultStripBackground = background && defaultStripColor ? defaultStripColor.makeOpaque(background) : defaultStripColor;
	if (defaultStripBackground) {
		collector.addRule(`${connectedTabsSelector} { --modern-ui-connected-tab-strip-background: ${defaultStripBackground}; }`);
	}

	const hoverBackground = theme.getColor(MODERN_EDITOR_TAB_HOVER_BACKGROUND);
	if (defaultStripBackground && hoverBackground) {
		// Flatten against the strip, not the document, so the action mask and pill paint one surface.
		collector.addRule(`${connectedTabsSelector} { --modern-ui-connected-tab-upper-hover-background: ${hoverBackground.makeOpaque(defaultStripBackground)}; }`);
	}

	const editorStripColor = theme.getColor(EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND) ?? defaultStripColor;
	const editorStripBackground = background && editorStripColor ? editorStripColor.makeOpaque(background) : editorStripColor;
	if (editorStripBackground) {
		collector.addRule(`${connectedEditorTabsSelector} { --modern-ui-connected-tab-strip-background: ${editorStripBackground}; }`);
	}
	if (editorStripBackground && hoverBackground) {
		collector.addRule(`${connectedEditorTabsSelector} { --modern-ui-connected-tab-upper-hover-background: ${hoverBackground.makeOpaque(editorStripBackground)}; }`);
	}
});
