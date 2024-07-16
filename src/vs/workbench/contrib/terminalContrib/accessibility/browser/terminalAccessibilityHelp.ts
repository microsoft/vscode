/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ShellIntegrationStatus, WindowsShellType } from 'vs/platform/terminal/common/terminal';
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
		const content = [
			localize('focusAccessibleTerminalView', 'The Focus Accessible Terminal View command<keybinding:{0}> enables screen readers to read terminal contents.', TerminalAccessibilityCommandId.FocusAccessibleBuffer),
			localize('preserveCursor', 'Customize the behavior of the cursor when toggling between the terminal and accessible view with `terminal.integrated.accessibleViewPreserveCursorPosition.`'),
			localize('openDetectedLink', 'The Open Detected Link command<keybinding:{0}> enables screen readers to easily open links found in the terminal.', TerminalLinksCommandId.OpenDetectedLink),
			localize('newWithProfile', 'The Create New Terminal (With Profile) command<keybinding:{0}> allows for easy terminal creation using a specific profile.', TerminalCommandId.NewWithProfile)
		];

		if (!this._configurationService.getValue(TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution)) {
			content.push(localize('focusOnCommandExecution', 'The setting `terminal.integrated.accessibleViewFocusOnCommandExecution` controls whether the terminal should focus on the accessible view when a command is executed.'));
		}

		if (this._instance.shellType === WindowsShellType.CommandPrompt) {
			content.push(localize('commandPrompt', 'When using Command Prompt, some commands may not work as expected.'));
		}

		if (this._hasShellIntegration) {
			content.push(localize('shellIntegration', 'Shell integration is enabled, providing enhanced accessibility features.'));
		} else {
			content.push(localize('noShellIntegration', 'Shell integration is not enabled. Some accessibility features may not be available.'));
		}

		return content.join('\n\n');
	}
}
