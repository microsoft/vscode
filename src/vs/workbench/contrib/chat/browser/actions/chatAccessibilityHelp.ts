/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { AccessibleViewProviderId, AccessibleViewType } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleDiffViewerNext } from 'vs/editor/browser/widget/diffEditor/commands';
import { INLINE_CHAT_ID } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { CONTEXT_IN_CHAT_SESSION, CONTEXT_RESPONSE, CONTEXT_REQUEST } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';

export class ChatAccessibilityHelp implements IAccessibleViewImplentation {
	readonly priority = 105;
	readonly name = 'panelChat';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.or(CONTEXT_IN_CHAT_SESSION, CONTEXT_RESPONSE, CONTEXT_REQUEST);
	getProvider(accessor: ServicesAccessor) {
		const codeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor() || accessor.get(ICodeEditorService).getFocusedCodeEditor();
		return getChatAccessibilityHelpProvider(accessor, codeEditor ?? undefined, 'panelChat');
	}
	dispose() { }
}

export function getAccessibilityHelpText(type: 'panelChat' | 'inlineChat'): string {
	const content = [];
	if (type === 'panelChat') {
		content.push(localize('chat.overview', 'The chat view is comprised of an input box and a request/response list. The input box is used to make requests and the list is used to display responses.'));
		content.push(localize('chat.requestHistory', 'In the input box, use up and down arrows to navigate your request history. Edit input and use enter or the submit button to run a new request.'));
		content.push(localize('chat.inspectResponse', 'In the input box, inspect the last response in the accessible view<keybinding:editor.action.accessibleView>'));
		content.push(localize('chat.followUp', 'In the input box, navigate to the suggested follow up question (Shift+Tab) and press Enter to run it.'));
		content.push(localize('chat.announcement', 'Chat responses will be announced as they come in. A response will indicate the number of code blocks, if any, and then the rest of the response.'));
		content.push(localize('workbench.action.chat.focus', 'To focus the chat request/response list, which can be navigated with up and down arrows, invoke the Focus Chat command<keybinding:chat.action.focus>.'));
		content.push(localize('workbench.action.chat.focusInput', 'To focus the input box for chat requests, invoke the Focus Chat Input command<keybinding:workbench.action.chat.focusInput>.'));
		content.push(localize('workbench.action.chat.nextCodeBlock', 'To focus the next code block within a response, invoke the Chat: Next Code Block command<keybinding:workbench.action.chat.nextCodeBlock>.'));
		content.push(localize('workbench.action.chat.nextFileTree', 'To focus the next file tree within a response, invoke the Chat: Next File Tree command<keybinding:workbench.action.chat.nextFileTree>.'));
		content.push(localize('workbench.action.chat.clear', 'To clear the request/response list, invoke the Chat Clear command<keybinding:workbench.action.chat.clear>.'));
	} else {
		content.push(localize('inlineChat.overview', "Inline chat occurs within a code editor and takes into account the current selection. It is useful for making changes to the current editor. For example, fixing diagnostics, documenting or refactoring code. Keep in mind that AI generated code may be incorrect."));
		content.push(localize('inlineChat.access', "It can be activated via code actions or directly using the command: Inline Chat: Start Inline Chat<keybinding:inlineChat.start>."));
		content.push(localize('inlineChat.requestHistory', 'In the input box, use<keybinding:inlineChat.previousFromHistory> and<keybinding:inlineChat.nextFromHistory> to navigate your request history. Edit input and use enter or the submit button to run a new request.'));
		content.push(localize('inlineChat.inspectResponse', 'In the input box, inspect the response in the accessible viewview<keybinding:editor.action.accessibleView>'));
		content.push(localize('inlineChat.contextActions', "Context menu actions may run a request prefixed with a /. Type / to discover such ready-made commands."));
		content.push(localize('inlineChat.fix', "If a fix action is invoked, a response will indicate the problem with the current code. A diff editor will be rendered and can be reached by tabbing."));
		content.push(localize('inlineChat.diff', "Once in the diff editor, enter review mode with<keybinding:{0}>. Use up and down arrows to navigate lines with the proposed changes.", AccessibleDiffViewerNext.id));
		content.push(localize('inlineChat.toolbar', "Use tab to reach conditional parts like commands, status, message responses and more."));
	}
	content.push(localize('chat.signals', "Accessibility Signals can be changed via settings with a prefix of signals.chat. By default, if a request takes more than 4 seconds, you will hear a sound indicating that progress is still occurring."));
	return content.join('\n\n');
}

export function getChatAccessibilityHelpProvider(accessor: ServicesAccessor, editor: ICodeEditor | undefined, type: 'panelChat' | 'inlineChat') {
	const widgetService = accessor.get(IChatWidgetService);
	const inputEditor: ICodeEditor | undefined = type === 'panelChat' ? widgetService.lastFocusedWidget?.inputEditor : editor;

	if (!inputEditor) {
		return;
	}
	const domNode = inputEditor.getDomNode() ?? undefined;
	if (!domNode) {
		return;
	}

	const cachedPosition = inputEditor.getPosition();
	inputEditor.getSupportedActions();
	const helpText = getAccessibilityHelpText(type);
	return {
		id: type === 'panelChat' ? AccessibleViewProviderId.Chat : AccessibleViewProviderId.InlineChat,
		verbositySettingKey: type === 'panelChat' ? AccessibilityVerbositySettingId.Chat : AccessibilityVerbositySettingId.InlineChat,
		provideContent: () => helpText,
		onClose: () => {
			if (type === 'panelChat' && cachedPosition) {
				inputEditor.setPosition(cachedPosition);
				inputEditor.focus();

			} else if (type === 'inlineChat') {
				// TODO@jrieken find a better way for this
				const ctrl = <{ focus(): void } | undefined>editor?.getContribution(INLINE_CHAT_ID);
				ctrl?.focus();

			}
		},
		options: { type: AccessibleViewType.Help }
	};
}
