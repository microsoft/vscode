/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyEqualsExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';


export class MergeEditorAccessibilityHelpProvider implements IAccessibleViewImplementation {
	readonly name = 'mergeEditor';
	readonly type = AccessibleViewType.Help;
	readonly priority = 125;
	readonly when = ContextKeyEqualsExpr.create('isMergeEditor', true);
	getProvider(accessor: ServicesAccessor) {
		const codeEditorService = accessor.get(ICodeEditorService);

		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();
		if (!codeEditor) {
			return;
		}

		const content = [
			localize('msg1', "You are in a merge editor."),
			localize('msg2', "Navigate between merge conflicts using the commands Go to Next Unhandled Conflict{0} and Go to Previous Unhandled Conflict{1}.", '<keybinding:merge.goToNextUnhandledConflict>', '<keybinding:merge.goToPreviousUnhandledConflict>'),
			localize('msg3', "Run the command Merge Editor: Accept All Changes from the Left{0} and Merge Editor: Accept All Changes from the Right{1}", '<keybinding:merge.acceptAllInput1>', '<keybinding:merge.acceptAllInput2>'),
		];

		return new AccessibleContentProvider(
			AccessibleViewProviderId.MergeEditor,
			{ type: AccessibleViewType.Help },
			() => content.join('\n'),
			() => codeEditor.focus(),
			AccessibilityVerbositySettingId.MergeEditor,
		);
	}
}
