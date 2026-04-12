/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { TERMINAL_VIEW_ID } from './terminal.js';
export var TerminalContextKeyStrings;
(function (TerminalContextKeyStrings) {
    TerminalContextKeyStrings["IsOpen"] = "terminalIsOpen";
    TerminalContextKeyStrings["Count"] = "terminalCount";
    TerminalContextKeyStrings["GroupCount"] = "terminalGroupCount";
    TerminalContextKeyStrings["TabsNarrow"] = "isTerminalTabsNarrow";
    TerminalContextKeyStrings["HasFixedWidth"] = "terminalHasFixedWidth";
    TerminalContextKeyStrings["ProcessSupported"] = "terminalProcessSupported";
    TerminalContextKeyStrings["Focus"] = "terminalFocus";
    TerminalContextKeyStrings["FocusInAny"] = "terminalFocusInAny";
    TerminalContextKeyStrings["AccessibleBufferFocus"] = "terminalAccessibleBufferFocus";
    TerminalContextKeyStrings["AccessibleBufferOnLastLine"] = "terminalAccessibleBufferOnLastLine";
    TerminalContextKeyStrings["EditorFocus"] = "terminalEditorFocus";
    TerminalContextKeyStrings["TabsFocus"] = "terminalTabsFocus";
    TerminalContextKeyStrings["WebExtensionContributedProfile"] = "terminalWebExtensionContributedProfile";
    TerminalContextKeyStrings["TerminalHasBeenCreated"] = "terminalHasBeenCreated";
    TerminalContextKeyStrings["TerminalEditorActive"] = "terminalEditorActive";
    TerminalContextKeyStrings["TabsMouse"] = "terminalTabsMouse";
    TerminalContextKeyStrings["AltBufferActive"] = "terminalAltBufferActive";
    TerminalContextKeyStrings["SuggestWidgetVisible"] = "terminalSuggestWidgetVisible";
    TerminalContextKeyStrings["A11yTreeFocus"] = "terminalA11yTreeFocus";
    TerminalContextKeyStrings["ViewShowing"] = "terminalViewShowing";
    TerminalContextKeyStrings["TextSelected"] = "terminalTextSelected";
    TerminalContextKeyStrings["TextSelectedInFocused"] = "terminalTextSelectedInFocused";
    TerminalContextKeyStrings["FindVisible"] = "terminalFindVisible";
    TerminalContextKeyStrings["FindInputFocused"] = "terminalFindInputFocused";
    TerminalContextKeyStrings["FindFocused"] = "terminalFindFocused";
    TerminalContextKeyStrings["TabsSingularSelection"] = "terminalTabsSingularSelection";
    TerminalContextKeyStrings["SplitTerminal"] = "terminalSplitTerminal";
    TerminalContextKeyStrings["SplitPaneActive"] = "terminalSplitPaneActive";
    TerminalContextKeyStrings["ShellType"] = "terminalShellType";
    TerminalContextKeyStrings["InTerminalRunCommandPicker"] = "inTerminalRunCommandPicker";
    TerminalContextKeyStrings["TerminalShellIntegrationEnabled"] = "terminalShellIntegrationEnabled";
    TerminalContextKeyStrings["DictationInProgress"] = "terminalDictationInProgress";
})(TerminalContextKeyStrings || (TerminalContextKeyStrings = {}));
export var TerminalContextKeys;
(function (TerminalContextKeys) {
    /** Whether there is at least one opened terminal. */
    TerminalContextKeys.isOpen = new RawContextKey("terminalIsOpen" /* TerminalContextKeyStrings.IsOpen */, false, true);
    /** Whether the terminal is focused. */
    TerminalContextKeys.focus = new RawContextKey("terminalFocus" /* TerminalContextKeyStrings.Focus */, false, localize('terminalFocusContextKey', "Whether the terminal is focused."));
    /** Whether any terminal is focused, including detached terminals used in other UI. */
    TerminalContextKeys.focusInAny = new RawContextKey("terminalFocusInAny" /* TerminalContextKeyStrings.FocusInAny */, false, localize('terminalFocusInAnyContextKey', "Whether any terminal is focused, including detached terminals used in other UI."));
    /** Whether a terminal in the editor area is focused. */
    TerminalContextKeys.editorFocus = new RawContextKey("terminalEditorFocus" /* TerminalContextKeyStrings.EditorFocus */, false, localize('terminalEditorFocusContextKey', "Whether a terminal in the editor area is focused."));
    /** The current number of terminals. */
    TerminalContextKeys.count = new RawContextKey("terminalCount" /* TerminalContextKeyStrings.Count */, 0, localize('terminalCountContextKey', "The current number of terminals."));
    /** The current number of terminal groups. */
    TerminalContextKeys.groupCount = new RawContextKey("terminalGroupCount" /* TerminalContextKeyStrings.GroupCount */, 0, true);
    /** Whether the terminal tabs view is narrow. */
    TerminalContextKeys.tabsNarrow = new RawContextKey("isTerminalTabsNarrow" /* TerminalContextKeyStrings.TabsNarrow */, false, true);
    /** Whether the terminal tabs view is narrow. */
    TerminalContextKeys.terminalHasFixedWidth = new RawContextKey("terminalHasFixedWidth" /* TerminalContextKeyStrings.HasFixedWidth */, false, true);
    /** Whether the terminal tabs widget is focused. */
    TerminalContextKeys.tabsFocus = new RawContextKey("terminalTabsFocus" /* TerminalContextKeyStrings.TabsFocus */, false, localize('terminalTabsFocusContextKey', "Whether the terminal tabs widget is focused."));
    /** Whether a web extension has contributed a profile */
    TerminalContextKeys.webExtensionContributedProfile = new RawContextKey("terminalWebExtensionContributedProfile" /* TerminalContextKeyStrings.WebExtensionContributedProfile */, false, true);
    /** Whether at least one terminal has been created */
    TerminalContextKeys.terminalHasBeenCreated = new RawContextKey("terminalHasBeenCreated" /* TerminalContextKeyStrings.TerminalHasBeenCreated */, false, true);
    /** Whether at least one terminal has been created */
    TerminalContextKeys.terminalEditorActive = new RawContextKey("terminalEditorActive" /* TerminalContextKeyStrings.TerminalEditorActive */, false, true);
    /** Whether the mouse is within the terminal tabs list. */
    TerminalContextKeys.tabsMouse = new RawContextKey("terminalTabsMouse" /* TerminalContextKeyStrings.TabsMouse */, false, true);
    /** The shell type of the active terminal, this is set if the type can be detected. */
    TerminalContextKeys.shellType = new RawContextKey("terminalShellType" /* TerminalContextKeyStrings.ShellType */, undefined, { type: 'string', description: localize('terminalShellTypeContextKey', "The shell type of the active terminal, this is set if the type can be detected.") });
    /** Whether the terminal's alt buffer is active. */
    TerminalContextKeys.altBufferActive = new RawContextKey("terminalAltBufferActive" /* TerminalContextKeyStrings.AltBufferActive */, false, localize('terminalAltBufferActive', "Whether the terminal's alt buffer is active."));
    /** Whether the terminal's suggest widget is visible. */
    TerminalContextKeys.suggestWidgetVisible = new RawContextKey("terminalSuggestWidgetVisible" /* TerminalContextKeyStrings.SuggestWidgetVisible */, false, localize('terminalSuggestWidgetVisible', "Whether the terminal's suggest widget is visible."));
    /** Whether the terminal is NOT focused. */
    TerminalContextKeys.notFocus = TerminalContextKeys.focus.toNegated();
    /** Whether the terminal view is showing. */
    TerminalContextKeys.viewShowing = new RawContextKey("terminalViewShowing" /* TerminalContextKeyStrings.ViewShowing */, false, localize('terminalViewShowing', "Whether the terminal view is showing"));
    /** Whether text is selected in the active terminal. */
    TerminalContextKeys.textSelected = new RawContextKey("terminalTextSelected" /* TerminalContextKeyStrings.TextSelected */, false, localize('terminalTextSelectedContextKey', "Whether text is selected in the active terminal."));
    /** Whether text is selected in a focused terminal. `textSelected` counts text selected in an active in a terminal view or an editor, where `textSelectedInFocused` simply counts text in an element with DOM focus. */
    TerminalContextKeys.textSelectedInFocused = new RawContextKey("terminalTextSelectedInFocused" /* TerminalContextKeyStrings.TextSelectedInFocused */, false, localize('terminalTextSelectedInFocusedContextKey', "Whether text is selected in a focused terminal."));
    /** Whether text is NOT selected in the active terminal. */
    TerminalContextKeys.notTextSelected = TerminalContextKeys.textSelected.toNegated();
    /** Whether the active terminal's find widget is visible. */
    TerminalContextKeys.findVisible = new RawContextKey("terminalFindVisible" /* TerminalContextKeyStrings.FindVisible */, false, true);
    /** Whether the active terminal's find widget is NOT visible. */
    TerminalContextKeys.notFindVisible = TerminalContextKeys.findVisible.toNegated();
    /** Whether the active terminal's find widget text input is focused. */
    TerminalContextKeys.findInputFocus = new RawContextKey("terminalFindInputFocused" /* TerminalContextKeyStrings.FindInputFocused */, false, true);
    /** Whether an element within the active terminal's find widget is focused. */
    TerminalContextKeys.findFocus = new RawContextKey("terminalFindFocused" /* TerminalContextKeyStrings.FindFocused */, false, true);
    /** Whether NO elements within the active terminal's find widget is focused. */
    TerminalContextKeys.notFindFocus = TerminalContextKeys.findInputFocus.toNegated();
    /** Whether terminal processes can be launched in the current workspace. */
    TerminalContextKeys.processSupported = new RawContextKey("terminalProcessSupported" /* TerminalContextKeyStrings.ProcessSupported */, false, localize('terminalProcessSupportedContextKey', "Whether terminal processes can be launched in the current workspace."));
    /** Whether one terminal is selected in the terminal tabs list. */
    TerminalContextKeys.tabsSingularSelection = new RawContextKey("terminalTabsSingularSelection" /* TerminalContextKeyStrings.TabsSingularSelection */, false, localize('terminalTabsSingularSelectedContextKey', "Whether one terminal is selected in the terminal tabs list."));
    /** Whether the focused tab's terminal is a split terminal. */
    TerminalContextKeys.splitTerminalTabFocused = new RawContextKey("terminalSplitTerminal" /* TerminalContextKeyStrings.SplitTerminal */, false, localize('isSplitTerminalContextKey', "Whether the focused tab's terminal is a split terminal."));
    /** Whether the active terminal is a split pane */
    TerminalContextKeys.splitTerminalActive = new RawContextKey("terminalSplitPaneActive" /* TerminalContextKeyStrings.SplitPaneActive */, false, localize('splitPaneActive', "Whether the active terminal is a split pane."));
    /** Whether the terminal run command picker is currently open. */
    TerminalContextKeys.inTerminalRunCommandPicker = new RawContextKey("inTerminalRunCommandPicker" /* TerminalContextKeyStrings.InTerminalRunCommandPicker */, false, localize('inTerminalRunCommandPickerContextKey', "Whether the terminal run command picker is currently open."));
    /** Whether shell integration is enabled in the active terminal. This only considers full VS Code shell integration. */
    TerminalContextKeys.terminalShellIntegrationEnabled = new RawContextKey("terminalShellIntegrationEnabled" /* TerminalContextKeyStrings.TerminalShellIntegrationEnabled */, false, localize('terminalShellIntegrationEnabled', "Whether shell integration is enabled in the active terminal"));
    /** Whether a speech to text (dictation) session is in progress. */
    TerminalContextKeys.terminalDictationInProgress = new RawContextKey("terminalDictationInProgress" /* TerminalContextKeyStrings.DictationInProgress */, false);
    TerminalContextKeys.shouldShowViewInlineActions = ContextKeyExpr.and(ContextKeyExpr.equals('view', TERMINAL_VIEW_ID), ContextKeyExpr.notEquals(`config.${"terminal.integrated.tabs.hideCondition" /* TerminalSettingId.TabsHideCondition */}`, 'never'), ContextKeyExpr.not("hasHiddenChatTerminals" /* TerminalContribContextKeyStrings.ChatHasHiddenTerminals */), ContextKeyExpr.or(ContextKeyExpr.not(`config.${"terminal.integrated.tabs.enabled" /* TerminalSettingId.TabsEnabled */}`), ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.tabs.showActions" /* TerminalSettingId.TabsShowActions */}`, 'singleTerminal'), ContextKeyExpr.equals("terminalGroupCount" /* TerminalContextKeyStrings.GroupCount */, 1)), ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.tabs.showActions" /* TerminalSettingId.TabsShowActions */}`, 'singleTerminalOrNarrow'), ContextKeyExpr.or(ContextKeyExpr.equals("terminalGroupCount" /* TerminalContextKeyStrings.GroupCount */, 1), ContextKeyExpr.has("isTerminalTabsNarrow" /* TerminalContextKeyStrings.TabsNarrow */))), ContextKeyExpr.and(ContextKeyExpr.equals(`config.${"terminal.integrated.tabs.showActions" /* TerminalSettingId.TabsShowActions */}`, 'singleGroup'), ContextKeyExpr.equals("terminalGroupCount" /* TerminalContextKeyStrings.GroupCount */, 1)), ContextKeyExpr.equals(`config.${"terminal.integrated.tabs.showActions" /* TerminalSettingId.TabsShowActions */}`, 'always')));
})(TerminalContextKeys || (TerminalContextKeys = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb250ZXh0S2V5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVyRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFHakQsTUFBTSxDQUFOLElBQWtCLHlCQWlDakI7QUFqQ0QsV0FBa0IseUJBQXlCO0lBQzFDLHNEQUF5QixDQUFBO0lBQ3pCLG9EQUF1QixDQUFBO0lBQ3ZCLDhEQUFpQyxDQUFBO0lBQ2pDLGdFQUFtQyxDQUFBO0lBQ25DLG9FQUF1QyxDQUFBO0lBQ3ZDLDBFQUE2QyxDQUFBO0lBQzdDLG9EQUF1QixDQUFBO0lBQ3ZCLDhEQUFpQyxDQUFBO0lBQ2pDLG9GQUF1RCxDQUFBO0lBQ3ZELDhGQUFpRSxDQUFBO0lBQ2pFLGdFQUFtQyxDQUFBO0lBQ25DLDREQUErQixDQUFBO0lBQy9CLHNHQUF5RSxDQUFBO0lBQ3pFLDhFQUFpRCxDQUFBO0lBQ2pELDBFQUE2QyxDQUFBO0lBQzdDLDREQUErQixDQUFBO0lBQy9CLHdFQUEyQyxDQUFBO0lBQzNDLGtGQUFxRCxDQUFBO0lBQ3JELG9FQUF1QyxDQUFBO0lBQ3ZDLGdFQUFtQyxDQUFBO0lBQ25DLGtFQUFxQyxDQUFBO0lBQ3JDLG9GQUF1RCxDQUFBO0lBQ3ZELGdFQUFtQyxDQUFBO0lBQ25DLDBFQUE2QyxDQUFBO0lBQzdDLGdFQUFtQyxDQUFBO0lBQ25DLG9GQUF1RCxDQUFBO0lBQ3ZELG9FQUF1QyxDQUFBO0lBQ3ZDLHdFQUEyQyxDQUFB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