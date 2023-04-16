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
		const content = [];
		content.push(this._descriptionForCommand(TerminalCommandId.FocusAccessibleBuffer, localize('focusAccessibleBuffer', 'The Focus Accessible Buffer ({0}) command enables screen readers to read terminal contents.'), localize('focusAccessibleBufferNoKb', 'The Focus Accessible Buffer command enables screen readers to read terminal contents and is currently not triggerable by a keybinding.')));
		if (this._instance.shellType === WindowsShellType.CommandPrompt) {
			content.push(localize('commandPromptMigration', "Consider using powershell instead of command prompt for an improved experience"));
		}
		if (this._hasShellIntegration) {
			content.push(localize('shellIntegration', "The terminal has a feature called shell integration that offers an enhanced experience and provides useful commands for screen readers such as:"));
			content.push('- ' + this._descriptionForCommand(TerminalCommandId.AccessibleBufferGoToNextCommand, localize('goToNextCommand', 'Go to Next Command ({0})'), localize('goToNextCommandNoKb', 'Go to Next Command is currently not triggerable by a keybinding.')));
			content.push('- ' + this._descriptionForCommand(TerminalCommandId.AccessibleBufferGoToPreviousCommand, localize('goToPreviousCommand', 'Go to Previous Command ({0})'), localize('goToPreviousCommandNoKb', 'Go to Previous Command is currently not triggerable by a keybinding.')));
			content.push('- ' + this._descriptionForCommand(TerminalCommandId.NavigateAccessibleBuffer, localize('navigateAccessibleBuffer', 'Navigate Accessible Buffer ({0})'), localize('navigateAccessibleBufferNoKb', 'Navigate Accessible Buffer is currently not triggerable by a keybinding.')));
			content.push('- ' + this._descriptionForCommand(TerminalCommandId.RunRecentCommand, localize('runRecentCommand', 'Run Recent Command ({0})'), localize('runRecentCommandNoKb', 'Run Recent Command is currently not triggerable by a keybinding.')));
			content.push('- ' + this._descriptionForCommand(TerminalCommandId.GoToRecentDirectory, localize('goToRecentDirectory', 'Go to Recent Directory ({0})'), localize('goToRecentDirectoryNoKb', 'Go to Recent Directory is currently not triggerable by a keybinding.')));
		} else {
			content.push(this._descriptionForCommand(TerminalCommandId.RunRecentCommand, localize('goToRecentDirectoryNoShellIntegration', 'The Go to Recent Directory command ({0}) enables screen readers to easily navigate to a directory that has been used in the terminal.'), localize('goToRecentDirectoryNoKbNoShellIntegration', 'The Go to Recent Directory command enables screen readers to easily navigate to a directory that has been used in the terminal and is currently not triggerable by a keybinding.')));
		}
		content.push(this._descriptionForCommand(TerminalCommandId.OpenDetectedLink, localize('openDetectedLink', 'The Open Detected Link ({0}) command enables screen readers to easily open links found in the terminal.'), localize('openDetectedLinkNoKb', 'The Open Detected Link command enables screen readers to easily open links found in the terminal and is currently not triggerable by a keybinding.')));
		content.push(this._descriptionForCommand(TerminalCommandId.NewWithProfile, localize('newWithProfile', 'The Create New Terminal (With Profile) ({0}) command allows for easy terminal creation using a specific profile.'), localize('newWithProfileNoKb', 'The Create New Terminal (With Profile) command allows for easy terminal creation using a specific profile and is currently not triggerable by a keybinding.')));
		content.push(localize('accessibilitySettings', 'Access accessibility settings such as `terminal.integrated.tabFocusMode` via the Preferences: Open Accessibility Settings command.'));
		content.push(localize('readMore', '[Read more about terminal accessibility](https://code.visualstudio.com/docs/editor/accessibility#_terminal-accessibility)'));
		content.push(localize('dismiss', "You can dismiss this dialog by pressing Escape, tab, or focusing elsewhere."));
		const model = this.editorWidget.getModel() || await this.getTextModel(this._instance.resource);
		model?.setValue(content.join('\n'));
		this.editorWidget.setModel(model);
		this.element.setAttribute('aria-label', localize('introMsg', "Welcome to Terminal Accessibility Help"));
	}
}
