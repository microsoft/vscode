/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from './webview.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';

export class WebviewFindAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'webview-find';
	readonly type = AccessibleViewType.Help;
	readonly when = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		return new WebviewFindAccessibilityHelpProvider();
	}
}

class WebviewFindAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.WebviewFindHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	onClose(): void {
		// Focus will remain on webview
	}

	provideContent(): string {
		const content: string[] = [];

		// Header
		content.push(localize('webview.header', "Accessibility Help: Webview Find"));
		content.push(localize('webview.context', "You are in the Find input for embedded web content. This could be a Markdown preview, a documentation viewer, or a web-based extension interface."));
		content.push('');

		// Current Search Status
		content.push(localize('webview.statusHeader', "Current Search Status:"));
		content.push(localize('webview.statusDesc', "You are searching the web content."));
		content.push('');

		// Inside the Webview Find Input
		content.push(localize('webview.inputHeader', "Inside the Webview Find Input (What It Does):"));
		content.push(localize('webview.inputDesc', "While you are in the Find input, your focus stays in the field. You can type, edit your search term, or navigate matches without leaving the input. When you navigate to a match, the webview updates to show it, but your focus remains in the Find input."));
		content.push('');

		// What You Hear
		content.push(localize('webview.hearHeader', "What You Hear Each Time You Move to a Match:"));
		content.push(localize('webview.hearDesc', "Each navigation step gives you a complete spoken update:"));
		content.push(localize('webview.hear1', "1) The content containing the match is read first, so you get immediate context."));
		content.push(localize('webview.hear2', "2) Your position among the matches is announced, so you know how far you are through the results."));
		content.push(localize('webview.hear3', "3) The exact location information is announced so you know where the match is."));
		content.push('');

		// Focus Behavior
		content.push(localize('webview.focusHeader', "Focus Behavior (Important):"));
		content.push(localize('webview.focusDesc1', "When you navigate from the Webview Find input, the content updates in the background while your focus stays in the input. This is intentional, so you can keep refining your search without losing your place."));
		content.push(localize('webview.focusDesc2', "The webview may scroll to show the match, depending on how it is designed."));
		content.push(localize('webview.focusDesc3', "If you want to close Find and return focus to the webview content, press Escape. Focus moves back into the webview."));
		content.push('');

		// Keyboard Navigation Summary
		content.push(localize('webview.keyboardHeader', "Keyboard Navigation Summary:"));
		content.push('');
		content.push(localize('webview.keyNavHeader', "While focused IN the Find input:"));
		content.push(localize('webview.keyEnter', "- Enter: Move to the next match while staying in the Find input."));
		content.push(localize('webview.keyShiftEnter', "- Shift+Enter: Move to the previous match while staying in the Find input."));
		content.push('');

		// Find Options
		content.push(localize('webview.optionsHeader', "Find Options:"));
		content.push(localize('webview.optionCase', "- Match Case: Only exact case matches are included."));
		content.push(localize('webview.optionWord', "- Whole Word: Only full words are matched."));
		content.push(localize('webview.optionRegex', "- Regular Expression: Use pattern matching for advanced searches."));
		content.push('');

		// Important About Webviews
		content.push(localize('webview.importantHeader', "Important About Webviews:"));
		content.push(localize('webview.importantDesc', "Some webviews intercept keyboard input before VS Code's Find can use it. If Enter or Shift+Enter do not navigate matches, the webview may be handling those keys. Try clicking or tabbing into the webview content first to ensure the webview has focus, then reopen Find and try navigation again."));
		content.push('');

		// Settings
		content.push(localize('webview.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
		content.push(localize('webview.settingsDesc', "Webview Find has minimal configuration. Most behavior depends on the webview itself."));
		content.push(localize('webview.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the Webview Find input announces the Accessibility Help hint."));
		content.push('');

		// Closing
		content.push(localize('webview.closingHeader', "Closing:"));
		content.push(localize('webview.closingDesc', "Press Escape to close Webview Find. Focus moves back into the webview content, and your search history is available on next Find."));

		return content.join('\n');
	}
}
