/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { withNullAsUndefined } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EditMode } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';

export function getAccessibilityHelpText(accessor: ServicesAccessor, type: 'chat' | 'inline', currentInput?: string): string {
	const keybindingService = accessor.get(IKeybindingService);
	const configurationService = accessor.get(IConfigurationService);
	const content = [];
	if (type === 'chat') {
		content.push(localize('chat.overview', 'Chat responses will be announced as they come in. A response will indicate the number of code blocks, if any, and then the rest of the response.'));
		content.push(localize('chat.requestHistory', 'In the input box, use UpArrow/DownArrow to navigate your request history. Edit input and use enter to run a new request.'));
		content.push(descriptionForCommand('chat.action.focus', localize('workbench.action.chat.focus', 'The Focus Chat command ({0}) focuses the chat request/response list, which can be navigated with UpArrow/DownArrow.',), localize('workbench.action.chat.focusNoKb', 'The Focus Chat List command focuses the chat request/response list, which can be navigated with UpArrow/DownArrow and is currently not triggerable by a keybinding.'), keybindingService));
		content.push(descriptionForCommand('workbench.action.chat.focusInput', localize('workbench.action.chat.focusInput', 'The Focus Chat Input command ({0}) focuses the input box for chat requests.'), localize('workbench.action.interactiveSession.focusInputNoKb', 'Focus Chat Input command focuses the input box for chat requests and is currently not triggerable by a keybinding.'), keybindingService));
		content.push(descriptionForCommand('workbench.action.chat.nextCodeBlock', localize('workbench.action.chat.nextCodeBlock', 'The Chat: Next Code Block command ({0}) focuses the next code block within a response.'), localize('workbench.action.chat.nextCodeBlockNoKb', 'The Chat: Next Code Block command focuses the next code block within a response and is currently not triggerable by a keybinding.'), keybindingService));
		content.push(descriptionForCommand('workbench.action.chat.clear', localize('workbench.action.chat.clear', 'The Chat Clear command ({0}) clears the request/response list.'), localize('workbench.action.chat.clearNoKb', 'The Chat Clear command clears the request/response list and is currently not triggerable by a keybinding.'), keybindingService));
	} else {
		content.push(localize('inlineChat.makeRequest', "Tab once to reach the make request button, which will re-run the request."));
		const regex = /^(\/fix|\/explain)/;
		const match = currentInput?.match(regex);
		const command = match && match.length ? match[0].substring(1) : undefined;
		if (command === 'fix') {
			const editMode = configurationService.getValue('inlineChat.mode');
			if (editMode === EditMode.Preview) {
				const keybinding = keybindingService.lookupKeybinding('editor.action.diffReview.next')?.getAriaLabel();
				content.push(keybinding ? localize('inlineChat.diff', "Tab again to enter the Diff editor with the changes and enter review mode with ({0}). Use Up/DownArrow to navigate lines with the proposed changes.", keybinding) : localize('inlineChat.diffNoKb', "Tab again to enter the Diff editor with the changes and enter review mode with the Go to Next Difference Command. Use Up/DownArrow to navigate lines with the proposed changes."));
				content.push(localize('inlineChat.acceptReject', "Tab again to reach the action bar, which can be navigated with Left/RightArrow."));
			}
		} else if (command === 'explain') {
			content.push(localize('inlineChat.explain', "/explain commands will be run in the chat view."));
			content.push(localize('inlineChat.chatViewFocus', "To focus the chat view, run the GitHub Copilot: Focus on GitHub Copilot View command, which will focus the input box."));
		} else {
			content.push(localize('inlineChat.toolbar', "Use tab to reach conditional parts like commands, status message, message responses and more."));
		}
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

export async function runAccessibilityHelpAction(accessor: ServicesAccessor, editor: ICodeEditor, type: 'chat' | 'inline'): Promise<void> {
	const widgetService = accessor.get(IChatWidgetService);
	const accessibleViewService = accessor.get(IAccessibleViewService);
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
	inputEditor.getSupportedActions();
	const helpText = getAccessibilityHelpText(accessor, type, type === 'inline' ? cachedInput : undefined);
	const provider = accessibleViewService.registerProvider({
		id: type,
		provideContent: () => helpText,
		onClose: () => {
			if (type === 'chat' && cachedPosition) {
				inputEditor.setPosition(cachedPosition);
				inputEditor.focus();
			} else if (type === 'inline') {
				InlineChatController.get(editor)?.focus();
			}
			provider.dispose();
		},
		options: { ariaLabel: type === 'chat' ? localize('chat-help-label', "Chat accessibility help") : localize('inline-chat-label', "Inline chat accessibility help") }
	});
	accessibleViewService.show(type);
}
