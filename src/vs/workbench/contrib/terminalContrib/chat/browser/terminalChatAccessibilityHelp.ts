/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TerminalChatCommandId, TerminalChatContextKeys } from './terminalChat.js';
import { TerminalChatController } from './terminalChatController.js';

export class TerminalChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 110;
	readonly name = 'terminalChat';
	readonly when = TerminalChatContextKeys.focused;
	readonly type = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		const terminalService = accessor.get(ITerminalService);

		const instance = terminalService.activeInstance;
		if (!instance) {
			return;
		}

		const helpText = getAccessibilityHelpText(accessor);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.TerminalChat,
			{ type: AccessibleViewType.Help },
			() => helpText,
			() => TerminalChatController.get(instance)?.terminalChatWidget?.focus(),
			AccessibilityVerbositySettingId.TerminalChat,
		);
	}
}

export function getAccessibilityHelpText(accessor: ServicesAccessor): string {
	const keybindingService = accessor.get(IKeybindingService);
	const content = [];
	const openAccessibleViewKeybinding = keybindingService.lookupKeybinding('editor.action.accessibleView')?.getAriaLabel();
	const runCommandKeybinding = keybindingService.lookupKeybinding(TerminalChatCommandId.RunCommand)?.getAriaLabel();
	const insertCommandKeybinding = keybindingService.lookupKeybinding(TerminalChatCommandId.InsertCommand)?.getAriaLabel();
	const makeRequestKeybinding = keybindingService.lookupKeybinding(TerminalChatCommandId.MakeRequest)?.getAriaLabel();
	const startChatKeybinding = keybindingService.lookupKeybinding(TerminalChatCommandId.Start)?.getAriaLabel();
	const focusResponseKeybinding = keybindingService.lookupKeybinding('chat.action.focus')?.getAriaLabel();
	const focusInputKeybinding = keybindingService.lookupKeybinding('workbench.action.chat.focusInput')?.getAriaLabel();
	content.push(localize('inlineChat.overview', "Inline chat occurs within a terminal. It is useful for suggesting terminal commands. Keep in mind that AI generated code may be incorrect."));
	content.push(localize('inlineChat.access', "It can be activated using the command: Terminal: Start Chat ({0}), which will focus the input box.", startChatKeybinding));
	content.push(makeRequestKeybinding ? localize('inlineChat.input', "The input box is where the user can type a request and can make the request ({0}). The widget will be closed and all content will be discarded when the Escape key is pressed and the terminal will regain focus.", makeRequestKeybinding) : localize('inlineChat.inputNoKb', "The input box is where the user can type a request and can make the request by tabbing to the Make Request button, which is not currently triggerable via keybindings. The widget will be closed and all content will be discarded when the Escape key is pressed and the terminal will regain focus."));
	content.push(openAccessibleViewKeybinding ? localize('inlineChat.inspectResponseMessage', 'The response can be inspected in the accessible view ({0}).', openAccessibleViewKeybinding) : localize('inlineChat.inspectResponseNoKb', 'With the input box focused, inspect the response in the accessible view via the Open Accessible View command, which is currently not triggerable by a keybinding.'));
	content.push(focusResponseKeybinding ? localize('inlineChat.focusResponse', 'Reach the response from the input box ({0}).', focusResponseKeybinding) : localize('inlineChat.focusResponseNoKb', 'Reach the response from the input box by tabbing or assigning a keybinding for the command: Focus Terminal Response.'));
	content.push(focusInputKeybinding ? localize('inlineChat.focusInput', 'Reach the input box from the response ({0}).', focusInputKeybinding) : localize('inlineChat.focusInputNoKb', 'Reach the response from the input box by shift+tabbing or assigning a keybinding for the command: Focus Terminal Input.'));
	content.push(runCommandKeybinding ? localize('inlineChat.runCommand', 'With focus in the input box or command editor, the Terminal: Run Chat Command ({0}) action.', runCommandKeybinding) : localize('inlineChat.runCommandNoKb', 'Run a command by tabbing to the button as the action is currently not triggerable by a keybinding.'));
	content.push(insertCommandKeybinding ? localize('inlineChat.insertCommand', 'With focus in the input box command editor, the Terminal: Insert Chat Command ({0}) action.', insertCommandKeybinding) : localize('inlineChat.insertCommandNoKb', 'Insert a command by tabbing to the button as the action is currently not triggerable by a keybinding.'));
	content.push(localize('inlineChat.toolbar', "Use tab to reach conditional parts like commands, status, message responses and more."));
	content.push(localize('chat.signals', "Accessibility Signals can be changed via settings with a prefix of signals.chat. By default, if a request takes more than 4 seconds, you will hear a sound indicating that progress is still occurring."));
	return content.join('\n');
}
