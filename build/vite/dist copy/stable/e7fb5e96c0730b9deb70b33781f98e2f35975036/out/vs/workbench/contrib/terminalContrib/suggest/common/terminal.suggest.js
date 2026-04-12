/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export var TerminalSuggestCommandId;
(function (TerminalSuggestCommandId) {
    TerminalSuggestCommandId["SelectPrevSuggestion"] = "workbench.action.terminal.selectPrevSuggestion";
    TerminalSuggestCommandId["SelectPrevPageSuggestion"] = "workbench.action.terminal.selectPrevPageSuggestion";
    TerminalSuggestCommandId["SelectNextSuggestion"] = "workbench.action.terminal.selectNextSuggestion";
    TerminalSuggestCommandId["SelectNextPageSuggestion"] = "workbench.action.terminal.selectNextPageSuggestion";
    TerminalSuggestCommandId["AcceptSelectedSuggestion"] = "workbench.action.terminal.acceptSelectedSuggestion";
    TerminalSuggestCommandId["AcceptSelectedSuggestionEnter"] = "workbench.action.terminal.acceptSelectedSuggestionEnter";
    TerminalSuggestCommandId["ChangeSelectionModeNever"] = "workbench.action.terminal.changeSelectionModeNever";
    TerminalSuggestCommandId["ChangeSelectionModePartial"] = "workbench.action.terminal.changeSelectionModePartial";
    TerminalSuggestCommandId["ChangeSelectionModeAlways"] = "workbench.action.terminal.changeSelectionModeAlways";
    TerminalSuggestCommandId["HideSuggestWidget"] = "workbench.action.terminal.hideSuggestWidget";
    TerminalSuggestCommandId["HideSuggestWidgetAndNavigateHistory"] = "workbench.action.terminal.hideSuggestWidgetAndNavigateHistory";
    TerminalSuggestCommandId["TriggerSuggest"] = "workbench.action.terminal.triggerSuggest";
    TerminalSuggestCommandId["ResetWidgetSize"] = "workbench.action.terminal.resetSuggestWidgetSize";
    TerminalSuggestCommandId["ToggleDetails"] = "workbench.action.terminal.suggestToggleDetails";
    TerminalSuggestCommandId["ToggleDetailsFocus"] = "workbench.action.terminal.suggestToggleDetailsFocus";
    TerminalSuggestCommandId["ConfigureSettings"] = "workbench.action.terminal.configureSuggestSettings";
    TerminalSuggestCommandId["LearnMore"] = "workbench.action.terminal.suggestLearnMore";
    TerminalSuggestCommandId["ResetDiscoverability"] = "workbench.action.terminal.resetDiscoverability";
    TerminalSuggestCommandId["ShowOnType"] = "workbench.action.terminal.showSuggestOnType";
    TerminalSuggestCommandId["DoNotShowOnType"] = "workbench.action.terminal.doNotShowSuggestOnType";
})(TerminalSuggestCommandId || (TerminalSuggestCommandId = {}));
export const defaultTerminalSuggestCommandsToSkipShell = [
    "workbench.action.terminal.selectPrevSuggestion" /* TerminalSuggestCommandId.SelectPrevSuggestion */,
    "workbench.action.terminal.selectPrevPageSuggestion" /* TerminalSuggestCommandId.SelectPrevPageSuggestion */,
    "workbench.action.terminal.selectNextSuggestion" /* TerminalSuggestCommandId.SelectNextSuggestion */,
    "workbench.action.terminal.selectNextPageSuggestion" /* TerminalSuggestCommandId.SelectNextPageSuggestion */,
    "workbench.action.terminal.acceptSelectedSuggestion" /* TerminalSuggestCommandId.AcceptSelectedSuggestion */,
    "workbench.action.terminal.acceptSelectedSuggestionEnter" /* TerminalSuggestCommandId.AcceptSelectedSuggestionEnter */,
    "workbench.action.terminal.hideSuggestWidget" /* TerminalSuggestCommandId.HideSuggestWidget */,
    "workbench.action.terminal.triggerSuggest" /* TerminalSuggestCommandId.TriggerSuggest */,
    "workbench.action.terminal.suggestToggleDetails" /* TerminalSuggestCommandId.ToggleDetails */,
    "workbench.action.terminal.suggestToggleDetailsFocus" /* TerminalSuggestCommandId.ToggleDetailsFocus */,
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuc3VnZ2VzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zdWdnZXN0L2NvbW1vbi90ZXJtaW5hbC5zdWdnZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sQ0FBTixJQUFrQix3QkFxQmpCO0FBckJELFdBQWtCLHdCQUF3QjtJQUN6QyxtR0FBdUUsQ0FBQTtJQUN2RSwyR0FBK0UsQ0FBQTtJQUMvRSxtR0FBdUUsQ0FBQTtJQUN2RSwyR0FBK0UsQ0FBQTtJQUMvRSwyR0FBK0UsQ0FBQTtJQUMvRSxxSEFBeUYsQ0FBQTtJQUN6RiwyR0FBK0UsQ0FBQTtJQUMvRSwrR0FBbUYsQ0FBQTtJQUNuRiw2R0FBaUYsQ0FBQTtJQUNqRiw2RkFBaUUsQ0FBQTtJQUNqRSxpSUFBcUcsQ0FBQTtJQUNyRyx1RkFBMkQsQ0FBQTtJQUMzRCxnR0FBb0UsQ0FBQTtJQUNwRSw0RkFBZ0UsQ0FBQTtJQUNoRSxzR0FBMEUsQ0FBQTtJQUMxRSxvR0FBd0UsQ0FBQTtJQUN4RSxvRkFBd0QsQ0FBQTtJQUN4RCxtR0FBdUUsQ0FBQTtJQUN2RSxzRkFBMEQsQ0FBQTtJQUMxRCxnR0FBb0UsQ0FBQTtBQUNyRSxDQUFDLEVBckJpQix3QkFBd0IsS0FBeEIsd0JBQXdCLFFBcUJ6QztBQUVELE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHOzs7Ozs7Ozs7OztDQVd4RCxDQUFDIn0=