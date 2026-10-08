/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { CONNECTED_EDITOR_TABS_SELECTOR } from '../../../browser/parts/editor/editor.js';
import { EDITOR_GROUP_HEADER_CONNECTED_TABS_BACKGROUND, EDITOR_GROUP_HEADER_TABS_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, TAB_CONNECTED_ACTIVE_BORDER, TAB_UNFOCUSED_CONNECTED_ACTIVE_BORDER } from '../../../common/theme.js';
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

	// `!important` because the HC rules in connectedEditorTabs.css match these elements with equal specificity.
	const activeOutline = theme.getColor(TAB_CONNECTED_ACTIVE_BORDER);
	if (activeOutline) {
		collector.addRule(`${connectedTabsSelector} .part.editor > .content .editor-group-container.active, ${connectedTabsSelector} .modern-ui-editor-tab-group.modern-ui-editor-tab-group-active { --modern-ui-connected-tab-border: ${activeOutline} !important; --modern-ui-connected-well-border: ${activeOutline} !important; }`);
	}
	const unfocusedOutline = theme.getColor(TAB_UNFOCUSED_CONNECTED_ACTIVE_BORDER);
	if (unfocusedOutline) {
		collector.addRule(`${connectedTabsSelector} .part.editor > .content .editor-group-container:not(.active), ${connectedTabsSelector} .modern-ui-editor-tab-group:not(.modern-ui-editor-tab-group-active) { --modern-ui-connected-tab-border: ${unfocusedOutline} !important; --modern-ui-connected-well-border: ${unfocusedOutline} !important; }`);
	}

	// Mirror the HC group frame so a custom connected outline continues around the editor instead of stopping at the tab.
	if (!isHighContrast(theme.type) && (activeOutline || unfocusedOutline)) {
		const editorPart = `${connectedTabsSelector} .part.editor.editor-tabs-multiple`;
		collector.addRule(`${editorPart}:not(.modal-editor-part) { border-color: transparent; --modern-ui-editor-border-color: transparent; --modern-ui-floating-card-stroke-color: transparent; }`);
		collector.addRule(`${editorPart} > .content .editor-group-container { position: relative; }`);
		collector.addRule(`${editorPart} > .content .editor-group-container::after { content: ''; position: absolute; inset: 0; border: var(--vscode-strokeThickness) solid var(--modern-ui-connected-well-border); border-radius: var(--vscode-cornerRadius-large); box-sizing: border-box; pointer-events: none; z-index: 10; }`);
	}
});
