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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { INLINE_CHAT_ID } from '../../../inlineChat/common/inlineChat.js';
import { TerminalContribCommandId } from '../../../terminal/terminalContribExports.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { isStickyPromptHeaderShown } from '../promptTimeline/promptTimelineWidgetContrib.js';
import { FocusAgentSessionsAction } from '../agentSessions/agentSessionsActions.js';
import { AGENT_SESSION_RENAME_ACTION_ID } from '../agentSessions/agentSessions.js';
import { IChatWidgetService, isIChatResourceViewContext } from '../chat.js';
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

export function getAccessibilityHelpText(type: 'panelChat' | 'inlineChat' | 'quickChat' | 'editsView' | 'agentView', keybindingService: IKeybindingService, supportsFileReferences: boolean, isSessionsWindow: boolean = false, stickyPromptHeaderShown: boolean = false, sessionStatusPillsSupported: boolean = type === 'panelChat' || type === 'agentView', sessionArchiveNudgeShown: boolean = false): string {
	const content = [];
	if (sessionArchiveNudgeShown) {
		content.push(localize('chat.sessionArchiveNudge', "An archive suggestion appears above the chat input when the session's pull requests are merged. Use Tab or Shift+Tab to reach Archive or Dismiss Archive Suggestion, then press Enter or Space. Dismissing the suggestion, including with Escape while it is focused, returns to the chat input. Archiving keeps the conversation available to you and agents. Use the session-list filter to find the session and unarchive it at any time. For worktree sessions, archiving cleans up the worktree and unarchiving recreates it."));
	}
	if (type === 'panelChat' || type === 'quickChat' || type === 'editsView' || type === 'agentView') {
		content.push(localize('chat.modelPicker.tiers', "In the tabbed model picker, the selected model's details open beside the list. Moving between model rows updates the details immediately without selecting a model. The card stays visible when the pointer leaves a row. Press Right Arrow from a model row to focus its details, and Left Arrow to return. When Auto routing tiers are available, the tiers remain visible while Auto is off. Use arrow keys to move between tiers, then Enter or Space to choose a tier and turn Auto on. Turning Auto off preserves the selected tier."));
		content.push(localize('chat.fileChangesDisclosure', 'File change summaries show the total files, additions, and deletions. Focus the disclosure and press Enter or Space to show or hide the individual files. Focus an additions and deletions label and press Enter or Space to open the changes in a diff editor.'));
	}
	if (type === 'panelChat' || type === 'quickChat' || type === 'agentView') {
		if (type === 'quickChat') {
			content.push(localize('chat.overview', 'The quick chat view is comprised of an input box and a request/response list. The input box is used to make requests and the list is used to display responses.'));
			content.push(localize('chat.differenceQuick', 'The quick chat view is a transient interface for making and viewing requests, while the panel chat view is a persistent interface that also supports navigating suggested follow-up questions.'));
		} else {
			content.push(localize('chat.differencePanel', 'The chat view is a persistent interface that also supports navigating suggested follow-up questions, while the quick chat view is a transient interface for making and viewing requests.'));
			content.push(localize('workbench.action.chat.newChat', 'To create a new chat session, invoke the New Chat command{0}.', '<keybinding:workbench.action.chat.newChat>'));
			content.push(localize('workbench.action.chat.focusAgentSessionsViewer', 'You can focus the agent sessions list by invoking the Focus Agent Sessions command{0}.', `<keybinding:${FocusAgentSessionsAction.id}>`));
			content.push(localize('chat.externalSessionFilter', 'The agent sessions filter includes an External submenu. Use it to choose whether external sessions from another application are shown for the last 24 hours, the last 7 days, always, or not at all.'));
			content.push(localize('workbench.action.openAgentsWindow', 'To open the Agents Window, invoke the Open Agents Window command{0}. In screen reader mode, this keybinding includes Alt to avoid conflicts with screen reader shortcuts.', '<keybinding:workbench.action.openAgentsWindow>'));
			content.push(localize('workbench.action.chat.openAgentHostFolderPicker', 'When starting an agent session in a multi-root workspace, you can choose which root folder it runs in by invoking the Folder command{0}, then selecting a folder from the list.', '<keybinding:workbench.action.chat.openAgentHostFolderPicker>'));
			content.push(localize('chat.agentHostApprovalsPicker', 'When an agent session exposes approval presets, use Tab to reach the Approvals picker and choose how it handles workspace access, commands, and the internet.'));
		}
		if (sessionStatusPillsSupported) {
			content.push(localize('chat.sessionStatusPills', 'When session status pills appear above the input, use Tab to focus the toolbar, then use the left and right arrow keys to move between pills. Press Enter or Space to activate a pill. Open the context menu{0} to choose which optional pills are visible. Pull Requests Options lets you show all pull requests or only open and draft ones, remembered across sessions. If every pull request is filtered out, use the toolbar context menu to show all again.', '<keybinding:editor.action.showContextMenu>'));
		}
		content.push(localize('chat.requestHistory', 'In the input box, use up and down arrows to navigate your request history. Edit input and use enter or the submit button to run a new request.'));
		content.push(localize('chat.vscodePet', 'Type /vscode-pet to show or hide the VS Code pet above the input. One pet appears in whichever editor or Agents window is active. Drag it around the chat with the mouse and release it to drop it, or flick it in any direction to throw it along the gesture before gravity pulls it down. Pointer collisions are ignored for half a second after a drag release. After that, while the pet is falling, move the pointer into it to bounce it upward; pointer movement and where it catches the pet affect the bounce. Sideways and upward travel do not start the bounce counter. A counter beside the pet tracks consecutive bounces and remains for up to five seconds after landing, or until the pet next reacts or interacts. Landing with at least twenty bounces triggers confetti unless reduced motion is enabled. If it falls past the input, a despawn effect appears at the bottom and a respawn effect appears at the top before it automatically returns to the input. Moving the pointer rapidly between the pet\u2019s left and right sides makes it dizzy. With the keyboard, use Tab to focus the pet, then the left and right arrows to make it hop along the input until it reaches an edge. Hold Shift with the left or right arrow to throw it toward a wall; while it is airborne, press Enter or Space to bounce it upward. Rapidly alternate the unmodified arrows to make it dizzy. Press Enter or Space while it is resting to interact with it. When an achievement unlocks, the pet shows a gold star for ten seconds; activate the pet during that time to open Achievements. Open its context menu{0} (for example Shift+F10), use the up and down arrow keys to choose Achievements, Go on the Run, Come Back, Grow, Shrink, Reset Size, Stable Colors, or Insiders Colors, and press Enter to activate the choice. Grow and Shrink change its size in twenty-percent steps, while Reset Size restores its default size. The pet position and selected size are shared across chats and windows and remembered after you restart.', '<keybinding:editor.action.showContextMenu>'));
		if (supportsFileReferences) {
			content.push(localize('chat.attachments.inlineReferences', 'To mention an attached context item at a specific position without removing it from the attached context, type # or @ and select the attachment from the suggestions.'));
			content.push(localize('chat.attachments.inlineReferenceHover', 'To inspect an inline attachment reference, place the cursor on it and invoke Show or Focus Hover{0}. Image references include a preview, while file and folder references include their path.', '<keybinding:editor.action.showHover>'));
		}
		content.push(localize('chat.attachments.removal', 'To remove attached contexts, focus an attachment and press Delete or Backspace.'));
		content.push(localize('workbench.action.chat.toggleSpeechToText', 'To dictate your request into the input box, invoke the Dictate command{0}. Invoke it again to stop; recording start and stop are indicated by accessibility signals.', '<keybinding:workbench.action.chat.toggleSpeechToText>'));
		content.push(localize('workbench.action.chat.cancelSpeechToText', 'While dictating, invoke the Cancel Dictation command{0} to stop and discard the dictated text.', '<keybinding:workbench.action.chat.cancelSpeechToText>'));
		content.push(localize('chat.speechToText.contextMenu', 'To choose a microphone or turn off dictation or Voice Mode, focus the microphone button in the input toolbar and open its context menu{0} (for example Shift+F10).', '<keybinding:editor.action.showContextMenu>'));
		content.push(localize('chat.voiceInputMode.segmented', 'When the segmented voice input control is enabled, the input toolbar offers Dictation and Voice Mode. A connected hands-free session also offers Mute or Unmute Microphone; manual Voice Mode instead offers Start or Stop Listening, where stopping sends the completed turn. Each button can be focused and activated with Enter or Space.'));
		content.push(localize('chat.voiceInputMode.holdToTalk', 'In manual Voice Mode, the Start or Stop Listening button toggles listening when tapped, or you can press and hold it to talk and release to send. You can also hold the Voice Mode: Hold to Talk keybinding{0} to talk and release to send; this interrupts the assistant to barge in.', '<keybinding:workbench.action.chat.voiceInputMode.holdToTalk>'));
		content.push(localize('chat.voiceMode.introduction', 'The first time Voice Mode starts, an introduction appears above the input box. Tab to reach it, then use the arrow keys to move between the available voices; Enter or Space plays a voice and keeps it for future conversations. Its description also contains two links: Settings, which opens the Voice Mode settings, and How It Responds, which opens a file for customizing what the agent says back. Voice Mode stays connected but does not listen while the introduction is open. Press Escape, or activate the Close button, to dismiss it and return to the input box.'));
		if (type === 'agentView') {
			content.push(localize('chat.voiceInputMode.agentProgress', 'When the experimental agents.voice.agentProgress setting is enabled, Voice Mode Agent requests may speak brief progress updates while investigating, planning, editing, validating, or recovering from a problem.'));
		}
		content.push(localize('chat.inspectResponse', 'In the input box, inspect the last response in the accessible view{0}. Thinking content is included in order by default.', '<keybinding:editor.action.accessibleView>'));
		content.push(localize('chat.inspectResponseThinkingToggle', 'To include or exclude thinking content in the accessible view, run the Toggle Thinking Content in Accessible View command from the Command Palette.'));
		content.push(localize('chat.completedResponseDisclosure', 'When completed response collapsing is enabled, the final response remains visible while earlier work is collapsed. Use Tab to focus the work disclosure and press Enter or Space to show or hide that work.'));
		if (type === 'agentView') {
			content.push(localize('chat.systemNotificationDisclosure', 'Some session status messages have additional details. Use Tab to focus the status message and press Enter or Space to show or hide its details.'));
		}
		content.push(localize('chat.subagentPill', 'When a subagent pill appears in a response, use Tab to focus it and press Enter or Space to open that subagent chat.'));
		content.push(localize('workbench.action.chat.focus', 'To focus the chat request and response list, invoke the Focus Chat command{0}. This will move focus to the most recent response, which you can then navigate using the up and down arrow keys.', getChatFocusKeybindingLabel(keybindingService, type, 'last')));
		content.push(localize('workbench.action.chat.focusLastFocusedItem', 'To return to the last chat response you focused, invoke the Focus Last Focused Chat Response command{0}.', getChatFocusKeybindingLabel(keybindingService, type, 'lastFocused')));
		content.push(localize('workbench.action.chat.focusInput', 'To focus the input box for chat requests, invoke the Focus Chat Input command{0}.', getChatFocusKeybindingLabel(keybindingService, type, 'input')));
		content.push(localize('chat.progressVerbosity', 'As the chat request is being processed, you will hear verbose progress updates if the request takes more than 4 seconds. This includes information like searched text for <search term> with X results, created file <file_name>, or read file <file path>. This can be disabled with accessibility.verboseChatProgressUpdates.'));
		content.push(localize('chat.announcement', 'Chat responses will be announced as they come in. A response will indicate the number of code blocks, if any, and then the rest of the response.'));
		content.push(localize('workbench.action.chat.nextCodeBlock', 'To focus the next code block within a response, invoke the Chat: Next Code Block command{0}.', '<keybinding:workbench.action.chat.nextCodeBlock>'));
		content.push(localize('workbench.action.chat.nextUserPrompt', 'To navigate to the next user prompt in the conversation, invoke the Next User Prompt command{0}.', '<keybinding:workbench.action.chat.nextUserPrompt>'));
		content.push(localize('workbench.action.chat.previousUserPrompt', 'To navigate to the previous user prompt in the conversation, invoke the Previous User Prompt command{0}.', '<keybinding:workbench.action.chat.previousUserPrompt>'));
		if (stickyPromptHeaderShown) {
			content.push(localize('chat.stickyPromptHeader', 'The prompt you have scrolled past is pinned to the top of the transcript. Activate its title to jump back to that prompt.'));
		}
		content.push(localize('workbench.action.chat.announceConfirmation', 'To focus pending chat confirmation dialogs, invoke the Focus Chat Confirmation Status command{0}.', '<keybinding:workbench.action.chat.focusConfirmation>'));
		content.push(localize('chat.showHiddenTerminals', 'If there are any hidden chat terminals, you can view them by invoking the View Hidden Chat Terminals command{0}.', '<keybinding:workbench.action.terminal.chat.viewHiddenChatTerminals>'));
		content.push(localize('chat.focusMostRecentTerminal', 'To focus the last chat terminal that ran a tool, invoke the Focus Most Recent Chat Terminal command{0}.', `<keybinding:${TerminalContribCommandId.FocusMostRecentChatTerminal}>`));
		content.push(localize('chat.focusMostRecentTerminalOutput', 'To focus the output from the last chat terminal tool, invoke the Focus Most Recent Chat Terminal Output command{0}.', `<keybinding:${TerminalContribCommandId.FocusMostRecentChatTerminalOutput}>`));
		content.push(localize('chat.focusQuestionCarousel', 'When a chat question appears, toggle focus between the question and the chat input{0}.', '<keybinding:workbench.action.chat.focusQuestionCarousel>'));
		content.push(localize('chat.previousQuestionCarouselQuestion', 'When a chat question is focused, move to the previous question{0}.', '<keybinding:workbench.action.chat.previousQuestion>'));
		content.push(localize('chat.nextQuestionCarouselQuestion', 'When a chat question is focused, move to the next question{0}.', '<keybinding:workbench.action.chat.nextQuestion>'));
		content.push(localize('chat.planReviewEditor', 'When a plan is ready for review, open it from the chat response to edit the plan and add line comments. Use the editor toolbar to navigate, clear, or submit feedback. Choose an implementation action from the plan review in Chat.'));
		content.push(localize('chat.focusNotice', 'When a tip, notification or introduction appears above the input, toggle focus between it and the chat input{0}.', '<keybinding:workbench.action.chat.focusTip>'));
		if (isSessionsWindow) {
			content.push(localize('sessions.selectionSideChat', 'When you select text within an assistant response, an Ask Question input appears near the selection. Type a question and press Enter to start a new side chat scoped to that selection.'));
			content.push(localize('sessions.requestOrigin', 'Some requests include a source chat button above the message. Use Tab to focus it, then Enter or Space to open the originating chat.'));
			content.push(localize('sessions.threadCoordinationResult', 'Completed create-chat and send-message operations can include a target chat button in the response. Use Tab to focus it, then Enter or Space to open that chat.'));
		}
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
			content.push(localize('chatAgent.focusTodosView', 'To toggle focus between the Agent TODOs view and the chat input, use Agent TODOs: Toggle Focus{0}.', '<keybinding:workbench.action.chat.focusTodosView>'));
		}
		content.push(localize('chatEditing.helpfulCommands', 'Some helpful commands include:'));
		content.push(localize('workbench.action.chat.undoEdits', '- Undo Edits{0}.', '<keybinding:workbench.action.chat.undoEdits>'));
		content.push(localize('workbench.action.chat.restoreLastCheckpoint', '- Restore to Last Checkpoint{0}.', '<keybinding:workbench.action.chat.restoreLastCheckpoint>'));
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
	// Find is enabled on the chat view, chat editors and the Agents window, but not on quick
	// chat, inline chat or the input window (see `enableFind` in each host's view options).
	if (type === 'panelChat' || type === 'editsView' || type === 'agentView') {
		content.push(localize('chat.find', 'To search the chat transcript, invoke Find in Chat{0}. Find Next{1} and Find Previous{2} move between results, scrolling each one into view.', '<keybinding:workbench.action.chat.find>', '<keybinding:workbench.action.chat.findNext>', '<keybinding:workbench.action.chat.findPrevious>'));
	}
	if (!isSessionsWindow && (type === 'panelChat' || type === 'editsView' || type === 'agentView')) {
		content.push(localize('chat.renameSession', 'To rename the current chat session when supported, invoke the Rename command{0}. Agent Host sessions can be renamed after sending the first request.', `<keybinding:${AGENT_SESSION_RENAME_ACTION_ID}>`));
	}
	content.push(localize('chat.attachments.pastedText', "Long pasted text is stored as an attached text item and replaced in the input with a numbered inline reference."));
	content.push(localize('chat.paste.asText', "To paste the clipboard as plain text, without converting it to Markdown or storing it as an attachment, invoke Paste as Text{0}.", '<keybinding:editor.action.pasteAsText>'));
	content.push(localize('chat.signals', "Accessibility Signals can be changed via settings with a prefix of signals.chat. By default, if a request takes more than 4 seconds, you will hear a sound indicating that progress is still occurring."));
	return content.join('\n');
}

export function getChatAccessibilityHelpProvider(accessor: ServicesAccessor, editor: ICodeEditor | undefined, type: 'panelChat' | 'inlineChat' | 'quickChat' | 'editsView' | 'agentView'): AccessibleContentProvider | undefined {
	const widgetService = accessor.get(IChatWidgetService);
	const keybindingService = accessor.get(IKeybindingService);
	const environmentService = accessor.get(IWorkbenchEnvironmentService);
	const configurationService = accessor.get(IConfigurationService);
	const widget = widgetService.lastFocusedWidget;

	if (!widget) {
		return;
	}
	const inputEditor: ICodeEditor = widget.inputEditor;
	const domNode = inputEditor.getDomNode() ?? undefined;
	if (!domNode) {
		return;
	}

	const cachedPosition = inputEditor.getPosition();
	inputEditor.getSupportedActions();
	const isInlineChat = isIChatResourceViewContext(widget.viewContext) && widget.viewContext.isInlineChat;
	const helpText = getAccessibilityHelpText(type, keybindingService, widget.supportsFileReferences, environmentService.isSessionsWindow, isStickyPromptHeaderShown(widget, configurationService), !widget.rendersInputOnTop && !isInlineChat, widget.inputPart.hasSessionArchiveNudge);
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
