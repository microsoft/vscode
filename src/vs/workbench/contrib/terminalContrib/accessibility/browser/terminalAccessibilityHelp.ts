/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'vs/base/common/functional';
import { format } from 'vs/base/common/strings';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ShellIntegrationStatus, WindowsShellType } from 'vs/platform/terminal/common/terminal';
import { ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalAccessibleWidget } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/terminalAccessibleWidget';
import type { Terminal } from 'xterm';

export const enum ClassName {
	AccessibleBuffer = 'terminal-accessibility-help',
	Active = 'active',
	EditorTextArea = 'textarea'
}

export class AccessibilityHelpWidget extends TerminalAccessibleWidget {

	private readonly _hasShellIntegration: boolean;

	constructor(
		_instance: Pick<ITerminalInstance, 'shellType' | 'capabilities' | 'onDidRequestFocus' | 'resource'>,
		_xterm: Pick<IXtermTerminal, 'getFont' | 'shellIntegration'> & { raw: Terminal },
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IModelService _modelService: IModelService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@ITerminalService _terminalService: ITerminalService,
	) {
		super(ClassName.AccessibleBuffer, _instance, _xterm, undefined, _instantiationService, _modelService, _configurationService, _contextKeyService, _terminalService);
		this._hasShellIntegration = _xterm.shellIntegration.status === ShellIntegrationStatus.VSCode;
		this.element.ariaRoleDescription = localize('terminal.integrated.accessiblityHelp', 'Terminal accessibility help');
	}

	override registerListeners(): void {
		super.registerListeners();
		this.add(once(this.editorWidget.onDidFocusEditorText)(() => {
			// prevents tabbing into the editor
			const editorTextArea = this.element.querySelector(ClassName.EditorTextArea) as HTMLElement;
			if (editorTextArea) {
				editorTextArea.tabIndex = -1;
			}
		}));
		this.add(this.editorWidget.onDidBlurEditorText(() => this.hide()));
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		const kb = this._keybindingService.lookupKeybindings(commandId);
		switch (kb.length) {
			case 0:
				return format(noKbMsg, commandId);
			case 1:
				return format(msg, kb[0].getAriaLabel());
		}
		// Run recent command has multiple keybindings. lookupKeybinding just returns the first one regardless of the when context.
		// Thus, we have to check if accessibility mode is enabled to determine which keybinding to use.
		return this._accessibilityService.isScreenReaderOptimized() ? format(msg, kb[1].getAriaLabel()) : format(msg, kb[0].getAriaLabel());
	}

	async updateEditor(): Promise<void> {
		if (this.editorWidget.getModel()?.getValue().length) {
			return;
		}
		const introMessage = localize('introMsg', "Welcome to Terminal Accessibility Help");
		const focusAccessibleBufferNls = localize('focusAccessibleBuffer', 'The Focus Accessible Buffer ({0}) command enables screen readers to read terminal contents.');
		const focusAccessibleBufferNoKb = localize('focusAccessibleBufferNoKb', 'The Focus Accessible Buffer command enables screen readers to read terminal contents and is currently not triggerable by a keybinding.');
		const shellIntegration = localize('shellIntegration', "The terminal has a feature called shell integration that offers an enhanced experience and provides useful commands for screen readers such as:");
		const goToNextCommand = this._descriptionForCommand(TerminalCommandId.AccessibleBufferGoToNextCommand, localize('goToNextCommand', 'Go to Next Command ({0})'), localize('goToNextCommandNoKb', 'Go to Next Command is currently not triggerable by a keybinding.'));
		const goToPreviousCommand = this._descriptionForCommand(TerminalCommandId.AccessibleBufferGoToPreviousCommand, localize('goToPreviousCommand', 'Go to Previous Command ({0})'), localize('goToPreviousCommandNoKb', 'Go to Previous Command is currently not triggerable by a keybinding.'));
		const navigateAccessibleBuffer = localize('navigateAccessibleBuffer', 'Navigate Accessible Buffer ({0})');
		const navigateAccessibleBufferNoKb = localize('navigateAccessibleBufferNoKb', 'Navigate Accessible Buffer is currently not triggerable by a keybinding.');
		const runRecentCommand = localize('runRecentCommand', 'Run Recent Command ({0})');
		const runRecentCommandNoKb = localize('runRecentCommandNoKb', 'Run Recent Command is currently not triggerable by a keybinding.');
		const goToRecentNoShellIntegration = localize('goToRecentDirectoryNoShellIntegration', 'The Go to Recent Directory command ({0}) enables screen readers to easily navigate to a directory that has been used in the terminal.');
		const goToRecentNoKbNoShellIntegration = localize('goToRecentDirectoryNoKbNoShellIntegration', 'The Go to Recent Directory command enables screen readers to easily navigate to a directory that has been used in the terminal and is currently not triggerable by a keybinding.');
		const goToRecent = localize('goToRecentDirectory', 'Go to Recent Directory ({0})');
		const goToRecentNoKb = localize('goToRecentDirectoryNoKb', 'Go to Recent Directory is currently not triggerable by a keybinding.');
		const readMoreLink = localize('readMore', '[Read more about terminal accessibility](https://code.visualstudio.com/docs/editor/accessibility#_terminal-accessibility)');
		const dismiss = localize('dismiss', "You can dismiss this dialog by pressing Escape, tab, or focusing elsewhere.");
		const openDetectedLink = localize('openDetectedLink', 'The Open Detected Link ({0}) command enables screen readers to easily open links found in the terminal.');
		const openDetectedLinkNoKb = localize('openDetectedLinkNoKb', 'The Open Detected Link command enables screen readers to easily open links found in the terminal and is currently not triggerable by a keybinding.');
		const newWithProfile = localize('newWithProfile', 'The Create New Terminal (With Profile) ({0}) command allows for easy terminal creation using a specific profile.');
		const newWithProfileNoKb = localize('newWithProfileNoKb', 'The Create New Terminal (With Profile) command allows for easy terminal creation using a specific profile and is currently not triggerable by a keybinding.');
		const accessibilitySettings = localize('accessibilitySettings', 'Access accessibility settings such as `terminal.integrated.tabFocusMode` via the Preferences: Open Accessibility Settings command.');
		const commandPrompt = localize('commandPromptMigration', "Consider using powershell instead of command prompt for an improved experience");

		const content = [];
		content.push(this._descriptionForCommand(TerminalCommandId.FocusAccessibleBuffer, focusAccessibleBufferNls, focusAccessibleBufferNoKb));
		if (this._instance.shellType === WindowsShellType.CommandPrompt) {
			content.push(commandPrompt);
		}
		if (this._hasShellIntegration) {
			content.push(shellIntegration);
			content.push('- ' + goToNextCommand);
			content.push('- ' + goToPreviousCommand);
			content.push('- ' + this._descriptionForCommand(TerminalCommandId.NavigateAccessibleBuffer, navigateAccessibleBuffer, navigateAccessibleBufferNoKb));
			content.push('- ' + this._descriptionForCommand(TerminalCommandId.RunRecentCommand, runRecentCommand, runRecentCommandNoKb));
			content.push('- ' + this._descriptionForCommand(TerminalCommandId.GoToRecentDirectory, goToRecent, goToRecentNoKb));
		} else {
			content.push(this._descriptionForCommand(TerminalCommandId.GoToRecentDirectory, goToRecentNoShellIntegration, goToRecentNoKbNoShellIntegration));
		}
		content.push(this._descriptionForCommand(TerminalCommandId.OpenDetectedLink, openDetectedLink, openDetectedLinkNoKb));
		content.push(this._descriptionForCommand(TerminalCommandId.NewWithProfile, newWithProfile, newWithProfileNoKb));
		content.push(accessibilitySettings);
		content.push(readMoreLink, dismiss);
		const model = this.editorWidget.getModel() || await this.getTextModel(this._instance.resource);
		model?.setValue(content.join('\n'));
		this.editorWidget.setModel(model);
		this.element.setAttribute('aria-label', introMessage);
	}
}
