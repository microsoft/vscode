/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalChatCommandId, TerminalChatContextKeys } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';

export class TerminalChatAccessibilityHelpContribution extends Disposable {
	static ID = 'terminalChatAccessiblityHelp';
	constructor() {
		super();
		this._register(AccessibilityHelpAction.addImplementation(110, 'terminalChat', runAccessibilityHelpAction, TerminalChatContextKeys.focused));
	}
}

export async function runAccessibilityHelpAction(accessor: ServicesAccessor): Promise<void> {
	const accessibleViewService = accessor.get(IAccessibleViewService);
	const terminalService = accessor.get(ITerminalService);

	const instance = terminalService.activeInstance;
	if (!instance) {
		return;
	}

	const helpText = getAccessibilityHelpText(accessor);
	accessibleViewService.show({
		id: AccessibleViewProviderId.TerminalChat,
		verbositySettingKey: AccessibilityVerbositySettingId.TerminalChat,
		provideContent: () => helpText,
		onClose: () => TerminalChatController.get(instance)?.focus(),
		options: { type: AccessibleViewType.Help }
	});
}

export function getAccessibilityHelpText(accessor: ServicesAccessor): string {
	const keybindingService = accessor.get(IKeybindingService);
	const content = [];
	const openAccessibleViewKeybinding = keybindingService.lookupKeybinding('editor.action.accessibleView')?.getAriaLabel();
	const runCommandKeybinding = keybindingService.lookupKeybinding(TerminalChatCommandId.RunCommand)?.getAriaLabel();
	const insertCommandKeybinding = keybindingService.lookupKeybinding(TerminalChatCommandId.InsertCommand)?.getAriaLabel();
	const makeRequestKeybinding = keybindingService.lookupKeybinding(TerminalChatCommandId.MakeRequest)?.getAriaLabel();
	const startChatKeybinding = keybindingService.lookupKeybinding(TerminalChatCommandId.Start)?.getAriaLabel();
	content.push(localize('inlineChat.overview', "Inline chat occurs within a terminal. It is useful for suggesting terminal commands. Keep in mind that AI generated code may be incorrect."));
	content.push(localize('inlineChat.access', "It can be activated using the command: Terminal: Start Chat ({0}), which will focus the input box.", startChatKeybinding));
	content.push(makeRequestKeybinding ? localize('inlineChat.input', "The input box is where the user can type a request and can make the request ({0}). The widget will be closed and all content will be discarded when the Escape key is pressed and the terminal will regain focus.", makeRequestKeybinding) : localize('inlineChat.inputNoKb', "The input box is where the user can type a request and can make the request by tabbing to the Make Request button, which is not currently triggerable via keybindings. The widget will be closed and all content will be discarded when the Escape key is pressed and the terminal will regain focus."));
	content.push(localize('inlineChat.results', "A result may contain a terminal command or just a message. In either case, the result will be announced."));
	content.push(openAccessibleViewKeybinding ? localize('inlineChat.inspectResponseMessage', 'If just a message comes back, it can be inspected in the accessible view ({0}).', openAccessibleViewKeybinding) : localize('inlineChat.inspectResponseNoKb', 'With the input box focused, inspect the response in the accessible view via the Open Accessible View command, which is currently not triggerable by a keybinding.'));
	content.push(localize('inlineChat.inspectTerminalCommand', 'If a terminal command comes back, it can be inspected in an editor reached via Shift+Tab.'));
	content.push(runCommandKeybinding ? localize('inlineChat.runCommand', 'With focus in the input box or command editor, the Terminal: Run Chat Command ({0}) action.', runCommandKeybinding) : localize('inlineChat.runCommandNoKb', 'Run a command by tabbing to the button as the action is currently not triggerable by a keybinding.'));
	content.push(insertCommandKeybinding ? localize('inlineChat.insertCommand', 'With focus in the input box command editor, the Terminal: Insert Chat Command ({0}) action.', insertCommandKeybinding) : localize('inlineChat.insertCommandNoKb', 'Insert a command by tabbing to the button as the action is currently not triggerable by a keybinding.'));
	content.push(localize('inlineChat.toolbar', "Use tab to reach conditional parts like commands, status, message responses and more."));
	content.push(localize('chat.signals', "Accessibility Signals can be changed via settings with a prefix of signals.chat. By default, if a request takes more than 4 seconds, you will hear a sound indicating that progress is still occurring."));
	return content.join('\n\n');
}
