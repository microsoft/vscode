/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { INewSessionInAgentsWindowOptions } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_DARK_CHAT_BACKGROUND_IMAGE_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_LAYOUT_SETTING, AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING, chatBackgroundImageExtensions, chatBackgroundImageLayoutValues, ChatBackgroundImageLayout, chatBackgroundPresets, getChatBackgroundPresetLabel, ISessionsChatBackgroundService, SessionsChatBackgroundPreset, SessionsChatBackgroundService } from '../../../../workbench/contrib/sessions/browser/chatBackgroundService.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING, NEW_SESSION_ACTION_ID } from '../../../../workbench/contrib/sessions/common/chatConstants.js';
import { SessionsChatBackgroundAvailableContext, SessionsChatBackgroundImageConfiguredContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_IMAGE_TINT_SETTING, SessionsChatBackgroundTint, ToggleChatBackgroundTintAction } from './chatBackgroundTint.js';
import { GetThemeColorsToolContribution } from './getThemeColorsTool.js';

const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_COMMAND_ID = 'workbench.action.chat.changeAgentSessionsBackground';
const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_LAYOUT_COMMAND_ID = 'workbench.action.chat.changeAgentSessionsBackgroundLayout';
const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN = ContextKeyExpr.and(IsSessionsWindowContext, SessionsChatBackgroundAvailableContext);
const CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_LAYOUT_WHEN = ContextKeyExpr.and(CHANGE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN, SessionsChatBackgroundImageConfiguredContext);
const GENERATE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING}`, true));

type RecentChatBackgroundTypeItem = IQuickPickItem & {
	readonly kind: 'recentImage';
	readonly image: URI;
};

type ChatBackgroundTypeItem = IQuickPickItem & ({
	readonly kind: 'none' | SessionsChatBackgroundPreset | 'image' | 'generate';
}) | RecentChatBackgroundTypeItem;

const chatBackgroundTypeItems: ChatBackgroundTypeItem[] = [{
	kind: 'none',
	label: localize('chat.agentSessions.backgroundType.none.label', "No Background"),
	detail: localize('chat.agentSessions.backgroundType.none.detail', "Remove the current chat background."),
}, {
	kind: 'codicons',
	label: getChatBackgroundPresetLabel('codicons'),
	detail: localize('chat.agentSessions.backgroundType.codicons.detail', "Use a theme-aware pattern of built-in VS Code icons."),
}, {
	kind: 'koi-light',
	label: getChatBackgroundPresetLabel('koi-light'),
	detail: localize('chat.agentSessions.backgroundType.koiLight.detail', "Use an animated ASCII koi pond on a light background."),
}, {
	kind: 'koi-dark',
	label: getChatBackgroundPresetLabel('koi-dark'),
	detail: localize('chat.agentSessions.backgroundType.koiDark.detail', "Use an animated ASCII koi pond on a dark background."),
}, {
	kind: 'image',
	label: localize('chat.agentSessions.backgroundType.image.label', "Image..."),
	detail: localize('chat.agentSessions.backgroundType.image.detail', "Choose an image file from this machine."),
}];

const generateChatBackgroundTypeItem: ChatBackgroundTypeItem = {
	kind: 'generate',
	label: localize('chat.agentSessions.backgroundType.generate.label', "Generate Background..."),
	detail: localize('chat.agentSessions.backgroundType.generate.detail', "Describe an image for an agent to generate and set in a new session."),
};

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
		const commandService = accessor.get(ICommandService);
		const canGenerate = accessor.get(IContextKeyService).contextMatchesRules(GENERATE_AGENT_SESSIONS_CHAT_BACKGROUND_WHEN)
			&& accessor.get(ISessionsManagementService).isQuickChatTargetAvailable();
		const configuredBackground = backgroundService.getConfiguredBackground();
		const backgroundKind = configuredBackground?.kind === 'image' ? configuredBackground.preset ?? 'image' : configuredBackground?.kind ?? 'none';
		const recentImages = backgroundService.getRecentBackgroundImages();
		const recentItems: RecentChatBackgroundTypeItem[] = recentImages.map(image => ({
			kind: 'recentImage',
			image,
			label: basename(image) || image.fsPath,
			detail: image.fsPath,
		}));
		const items: QuickPickInput<ChatBackgroundTypeItem>[] = [...chatBackgroundTypeItems];
		if (canGenerate) {
			items.push({ type: 'separator' }, generateChatBackgroundTypeItem);
		}
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
			await backgroundService.clearBackground('backgroundPicker');
			status(localize('chat.agentSessions.clearBackground.cleared', "Chat background cleared."));
			return;
		}
		if (backgroundType.kind === 'codicons' || backgroundType.kind === 'koi-light' || backgroundType.kind === 'koi-dark') {
			await backgroundService.setBackground(backgroundType.kind, 'backgroundPicker');
			status(localize('chat.agentSessions.setBackground.preset', "Chat background set to {0}.", backgroundType.label));
			return;
		}
		if (backgroundType.kind === 'recentImage') {
			await backgroundService.setBackground(backgroundType.image, 'backgroundPicker');
			status(localize('chat.agentSessions.setBackground.recentImage', "Chat background image set to {0}.", backgroundType.label));
			return;
		}
		if (backgroundType.kind === 'generate') {
			const options: INewSessionInAgentsWindowOptions = {
				// The trailing space is outside the localized text so translations can't drop it before the caret.
				prompt: `${localize('chat.agentSessions.generateBackground.prompt', "Generate a chat background of")} `,
				prefillPrompt: true,
				noWorkspace: true,
			};
			await commandService.executeCommand(NEW_SESSION_ACTION_ID, options);
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
				extensions: [...chatBackgroundImageExtensions],
			}],
			availableFileSystems: [Schemas.file],
			defaultUri: configuredBackground?.kind === 'image' && !configuredBackground.preset ? currentImage : undefined,
		});
		const image = selected?.[0];
		if (!image) {
			return;
		}

		await backgroundService.setBackground(image, 'backgroundPicker');
		status(localize('chat.agentSessions.setBackground.image', "Chat background image set."));
	}
}

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
				onDidFocus: item => void backgroundService.setBackgroundImageLayout(item.layout, 'layoutPicker', false),
			});
		} finally {
			await backgroundService.setBackgroundImageLayout(selected?.layout ?? currentLayout, 'layoutPicker', selected !== undefined);
		}
		if (selected && selected.layout !== currentLayout) {
			status(localize('chat.agentSessions.changeBackgroundLayout.changed', "Chat background layout changed to {0}.", selected.label));
		}
	}
}

registerAction2(SetChatBackgroundAction);
registerAction2(ChangeChatBackgroundLayoutAction);
registerAction2(ToggleChatBackgroundTintAction);
registerWorkbenchContribution2(SessionsChatBackgroundTint.ID, SessionsChatBackgroundTint, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(GetThemeColorsToolContribution.ID, GetThemeColorsToolContribution, WorkbenchPhase.Eventually);
registerSingleton(ISessionsChatBackgroundService, SessionsChatBackgroundService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[AGENT_SESSIONS_APPEARANCE_TOOLS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['advanced'],
			experiment: { mode: 'auto' },
			markdownDescription: localize('chat.agentSessions.appearanceTools.enabled', "Enable the Get Theme Colors, Set Chat Background, and Screenshot Window tools and the built-in `generate-chat-background` skill in the Agents window. Disabling this does not remove existing backgrounds or affect the manual background controls."),
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
			markdownDescription: localize('chat.agentSessions.preferredDarkBackgroundImage', "Specifies a built-in background (`codicons`, `koi-light`, or `koi-dark`), an absolute file path, or a `file` URI for the background displayed behind chat content in the Agents Window when using a dark color theme. The background is hidden in high contrast themes."),
			examples: [...chatBackgroundPresets],
			tags: ['experimental'],
			ignoreSync: true,
		},
		[AGENT_SESSIONS_PREFERRED_LIGHT_CHAT_BACKGROUND_IMAGE_SETTING]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.MACHINE,
			markdownDescription: localize('chat.agentSessions.preferredLightBackgroundImage', "Specifies a built-in background (`codicons`, `koi-light`, or `koi-dark`), an absolute file path, or a `file` URI for the background displayed behind chat content in the Agents Window when using a light color theme. The background is hidden in high contrast themes."),
			examples: [...chatBackgroundPresets],
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
