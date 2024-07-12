/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShellIntegrationStatus, TerminalSettingId, WindowsShellType } from 'vs/platform/terminal/common/terminal';
import { AccessibilityCommandId } from 'vs/workbench/contrib/accessibility/common/accessibilityCommands';
import { ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import type { Terminal } from '@xterm/xterm';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalAccessibilitySettingId } from 'vs/workbench/contrib/terminalContrib/accessibility/common/terminalAccessibilityConfiguration';
import { TerminalAccessibilityCommandId } from 'vs/workbench/contrib/terminalContrib/accessibility/common/terminal.accessibility';
import { TerminalLinksCommandId } from 'vs/workbench/contrib/terminalContrib/links/common/terminal.links';
import { IAccessibleViewContentProvider, AccessibleViewProviderId, IAccessibleViewOptions, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { accessibleViewIsShown, accessibleViewCurrentProviderId, AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';

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
		@IInstantiationService _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._hasShellIntegration = _xterm.shellIntegration.status === ShellIntegrationStatus.VSCode;
	}
	provideContent(): string {
		const content = [];
		content.push(localize('focusAccessibleTerminalView', 'The Focus Accessible Terminal View command<keybinding:{0}> enables screen readers to read terminal contents.', TerminalAccessibilityCommandId.FocusAccessibleBuffer));
		content.push(localize('preserveCursor', 'Customize the behavior of the cursor when toggling between the terminal and accessible view with `terminal.integrated.accessibleViewPreserveCursorPosition.`'));
		if (!this._configurationService.getValue(TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution)) {
			content.push(localize('focusViewOnExecution', 'Enable `terminal.integrated.accessibleViewFocusOnCommandExecution` to automatically focus the terminal accessible view when a command is executed in the terminal.'));
		}
		if (this._instance.shellType === WindowsShellType.CommandPrompt) {
			content.push(localize('commandPromptMigration', "Consider using powershell instead of command prompt for an improved experience"));
		}
		if (this._hasShellIntegration) {
			const shellIntegrationCommandList = [];
			shellIntegrationCommandList.push(localize('shellIntegration', "The terminal has a feature called shell integration that offers an enhanced experience and provides useful commands for screen readers such as:"));
			shellIntegrationCommandList.push('- ' + localize('goToNextCommand', 'Go to Next Command<keybinding:{0}> in the accessible view', TerminalAccessibilityCommandId.AccessibleBufferGoToNextCommand));
			shellIntegrationCommandList.push('- ' + localize('goToPreviousCommand', 'Go to Previous Command<keybinding:{0}> in the accessible view', TerminalAccessibilityCommandId.AccessibleBufferGoToPreviousCommand));
			shellIntegrationCommandList.push('- ' + localize('goToSymbol', 'Go to Symbol<keybinding:{0}>', AccessibilityCommandId.GoToSymbol));
			shellIntegrationCommandList.push('- ' + localize('runRecentCommand', 'Run Recent Command<keybinding:{0}>', TerminalCommandId.RunRecentCommand));
			shellIntegrationCommandList.push('- ' + localize('goToRecentDirectory', 'Go to Recent Directory<keybinding:{0}>', TerminalCommandId.GoToRecentDirectory));
			content.push(shellIntegrationCommandList.join('\n'));
		} else {
			content.push(localize('goToRecentDirectoryNoShellIntegration', 'The Go to Recent Directory command<keybinding:{0}> enables screen readers to easily navigate to a directory that has been used in the terminal.', TerminalCommandId.RunRecentCommand));
		}
		content.push(localize('openDetectedLink', 'The Open Detected Link command<keybinding:{0}> enables screen readers to easily open links found in the terminal.', TerminalLinksCommandId.OpenDetectedLink));
		content.push(localize('newWithProfile', 'The Create New Terminal (With Profile) command<keybinding:{0}> allows for easy terminal creation using a specific profile.', TerminalCommandId.NewWithProfile));
		content.push(localize('focusAfterRun', 'Configure what gets focused after running selected text in the terminal with `{0}`.', TerminalSettingId.FocusAfterRun));
		return content.join('\n\n');
	}
}
