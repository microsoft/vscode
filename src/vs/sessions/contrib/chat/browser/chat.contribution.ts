/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Schemas } from '../../../../base/common/network.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../../workbench/common/configuration.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService, inheritableSessionTarget } from '../../../services/sessions/common/sessionsManagement.js';
import { BranchChatSessionAction } from './branchChatSessionAction.js';
import { RunScriptContribution } from './runScriptAction.js';
import './nullInlineChatSessionService.js';
import './modelPicker.js';
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
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionsChatAccessibilityHelp } from './sessionsChatAccessibilityHelp.js';
import { SessionsOpenerParticipantContribution } from './sessionsOpenerParticipant.js';
import { OpenSessionLinkOpenerContribution } from './openSessionLinkOpener.contribution.js';
import { WorktreeCreatedTaskDispatcher, AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING } from './worktreeCreatedTaskDispatcher.js';
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from './sessionsChatHistory.js';
import '../../sessions/browser/mobile/mobileOverlayContribution.js';
import { EditorAreaFocusContext, IsSessionsWindowContext, SideBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { NEW_SESSION_ACTION_ID, UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';
import { SessionsChatBackgroundAvailableContext, SessionsChatBackgroundImageConfiguredContext, SessionsTitleBarNewSessionEnabledContext, SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { Menus } from '../../../browser/menus.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from './chatViewStateService.js';
import { SessionsChatResponseFileChangesService } from './sessionTurnChanges.js';
import { IChatResponseFileChangesService } from '../../../../workbench/contrib/chat/browser/chatResponseFileChangesService.js';
import { SessionsChatPetAchievementContribution } from './chatPetAchievements.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, chatBackgroundImageLayoutValues, ChatBackgroundImageLayout, ISessionsChatBackgroundService, SessionsChatBackgroundService } from '../../../services/chatBackground/browser/chatBackgroundService.js';
import { LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING, unifiedWorkspacePickerConfigurationMigration } from './unifiedWorkspacePickerConfiguration.js';
import { ISessionArchiveNudgeService, SESSION_ARCHIVE_NUDGE_SETTING, SessionArchiveNudgeContribution, SessionArchiveNudgeService } from './sessionArchiveNudge.js';

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

class NewChatInSessionsWindowAction extends Action2 {

	constructor() {
		super({
			id: NEW_SESSION_ACTION_ID,
			title: localize2('sessions.newSession.label', "New Session"),
			category: CHAT_CATEGORY,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				// Don't shadow Ctrl/Cmd+N (and Ctrl/Cmd+L) when focus is in the
				// editor area so the standard editor commands (new untitled file,
				// expand line selection) handle the shortcut instead.
				when: EditorAreaFocusContext.negate(),
				primary: KeyMod.CtrlCmd | KeyCode.KeyN,
				secondary: [KeyMod.CtrlCmd | KeyCode.KeyL],
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.KeyN,
					secondary: [KeyMod.WinCtrl | KeyCode.KeyL]
				},
			},
			menu: [
				{
					id: Menus.SidebarSessionsHeader,
					group: 'navigation',
					// Render before the filter (order 10) and find (order 20)
					// actions so the sessions sidebar header reads: New, Filter, Find.
					order: 0,
				},
				{
					id: Menus.TitleBarLeftLayout,
					group: 'navigation',
					order: 1,
					// Show in the titlebar only when the sidebar is hidden, gated behind an A/B experiment.
					when: ContextKeyExpr.and(SideBarVisibleContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionsTitleBarNewSessionEnabledContext)
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, options?: { toSide?: boolean }): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const activeSession = sessionsService.activeSession.get();
		// A quick chat never contributes its folder — it is workspace-less by
		// intent (any scratch working directory must not seed the workspace
		// composer), so it always falls to the New Session composer's folder picker.
		const isQuickChat = activeSession?.isQuickChat?.get() ?? false;
		const folderUri = isQuickChat ? undefined : activeSession?.workspace.get()?.uri;
		// Inherit the active session's harness so the new session defaults to
		// the kind the user is working in — but only while the folder still
		// offers it (see `inheritableSessionTarget`).
		await sessionsService.openNewSession({
			folderUri,
			toSide: options?.toSide,
			...inheritableSessionTarget(sessionsManagementService, activeSession, folderUri),
		});
	}
}

registerAction2(NewChatInSessionsWindowAction);

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

// register accessibility help
AccessibleViewRegistry.register(new SessionsChatAccessibilityHelp());

// register configuration
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[SESSION_ARCHIVE_NUDGE_SETTING]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			scope: ConfigurationScope.APPLICATION,
			description: localize('chat.agentSessions.archiveNudge.enabled', "Suggests archiving an inactive session when all of its GitHub pull request artifacts have merged. Dismissing the suggestion hides it for that session until it is archived or deleted."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[LEGACY_UNIFIED_WORKSPACE_PICKER_SETTING]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			scope: ConfigurationScope.APPLICATION,
			deprecationMessage: localize('chat.agentSessions.consolidatedRemoteWorkspaces.deprecated', "Deprecated. Use the unified workspace picker setting instead."),
		},
		[UNIFIED_WORKSPACE_PICKER_SETTING]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			scope: ConfigurationScope.APPLICATION,
			description: localize('sessions.chat.unifiedWorkspacePicker.enabled', "Controls whether the Agents Window uses the unified workspace picker, which combines GitHub and remote workspaces, provides search, and, when supported, allows creating sessions with no workspace."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
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

Registry.as<IConfigurationMigrationRegistry>(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([unifiedWorkspacePickerConfigurationMigration]);
