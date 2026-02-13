/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatEditingSession } from '../../common/editing/chatEditingService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../common/constants.js';
import { getChatSessionType, LocalChatSessionUri } from '../../common/model/chatUri.js';
import { ChatViewId, IChatWidgetService, isIChatViewViewContext } from '../chat.js';
import { EditingSessionAction, EditingSessionActionContext, getEditingSessionContext } from '../chatEditing/chatEditingActions.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
import { ChatViewPane } from '../widgetHosts/viewPane/chatViewPane.js';
import { ACTION_ID_NEW_CHAT, ACTION_ID_NEW_EDIT_SESSION, CHAT_CATEGORY, handleCurrentEditingSession } from './chatActions.js';
import { clearChatEditor } from './chatClear.js';
import { AgentSessionProviders, AgentSessionsViewerOrientation } from '../agentSessions/agentSessions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

export interface INewEditSessionActionContext {

	/**
	 * An initial prompt to write to the chat.
	 */
	inputValue?: string;

	/**
	 * Selects opening in agent mode or not. If not set, the current mode is used.
	 * This is ignored when coming from a chat view title context.
	 */
	agentMode?: boolean;

	/**
	 * Whether the inputValue is partial and should wait for further user input.
	 * If false or not set, the prompt is sent immediately.
	 */
	isPartialQuery?: boolean;
}

function isNewEditSessionActionContext(arg: unknown): arg is INewEditSessionActionContext {
	if (arg && typeof arg === 'object') {
		const obj = arg as Record<string, unknown>;
		if (obj.inputValue !== undefined && typeof obj.inputValue !== 'string') {
			return false;
		}
		if (obj.agentMode !== undefined && typeof obj.agentMode !== 'boolean') {
			return false;
		}
		if (obj.isPartialQuery !== undefined && typeof obj.isPartialQuery !== 'boolean') {
			return false;
		}
		return true;
	}
	return false;
}

export function registerNewChatActions() {

	// Add "New Chat" submenu to Chat view menu
	MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
		submenu: MenuId.ChatNewMenu,
		title: localize2('chat.newEdits.label', "New Chat"),
		icon: Codicon.plus,
		when: ContextKeyExpr.equals('view', ChatViewId),
		group: 'navigation',
		order: -1,
		isSplitButton: true
	});

	registerAction2(class NewChatEditorAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chatEditor.newChat',
				title: localize2('chat.newChat.label', "New Chat"),
				icon: Codicon.plus,
				f1: false,
				precondition: ChatContextKeys.enabled,
			});
		}
		async run(accessor: ServicesAccessor, ...args: unknown[]) {
			await clearChatEditor(accessor);
		}
	});

	registerAction2(class NewChatAction extends Action2 {
		constructor() {
			super({
				id: ACTION_ID_NEW_CHAT,
				title: localize2('chat.newEdits.label', "New Chat"),
				category: CHAT_CATEGORY,
				icon: Codicon.plus,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
				f1: true,
				menu: [
					{
						id: MenuId.ChatContext,
						group: 'z_clear'
					},
					{
						id: MenuId.ChatNewMenu,
						group: '1_open',
						order: 1,
					},
					{
						id: MenuId.CompactWindowEditorTitle,
						group: 'navigation',
						when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
						order: 1
					}
				],
				keybinding: {
					weight: KeybindingWeight.WorkbenchContrib + 1,
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
					mac: {
						primary: KeyMod.CtrlCmd | KeyCode.KeyN,
						secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
					},
					when: ChatContextKeys.inChatSession
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: unknown[]) {
			const executeCommandContext = isNewEditSessionActionContext(args[0]) ? args[0] : undefined;

			// Context from toolbar or lastFocusedWidget
			const context = getEditingSessionContext(accessor, args);
			await runNewChatAction(accessor, context, executeCommandContext);
		}
	}
	);
	CommandsRegistry.registerCommandAlias(ACTION_ID_NEW_EDIT_SESSION, ACTION_ID_NEW_CHAT);

	registerAction2(class NewLocalChatAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.newLocalChat',
				title: localize2('chat.newLocalChat.label', "New Local Chat"),
				category: CHAT_CATEGORY,
				icon: Codicon.plus,
				precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)),
				f1: false,
			});
		}

		async run(accessor: ServicesAccessor, ...args: unknown[]) {
			const executeCommandContext = isNewEditSessionActionContext(args[0]) ? args[0] : undefined;

			// Context from toolbar or lastFocusedWidget
			const context = getEditingSessionContext(accessor, args);
			await runNewChatAction(accessor, context, executeCommandContext, AgentSessionProviders.Local);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.ChatViewSessionTitleNavigationToolbar, {
		command: {
			id: ACTION_ID_NEW_CHAT,
			title: localize2('chat.goBack', "Go Back"),
			icon: Codicon.arrowLeft,
		},
		when: ChatContextKeys.agentSessionsViewerOrientation.notEqualsTo(AgentSessionsViewerOrientation.SideBySide), // when sessions show side by side, no need for a back button
		group: 'navigation',
		order: 1
	});

	registerAction2(class UndoChatEditInteractionAction extends EditingSessionAction {
		constructor() {
			super({
				id: 'workbench.action.chat.undoEdit',
				title: localize2('chat.undoEdit.label', "Undo Last Edit"),
				category: CHAT_CATEGORY,
				icon: Codicon.discard,
				precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanUndo, ChatContextKeys.enabled),
				f1: true,
				menu: [{
					id: MenuId.ViewTitle,
					when: ContextKeyExpr.equals('view', ChatViewId),
					group: 'navigation',
					order: -3,
					isHiddenByDefault: true
				}]
			});
		}

		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession) {
			await editingSession.undoInteraction();
		}
	});

	registerAction2(class RedoChatEditInteractionAction extends EditingSessionAction {
		constructor() {
			super({
				id: 'workbench.action.chat.redoEdit',
				title: localize2('chat.redoEdit.label', "Redo Last Edit"),
				category: CHAT_CATEGORY,
				icon: Codicon.redo,
				precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled),
				f1: true,
				menu: [
					{
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', ChatViewId),
						group: 'navigation',
						order: -2,
						isHiddenByDefault: true
					}
				]
			});
		}

		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession) {
			const chatService = accessor.get(IChatService);
			await editingSession.redoInteraction();
			chatService.getSession(editingSession.chatSessionResource)?.setCheckpoint(undefined);
		}
	});

	registerAction2(class RedoChatCheckpoints extends EditingSessionAction {
		constructor() {
			super({
				id: 'workbench.action.chat.redoEdit2',
				title: localize2('chat.redoEdit.label2', "Redo"),
				tooltip: localize2('chat.redoEdit.tooltip', "Reapply discarded workspace changes and chat"),
				category: CHAT_CATEGORY,
				precondition: ContextKeyExpr.and(ChatContextKeys.chatEditingCanRedo, ChatContextKeys.enabled),
				f1: true,
				menu: [{
					id: MenuId.ChatMessageRestoreCheckpoint,
					when: ChatContextKeys.lockedToCodingAgent.negate(),
					group: 'navigation',
					order: -1
				}]
			});
		}

		async runEditingSessionAction(accessor: ServicesAccessor, editingSession: IChatEditingSession) {
			const widget = accessor.get(IChatWidgetService);

			while (editingSession.canRedo.get()) {
				await editingSession.redoInteraction();
			}

			const currentWidget = widget.getWidgetBySessionResource(editingSession.chatSessionResource);
			const requestText = currentWidget?.viewModel?.model.checkpoint?.message.text;

			// if the input has the same text that we just restored, clear it.
			if (currentWidget?.inputEditor.getValue() === requestText) {
				currentWidget?.input.setValue('', false);
			}

			currentWidget?.viewModel?.model.setCheckpoint(undefined);
			currentWidget?.focusInput();
		}
	});
}

/**
 * Creates a new session resource URI with the specified session type.
 * For remote sessions, creates a URI with the session type as the scheme.
 * For local sessions, creates a LocalChatSessionUri.
 */
function getResourceForNewChatSession(sessionType: string): URI {
	const isRemoteSession = sessionType !== localChatSessionType;
	if (isRemoteSession) {
		return URI.from({
			scheme: sessionType,
			path: `/untitled-${generateUuid()}`,
		});
	}

	return LocalChatSessionUri.forSession(generateUuid());
}

async function runNewChatAction(
	accessor: ServicesAccessor,
	context: EditingSessionActionContext | undefined,
	executeCommandContext?: INewEditSessionActionContext,
	sessionType?: AgentSessionProviders
) {
	const accessibilityService = accessor.get(IAccessibilityService);
	const viewsService = accessor.get(IViewsService);
	const configurationService = accessor.get(IConfigurationService);

	const { editingSession, chatWidget: widget } = context ?? {};
	if (!widget) {
		return;
	}

	const dialogService = accessor.get(IDialogService);

	const model = widget.viewModel?.model;
	if (model && !(await handleCurrentEditingSession(model, undefined, dialogService))) {
		return;
	}

	await editingSession?.stop();

	// Create a new session with the same type as the current session
	const currentResource = widget.viewModel?.model.sessionResource;
	const newSessionType = sessionType ?? (currentResource ? getChatSessionType(currentResource) : localChatSessionType);
	if (isIChatViewViewContext(widget.viewContext) && newSessionType !== localChatSessionType) {
		// For the sidebar, we need to explicitly load a session with the same type
		const newResource = getResourceForNewChatSession(newSessionType);
		const view = await viewsService.openView(ChatViewId) as ChatViewPane;
		await view.loadSession(newResource);
	} else {
		// For the editor, widget.clear() already preserves the session type via clearChatEditor
		await widget.clear();
	}

	widget.attachmentModel.clear(true);
	widget.focusInput();

	accessibilityService.alert(localize('newChat', "New chat"));

	if (!executeCommandContext) {
		return;
	}

	if (typeof executeCommandContext.agentMode === 'boolean') {
		widget.input.setChatMode(executeCommandContext.agentMode ? ChatModeKind.Agent : ChatModeKind.Edit);
	} else if (widget.input.currentModeKind === ChatModeKind.Edit && configurationService.getValue<boolean>(ChatConfiguration.EditModeHidden)) {
		widget.input.setChatMode(ChatModeKind.Agent);
	}

	if (executeCommandContext.inputValue) {
		if (executeCommandContext.isPartialQuery) {
			widget.setInput(executeCommandContext.inputValue);
		} else {
			widget.acceptInput(executeCommandContext.inputValue);
		}
	}
}
