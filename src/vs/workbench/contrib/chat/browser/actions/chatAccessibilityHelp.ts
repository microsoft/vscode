/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { AccessibleDiffViewerNext } from '../../../../../editor/browser/widget/diffEditor/commands.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { INLINE_CHAT_ID } from '../../../inlineChat/common/inlineChat.js';
import { TerminalContribCommandId } from '../../../terminal/terminalContribExports.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { FocusAgentSessionsAction } from '../agentSessions/agentSessionsActions.js';
import { IChatWidgetService } from '../chat.js';
import { ChatEditingShowChangesAction, ViewPreviousEditsAction } from '../chatEditing/chatEditingActions.js';

export class PanelChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 107;
	readonly name = 'panelChat';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat), ChatContextKeys.inQuickChat.negate(), ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask), ContextKeyExpr.or(ChatContextKeys.inChatSession, ChatContextKeys.isResponse, ChatContextKeys.isRequest));
	getProvider(accessor: ServicesAccessor) {
		return getChatAccessibilityHelpProvider(accessor, undefined, 'panelChat');
	}
}

export class QuickChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 107;
	readonly name = 'quickChat';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(ChatContextKeys.inQuickChat, ContextKeyExpr.or(ChatContextKeys.inChatSession, ChatContextKeys.isResponse, ChatContextKeys.isRequest));
	getProvider(accessor: ServicesAccessor) {
		return getChatAccessibilityHelpProvider(accessor, undefined, 'quickChat');
	}
}

export class EditsChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 119;
	readonly name = 'editsView';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(ChatContextKeyExprs.inEditingMode, ChatContextKeys.inChatInput);
	getProvider(accessor: ServicesAccessor) {
		return getChatAccessibilityHelpProvider(accessor, undefined, 'editsView');
	}
}

export class AgentChatAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'agentView';
	readonly type = AccessibleViewType.Help;
	readonly when = ContextKeyExpr.and(ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent), ChatContextKeys.inChatInput);
	getProvider(accessor: ServicesAccessor) {
		return getChatAccessibilityHelpProvider(accessor, undefined, 'agentView');
	}
}

export function getAccessibilityHelpText(type: 'panelChat' | 'inlineChat' | 'agentView' | 'quickChat' | 'editsView' | 'agentView', keybindingService: IKeybindingService): string {
	const content = [];
	if (type === 'panelChat' || type === 'quickChat' || type === 'agentView') {
		if (type === 'quickChat') {
			content.push(localize('chat.overview', 'The quick chat view is comprised of an input box and a request/response list. The input box is used to make requests and the list is used to display responses.'));
			content.push(localize('chat.differenceQuick', 'The quick chat view is a transient interface for making and viewing requests, while the panel chat view is a persistent interface that also supports navigating suggested follow-up questions.'));
		} else {
			content.push(localize('chat.differencePanel', 'The chat view is a persistent interface that also supports navigating suggested follow-up questions, while the quick chat view is a transient interface for making and viewing requests.'));
			content.push(localize('workbench.action.chat.newChat', 'To create a new chat session, invoke the New Chat command{0}.', '<keybinding:workbench.action.chat.newChat>'));
			content.push(localize('workbench.action.chat.history', 'To view all chat sessions, invoke the Show Chats command{0}.', '<keybinding:workbench.action.chat.history>'));
			content.push(localize('workbench.action.chat.focusAgentSessionsViewer', 'You can focus the agent sessions list by invoking the Focus Agent Sessions command{0}.', `<keybinding:${FocusAgentSessionsAction.id}>`));
		}
		content.push(localize('chat.requestHistory', 'In the input box, use up and down arrows to navigate your request history. Edit input and use enter or the submit button to run a new request.'));
		content.push(localize('chat.attachments.removal', 'To remove attached contexts, focus an attachment and press Delete or Backspace.'));
		content.push(localize('chat.inspectResponse', 'In the input box, inspect the last response in the accessible view{0}.', '<keybinding:editor.action.accessibleView>'));
		content.push(localize('workbench.action.chat.focus', 'To focus the chat request and response list, invoke the Focus Chat command{0}. This will move focus to the most recent response, which you can then navigate using the up and down arrow keys.', getChatFocusKeybindingLabel(keybindingService, type, 'last')));
		content.push(localize('workbench.action.chat.focusLastFocusedItem', 'To return to the last chat response you focused, invoke the Focus Last Focused Chat Response command{0}.', getChatFocusKeybindingLabel(keybindingService, type, 'lastFocused')));
		content.push(localize('workbench.action.chat.focusInput', 'To focus the input box for chat requests, invoke the Focus Chat Input command{0}.', getChatFocusKeybindingLabel(keybindingService, type, 'input')));
		content.push(localize('chat.progressVerbosity', 'As the chat request is being processed, you will hear verbose progress updates if the request takes more than 4 seconds. This includes information like searched text for <search term> with X results, created file <file_name>, or read file <file path>. This can be disabled with accessibility.verboseChatProgressUpdates.'));
		content.push(localize('chat.announcement', 'Chat responses will be announced as they come in. A response will indicate the number of code blocks, if any, and then the rest of the response.'));
		content.push(localize('workbench.action.chat.nextCodeBlock', 'To focus the next code block within a response, invoke the Chat: Next Code Block command{0}.', '<keybinding:workbench.action.chat.nextCodeBlock>'));
		content.push(localize('workbench.action.chat.nextUserPrompt', 'To navigate to the next user prompt in the conversation, invoke the Next User Prompt command{0}.', '<keybinding:workbench.action.chat.nextUserPrompt>'));
		content.push(localize('workbench.action.chat.previousUserPrompt', 'To navigate to the previous user prompt in the conversation, invoke the Previous User Prompt command{0}.', '<keybinding:workbench.action.chat.previousUserPrompt>'));
		content.push(localize('workbench.action.chat.announceConfirmation', 'To focus pending chat confirmation dialogs, invoke the Focus Chat Confirmation Status command{0}.', '<keybinding:workbench.action.chat.focusConfirmation>'));
		content.push(localize('chat.showHiddenTerminals', 'If there are any hidden chat terminals, you can view them by invoking the View Hidden Chat Terminals command{0}.', '<keybinding:workbench.action.terminal.chat.viewHiddenChatTerminals>'));
		content.push(localize('chat.focusMostRecentTerminal', 'To focus the last chat terminal that ran a tool, invoke the Focus Most Recent Chat Terminal command{0}.', `<keybinding:${TerminalContribCommandId.FocusMostRecentChatTerminal}>`));
		content.push(localize('chat.focusMostRecentTerminalOutput', 'To focus the output from the last chat terminal tool, invoke the Focus Most Recent Chat Terminal Output command{0}.', `<keybinding:${TerminalContribCommandId.FocusMostRecentChatTerminalOutput}>`));
	}
	if (type === 'editsView' || type === 'agentView') {
		if (type === 'agentView') {
			content.push(localize('chatAgent.overview', 'The chat agent view is used to apply edits across files in your workspace, enable running commands in the terminal, and more.'));
		} else {
			content.push(localize('chatEditing.overview', 'The chat editing view is used to apply edits across files.'));
		}
		content.push(localize('chatEditing.format', 'It is comprised of an input box and a file working set (Shift+Tab).'));
		content.push(localize('chatEditing.expectation', 'When a request is made, a progress indicator will play while the edits are being applied.'));
		content.push(localize('chatEditing.review', 'Once the edits are applied, a sound will play to indicate the document has been opened and is ready for review. The sound can be disabled with accessibility.signals.chatEditModifiedFile.'));
		content.push(localize('chatEditing.sections', 'Navigate between edits in the editor with navigate previous{0} and next{1}', '<keybinding:chatEditor.action.navigatePrevious>', '<keybinding:chatEditor.action.navigateNext>'));
		content.push(localize('chatEditing.acceptHunk', 'In the editor, Keep{0}, Undo{1}, or Toggle the Diff{2} for the current Change.', '<keybinding:chatEditor.action.acceptHunk>', '<keybinding:chatEditor.action.undoHunk>', '<keybinding:chatEditor.action.toggleDiff>'));
		content.push(localize('chatEditing.undoKeepSounds', 'Sounds will play when a change is accepted or undone. The sounds can be disabled with accessibility.signals.editsKept and accessibility.signals.editsUndone.'));
		if (type === 'agentView') {
			content.push(localize('chatAgent.userActionRequired', 'An alert will indicate when user action is required. For example, if the agent wants to run something in the terminal, you will hear Action Required: Run Command in Terminal.'));
			content.push(localize('chatAgent.runCommand', 'To take the action, use the accept tool command{0}.', '<keybinding:workbench.action.chat.acceptTool>'));
			content.push(localize('chatAgent.autoApprove', 'To automatically approve tool actions without manual confirmation, set {0} to {1} in your settings.', ChatConfiguration.GlobalAutoApprove, 'true'));
			content.push(localize('chatAgent.acceptTool', 'To accept a tool action, use the Accept Tool Confirmation command{0}.', '<keybinding:workbench.action.chat.acceptTool>'));
			content.push(localize('chatAgent.openEditedFilesSetting', 'By default, when edits are made to files, they will be opened. To change this behavior, set accessibility.openChatEditedFiles to false in your settings.'));
		}
		content.push(localize('chatEditing.helpfulCommands', 'Some helpful commands include:'));
		content.push(localize('workbench.action.chat.undoEdits', '- Undo Edits{0}.', '<keybinding:workbench.action.chat.undoEdits>'));
		content.push(localize('workbench.action.chat.editing.attachFiles', '- Attach Files{0}.', '<keybinding:workbench.action.chat.editing.attachFiles>'));
		content.push(localize('chatEditing.removeFileFromWorkingSet', '- Remove File from Working Set{0}.', '<keybinding:chatEditing.removeFileFromWorkingSet>'));
		content.push(localize('chatEditing.acceptFile', '- Keep{0} and Undo File{1}.', '<keybinding:chatEditing.acceptFile>', '<keybinding:chatEditing.discardFile>'));
		content.push(localize('chatEditing.saveAllFiles', '- Save All Files{0}.', '<keybinding:chatEditing.saveAllFiles>'));
		content.push(localize('chatEditing.acceptAllFiles', '- Keep All Edits{0}.', '<keybinding:chatEditing.acceptAllFiles>'));
		content.push(localize('chatEditing.discardAllFiles', '- Undo All Edits{0}.', '<keybinding:chatEditing.discardAllFiles>'));
		content.push(localize('chatEditing.openFileInDiff', '- Open File in Diff{0}.', '<keybinding:chatEditing.openFileInDiff>'));
		content.push(`- ${ChatEditingShowChangesAction.LABEL}<keybinding:chatEditing.viewChanges>`);
		content.push(`- ${ViewPreviousEditsAction.Label}<keybinding:chatEditing.viewPreviousEdits>`);
	}
	else {
		content.push(localize('inlineChat.overview', "Inline chat occurs within a code editor and takes into account the current selection. It is useful for making changes to the current editor. For example, fixing diagnostics, documenting or refactoring code. Keep in mind that AI generated code may be incorrect."));
		content.push(localize('inlineChat.access', "It can be activated via code actions or directly using the command: Inline Chat: Start Inline Chat{0}.", '<keybinding:inlineChat.start>'));
		content.push(localize('inlineChat.requestHistory', 'In the input box, use Show Previous{0} and Show Next{1} to navigate your request history. Edit input and use enter or the submit button to run a new request.', '<keybinding:history.showPrevious>', '<keybinding:history.showNext>'));
		content.push(localize('inlineChat.inspectResponse', 'In the input box, inspect the response in the accessible view{0}.', '<keybinding:editor.action.accessibleView>'));
		content.push(localize('inlineChat.contextActions', "Context menu actions may run a request prefixed with a /. Type / to discover such ready-made commands."));
		content.push(localize('inlineChat.fix', "If a fix action is invoked, a response will indicate the problem with the current code. A diff editor will be rendered and can be reached by tabbing."));
		content.push(localize('inlineChat.diff', "Once in the diff editor, enter review mode with{0}. Use up and down arrows to navigate lines with the proposed changes.", AccessibleDiffViewerNext.id));
		content.push(localize('inlineChat.toolbar', "Use tab to reach conditional parts like commands, status, message responses and more."));
	}
	content.push(localize('chat.signals', "Accessibility Signals can be changed via settings with a prefix of signals.chat. By default, if a request takes more than 4 seconds, you will hear a sound indicating that progress is still occurring."));
	return content.join('\n');
}

export function getChatAccessibilityHelpProvider(accessor: ServicesAccessor, editor: ICodeEditor | undefined, type: 'panelChat' | 'inlineChat' | 'quickChat' | 'editsView' | 'agentView'): AccessibleContentProvider | undefined {
	const widgetService = accessor.get(IChatWidgetService);
	const keybindingService = accessor.get(IKeybindingService);
	const inputEditor: ICodeEditor | undefined = widgetService.lastFocusedWidget?.inputEditor;

	if (!inputEditor) {
		return;
	}
	const domNode = inputEditor.getDomNode() ?? undefined;
	if (!domNode) {
		return;
	}

	const cachedPosition = inputEditor.getPosition();
	inputEditor.getSupportedActions();
	const helpText = getAccessibilityHelpText(type, keybindingService);
	return new AccessibleContentProvider(
		type === 'panelChat' ? AccessibleViewProviderId.PanelChat : type === 'inlineChat' ? AccessibleViewProviderId.InlineChat : type === 'agentView' ? AccessibleViewProviderId.AgentChat : AccessibleViewProviderId.QuickChat,
		{ type: AccessibleViewType.Help },
		() => helpText,
		() => {
			if (type === 'quickChat' || type === 'editsView' || type === 'agentView' || type === 'panelChat') {
				if (cachedPosition) {
					inputEditor.setPosition(cachedPosition);
				}
				inputEditor.focus();

			} else if (type === 'inlineChat') {
				// TODO@jrieken find a better way for this
				const ctrl = <{ focus(): void } | undefined>editor?.getContribution(INLINE_CHAT_ID);
				ctrl?.focus();

			}
		},
		type === 'inlineChat' ? AccessibilityVerbositySettingId.InlineChat : AccessibilityVerbositySettingId.Chat,
	);
}

// The when clauses for actions may not be true when we invoke the accessible view, so we need to provide the keybinding label manually
// to ensure it's correct
function getChatFocusKeybindingLabel(keybindingService: IKeybindingService, type: 'agentView' | 'panelChat' | 'inlineChat' | 'quickChat', focus?: 'lastFocused' | 'last' | 'input'): string | undefined {
	let kbs;
	const fallback = ' (unassigned keybinding)';
	if (focus === 'input') {
		kbs = keybindingService.lookupKeybindings('workbench.action.chat.focusInput');
	} else if (focus === 'lastFocused') {
		kbs = keybindingService.lookupKeybindings('workbench.chat.action.focusLastFocused');
	} else {
		kbs = keybindingService.lookupKeybindings('chat.action.focus');
	}
	if (!kbs?.length) {
		return fallback;
	}
	let kb;
	if (type === 'agentView' || type === 'panelChat') {
		if (focus !== 'input') {
			kb = kbs.find(kb => kb.getAriaLabel()?.includes('UpArrow'))?.getAriaLabel();
		} else {
			kb = kbs.find(kb => kb.getAriaLabel()?.includes('DownArrow'))?.getAriaLabel();
		}
	} else {
		// Quick chat
		if (focus !== 'input') {
			kb = kbs.find(kb => kb.getAriaLabel()?.includes('DownArrow'))?.getAriaLabel();
		} else {
			kb = kbs.find(kb => kb.getAriaLabel()?.includes('UpArrow'))?.getAriaLabel();
		}
	}
	return !!kb ? ` (${kb})` : fallback;
}
