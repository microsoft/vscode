/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { format } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ShellIntegrationStatus, TerminalSettingId, WindowsShellType } from 'vs/platform/terminal/common/terminal';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewType, IAccessibleContentProvider, IAccessibleViewOptions } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { ITerminalInstance, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import type { Terminal } from 'xterm';

export const enum ClassName {
	Active = 'active',
	EditorTextArea = 'textarea'
}

export class TerminalAccessibleContentProvider extends Disposable implements IAccessibleContentProvider {

	private readonly _hasShellIntegration: boolean = false;

	onClose() {
		if (this._contextKeyService.getContextKeyValue<boolean>(TerminalContextKeys.accessibleBufferFocus.key) === true) {
			this._commandService.executeCommand(TerminalCommandId.FocusAccessibleBuffer);
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
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ICommandService private readonly _commandService: ICommandService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
		this._hasShellIntegration = _xterm.shellIntegration.status === ShellIntegrationStatus.VSCode;
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		if (commandId === TerminalCommandId.RunRecentCommand) {
			const kb = this._keybindingService.lookupKeybindings(commandId);
			// Run recent command has multiple keybindings. lookupKeybinding just returns the first one regardless of the when context.
			// Thus, we have to check if accessibility mode is enabled to determine which keybinding to use.
			const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
			if (isScreenReaderOptimized && kb[1]) {
				format(msg, kb[1].getAriaLabel());
			} else if (kb[0]) {
				format(msg, kb[0].getAriaLabel());
			} else {
				return format(noKbMsg, commandId);
			}
		}
		const kb = this._keybindingService.lookupKeybinding(commandId, this._contextKeyService)?.getAriaLabel();
		return !kb ? format(noKbMsg, commandId) : format(msg, kb);
	}

	provideContent(): string {
		const content = [];
		content.push(this._descriptionForCommand(TerminalCommandId.FocusAccessibleBuffer, localize('focusAccessibleBuffer', 'The Focus Accessible Buffer ({0}) command enables screen readers to read terminal contents.'), localize('focusAccessibleBufferNoKb', 'The Focus Accessible Buffer command enables screen readers to read terminal contents and is currently not triggerable by a keybinding.')));
		if (this._instance.shellType === WindowsShellType.CommandPrompt) {
			content.push(localize('commandPromptMigration', "Consider using powershell instead of command prompt for an improved experience"));
		}
		if (this._hasShellIntegration) {
			const shellIntegrationCommandList = [];
			shellIntegrationCommandList.push(localize('shellIntegration', "The terminal has a feature called shell integration that offers an enhanced experience and provides useful commands for screen readers such as:"));
			shellIntegrationCommandList.push('- ' + this._descriptionForCommand(TerminalCommandId.AccessibleBufferGoToNextCommand, localize('goToNextCommand', 'Go to Next Command ({0})'), localize('goToNextCommandNoKb', 'Go to Next Command is currently not triggerable by a keybinding.')));
			shellIntegrationCommandList.push('- ' + this._descriptionForCommand(TerminalCommandId.AccessibleBufferGoToPreviousCommand, localize('goToPreviousCommand', 'Go to Previous Command ({0})'), localize('goToPreviousCommandNoKb', 'Go to Previous Command is currently not triggerable by a keybinding.')));
			shellIntegrationCommandList.push('- ' + this._descriptionForCommand(TerminalCommandId.NavigateAccessibleBuffer, localize('navigateAccessibleBuffer', 'Navigate Accessible Buffer ({0})'), localize('navigateAccessibleBufferNoKb', 'Navigate Accessible Buffer is currently not triggerable by a keybinding.')));
			shellIntegrationCommandList.push('- ' + this._descriptionForCommand(TerminalCommandId.RunRecentCommand, localize('runRecentCommand', 'Run Recent Command ({0})'), localize('runRecentCommandNoKb', 'Run Recent Command is currently not triggerable by a keybinding.')));
			shellIntegrationCommandList.push('- ' + this._descriptionForCommand(TerminalCommandId.GoToRecentDirectory, localize('goToRecentDirectory', 'Go to Recent Directory ({0})'), localize('goToRecentDirectoryNoKb', 'Go to Recent Directory is currently not triggerable by a keybinding.')));
			content.push(shellIntegrationCommandList.join('\n'));
		} else {
			content.push(this._descriptionForCommand(TerminalCommandId.RunRecentCommand, localize('goToRecentDirectoryNoShellIntegration', 'The Go to Recent Directory command ({0}) enables screen readers to easily navigate to a directory that has been used in the terminal.'), localize('goToRecentDirectoryNoKbNoShellIntegration', 'The Go to Recent Directory command enables screen readers to easily navigate to a directory that has been used in the terminal and is currently not triggerable by a keybinding.')));
		}
		content.push(this._descriptionForCommand(TerminalCommandId.OpenDetectedLink, localize('openDetectedLink', 'The Open Detected Link ({0}) command enables screen readers to easily open links found in the terminal.'), localize('openDetectedLinkNoKb', 'The Open Detected Link command enables screen readers to easily open links found in the terminal and is currently not triggerable by a keybinding.')));
		content.push(this._descriptionForCommand(TerminalCommandId.NewWithProfile, localize('newWithProfile', 'The Create New Terminal (With Profile) ({0}) command allows for easy terminal creation using a specific profile.'), localize('newWithProfileNoKb', 'The Create New Terminal (With Profile) command allows for easy terminal creation using a specific profile and is currently not triggerable by a keybinding.')));
		content.push(localize('focusAfterRun', 'Configure what gets focused after running selected text in the terminal with `{0}`.', TerminalSettingId.FocusAfterRun));
		content.push(localize('accessibilitySettings', 'Access accessibility settings such as `terminal.integrated.tabFocusMode` via the Preferences: Open Accessibility Settings command.'));
		return content.join('\n\n');
	}
}
