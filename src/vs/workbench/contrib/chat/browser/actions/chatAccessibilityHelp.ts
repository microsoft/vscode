/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { format } from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { InlineChatController } from 'vs/workbench/contrib/inlineChat/browser/inlineChatController';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleDiffViewerNext } from 'vs/editor/browser/widget/diffEditor.contribution';

export function getAccessibilityHelpText(accessor: ServicesAccessor, type: 'panelChat' | 'inlineChat'): string {
	const keybindingService = accessor.get(IKeybindingService);
	const content = [];
	const openAccessibleViewKeybinding = keybindingService.lookupKeybinding('editor.action.accessibleView')?.getAriaLabel();
	if (type === 'panelChat') {
		content.push(localize('chat.overview', 'The chat view is comprised of an input box and a request/response list. The input box is used to make requests and the list is used to display responses.'));
		content.push(localize('chat.requestHistory', 'In the input box, use up and down arrows to navigate your request history. Edit input and use enter or the submit button to run a new request.'));
		content.push(openAccessibleViewKeybinding ? localize('chat.inspectResponse', 'In the input box, inspect the last response in the accessible view via {0}', openAccessibleViewKeybinding) : localize('chat.inspectResponseNoKb', 'With the input box focused, inspect the last response in the accessible view via the Open Accessible View command, which is currently not triggerable by a keybinding.'));
		content.push(localize('chat.announcement', 'Chat responses will be announced as they come in. A response will indicate the number of code blocks, if any, and then the rest of the response.'));
		content.push(descriptionForCommand('chat.action.focus', localize('workbench.action.chat.focus', 'To focus the chat request/response list, which can be navigated with up and down arrows, invoke the Focus Chat command ({0}).',), localize('workbench.action.chat.focusNoKb', 'To focus the chat request/response list, which can be navigated with up and down arrows, invoke The Focus Chat List command, which is currently not triggerable by a keybinding.'), keybindingService));
		content.push(descriptionForCommand('workbench.action.chat.focusInput', localize('workbench.action.chat.focusInput', 'To focus the input box for chat requests, invoke the Focus Chat Input command ({0})'), localize('workbench.action.interactiveSession.focusInputNoKb', 'To focus the input box for chat requests, invoke the Focus Chat Input command, which is currently not triggerable by a keybinding.'), keybindingService));
		content.push(descriptionForCommand('workbench.action.chat.nextCodeBlock', localize('workbench.action.chat.nextCodeBlock', 'To focus the next code block within a response, invoke the Chat: Next Code Block command ({0}).'), localize('workbench.action.chat.nextCodeBlockNoKb', 'To focus the next code block within a response, invoke the Chat: Next Code Block command, which is currently not triggerable by a keybinding.'), keybindingService));
		content.push(descriptionForCommand('workbench.action.chat.nextFileTree', localize('workbench.action.chat.nextFileTree', 'To focus the next file tree within a response, invoke the Chat: Next File Tree command ({0}).'), localize('workbench.action.chat.nextFileTreeNoKb', 'To focus the next file tree within a response, invoke the Chat: Next File Tree command, which is currently not triggerable by a keybinding.'), keybindingService));
		content.push(descriptionForCommand('workbench.action.chat.clear', localize('workbench.action.chat.clear', 'To clear the request/response list, invoke the Chat Clear command ({0}).'), localize('workbench.action.chat.clearNoKb', 'To clear the request/response list, invoke the Chat Clear command, which is currently not triggerable by a keybinding.'), keybindingService));
	} else {
		const startChatKeybinding = keybindingService.lookupKeybinding('inlineChat.start')?.getAriaLabel();
		content.push(localize('inlineChat.overview', "Inline chat occurs within a code editor and takes into account the current selection. It is useful for making changes to the current editor. For example, fixing diagnostics, documenting or refactoring code. Keep in mind that AI generated code may be incorrect."));
		content.push(localize('inlineChat.access', "It can be activated via code actions or directly using the command: Inline Chat: Start Code Chat ({0}).", startChatKeybinding));
		const upHistoryKeybinding = keybindingService.lookupKeybinding('inlineChat.previousFromHistory')?.getAriaLabel();
		const downHistoryKeybinding = keybindingService.lookupKeybinding('inlineChat.nextFromHistory')?.getAriaLabel();
		if (upHistoryKeybinding && downHistoryKeybinding) {
			content.push(localize('inlineChat.requestHistory', 'In the input box, use {0} and {1} to navigate your request history. Edit input and use enter or the submit button to run a new request.', upHistoryKeybinding, downHistoryKeybinding));
		}
		content.push(openAccessibleViewKeybinding ? localize('inlineChat.inspectResponse', 'In the input box, inspect the response in the accessible view via {0}', openAccessibleViewKeybinding) : localize('inlineChat.inspectResponseNoKb', 'With the input box focused, inspect the response in the accessible view via the Open Accessible View command, which is currently not triggerable by a keybinding.'));
		content.push(localize('inlineChat.contextActions', "Context menu actions may run a request prefixed with a /. Type / to discover such ready-made commands."));
		content.push(localize('inlineChat.fix', "If a fix action is invoked, a response will indicate the problem with the current code. A diff editor will be rendered and can be reached by tabbing."));
		const diffReviewKeybinding = keybindingService.lookupKeybinding(AccessibleDiffViewerNext.id)?.getAriaLabel();
		content.push(diffReviewKeybinding ? localize('inlineChat.diff', "Once in the diff editor, enter review mode with ({0}). Use up and down arrows to navigate lines with the proposed changes.", diffReviewKeybinding) : localize('inlineChat.diffNoKb', "Tab again to enter the Diff editor with the changes and enter review mode with the Go to Next Difference Command. Use Up/DownArrow to navigate lines with the proposed changes."));
		content.push(localize('inlineChat.toolbar', "Use tab to reach conditional parts like commands, status, message responses and more."));
	}
	content.push(localize('chat.audioCues', "Audio cues can be changed via settings with a prefix of audioCues.chat. By default, if a request takes more than 4 seconds, you will hear an audio cue indicating that progress is still occurring."));
	return content.join('\n\n');
}

function descriptionForCommand(commandId: string, msg: string, noKbMsg: string, keybindingService: IKeybindingService): string {
	const kb = keybindingService.lookupKeybinding(commandId);
	if (kb) {
		return format(msg, kb.getAriaLabel());
	}
	return format(noKbMsg, commandId);
}

export async function runAccessibilityHelpAction(accessor: ServicesAccessor, editor: ICodeEditor, type: 'panelChat' | 'inlineChat'): Promise<void> {
	const widgetService = accessor.get(IChatWidgetService);
	const accessibleViewService = accessor.get(IAccessibleViewService);
	const inputEditor: ICodeEditor | undefined = type === 'panelChat' ? widgetService.lastFocusedWidget?.inputEditor : editor;
	const editorUri = editor.getModel()?.uri;

	if (!inputEditor || !editorUri) {
		return;
	}
	const domNode = inputEditor.getDomNode() ?? undefined;
	if (!domNode) {
		return;
	}

	const cachedPosition = inputEditor.getPosition();
	inputEditor.getSupportedActions();
	const helpText = getAccessibilityHelpText(accessor, type);
	accessibleViewService.show({
		verbositySettingKey: type === 'panelChat' ? AccessibilityVerbositySettingId.Chat : AccessibilityVerbositySettingId.InlineChat,
		provideContent: () => helpText,
		onClose: () => {
			if (type === 'panelChat' && cachedPosition) {
				inputEditor.setPosition(cachedPosition);
				inputEditor.focus();
			} else if (type === 'inlineChat') {
				InlineChatController.get(editor)?.focus();
			}
		},
		options: { type: AccessibleViewType.Help }
	});
}
