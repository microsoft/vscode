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
import { EmptyFileEditorSearchFocusedContext, EmptyFileEditorSearchPickerFocusedContext } from './emptyFileEditorSearch.js';

export class EmptyFileEditorAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 115;
	readonly name = 'emptyFileEditorSearch';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.or(EmptyFileEditorSearchFocusedContext, EmptyFileEditorSearchPickerFocusedContext);

	getProvider(_accessor: ServicesAccessor): AccessibleContentProvider {
		const focusedElement = getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.EmptyFileEditorSearch,
			{ type: AccessibleViewType.Help },
			() => [
				localize('emptyFileEditor.searchHelp.overview', "You are in the Files editor search. Type part of a file name to search the active session workspace."),
				localize('emptyFileEditor.searchHelp.navigation', "Use Up Arrow and Down Arrow to move the highlighted result while focus remains in the search input. Press Enter to open the highlighted file."),
				localize('emptyFileEditor.searchHelp.dismiss', "Press Escape to clear the search text and close the search results."),
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
