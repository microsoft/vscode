/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { addStandardDisposableListener } from 'vs/base/browser/dom';
import { withNullAsUndefined } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { KeyCode } from 'vs/base/common/keyCodes';

export function getAccessibilityHelpText(keybindingService: IKeybindingService, type: 'chat' | 'editor'): string {
	const content = [];
	if (type === 'chat') {
		content.push(localize('chat.accessibilityHelp', "Chat Accessibility Help"));
		content.push(localize('interactiveSession.helpMenuExit', "Exit this menu and return to the interactive editor input via the Escape key."));
		content.push(descriptionForCommand('interactiveSession.action.focus', localize('interactiveSession.action.focus', 'The Focus Interactive Session ({0}) command focuses the chat request/response list, which can be navigated with UpArrow/DownArrow.',), localize('interactiveSession.action.focusNoKb', 'The Focus Interactive Session command focuses the chat request/response list, which can be navigated with UpArrow/DownArrow and is currently not triggerable by a keybinding.'), keybindingService));
		content.push(descriptionForCommand('workbench.action.interactiveSession.focusInput', localize('workbench.action.interactiveSession.focusInput', 'The Focus Interactive Session Input ({0}) command focuses the input box for chat requests.'), localize('workbench.action.interactiveSession.focusInputNoKb', 'Focus Interactive Session Input command focuses the input box for chat requests and is currently not triggerable by a keybinding.'), keybindingService));
	} else {
		content.push(localize('interactiveSessionEditor.accessibilityHelp', "Interactive Session Editor Accessibility Help"));
		content.push(localize('interactiveSession.helpMenuExit', "Exit this menu and return to the interactive editor input via the Escape key."));
	}
	return content.join('\n');
}

function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return format(msg, kb.getAriaLabel());
	}
	return format(noKbMsg, commandId);
}

export async function runAccessibilityHelpAction(accessor: ServicesAccessor, editor: ICodeEditor, type: 'chat' | 'editor'): Promise<void> {
	const widgetService = accessor.get(IInteractiveSessionWidgetService);
	const keybindingService = accessor.get(IKeybindingService);
	const inputEditor: ICodeEditor | undefined = type === 'chat' ? widgetService.lastFocusedWidget?.inputEditor : editor;
	const editorUri = editor.getModel()?.uri;

	if (!inputEditor || !editorUri) {
		return;
	}
	const domNode = withNullAsUndefined(inputEditor.getDomNode());
	if (!domNode) {
		return;
	}

	const cachedInput = inputEditor.getValue();
	const cachedPosition = inputEditor.getPosition();

	const helpText = getAccessibilityHelpText(keybindingService, type);
	inputEditor.setValue(helpText);
	inputEditor.updateOptions({ readOnly: true });
	inputEditor.focus();
	const disposable = addStandardDisposableListener(domNode, 'keydown', e => {
		if (!inputEditor) {
			return;
		}
		if (e.keyCode === KeyCode.Escape && inputEditor.getValue() === helpText) {
			inputEditor.updateOptions({ readOnly: false });
			inputEditor.setValue(cachedInput);
			if (cachedPosition) {
				inputEditor.setPosition(cachedPosition);
			}
			inputEditor.focus();
			disposable.dispose();
		}
	});
}
