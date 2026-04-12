/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { accessibleViewIsShown, accessibleViewCurrentProviderId } from '../../../accessibility/browser/accessibilityConfiguration.js';
export var ClassName;
(function (ClassName) {
    ClassName["Active"] = "active";
    ClassName["EditorTextArea"] = "textarea";
})(ClassName || (ClassName = {}));
let TerminalAccessibilityHelpProvider = class TerminalAccessibilityHelpProvider extends Disposable {
    onClose() {
        const expr = ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "terminal-help" /* AccessibleViewProviderId.TerminalHelp */));
        if (expr?.evaluate(this._contextKeyService.getContext(null))) {
            this._commandService.executeCommand("workbench.action.terminal.focusAccessibleBuffer" /* TerminalAccessibilityCommandId.FocusAccessibleBuffer */);
        }
        else {
            this._instance.focus();
        }
        this.dispose();
    }
    constructor(_instance, _xterm, _commandService, _configurationService, _contextKeyService) {
        super();
        this._instance = _instance;
        this._commandService = _commandService;
        this._configurationService = _configurationService;
        this._contextKeyService = _contextKeyService;
        this.id = "terminal-help" /* AccessibleViewProviderId.TerminalHelp */;
        this._hasShellIntegration = false;
        this.options = {
            type: "help" /* AccessibleViewType.Help */,
            readMoreUrl: 'https://code.visualstudio.com/docs/editor/accessibility#_terminal-accessibility'
        };
        this.verbositySettingKey = "accessibility.verbosity.terminal" /* AccessibilityVerbositySettingId.Terminal */;
        this._hasShellIntegration = _xterm.shellIntegration.status === 2 /* ShellIntegrationStatus.VSCode */;
    }
    provideContent() {
        const content = [
            localize('focusAccessibleTerminalView', 'The Focus Accessible Terminal View command<keybinding:{0}> enables screen readers to read terminal contents.', "workbench.action.terminal.focusAccessibleBuffer" /* TerminalAccessibilityCommandId.FocusAccessibleBuffer */),
            localize('preserveCursor', 'Customize the behavior of the cursor when toggling between the terminal and accessible view with `terminal.integrated.accessibleViewPreserveCursorPosition.`'),
            localize('openDetectedLink', 'The Open Detected Link command<keybinding:{0}> enables screen readers to easily open links found in the terminal.', "workbench.action.terminal.openDetectedLink" /* TerminalLinksCommandId.OpenDetectedLink */),
            localize('newWithProfile', 'The Create New Terminal (With Profile) command<keybinding:{0}> allows for easy terminal creation using a specific profile.', "workbench.action.terminal.newWithProfile" /* TerminalCommandId.NewWithProfile */),
            localize('focusAfterRun', 'Configure what gets focused after running selected text in the terminal with `{0}`.', "terminal.integrated.focusAfterRun" /* TerminalSettingId.FocusAfterRun */),
        ];
        if (!this._configurationService.getValue("terminal.integrated.accessibleViewFocusOnCommandExecution" /* TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution */)) {
            content.push(localize('focusViewOnExecution', 'Enable `terminal.integrated.accessibleViewFocusOnCommandExecution` to automatically focus the terminal accessible view when a command is executed in the terminal.'));
        }
        if (this._configurationService.getValue("terminal.integrated.suggest.enabled" /* TerminalSuggestSettingId.Enabled */)) {
            content.push(localize('suggestTrigger', 'The terminal request completions command can be invoked manually<keybinding:{0}>, but also appears while typing.', "workbench.action.terminal.triggerSuggest" /* TerminalSuggestCommandId.TriggerSuggest */));
            content.push(localize('suggest', 'When the terminal suggest widget is focused:'));
            content.push(localize('suggestCommands', '- Accept the suggestion<keybinding:{0}> and configure suggest settings<keybinding:{1}>.', "workbench.action.terminal.acceptSelectedSuggestion" /* TerminalSuggestCommandId.AcceptSelectedSuggestion */, "workbench.action.terminal.configureSuggestSettings" /* TerminalSuggestCommandId.ConfigureSettings */));
            content.push(localize('suggestCommandsMore', '- Toggle between the widget and terminal<keybinding:{0}> and toggle details focus<keybinding:{1}> to learn more about the suggestion.', "workbench.action.terminal.suggestToggleDetails" /* TerminalSuggestCommandId.ToggleDetails */, "workbench.action.terminal.suggestToggleDetailsFocus" /* TerminalSuggestCommandId.ToggleDetailsFocus */));
            content.push(localize('suggestLearnMore', '- Learn more about the suggestion<keybinding:{0}>.', "workbench.action.terminal.suggestLearnMore" /* TerminalSuggestCommandId.LearnMore */));
            content.push(localize('suggestConfigure', '-Configure suggest settings<keybinding:{0}> ', "workbench.action.terminal.configureSuggestSettings" /* TerminalSuggestCommandId.ConfigureSettings */));
        }
        if (this._instance.shellType === "cmd" /* WindowsShellType.CommandPrompt */) {
            content.push(localize('commandPromptMigration', "Consider using powershell instead of command prompt for an improved experience"));
        }
        if (this._hasShellIntegration) {
            content.push(localize('shellIntegration', "The terminal has a feature called shell integration that offers an enhanced experience and provides useful commands for screen readers such as:"));
            content.push('- ' + localize('goToNextCommand', 'Go to Next Command<keybinding:{0}> in the accessible view', "workbench.action.terminal.accessibleBufferGoToNextCommand" /* TerminalAccessibilityCommandId.AccessibleBufferGoToNextCommand */));
            content.push('- ' + localize('goToPreviousCommand', 'Go to Previous Command<keybinding:{0}> in the accessible view', "workbench.action.terminal.accessibleBufferGoToPreviousCommand" /* TerminalAccessibilityCommandId.AccessibleBufferGoToPreviousCommand */));
            content.push('- ' + localize('goToSymbol', 'Go to Symbol<keybinding:{0}>', "editor.action.accessibleViewGoToSymbol" /* AccessibilityCommandId.GoToSymbol */));
            content.push('- ' + localize('runRecentCommand', 'Run Recent Command<keybinding:{0}>', "workbench.action.terminal.runRecentCommand" /* TerminalHistoryCommandId.RunRecentCommand */));
            content.push('- ' + localize('goToRecentDirectory', 'Go to Recent Directory<keybinding:{0}>', "workbench.action.terminal.goToRecentDirectory" /* TerminalHistoryCommandId.GoToRecentDirectory */));
        }
        else {
            content.push(localize('noShellIntegration', 'Shell integration is not enabled. Some accessibility features may not be available.'));
        }
        return content.join('\n');
    }
};
TerminalAccessibilityHelpProvider = __decorate([
    __param(2, ICommandService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService)
], TerminalAccessibilityHelpProvider);
export { TerminalAccessibilityHelpProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxBY2Nlc3NpYmlsaXR5SGVscC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvdGVybWluYWxBY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFNN0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFLdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLCtCQUErQixFQUFtQyxNQUFNLDhEQUE4RCxDQUFDO0FBS3ZLLE1BQU0sQ0FBTixJQUFrQixTQUdqQjtBQUhELFdBQWtCLFNBQVM7SUFDMUIsOEJBQWlCLENBQUE7SUFDakIsd0NBQTJCLENBQUE7QUFDNUIsQ0FBQyxFQUhpQixTQUFTLEtBQVQsU0FBUyxRQUcxQjtBQUVNLElBQU0saUNBQWlDLEdBQXZDLE1BQU0saUNBQWtDLFNBQVEsVUFBVTtJQUdoRSxPQUFPO1FBQ04sTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLCtCQUErQixDQUFDLEdBQUcsOERBQXdDLENBQUMsQ0FBQztRQUMxSixJQUFJLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxF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