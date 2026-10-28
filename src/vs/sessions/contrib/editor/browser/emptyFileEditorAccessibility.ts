/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { EmptyFileEditorFocusedContext } from './emptyFileEditor.js';
import { EmptyFileEditorSearchPickerFocusedContext } from './emptyFileEditorSearch.js';

export class EmptyFileEditorAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'emptyFileEditorSearch';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.or(EmptyFileEditorFocusedContext, EmptyFileEditorSearchPickerFocusedContext);

	getProvider(_accessor: ServicesAccessor): AccessibleContentProvider {
		const focusedElement = getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.EmptyFileEditorSearch,
			{ type: AccessibleViewType.Help },
			() => [
				localize('emptyFileEditor.searchHelp.overview', "The Files editor offers a search field, followed by Open File and New File actions. Use Tab to reach the search field and actions. Use Up Arrow or Down Arrow to move between actions and Enter or Space to run one."),
				localize('emptyFileEditor.searchHelp.inlineSearch', "Type part of a file name in the search field to search the active session workspace. Use Up Arrow and Down Arrow to choose a result, and Enter to open it. Press Escape to clear the search and return to the search field."),
				localize('emptyFileEditor.searchHelp.open', "Open File searches the active session workspace. Type part of a file name, use Up Arrow and Down Arrow to choose a result, and press Enter to open it."),
				localize('emptyFileEditor.searchHelp.dismiss', "Press Escape to close the search results and return to the Files editor."),
			].join('\n'),
			() => {
				if (isHTMLElement(focusedElement)) {
					focusedElement.focus();
				}
			},
			AccessibilityVerbositySettingId.EmptyFileEditorSearch,
		);
	}
}
