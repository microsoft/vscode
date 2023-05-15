/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export function getAccessibilityHelpText(keybindingService: IKeybindingService): string {
	const content = [];
	content.push(localize('chat.accessibilityHelp', "Chat Accessibility Help"));
	content.push(localize('interactiveSession.helpMenuExit', "Exit this menu and return to the interactive editor input via the Escape key."));
	content.push(descriptionForCommand('interactiveSession.action.focus', localize('interactiveSession.action.focus', 'The Focus Interactive Session ({0}) command focuses the chat request/response list, which can be navigated with UpArrow/DownArrow.',), localize('interactiveSession.action.focusNoKb', 'The Focus Interactive Session command focuses the chat request/response list, which can be navigated with UpArrow/DownArrow and is currently not triggerable by a keybinding.'), keybindingService));
	content.push(descriptionForCommand('workbench.action.interactiveSession.focusInput', localize('workbench.action.interactiveSession.focusInput', 'The Focus Interactive Session Input ({0}) command focuses the input box for chat requests.'), localize('workbench.action.interactiveSession.focusInputNoKb', 'Focus Interactive Session Input command focuses the input box for chat requests and is currently not triggerable by a keybinding.'), keybindingService));
	return content.join('\n');
}

function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return format(msg, kb.getAriaLabel());
	}
	return format(noKbMsg, commandId);
}
