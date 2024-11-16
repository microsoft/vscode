/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ShellIntegrationStatus, TerminalSettingId, WindowsShellType } from '../../../../../platform/terminal/common/terminal.js';
import { AccessibilityCommandId } from '../../../accessibility/common/accessibilityCommands.js';
import { ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { TerminalCommandId } from '../../../terminal/common/terminal.js';
import type { Terminal } from '@xterm/xterm';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalAccessibilitySettingId } from '../common/terminalAccessibilityConfiguration.js';
import { TerminalAccessibilityCommandId } from '../common/terminal.accessibility.js';
import { TerminalLinksCommandId } from '../../links/common/terminal.links.js';
import { IAccessibleViewContentProvider, AccessibleViewProviderId, IAccessibleViewOptions, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { accessibleViewIsShown, accessibleViewCurrentProviderId, AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { TerminalHistoryCommandId } from '../../history/common/terminal.history.js';

export const enum ClassName {
	Active = 'active',
	EditorTextArea = 'textarea'
}

export class TerminalAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	id = AccessibleViewProviderId.TerminalHelp;
	private readonly _hasShellIntegration: boolean = false;
	onClose() {
		const expr = ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.TerminalHelp));
		if (expr?.evaluate(this._contextKeyService.getContext(null))) {
			this._commandService.executeCommand(TerminalAccessibilityCommandId.FocusAccessibleBuffer);
		} else {
			this._instance.focus();
		}
		this.dispose();
	}
	options: IAccessibleViewOptions = {
		type: AccessibleViewType.Help,
		readMoreUrl: 'https://code.visualstudio.com/docs/editor/accessibility#_terminal-accessibility'
	};
	verbositySettingKey = AccessibilityVerbositySettingId.Terminal;

	constructor(
		private readonly _instance: Pick<ITerminalInstance, 'shellType' | 'capabilities' | 'onDidRequestFocus' | 'resource' | 'focus'>,
		_xterm: Pick<IXtermTerminal, 'getFont' | 'shellIntegration'> & { raw: Terminal },
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._hasShellIntegration = _xterm.shellIntegration.status === ShellIntegrationStatus.VSCode;
	}
	provideContent(): string {
		const content = [
			localize('focusAccessibleTerminalView', 'The Focus Accessible Terminal View command<keybinding:{0}> enables screen readers to read terminal contents.', TerminalAccessibilityCommandId.FocusAccessibleBuffer),
			localize('preserveCursor', 'Customize the behavior of the cursor when toggling between the terminal and accessible view with `terminal.integrated.accessibleViewPreserveCursorPosition.`'),
			localize('openDetectedLink', 'The Open Detected Link command<keybinding:{0}> enables screen readers to easily open links found in the terminal.', TerminalLinksCommandId.OpenDetectedLink),
			localize('newWithProfile', 'The Create New Terminal (With Profile) command<keybinding:{0}> allows for easy terminal creation using a specific profile.', TerminalCommandId.NewWithProfile),
			localize('focusAfterRun', 'Configure what gets focused after running selected text in the terminal with `{0}`.', TerminalSettingId.FocusAfterRun)
		];

		if (!this._configurationService.getValue(TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution)) {
			content.push(localize('focusViewOnExecution', 'Enable `terminal.integrated.accessibleViewFocusOnCommandExecution` to automatically focus the terminal accessible view when a command is executed in the terminal.'));
		}

		if (this._instance.shellType === WindowsShellType.CommandPrompt) {
			content.push(localize('commandPromptMigration', "Consider using powershell instead of command prompt for an improved experience"));
		}

		if (this._hasShellIntegration) {
			content.push(localize('shellIntegration', "The terminal has a feature called shell integration that offers an enhanced experience and provides useful commands for screen readers such as:"));
			content.push('- ' + localize('goToNextCommand', 'Go to Next Command<keybinding:{0}> in the accessible view', TerminalAccessibilityCommandId.AccessibleBufferGoToNextCommand));
			content.push('- ' + localize('goToPreviousCommand', 'Go to Previous Command<keybinding:{0}> in the accessible view', TerminalAccessibilityCommandId.AccessibleBufferGoToPreviousCommand));
			content.push('- ' + localize('goToSymbol', 'Go to Symbol<keybinding:{0}>', AccessibilityCommandId.GoToSymbol));
			content.push('- ' + localize('runRecentCommand', 'Run Recent Command<keybinding:{0}>', TerminalHistoryCommandId.RunRecentCommand));
			content.push('- ' + localize('goToRecentDirectory', 'Go to Recent Directory<keybinding:{0}>', TerminalHistoryCommandId.GoToRecentDirectory));
		} else {
			content.push(localize('noShellIntegration', 'Shell integration is not enabled. Some accessibility features may not be available.'));
		}

		return content.join('\n');
	}
}
