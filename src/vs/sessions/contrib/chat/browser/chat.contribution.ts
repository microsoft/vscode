/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../../workbench/browser/editor.js';
import { Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../workbench/common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { EditorExtensions } from '../../../../workbench/common/editor.js';
import { AgentHostSandboxNotifications } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSandboxNotifications.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { BranchChatSessionAction } from './branchChatSessionAction.js';
import { RunScriptContribution } from './runScriptAction.js';
import './nullInlineChatSessionService.js';
import './modelPicker.js';
import './newSessionOnboardingTargets.js';
import './newSessionPickerTryout.js';
import './agentHostDelegation.js';
import './newSessionFolderQuickPickAction.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ISessionsTasksService, SessionsTasksService } from './sessionsTasksService.js';
import { ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry } from './sessionTaskRunner.js';
import { RegisterDefaultSessionTaskRunnersContribution } from './registerDefaultSessionTaskRunners.js';
import { AgenticPromptsService } from './promptsService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { IAICustomizationWorkspaceService } from '../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { SessionsAICustomizationWorkspaceService } from './aiCustomizationWorkspaceService.js';
import { SessionsCustomizationHarnessService } from './customizationHarnessService.js';
import { IChatViewFactory } from '../../../services/chatView/browser/chatViewFactory.js';
import { ChatViewFactory } from './chatView.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionsChatAccessibilityHelp } from './sessionsChatAccessibilityHelp.js';
import { SessionWorktreeCleanupAccessibilityHelp } from '../../sessionInputBanners/browser/sessionWorktreeCleanupAccessibilityHelp.js';
import { SessionsOpenerParticipantContribution } from './sessionsOpenerParticipant.js';
import { OpenSessionLinkOpenerContribution } from './openSessionLinkOpener.contribution.js';
import { WorktreeCreatedTaskDispatcher, AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING } from './worktreeCreatedTaskDispatcher.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import '../../sessions/browser/mobile/mobileOverlayContribution.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, NEW_SESSION_WELCOME_MESSAGES_SETTING, NEW_SESSION_WELCOME_NAME_SETTING, NEW_SESSION_WELCOME_PHRASES_SETTING } from '../common/constants.js';
import { SessionsChatBackgroundAvailableContext, SessionsChatBackgroundImageConfiguredContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from './chatViewStateService.js';
import { SessionsChatResponseFileChangesService } from './sessionTurnChanges.js';
import { IChatResponseFileChangesService } from '../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { SessionsChatPetAchievementContribution } from './chatPetAchievements.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, chatBackgroundImageLayoutValues, ChatBackgroundImageLayout, ISessionsChatBackgroundService, SessionsChatBackgroundService } from '../../../services/chatBackground/browser/chatBackgroundService.js';
import { LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING, unifiedWorkspacePickerConfigurationMigration } from './unifiedWorkspacePickerConfiguration.js';
import { ISessionArchiveNudgeService, SESSION_ARCHIVE_NUDGE_SETTING, SessionArchiveNudgeContribution, SessionArchiveNudgeService } from './sessionArchiveNudge.js';
import { NewChatInSessionsWindowAction } from './newSessionAction.js';
import { FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID } from '../../../common/sessionCommands.js';
import { FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING, FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN, FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING, FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN } from './newChatPickerKeybinding.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING } from './responseSelectionSideChatController.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, SessionsChatBackgroundTint, ToggleChatBackgroundTintAction } from './chatBackgroundTint.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { sessionStorageCleanupSuggestionConfigurationMigration } from '../../sessionInputBanners/browser/sessionStorageCleanupConfiguration.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, ISessionWorktreeCleanupService, MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID, SessionWorktreeCleanupService } from '../../sessionInputBanners/browser/sessionWorktreeCleanupService.js';
import { SessionWorktreeCleanupEditorInput } from '../../sessionInputBanners/browser/sessionWorktreeCleanupEditorInput.js';
import { SessionWorktreeCleanupEditor } from '../../sessionInputBanners/browser/sessionWorktreeCleanupEditor.js';

const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_COMMAND_ID = 'workbench.action.chat.changeAgentSessionsBackground';
const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_LAYOUT_COMMAND_ID = 'workbench.action.chat.changeAgentSessionsBackgroundLayout';
const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN = ContextKeyExpr.and(IsSessionsWindowContext, SessionsChatBackgroundAvailableContext);
const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_LAYOUT_WHEN = ContextKeyExpr.and(CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN, SessionsChatBackgroundImageConfiguredContext);

type RecentChatBackgroundTypeItem = IQuickPickItem & {
	readonly kind: 'recentImage';
	readonly image: URI;
};

type ChatBackgroundTypeItem = IQuickPickItem & ({
	readonly kind: 'none' | 'codicons' | 'image';
}) | RecentChatBackgroundTypeItem;

const chatBackgroundTypeItems: ChatBackgroundTypeItem[] = [{
	kind: 'none',
	label: localize('chat.agentSessions.backgroundType.none.label', "No Background"),
	detail: localize('chat.agentSessions.backgroundType.none.detail', "Remove the current chat background."),
}, {
	kind: 'codicons',
	label: localize('chat.agentSessions.backgroundType.codicons.label', "Codicons"),
	detail: localize('chat.agentSessions.backgroundType.codicons.detail', "Use a theme-aware pattern of built-in VS Code icons."),
}, {
	kind: 'image',
	label: localize('chat.agentSessions.backgroundType.image.label', "Image..."),
	detail: localize('chat.agentSessions.backgroundType.image.detail', "Choose an image file from this machine."),
}];

interface IChatBackgroundImageLayoutMetadata extends IQuickPickItem {
	readonly detail: string;
}

const chatBackgroundImageLayoutMetadata: Record<ChatBackgroundImageLayout, IChatBackgroundImageLayoutMetadata> = {
	repeat: {
		label: localize('chat.agentSessions.backgroundImageLayout.repeat.label', "Repeat"),
		detail: localize('chat.agentSessions.backgroundImageLayout.repeat.description', "Repeats the image at its original size until it fills the chat background."),
	},
	stretch: {
		label: localize('chat.agentSessions.backgroundImageLayout.stretch.label', "Stretch"),
		detail: localize('chat.agentSessions.backgroundImageLayout.stretch.description', "Stretches the image to fill the chat background."),
	},
	center: {
		label: localize('chat.agentSessions.backgroundImageLayout.center.label', "Center"),
		detail: localize('chat.agentSessions.backgroundImageLayout.center.description', "Shows the image at its original size in the center."),
	},
	top: {
		label: localize('chat.agentSessions.backgroundImageLayout.top.label', "Top"),
		detail: localize('chat.agentSessions.backgroundImageLayout.top.description', "Shows the image at its original size at the top center."),
	},
	'top-right': {
		label: localize('chat.agentSessions.backgroundImageLayout.topRight.label', "Top Right"),
		detail: localize('chat.agentSessions.backgroundImageLayout.topRight.description', "Shows the image at its original size in the top right."),
	},
	'top-left': {
		label: localize('chat.agentSessions.backgroundImageLayout.topLeft.label', "Top Left"),
		detail: localize('chat.agentSessions.backgroundImageLayout.topLeft.description', "Shows the image at its original size in the top left."),
	},
	bottom: {
		label: localize('chat.agentSessions.backgroundImageLayout.bottom.label', "Bottom"),
		detail: localize('chat.agentSessions.backgroundImageLayout.bottom.description', "Shows the image at its original size at the bottom center."),
	},
	'bottom-right': {
		label: localize('chat.agentSessions.backgroundImageLayout.bottomRight.label', "Bottom Right"),
		detail: localize('chat.agentSessions.backgroundImageLayout.bottomRight.description', "Shows the image at its original size in the bottom right."),
	},
	'bottom-left': {
		label: localize('chat.agentSessions.backgroundImageLayout.bottomLeft.label', "Bottom Left"),
		detail: localize('chat.agentSessions.backgroundImageLayout.bottomLeft.description', "Shows the image at its original size in the bottom left."),
	},
	left: {
		label: localize('chat.agentSessions.backgroundImageLayout.left.label', "Left"),
		detail: localize('chat.agentSessions.backgroundImageLayout.left.description', "Shows the image at its original size at the center left."),
	},
	right: {
		label: localize('chat.agentSessions.backgroundImageLayout.right.label', "Right"),
		detail: localize('chat.agentSessions.backgroundImageLayout.right.description', "Shows the image at its original size at the center right."),
	},
};

const chatBackgroundImageLayoutItems = chatBackgroundImageLayoutValues.map(layout => ({
	layout,
	...chatBackgroundImageLayoutMetadata[layout],
}));

const chatBackgroundImageLayoutEnumConfiguration = {
	enum: [...chatBackgroundImageLayoutValues],
	enumItemLabels: chatBackgroundImageLayoutItems.map(item => item.label),
	enumDescriptions: chatBackgroundImageLayoutItems.map(item => item.detail),
};

registerAction2(NewChatInSessionsWindowAction);

class FocusNewSessionWorkspacePickerAction extends Action2 {
	constructor() {
		super({
			id: FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID,
			title: localize2('sessions.focusNewSessionWorkspacePicker', "Focus Workspace Picker"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: FOCUS_NEW_SESSION_WORKSPACE_PICKER_WHEN,
				primary: FOCUS_NEW_SESSION_WORKSPACE_PICKER_KEYBINDING,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		(sessionsPartService.getFocusedSessionView() ?? sessionsPartService.getSessionView(sessionsService.activeSession.get()?.sessionId))?.focusWorkspacePicker();
	}
}

registerAction2(FocusNewSessionWorkspacePickerAction);

class FocusNewSessionHarnessPickerAction extends Action2 {
	constructor() {
		super({
			id: FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID,
			title: localize2('sessions.focusNewSessionHarnessPicker', "Focus Harness Picker"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: FOCUS_NEW_SESSION_HARNESS_PICKER_WHEN,
				primary: FOCUS_NEW_SESSION_HARNESS_PICKER_KEYBINDING,
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		(sessionsPartService.getFocusedSessionView() ?? sessionsPartService.getSessionView(sessionsService.activeSession.get()?.sessionId))?.focusHarnessPicker();
	}
}

registerAction2(FocusNewSessionHarnessPickerAction);

class CustomizeNewSessionWelcomeMessageAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.sessions.customizeWelcomeMessage',
			title: localize2('sessions.chat.customizeWelcomeMessage', "Customize Welcome Message..."),
			category: CHAT_CATEGORY,
			icon: Codicon.edit,
			precondition: IsSessionsWindowContext,
			menu: [{
				id: MenuId.CommandPalette,
				when: IsSessionsWindowContext,
			}, {
				id: Menus.NewSessionWelcome,
				group: 'navigation',
			}, {
				id: Menus.NewSessionWelcomeContext,
				group: 'navigation',
			}],
		});
	}

	override async run(accessor: ServicesAccessor, anchor?: unknown): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);

		const namePick: IQuickPickItem = {
			id: 'name',
			label: localize('sessions.chat.customizeWelcomeMessage.name', "Name"),
			description: localize('sessions.chat.customizeWelcomeMessage.nameDescription', "Set the name used in welcome messages"),
		};
		const phrasesPick: IQuickPickItem = {
			id: 'phrases',
			label: localize('sessions.chat.customizeWelcomeMessage.phrases', "Phrases"),
			description: localize('sessions.chat.customizeWelcomeMessage.phrasesDescription', "Add to or replace the welcome phrases"),
		};
		const pick = await quickInputService.pick([namePick, phrasesPick], {
			placeHolder: localize('sessions.chat.customizeWelcomeMessage.placeholder', "Choose what to customize"),
			anchor,
		});
		if (pick === namePick) {
			await this._setWelcomeName(accessor, anchor);
		} else if (pick === phrasesPick) {
			await commandService.executeCommand('workbench.action.openSettings', NEW_SESSION_WELCOME_MESSAGES_SETTING);
		}
	}

	private async _setWelcomeName(accessor: ServicesAccessor, anchor: unknown): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const quickInputService = accessor.get(IQuickInputService);
		const configuredName = configurationService.getValue<string>(NEW_SESSION_WELCOME_NAME_SETTING).trim();
		const name = await quickInputService.input({
			value: configuredName,
			prompt: localize('sessions.chat.setWelcomeName.prompt', "Enter the name to use in new-session welcome messages"),
			placeHolder: localize('sessions.chat.setWelcomeName.placeholder', "Leave empty to use your GitHub first name when available"),
			anchor,
		});
		if (name === undefined) {
			return;
		}

		const trimmedName = name.trim();
		await configurationService.updateValue(NEW_SESSION_WELCOME_NAME_SETTING, trimmedName || undefined, ConfigurationTarget.USER);
		status(trimmedName
			? localize('sessions.chat.setWelcomeName.updated', "Welcome name set to {0}.", trimmedName)
			: localize('sessions.chat.setWelcomeName.cleared', "Welcome name reset to your GitHub first name when available."));
	}
}

registerAction2(CustomizeNewSessionWelcomeMessageAction);

class SetChatBackgroundAction extends Action2 {

	constructor() {
		super({
			id: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_COMMAND_ID,
			title: localize2('chat.agentSessions.setBackground', "Set Background..."),
			category: CHAT_CATEGORY,
			precondition: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN,
			menu: [{
				id: MenuId.CommandPalette,
				when: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN,
			}, {
				id: Menus.SessionChatBackgroundContext,
				group: 'navigation',
				order: 1,
				when: SessionsChatBackgroundAvailableContext,
			}, {
				id: MenuId.ChatContext,
				group: 'zz_background',
				order: 1,
				when: ContextKeyExpr.and(CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN, ChatContextKeys.contextMenuIsBackground),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const backgroundService = accessor.get(ISessionsChatBackgroundService);
		const quickInputService = accessor.get(IQuickInputService);
		const fileDialogService = accessor.get(IFileDialogService);
		const backgroundKind = backgroundService.getBackground()?.kind ?? 'none';
		const recentImages = backgroundService.getRecentBackgroundImages();
		const recentItems: RecentChatBackgroundTypeItem[] = recentImages.map(image => ({
			kind: 'recentImage',
			image,
			label: basename(image) || image.fsPath,
			detail: image.fsPath,
		}));
		const items: QuickPickInput<ChatBackgroundTypeItem>[] = [...chatBackgroundTypeItems];
		if (recentItems.length > 0) {
			items.push({
				type: 'separator',
				label: localize('chat.agentSessions.backgroundType.recentlyUsed', "recently used"),
			}, ...recentItems);
		}
		const currentImage = backgroundService.getConfiguredBackgroundImage();
		const backgroundType = await quickInputService.pick(items, {
			title: localize('chat.agentSessions.setBackground.title', "Set Chat Background"),
			placeHolder: localize('chat.agentSessions.setBackground.placeholder', "Select a background type"),
			activeItem: backgroundKind === 'image'
				? recentItems.find(item => currentImage && isEqual(item.image, currentImage))
				: chatBackgroundTypeItems.find(item => item.kind === backgroundKind),
		});
		if (!backgroundType) {
			return;
		}
		if (backgroundType.kind === 'none') {
			await backgroundService.clearBackground();
			status(localize('chat.agentSessions.clearBackground.cleared', "Chat background cleared."));
			return;
		}
		if (backgroundType.kind === 'codicons') {
			await backgroundService.setBackground(AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET);
			status(localize('chat.agentSessions.setBackground.codicons', "Chat background set to Codicons."));
			return;
		}
		if (backgroundType.kind === 'recentImage') {
			await backgroundService.setBackground(backgroundType.image);
			status(localize('chat.agentSessions.setBackground.recentImage', "Chat background image set to {0}.", backgroundType.label));
			return;
		}

		const selected = await fileDialogService.showOpenDialog({
			title: localize('chat.agentSessions.setBackground.dialogTitle', "Set Chat Background"),
			openLabel: localize('chat.agentSessions.setBackground.openLabel', "Set Background"),
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: [{
				name: localize('chat.agentSessions.changeBackground.images', "Images"),
				extensions: ['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp'],
			}],
			availableFileSystems: [Schemas.file],
			defaultUri: backgroundService.getConfiguredBackgroundImage(),
		});
		const image = selected?.[0];
		if (!image) {
			return;
		}

		await backgroundService.setBackground(image);
		status(localize('chat.agentSessions.setBackground.image', "Chat background image set."));
	}
}

registerAction2(SetChatBackgroundAction);

class ChangeChatBackgroundLayoutAction extends Action2 {

	constructor() {
		super({
			id: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_LAYOUT_COMMAND_ID,
			title: localize2('chat.agentSessions.changeBackgroundLayout', "Change Background Layout..."),
			category: CHAT_CATEGORY,
			precondition: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_LAYOUT_WHEN,
			menu: [{
				id: MenuId.CommandPalette,
				when: CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_LAYOUT_WHEN,
			}, {
				id: Menus.SessionChatBackgroundContext,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(SessionsChatBackgroundAvailableContext, SessionsChatBackgroundImageConfiguredContext),
			}, {
				id: MenuId.ChatContext,
				group: 'zz_background',
				order: 2,
				when: ContextKeyExpr.and(CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_LAYOUT_WHEN, ChatContextKeys.contextMenuIsBackground),
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const backgroundService = accessor.get(ISessionsChatBackgroundService);
		const currentLayout = backgroundService.getBackgroundImageLayout();
		let selected: (typeof chatBackgroundImageLayoutItems)[number] | undefined;
		try {
			selected = await accessor.get(IQuickInputService).pick(chatBackgroundImageLayoutItems, {
				title: localize('chat.agentSessions.changeBackgroundLayout.title', "Change Chat Background Layout"),
				placeHolder: localize('chat.agentSessions.changeBackgroundLayout.placeholder', "Select how the background image is displayed"),
				activeItem: chatBackgroundImageLayoutItems.find(item => item.layout === currentLayout),
				onDidFocus: item => void backgroundService.setBackgroundImageLayout(item.layout, false),
			});
		} finally {
			await backgroundService.setBackgroundImageLayout(selected?.layout ?? currentLayout, selected !== undefined);
		}
		if (selected && selected.layout !== currentLayout) {
			status(localize('chat.agentSessions.changeBackgroundLayout.changed', "Chat background layout changed to {0}.", selected.label));
		}
	}
}

registerAction2(ChangeChatBackgroundLayoutAction);
registerAction2(ToggleChatBackgroundTintAction);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		SessionWorktreeCleanupEditor,
		SessionWorktreeCleanupEditor.ID,
		localize('sessionWorktreeCleanupEditor', "Clean Up Agent Worktrees Editor"),
	),
	[new SyncDescriptor(SessionWorktreeCleanupEditorInput)],
);

registerAction2(class ManageAgentSessionStorageAction extends Action2 {
	constructor() {
		super({
			id: MANAGE_AGENT_SESSION_WORKTREES_COMMAND_ID,
			title: localize2('manageAgentSessionStorage', "Clean Up Agent Worktrees"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: 'manage',
				order: 0,
				when: ChatContextKeys.enabled,
			}, {
				id: MenuId.SessionItemContextMenu,
				group: '9_storage',
				order: 0,
				when: ChatContextKeys.enabled,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, section?: unknown): Promise<void> {
		accessor.get(ISessionWorktreeCleanupService).suppressForWindow();
		const pane = await accessor.get(IEditorService).openEditor(new SessionWorktreeCleanupEditorInput(), { pinned: true });
		if (section === 'automatic' && pane instanceof SessionWorktreeCleanupEditor) {
			pane.focusAutomaticCleanup();
		}
	}
});

registerAction2(class DisableSessionStorageCleanupSuggestionsAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chat.disableSessionStorageCleanupSuggestions',
			title: localize2('disableSessionStorageCleanupSuggestions', "Disable Session Storage Cleanup Suggestions"),
			category: CHAT_CATEGORY,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING}`, true)),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(ISessionWorktreeCleanupService).suppressForWindow();
		await accessor.get(IConfigurationService).updateValue(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, false, ConfigurationTarget.APPLICATION);
		status(localize('sessionStorageCleanupSuggestionsDisabled', "Session storage cleanup suggestions disabled."));
	}
});

// register actions
registerAction2(BranchChatSessionAction);

// register workbench contributions
registerWorkbenchContribution2(RunScriptContribution.ID, RunScriptContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsOpenerParticipantContribution.ID, SessionsOpenerParticipantContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(OpenSessionLinkOpenerContribution.ID, OpenSessionLinkOpenerContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RegisterDefaultSessionTaskRunnersContribution.ID, RegisterDefaultSessionTaskRunnersContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(WorktreeCreatedTaskDispatcher.ID, WorktreeCreatedTaskDispatcher, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsChatPetAchievementContribution.ID, SessionsChatPetAchievementContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionArchiveNudgeContribution.ID, SessionArchiveNudgeContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(SessionsChatBackgroundTint.ID, SessionsChatBackgroundTint, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSandboxNotifications.ID, AgentHostSandboxNotifications, WorkbenchPhase.AfterRestored);

// register services
registerSingleton(IPromptsService, AgenticPromptsService, InstantiationType.Delayed);
registerSingleton(ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry, InstantiationType.Delayed);
registerSingleton(ISessionsTasksService, SessionsTasksService, InstantiationType.Delayed);
registerSingleton(IAICustomizationWorkspaceService, SessionsAICustomizationWorkspaceService, InstantiationType.Delayed);
registerSingleton(ICustomizationHarnessService, SessionsCustomizationHarnessService, InstantiationType.Delayed);
registerSingleton(IChatViewFactory, ChatViewFactory, InstantiationType.Delayed);
registerSingleton(ISessionsChatViewStateService, SessionsChatViewStateService, InstantiationType.Delayed);
registerSingleton(IChatResponseFileChangesService, SessionsChatResponseFileChangesService, InstantiationType.Delayed);
registerSingleton(ISessionsChatBackgroundService, SessionsChatBackgroundService, InstantiationType.Delayed);
registerSingleton(ISessionArchiveNudgeService, SessionArchiveNudgeService, InstantiationType.Eager);
registerSingleton(ISessionWorktreeCleanupService, SessionWorktreeCleanupService, InstantiationType.Delayed);

// register accessibility help
AccessibleViewRegistry.register(new SessionsChatAccessibilityHelp());
AccessibleViewRegistry.register(new SessionWorktreeCleanupAccessibilityHelp());

// register configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[AGENT_SESSIONS_RESPONSE_SELECTION_MENU_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('chat.agentSessions.responseSelectionMenu.enabled', "Shows an enhanced action menu with Ask in a Side Chat, Quote, and Copy when selecting assistant response text in the Agents Window."),
		},
		[SESSION_ARCHIVE_NUDGE_SETTING]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentSessions.archiveNudge.enabled', "Suggests archiving an inactive session when all GitHub pull requests associated with the session have merged. Dismissing the suggestion hides it for that session until it is archived or deleted."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
			description: localize('chat.agentSessions.sessionStorageCleanupSuggestion', "Controls whether the Agents Window suggests cleaning up session storage when inactive worktrees reach the count or reclaimable-storage threshold."),
		},
		[LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			scope: ConfigurationScope.APPLICATION,
			deprecationMessage: localize('chat.agentSessions.consolidatedRemoteWorkspaces.deprecated', "Deprecated. Use the unified workspace picker setting instead."),
		},
		[AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentHost.runWorktreeCreatedTasks', "Whether to automatically run tasks tagged with `\"runOptions\": { \"runOn\": \"worktreeCreated\" }` when a new agent host session worktree is created. Manual `Run Task` invocations are unaffected."),
		},
		[AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentSessions.scopedInputHistory', "Controls whether chat input history in the Agents Window is scoped to the current session. Disable this to use shared input history across sessions."),
		},
		[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			description: localize('sessions.chat.experimental.newSessionComposerLayout', "Controls whether the new-session composer groups workspace, repository, and harness controls above the chat input. This setting only applies when the unified workspace picker is enabled."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.experimental.collapsedSessionOptionsShowIcons', "Controls whether the collapsed session options above the new-session input keep the repository and harness pickers as icons, so they stay accessible without their labels. When disabled, collapsing hides these controls entirely. This setting only applies when the new-session composer layout is enabled."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[NEW_SESSION_WELCOME_PHRASES_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.experimental.welcomePhrases', "Controls whether rotating welcome phrases are shown above the new-session composer."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[NEW_SESSION_WELCOME_NAME_SETTING]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.experimental.welcomeName', "Specifies the name used in new-session welcome messages. Leave empty to use the first name from your signed-in GitHub profile when available; otherwise, welcome messages omit the name."),
			tags: ['experimental'],
		},
		[NEW_SESSION_WELCOME_MESSAGES_SETTING]: {
			type: 'object',
			default: {
				mode: 'append',
				phrases: []
			},
			properties: {
				mode: {
					type: 'string',
					enum: ['replace', 'append'],
					default: 'append',
					description: localize('sessions.chat.experimental.welcomeMessages.mode', "'replace' uses only your phrases; 'append' adds your phrases to the defaults."),
				},
				phrases: {
					type: 'array',
					items: { type: 'string' },
					default: [],
					markdownDescription: localize('sessions.chat.experimental.welcomeMessages.phrases', "Welcome phrases shown above the new-session composer. Use `{name}` to position the welcome name, for example `Back at it, {name}`. When no name is known, `{name}` and its surrounding separator are removed."),
				}
			},
			additionalProperties: false,
			markdownDescription: localize('sessions.chat.experimental.welcomeMessages', "Customize the welcome phrases shown above the new-session composer. Use `\"mode\": \"replace\"` to use only your phrases, or `\"mode\": \"append\"` to add them to the defaults. Use `{name}` inside a phrase to position the welcome name."),
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
		},
		[AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentSessions.backgroundImageTint', "Match the Agents window colors to your chat background image. Other windows keep their current theme. Not available in high contrast themes."),
			tags: ['experimental'],
		},
		[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.MACHINE,
			markdownDescription: localize('chat.agentSessions.preferredDarkBackgroundImage', "Specifies `codicons`, an absolute file path, or a `file` URI for the background displayed behind chat content in the Agents Window when using a dark color theme. The background is hidden in high contrast themes."),
			examples: ['codicons'],
			tags: ['experimental'],
			ignoreSync: true,
		},
		[AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.MACHINE,
			markdownDescription: localize('chat.agentSessions.preferredLightBackgroundImage', "Specifies `codicons`, an absolute file path, or a `file` URI for the background displayed behind chat content in the Agents Window when using a light color theme. The background is hidden in high contrast themes."),
			examples: ['codicons'],
			tags: ['experimental'],
			ignoreSync: true,
		},
		[AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: {
			type: 'string',
			...chatBackgroundImageLayoutEnumConfiguration,
			default: 'repeat',
			scope: ConfigurationScope.MACHINE,
			markdownDescription: localize('chat.agentSessions.preferredDarkBackgroundImageLayout', "Controls how the chat background image is laid out in the Agents Window when using a dark color theme."),
			tags: ['experimental'],
			ignoreSync: true,
		},
		[AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING]: {
			type: 'string',
			...chatBackgroundImageLayoutEnumConfiguration,
			default: 'repeat',
			scope: ConfigurationScope.MACHINE,
			markdownDescription: localize('chat.agentSessions.preferredLightBackgroundImageLayout', "Controls how the chat background image is laid out in the Agents Window when using a light color theme."),
			tags: ['experimental'],
			ignoreSync: true,
		},
	},
});

Registry.as<IConfigurationMigrationRegistry>(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([
	unifiedWorkspacePickerConfigurationMigration,
	sessionStorageCleanupSuggestionConfigurationMigration,
]);
