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
		content.push(localize('msg.webviewFindHeader', "Accessibility Help: Webview Find"));
		content.push('');
		content.push(localize('msg.webviewFindContext', "You are in the Webview Find input. This searches embedded web content such as Markdown previews, documentation viewers, or web-based extension interfaces."));
		content.push('');
		content.push(localize('msg.webviewOverview', "What to Expect:"));
		content.push(localize('msg.webviewTyping', "As you type, VS Code searches the webview content and announces the match count like \\\"3 of 7 matches\\\". Screen readers will inform you as matches are found or if no matches exist."));

		content.push('');
		content.push(localize('msg.webviewNavHeader', "Keyboard Navigation:"));
		content.push(localize('msg.webviewNavEnter', "- Press Enter to navigate to the next match. Your screen reader announces the content where the match appears."));
		content.push(localize('msg.webviewNavShiftEnter', "- Press Shift+Enter to navigate to the previous match."));
		content.push(localize('msg.webviewFocusStays', "- Focus remains in the Find input when you press Enter or Shift+Enter. You can continue navigating through matches without leaving the Find input."));
		content.push(localize('msg.webviewReturnToFind', "- To return to the Find input from the webview, press{0}.", '<keybinding:actions.find>'));
		content.push(localize('msg.webviewEscape', "- Press Escape to close the Find widget. Focus moves to the webview content."));

		content.push('');
		content.push(localize('msg.webviewOptions', "Search Options:"));
		content.push(localize('msg.webviewOptionCase', "-{0}Match Case - Only find exact case matches.", '<keybinding:toggleFindCaseSensitive>'));
		content.push(localize('msg.webviewOptionWord', "-{0}Whole Word - Only find complete words, not partial matches.", '<keybinding:toggleFindWholeWord>'));
		content.push(localize('msg.webviewOptionRegex', "-{0}Regular Expression - Use regex patterns for advanced searches.", '<keybinding:toggleFindRegex>'));

		content.push('');
		content.push(localize('msg.webviewNotes', "Important About Webviews:"));
		content.push(localize('msg.webviewCustomKeyboard', "Each webview can define its own keyboard behavior. If VS Code's find navigation (Enter, Shift+Enter) does not work as expected, the webview may be intercepting those keys."));
		content.push(localize('msg.webviewIfUnresponsive', "If find navigation seems unresponsive: First, click or tab into the webview content to ensure it has focus, then try your search again. Some webviews require focus within their content to respond to find commands."));

		return content.join('\n');
	}
}
