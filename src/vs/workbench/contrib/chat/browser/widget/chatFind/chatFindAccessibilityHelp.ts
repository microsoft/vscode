/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { getFocusedFindController } from '../../actions/chatFindActions.js';
import { IChatFindController } from '../../chat.js';

export class ChatFindAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'chatFind';
	readonly type = AccessibleViewType.Help;
	readonly when = ChatContextKeys.findWidgetFocused;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const controller = getFocusedFindController(accessor);
		return controller ? new ChatFindAccessibilityHelpProvider(controller) : undefined;
	}
}

class ChatFindAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.ChatFindHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	constructor(private readonly _controller: IChatFindController) {
		super();
	}

	onClose(): void {
		this._controller.focus();
	}

	provideContent(): string {
		const content: string[] = [];
		content.push(localize('chatFind.header', "Accessibility Help: Chat Transcript Find"));
		content.push(localize('chatFind.context', "You are in the Find input for the chat transcript. It searches the whole conversation, including turns that are scrolled out of view, not only what is on screen. Matches are ordered newest first, starting from the turn you are looking at and working back through earlier ones."));
		content.push('');
		content.push(localize('chatFind.keyboardHeader', "Keyboard Navigation Summary:"));
		content.push(localize('chatFind.keyEnter', "- Enter: Move to the next match."));
		content.push(localize('chatFind.keyShiftEnter', "- Shift+Enter: Move to the previous match."));
		content.push(localize('chatFind.keyF3', "- F3 / Shift+F3: Move to the next / previous match from anywhere in the chat."));
		content.push(localize('chatFind.keyEscape', "- Escape: Close Find and return focus to where it was before Find was opened."));
		content.push('');
		content.push(localize('chatFind.optionsHeader', "Find Options:"));
		content.push(localize('chatFind.optionCase', "- Match Case: Only exact case matches are included."));
		content.push(localize('chatFind.optionWord', "- Whole Word: Only full words are matched."));
		content.push(localize('chatFind.optionRegex', "- Regular Expression: Use pattern matching for advanced searches."));
		content.push('');
		content.push(localize('chatFind.revealHeader', "Navigating to a Match:"));
		content.push(localize('chatFind.revealDesc', "Moving to a match scrolls the transcript to it, expanding the completed-work disclosure when the match is inside it."));
		content.push('');
		content.push(localize('chatFind.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
		content.push(localize('chatFind.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether Chat Find announces the Accessibility Help hint."));
		return content.join('\n');
	}
}
