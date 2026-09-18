/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../contrib/accessibility/browser/accessibilityConfiguration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR } from './aiCustomizationManagement.js';
import { AICustomizationManagementEditor } from './aiCustomizationManagementEditor.js';

export class AICustomizationAccessibility implements IAccessibleViewImplementation {
	readonly priority = 100;
	readonly name = 'ai-customizations';
	readonly when = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR;

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof AICustomizationManagementEditor)) {
			return undefined;
		}
		const focused = DOM.getActiveElement();
		const helpText = [
			localize('aiCustomizations.help.overview', "You are in the Agent Customizations editor. Use the sidebar to browse customization types."),
			localize('aiCustomizations.help.search', "On the overview, use the search field to search all customization types. Results are grouped by customizations that are in use and available."),
			localize('aiCustomizations.help.searchNavigation', "Use the Up and Down Arrow keys to navigate search results and Enter to open the selected customization. Use Tab to reach an available Enable, Disable, or Install action."),
			localize('aiCustomizations.help.searchView', "Use {0} to read the current search query and results in the Accessible View.", '<keybinding:editor.action.accessibleView>'),
			localize('aiCustomizations.help.sections', "Within a customization type, use the search field to filter its items and the arrow keys to navigate the list."),
		].join('\n');
		const content = this.type === AccessibleViewType.Help ? helpText : editor.getOverviewSearchAccessibilityContent();
		if (!content) {
			return undefined;
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.AICustomizations,
			{ type: this.type },
			() => content,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			AccessibilityVerbositySettingId.AICustomizations,
		);
	}
}
