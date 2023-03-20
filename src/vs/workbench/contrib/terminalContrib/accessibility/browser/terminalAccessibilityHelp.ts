/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addStandardDisposableListener } from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { Widget } from 'vs/base/browser/ui/widget';
import { KeyCode } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { format } from 'vs/base/common/strings';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { localize } from 'vs/nls';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ShellIntegrationStatus, WindowsShellType } from 'vs/platform/terminal/common/terminal';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';

export class AccessibilityHelpWidget extends Widget {
	readonly id = 'help';
	private _domNode: FastDomNode<HTMLElement>;
	get element(): HTMLElement { return this._domNode.domNode; }
	private _contentDomNode: FastDomNode<HTMLElement>;
	private readonly _hasShellIntegration: boolean;
	private readonly _markdownRenderer: MarkdownRenderer;

	constructor(
		private readonly _instance: ITerminalInstance,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		this._hasShellIntegration = _instance.xterm?.shellIntegration.status === ShellIntegrationStatus.VSCode;
		this._domNode = createFastDomNode(document.createElement('div'));
		this._contentDomNode = createFastDomNode(document.createElement('div'));
		this._contentDomNode.setClassName('terminal-accessibility-help');
		this._contentDomNode.setAttribute('role', 'document');
		this._domNode.setDisplay('none');
		this._domNode.setAttribute('role', 'dialog');
		this._domNode.setAttribute('aria-hidden', 'true');
		this._domNode.appendChild(this._contentDomNode);
		this._register(addStandardDisposableListener(this._contentDomNode.domNode, 'keydown', (e) => {
			if (e.keyCode === KeyCode.Escape) {
				this.hide();
				_instance.focus();
			}
		}));
		this._register(_instance.onDidFocus(() => this.hide()));
		this._markdownRenderer = this._register(instantiationService.createInstance(MarkdownRenderer, {}));
	}

	public hide(): void {
		this._domNode.setDisplay('none');
		this._contentDomNode.setDisplay('none');
		this._domNode.setAttribute('aria-hidden', 'true');
	}

	show(): void {
		this._domNode.setDisplay('block');
		this._domNode.setAttribute('aria-hidden', 'false');
		this._contentDomNode.domNode.tabIndex = 0;
		this._buildContent();
		this._contentDomNode.domNode.focus();
	}

	private _descriptionForCommand(commandId: string, msg: string, noKbMsg: string): string {
		const kb = this._keybindingService.lookupKeybinding(commandId, this._contextKeyService);
		if (kb) {
			return format(msg, kb.getAriaLabel());
		}
		return format(noKbMsg, commandId);
	}

	private _buildContent(): void {
		const introMessage = localize('introMsg', "Welcome to Terminal Accessibility Help");
		const focusAccessibleBufferNls = localize('focusAccessibleBuffer', 'The Focus Accessible Buffer ({0}) command enables screen readers to read terminal contents.');
		const focusAccessibleBufferNoKb = localize('focusAccessibleBufferNoKb', 'The Focus Accessible Buffer command enables screen readers to read terminal contents and is currently not triggerable by a keybinding.');
		const shellIntegration = localize('shellIntegration', "The terminal has a feature called shell integration that offers an enhanced experience and provides useful commands for screen readers such as:");
		const navigateAccessibleBuffer = localize('navigateAccessibleBuffer', 'Navigate Accessible Buffer ({0})');
		const navigateAccessibleBufferNoKb = localize('navigateAccessibleBufferNoKb', 'Navigate Accessible Buffer is currently not triggerable by a keybinding.');
		const runRecentCommand = localize('runRecentCommand', 'Run Recent Command ({0})');
		const runRecentCommandNoKb = localize('runRecentCommandNoKb', 'Run Recent Command is currently not triggerable by a keybinding.');
		const goToRecentNoShellIntegration = localize('goToRecentDirectoryNoShellIntegration', 'The Go to Recent Directory command ({0}) enables screen readers to easily navigate to a directory that has been used in the terminal.');
		const goToRecentNoKbNoShellIntegration = localize('goToRecentDirectoryNoKbNoShellIntegration', 'The Go to Recent Directory command enables screen readers to easily navigate to a directory that has been used in the terminal and is currently not triggerable by a keybinding.');
		const goToRecent = localize('goToRecentDirectory', 'Go to Recent Directory ({0})');
		const goToRecentNoKb = localize('goToRecentDirectoryNoKb', 'Go to Recent Directory is currently not triggerable by a keybinding.');
		const readMoreLink = localize('readMore', '[Read more about terminal accessibility](https://code.visualstudio.com/docs/editor/accessibility#_terminal-accessibility)');
		const dismiss = localize('dismiss', "You can dismiss this dialog by pressing Escape or focusing elsewhere.");
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
		const element = renderElementAsMarkdown(this._markdownRenderer, this._openerService, content.join('\n\n'), this._register(new DisposableStore()));
		const anchorElements = element.querySelectorAll('a');
		for (const a of anchorElements) {
			a.tabIndex = 0;
		}
		this._contentDomNode.domNode.appendChild(element);
		this._contentDomNode.domNode.setAttribute('aria-label', introMessage);
	}
}
function renderElementAsMarkdown(markdownRenderer: MarkdownRenderer, openerSerivce: IOpenerService, text: string, disposables: DisposableStore): HTMLElement {
	const result = markdownRenderer.render({ value: text, isTrusted: true }, {
		actionHandler: {
			callback: (content: string) => openerSerivce.open(content),
			disposables
		}
	});
	return result.element;
}
