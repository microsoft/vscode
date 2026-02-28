/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CommonFindController } from '../../../../editor/contrib/find/browser/findController.js';
import { CONTEXT_FIND_WIDGET_FOCUSED } from '../../../../editor/contrib/find/browser/findModel.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider, IAccessibleViewOptions } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';

/**
 * Accessible view implementation for Find and Replace help in the code editor.
 * Provides comprehensive accessibility support for the Find dialog, including:
 * - Search status information (current term, match count, position)
 * - Navigation instructions for keyboard control
 * - Focus behavior explanation
 * - Available settings and options
 * - Platform-specific guidance
 *
 * Activated via Alt+F1 when any element in the Find widget is focused.
 */
export class EditorFindAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'editor-find';
	readonly when = CONTEXT_FIND_WIDGET_FOCUSED;
	readonly type = AccessibleViewType.Help;

	/**
	 * Creates an accessible view content provider for the active code editor's Find/Replace dialog.
	 * @param accessor Service accessor for retrieving the code editor service
	 * @returns The provider instance, or undefined if no active editor or find controller is found
	 */
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

		return new EditorFindAccessibilityHelpProvider(findController);
	}
}

/**
 * Content provider for the Find and Replace accessibility help.
 * Generates localized, context-aware help information based on the current Find state.
 *
 * The implementation:
 * - Adapts content based on whether Replace mode is active
 * - Provides current search status (term, match count, position)
 * - Explains focus behavior (how focus moves between Find input, Replace input, and editor)
 * - Lists keyboard navigation shortcuts for different contexts
 * - Documents available Find and Replace options
 * - References relevant settings that affect Find behavior
 * - Includes platform-specific guidance where applicable
 */
class EditorFindAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.EditorFindHelp;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Find;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	constructor(
		private readonly _findController: CommonFindController
	) {
		super();
	}

	/**
	 * Returns focus to the last focused element in the Find widget when the accessibility help is closed.
	 * This handles focus restoration for any element (inputs, checkboxes, buttons) not just the text inputs.
	 */
	onClose(): void {
		this._findController.focusLastElement();
	}

	/**
	 * Generates the complete accessibility help content for Find and Replace.
	 * The content structure varies based on whether Replace mode is visible:
	 *
	 * Replace Mode Content:
	 * - Header identifying the dialog
	 * - Context explaining what the dialog does
	 * - Current search and replace status
	 * - Focus behavior explanation
	 * - Keyboard shortcuts for Find, Replace, and Editor contexts
	 * - Find and Replace options explanation
	 * - Configurable settings documentation
	 * - Platform-specific settings (macOS)
	 *
	 * Find-Only Mode Content:
	 * - Similar structure but without Replace-specific sections
	 *
	 * @returns The complete help text as a newline-joined string for audio announcement
	 */
	provideContent(): string {
		const state = this._findController.getState();
		const isReplaceVisible = state.isReplaceRevealed;
		const searchString = state.searchString;
		const matchCount = state.matchesCount;
		const matchPosition = state.matchesPosition;

		const content: string[] = [];

		if (isReplaceVisible) {
			// ========== REPLACE MODE CONTENT ==========
			content.push(localize('replace.header', "Accessibility Help: Editor Find and Replace"));
			content.push(localize('replace.context', "You are in the Find and Replace dialog for the active editor. This dialog lets you locate text and replace it. The editor is a separate surface that shows each match and the surrounding context."));
			content.push('');

			// Current Search Status
			content.push(localize('replace.statusHeader', "Current Search Status:"));
			if (searchString) {
				content.push(localize('replace.searchTerm', "You are searching for: \"{0}\".", searchString));
				if (matchCount !== undefined && matchPosition !== undefined) {
					if (matchCount === 0) {
						content.push(localize('replace.noMatches', "No matches found in the current file. Try adjusting your search text or the options below."));
					} else {
						content.push(localize('replace.matchStatus', "Match {0} of {1}.", matchPosition, matchCount));
					}
				}
			} else {
				content.push(localize('replace.noSearchTerm', "No search text entered yet. Start typing to find matches in the editor."));
			}

			const replaceString = state.replaceString;
			if (replaceString) {
				content.push(localize('replace.replaceText', "Replacement text: \"{0}\".", replaceString));
			} else {
				content.push(localize('replace.noReplaceText', "No replacement text entered yet. Press Tab to move to the Replace input and type your replacement."));
			}
			content.push('');

			// Inside the Find and Replace Dialog
			content.push(localize('replace.dialogHeader', "Inside the Find and Replace Dialog (What It Does):"));
			content.push(localize('replace.dialogDesc', "While you are in either input, your focus stays in that input. You can type, edit, or navigate matches without leaving. When you navigate to a match from the Find input, the editor updates in the background, but your focus remains in the dialog. Tab moves you from Find to Replace and back."));
			content.push('');

			// What You Hear
			content.push(localize('replace.hearHeader', "What You Hear Each Time You Move to a Match:"));
			content.push(localize('replace.hearDesc', "Each navigation step gives you a complete spoken update:"));
			content.push(localize('replace.hear1', "1) The full line that contains the match is read first, so you get immediate context."));
			content.push(localize('replace.hear2', "2) Your position among the matches is announced, so you know how far you are through the results."));
			content.push(localize('replace.hear3', "3) The exact line and column are announced, so you know precisely where the match is in the file."));
			content.push('');

			// Focus Behavior
			content.push(localize('replace.focusHeader', "Focus Behavior (Important):"));
			content.push(localize('replace.focusDesc1', "When you navigate from inside the Find dialog, the editor updates while your focus stays in the input. This is intentional, so you can keep adjusting your search without losing your place."));
			content.push(localize('replace.focusDesc2', "When you replace from the Replace input, the match is replaced and focus moves to the next match. If you have replaced all matches, the dialog remains open."));
			content.push(localize('replace.focusDesc3', "If you want to move focus into the editor to edit text, press Escape to close the dialog. Focus returns to the editor at the last replacement location."));
			content.push('');

			// Keyboard Navigation Summary
			content.push(localize('replace.keyboardHeader', "Keyboard Navigation Summary:"));
			content.push('');
			content.push(localize('replace.keyNavFindHeader', "While focused IN the Find input:"));
			content.push(localize('replace.keyEnter', "- Enter: Move to the next match while staying in Find."));
			content.push(localize('replace.keyShiftEnter', "- Shift+Enter: Move to the previous match while staying in Find."));
			content.push(localize('replace.keyTab', "- Tab: Move between Find and Replace inputs."));
			content.push('');
			content.push(localize('replace.keyNavReplaceHeader', "While focused IN the Replace input:"));
			content.push(localize('replace.keyReplaceEnter', "- Enter: Replace the current match and move to the next."));
			content.push(localize('replace.keyReplaceOne', "- {0}: Replace only the current match.", '<keybinding:editor.action.replaceOne>'));
			content.push(localize('replace.keyReplaceAll', "- {0}: Replace all matches at once.", '<keybinding:editor.action.replaceAll>'));
			content.push('');
			content.push(localize('replace.keyNavEditorHeader', "While focused IN the editor (not the Find input):"));
			content.push(localize('replace.keyF3', "- {0}: Move to the next match.", '<keybinding:editor.action.nextMatchFindAction>'));
			content.push(localize('replace.keyShiftF3', "- {0}: Move to the previous match.", '<keybinding:editor.action.previousMatchFindAction>'));
			content.push('');
			content.push(localize('replace.keyNavNote', "Note: Don't press Enter or Shift+Enter when focused in the editor - these will insert line breaks instead of navigating."));
			content.push('');

			// Find and Replace Options
			content.push(localize('replace.optionsHeader', "Find and Replace Options in the Dialog:"));
			content.push(localize('replace.optionCase', "- Match Case: Only exact case matches are included."));
			content.push(localize('replace.optionWord', "- Whole Word: Only full words are matched."));
			content.push(localize('replace.optionRegex', "- Regular Expression: Use pattern matching for advanced searches."));
			content.push(localize('replace.optionSelection', "- Find in Selection: Limit matches to the current selection."));
			content.push(localize('replace.optionPreserve', "- Preserve Case: When replacing, maintains the case of the original match."));
			content.push('');

			// Settings
			content.push(localize('replace.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
			content.push(localize('replace.settingsIntro', "These settings affect how Find and Replace behave or how matches are highlighted."));
			content.push(localize('replace.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the Find and Replace inputs announce the Accessibility Help hint."));
			content.push(localize('replace.settingFindOnType', "- `editor.find.findOnType`: Runs Find as you type."));
			content.push(localize('replace.settingCursorMove', "- `editor.find.cursorMoveOnType`: Moves the cursor to the best match while you type."));
			content.push(localize('replace.settingSeed', "- `editor.find.seedSearchStringFromSelection`: Controls when selection text is used to seed Find."));
			content.push(localize('replace.settingAutoSelection', "- `editor.find.autoFindInSelection`: Automatically enables Find in Selection based on selection type."));
			content.push(localize('replace.settingLoop', "- `editor.find.loop`: Wraps search at the beginning or end of the file."));
			content.push(localize('replace.settingExtraSpace', "- `editor.find.addExtraSpaceOnTop`: Adds extra scroll space so matches are not hidden behind the Find and Replace dialog."));
			content.push(localize('replace.settingFindHistory', "- `editor.find.history`: Controls whether Find search history is stored."));
			content.push(localize('replace.settingReplaceHistory', "- `editor.find.replaceHistory`: Controls whether Replace history is stored."));
			content.push(localize('replace.settingOccurrences', "- `editor.occurrencesHighlight`: Highlights other occurrences of the current symbol."));
			content.push(localize('replace.settingOccurrencesDelay', "- `editor.occurrencesHighlightDelay`: Controls how soon occurrences are highlighted."));
			content.push(localize('replace.settingSelectionHighlight', "- `editor.selectionHighlight`: Highlights other matches of the current selection."));
			content.push(localize('replace.settingSelectionMaxLength', "- `editor.selectionHighlightMaxLength`: Limits selection highlight length."));
			content.push(localize('replace.settingSelectionMultiline', "- `editor.selectionHighlightMultiline`: Controls whether multi-line selections are highlighted."));

			// Platform-specific setting
			if (isMacintosh) {
				content.push('');
				content.push(localize('replace.macSettingHeader', "Platform-Specific Setting (macOS only):"));
				content.push(localize('replace.macSetting', "- `editor.find.globalFindClipboard`: Uses the shared macOS Find clipboard when available."));
			}

			content.push('');
			content.push(localize('replace.closingHeader', "Closing:"));
			content.push(localize('replace.closingDesc', "Press Escape to close Find and Replace. Focus returns to the editor at the last replacement location, and your search and replace history is preserved."));
		} else {
			// ========== FIND-ONLY MODE CONTENT ==========
			content.push(localize('find.header', "Accessibility Help: Editor Find"));
			content.push(localize('find.context', "You are in the Find dialog for the active editor. This dialog is where you type what you want to locate. The editor is a separate surface that shows each match and its surrounding context."));
			content.push('');

			// Current Search Status
			content.push(localize('find.statusHeader', "Current Search Status:"));
			if (searchString) {
				content.push(localize('find.searchTerm', "You are searching for: \"{0}\".", searchString));
				if (matchCount !== undefined && matchPosition !== undefined) {
					if (matchCount === 0) {
						content.push(localize('find.noMatches', "No matches found in the current file. Try adjusting your search text or the options below."));
					} else {
						content.push(localize('find.matchStatus', "Match {0} of {1}.", matchPosition, matchCount));
					}
				}
			} else {
				content.push(localize('find.noSearchTerm', "No search text entered yet. Start typing to find matches in the editor."));
			}
			content.push('');

			// Inside the Find Dialog
			content.push(localize('find.dialogHeader', "Inside the Find Dialog (What It Does):"));
			content.push(localize('find.dialogDesc', "While you are in the Find dialog, your focus stays in the input. You can keep typing, edit your search text, or move through matches without leaving the dialog. When you navigate to a match from here, the editor updates in the background, but your focus remains in the Find dialog."));
			content.push('');

			// What You Hear
			content.push(localize('find.hearHeader', "What You Hear Each Time You Move to a Match:"));
			content.push(localize('find.hearDesc', "Each navigation step gives you a complete spoken update so you always know where you are. The order is consistent:"));
			content.push(localize('find.hear1', "1) The full line that contains the match is read first, so you get immediate context."));
			content.push(localize('find.hear2', "2) Your position among the matches is announced, so you know how far you are through the results."));
			content.push(localize('find.hear3', "3) The exact line and column are announced, so you know precisely where the match is in the file."));
			content.push(localize('find.hearConclusion', "This sequence happens every time you move forward or backward."));
			content.push('');

			// Outside the Find Dialog
			content.push(localize('find.outsideHeader', "Outside the Find Dialog (Inside the Editor):"));
			content.push(localize('find.outsideDesc', "When you are focused in the editor instead of the Find dialog, you can still navigate matches."));
			content.push(localize('find.outsideF3', "- Press {0} to move to the next match.", '<keybinding:editor.action.nextMatchFindAction>'));
			content.push(localize('find.outsideShiftF3', "- Press {0} to move to the previous match.", '<keybinding:editor.action.previousMatchFindAction>'));
			content.push(localize('find.outsideConclusion', "You hear the same three-step sequence: full line, match position, then line and column."));
			content.push('');

			// Focus Behavior
			content.push(localize('find.focusHeader', "Focus Behavior (Important):"));
			content.push(localize('find.focusDesc1', "When you navigate from inside the Find dialog, the editor updates while your focus stays in the input. This is intentional, so you can keep adjusting your search without losing your place."));
			content.push(localize('find.focusDesc2', "If you want to move focus into the editor to edit text or inspect surrounding code, press Escape to close Find. Focus returns to the editor at the most recent match."));
			content.push('');

			// Keyboard Navigation Summary
			content.push(localize('find.keyboardHeader', "Keyboard Navigation Summary:"));
			content.push('');
			content.push(localize('find.keyNavFindHeader', "While focused IN the Find input:"));
			content.push(localize('find.keyEnter', "- Enter: Move to the next match while staying in the Find dialog."));
			content.push(localize('find.keyShiftEnter', "- Shift+Enter: Move to the previous match while staying in the Find dialog."));
			content.push('');
			content.push(localize('find.keyNavEditorHeader', "While focused IN the editor (not the Find input):"));
			content.push(localize('find.keyF3', "- {0}: Move to the next match.", '<keybinding:editor.action.nextMatchFindAction>'));
			content.push(localize('find.keyShiftF3', "- {0}: Move to the previous match.", '<keybinding:editor.action.previousMatchFindAction>'));
			content.push('');
			content.push(localize('find.keyNavNote', "Note: Don't press Enter or Shift+Enter when focused in the editor - these will insert line breaks instead of navigating."));
			content.push('');

			// Find Options
			content.push(localize('find.optionsHeader', "Find Options in the Dialog:"));
			content.push(localize('find.optionCase', "- Match Case: Only exact case matches are included."));
			content.push(localize('find.optionWord', "- Whole Word: Only full words are matched."));
			content.push(localize('find.optionRegex', "- Regular Expression: Use pattern matching for advanced searches."));
			content.push(localize('find.optionSelection', "- Find in Selection: Limit matches to the current selection."));
			content.push('');

			// Settings
			content.push(localize('find.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
			content.push(localize('find.settingsIntro', "These settings affect how Find behaves or how matches are highlighted."));
			content.push(localize('find.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the Find input announces the Accessibility Help hint."));
			content.push(localize('find.settingFindOnType', "- `editor.find.findOnType`: Runs Find as you type."));
			content.push(localize('find.settingCursorMove', "- `editor.find.cursorMoveOnType`: Moves the cursor to the best match while you type."));
			content.push(localize('find.settingSeed', "- `editor.find.seedSearchStringFromSelection`: Controls when selection text is used to seed Find."));
			content.push(localize('find.settingAutoSelection', "- `editor.find.autoFindInSelection`: Automatically enables Find in Selection based on selection type."));
			content.push(localize('find.settingLoop', "- `editor.find.loop`: Wraps search at the beginning or end of the file."));
			content.push(localize('find.settingExtraSpace', "- `editor.find.addExtraSpaceOnTop`: Adds extra scroll space so matches are not hidden behind the Find dialog."));
			content.push(localize('find.settingHistory', "- `editor.find.history`: Controls whether Find search history is stored."));
			content.push(localize('find.settingOccurrences', "- `editor.occurrencesHighlight`: Highlights other occurrences of the current symbol."));
			content.push(localize('find.settingOccurrencesDelay', "- `editor.occurrencesHighlightDelay`: Controls how soon occurrences are highlighted."));
			content.push(localize('find.settingSelectionHighlight', "- `editor.selectionHighlight`: Highlights other matches of the current selection."));
			content.push(localize('find.settingSelectionMaxLength', "- `editor.selectionHighlightMaxLength`: Limits selection highlight length."));
			content.push(localize('find.settingSelectionMultiline', "- `editor.selectionHighlightMultiline`: Controls whether multi-line selections are highlighted."));

			// Platform-specific setting
			if (isMacintosh) {
				content.push('');
				content.push(localize('find.macSettingHeader', "Platform-Specific Setting (macOS only):"));
				content.push(localize('find.macSetting', "- `editor.find.globalFindClipboard`: Uses the shared macOS Find clipboard when available."));
			}

			content.push('');
			content.push(localize('find.closingHeader', "Closing:"));
			content.push(localize('find.closingDesc', "Press Escape to close Find. Focus returns to the editor at the most recent match, and your search history is preserved."));
		}

		return content.join('\n');
	}
}

// Register the accessibility help provider
AccessibleViewRegistry.register(new EditorFindAccessibilityHelp());
