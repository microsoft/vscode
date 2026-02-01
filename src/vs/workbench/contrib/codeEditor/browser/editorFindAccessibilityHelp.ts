/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_REPLACE_INPUT_FOCUSED } from '../../../../editor/contrib/find/browser/findModel.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { CommonFindController } from '../../../../editor/contrib/find/browser/findController.js';

export class EditorFindAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'editor-find';
	readonly when = ContextKeyExpr.or(CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_REPLACE_INPUT_FOCUSED);
	readonly type = AccessibleViewType.Help;

	getProvider(accessor: ServicesAccessor) {
		const codeEditorService = accessor.get(ICodeEditorService);
		const codeEditor = codeEditorService.getActiveCodeEditor() || codeEditorService.getFocusedCodeEditor();

		if (!codeEditor) {
			return;
		}

		const findController = CommonFindController.get(codeEditor);
		if (!findController) {
			return;
		}

		return new EditorFindAccessibilityHelpProvider(findController, codeEditor);
	}
}

class EditorFindAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.EditorFindHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	constructor(
		private readonly _findController: CommonFindController,
		private readonly _codeEditor: { focus: () => void }
	) {
		super();
	}

	onClose(): void {
		this._codeEditor.focus();
	}

	provideContent(): string {
		const state = this._findController.getState();
		const isReplaceVisible = state.isReplaceRevealed;
		const searchString = state.searchString;
		const matchCount = state.matchesCount;
		const matchPosition = state.matchesPosition;

		const content: string[] = [];

		// Header
		if (isReplaceVisible) {
			content.push(localize('msg.findReplaceHeader', "Accessibility Help: Editor Find and Replace"));
			content.push('');
			content.push(localize('msg.findReplaceContext', "You are in the Find and Replace widget for the active code editor."));
		} else {
			content.push(localize('msg.findHeader', "Accessibility Help: Editor Find"));
			content.push('');
			content.push(localize('msg.findContext', "Welcome to the Find input for your code editor. This widget helps you locate and navigate to code."));
		}

		content.push('');
		content.push(localize('msg.overview', "Current Search Status:"));

		// Current search state
		if (searchString) {
			content.push(localize('msg.searchTerm', "You are searching for: \"{0}\".", searchString));
			if (matchCount !== undefined && matchPosition !== undefined) {
				if (matchCount === 0) {
					content.push(localize('msg.noMatches', "No matches found in the editor. Try a different search term or check your case sensitivity and whole word settings below."));
				} else if (matchCount === 1) {
					content.push(localize('msg.oneMatch', "One match found. Press Enter or F3 to jump to this location in the editor."));
				} else {
					content.push(localize('msg.matchStatus', "Match {0} of {1} total. You can navigate through these results.", matchPosition, matchCount));
				}
			}
		} else {
			content.push(localize('msg.noSearchTerm', "No search text entered yet. Start typing to find matches in the editor."));
		}

		if (isReplaceVisible) {
			const replaceString = state.replaceString;
			content.push('');
			content.push(localize('msg.replaceInfo', "You are in Replace mode."));
			if (replaceString) {
				content.push(localize('msg.replaceText', "Replacement text: \"{0}\".", replaceString));
			} else {
				content.push(localize('msg.noReplaceText', "No replacement text entered. Press Tab to move to the Replace input field and type your replacement."));
			}
		}

		content.push('');
		content.push(localize('msg.navigationHeader', "Keyboard Navigation:"));
		content.push(localize('msg.navIntro', "As you type in the Find input, VS Code announces the match count. Your screen reader will say something like \"3 of 12 matches\"."));
		content.push('');

		if (isReplaceVisible) {
			content.push(localize('msg.replaceNav1', "While in the Find input:"));
			content.push(localize('msg.replaceNav2', "- Press Enter to highlight the current match. Focus stays in the Find input."));
			content.push(localize('msg.replaceNav3', "- Press Shift+Enter to highlight the previous match instead."));
			content.push(localize('msg.replaceNav4', "- Press Tab to move focus to the Replace input field."));
			content.push('');
			content.push(localize('msg.replaceNav5', "While in the Replace input:"));
			content.push(localize('msg.replaceNav6', "- Press Enter to replace the current match and move to the next match. Focus stays in the Replace input."));
			content.push(localize('msg.replaceNav7', "- Press Shift+Tab to move focus back to the Find input."));
			content.push(localize('msg.replaceNav8', "- Press{0}to replace only the current match without moving to the next.", '<keybinding:editor.action.replaceOne>'));
			content.push(localize('msg.replaceNav9', "- Press{0}to replace all matches at once.", '<keybinding:editor.action.replaceAll>'));
		} else {
			content.push(localize('msg.navEnter', "- Press Enter while in the Find input to navigate to the next match. The view scrolls and the match is highlighted, but focus stays in the Find input."));
			content.push(localize('msg.navShiftEnter', "- Press Shift+Enter to navigate to the previous match instead. Focus also remains in the Find input."));
			content.push(localize('msg.navF3', "- Press{0}to navigate to the next match. This works from anywhere - the Find input or the editor. Focus does not change.", '<keybinding:editor.action.nextMatchFindAction>'));
			content.push(localize('msg.navShiftF3', "- Press{0}to navigate to the previous match. Focus also does not change.", '<keybinding:editor.action.previousMatchFindAction>'));
		}

		content.push('');
		content.push(localize('msg.focusBehavior', "Focus Behavior:"));
		content.push(localize('msg.focusDetail1', "When you press Enter while in the Find input, the next match is highlighted with a yellow background and the editor scrolls to show it. Focus remains in the Find input so you can continue navigating or refine your search."));
		content.push(localize('msg.focusDetail2', "When you press F3 from anywhere, VS Code navigates to the next match. If you were in the Find input, focus stays there. If you were in the editor, focus stays in the editor."));
		content.push(localize('msg.focusDetail3', "To move focus from the Find input into the editor, press{0}. To return to the Find input from the editor, press{1}.", '<keybinding:editor.action.focusNextPart>', '<keybinding:actions.find>'));

		content.push('');
		content.push(localize('msg.optionsHeader', "Search Options:"));
		content.push(localize('msg.optionsIntro', "Toggle these options with keyboard shortcuts to refine your search:"));
		content.push(localize('msg.optionCase', "-{0}Match Case - When enabled, finds only exact case matches. Useful when searching for \"const\" vs \"Const\".", '<keybinding:toggleFindCaseSensitive>'));
		content.push(localize('msg.optionWord', "-{0}Whole Word - When enabled, finds only complete words, not partial matches. For example, searching for \"test\" won't match \"testing\".", '<keybinding:toggleFindWholeWord>'));
		content.push(localize('msg.optionRegex', "-{0}Use Regular Expression - When enabled, interpret your search text as a regex pattern for powerful searches like \"[a-z]+\" or \"function\\\\s*\\\\(.*\\\\)\".", '<keybinding:toggleFindRegex>'));
		if (isReplaceVisible) {
			content.push(localize('msg.optionPreserve', "-{0}Preserve Case - When enabled, replacement preserves the case of the original match. Useful when replacing identifiers.", '<keybinding:togglePreserveCase>'));
		}

		content.push('');
		content.push(localize('msg.closing', "Closing the Find Widget:"));
		content.push(localize('msg.closingDetail', "Press Escape to close the Find widget. When you close it, focus moves to the editor at the position of the last highlighted match. Your search history is preserved, so when you reopen Find, your previous searches are available."));

		return content.join('\n');
	}
}

// Register the accessibility help provider
AccessibleViewRegistry.register(new EditorFindAccessibilityHelp());
