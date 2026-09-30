/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../base/common/async.js';
import * as DOM from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IMcpWorkbenchService } from '../../mcp/common/mcpTypes.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { AICustomizationManagementSection } from '../common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../common/customizationHarnessService.js';
import { IAICustomizationItemSource, IAICustomizationListItem } from './aiCustomization/aiCustomizationItemSource.js';
import { IAICustomizationItemsModel } from './aiCustomization/aiCustomizationItemsModel.js';
import { CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID, chatPetAchievements, ChatPetAchievementIds, isUserAuthoredChatPetCustomization } from './chatPetAchievements.js';
import { ChatPetAchievementsContextKeys, ChatPetAchievementsEditor, IChatPetAchievementsEditorOptions } from './chatPetAchievementsEditor.js';
import { ChatPetAchievementsEditorInput } from './chatPetAchievementsEditorInput.js';
import { CHAT_PET_OPEN_INTERACTIONS_COMMAND_ID, CHAT_PET_OPEN_SPRITES_COMMAND_ID } from './chatPetMoves.js';
import { ChatPetContextKeys, IChatPetService } from './chatPetService.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatPetAchievementsEditor,
		ChatPetAchievementsEditor.ID,
		localize('chatPet.achievements.editor', "Achievements Editor"),
	),
	[new SyncDescriptor(ChatPetAchievementsEditorInput)],
);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CHAT_PET_OPEN_ACHIEVEMENTS_COMMAND_ID,
			title: localize2('chatPet.achievements.open', "Open Achievements"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatPetContextKeys.enabled),
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'chat.pet.developer.unlockAllAchievements',
					title: localize2('chatPet.achievements.developer.unlockAll', "Unlock All Pet Achievements"),
					category: Categories.Developer,
					precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatPetContextKeys.enabled),
					f1: true,
				});
			}

			run(accessor: ServicesAccessor): void {
				const chatPetService = accessor.get(IChatPetService);
				for (const achievement of chatPetAchievements) {
					chatPetService.unlockAchievement(achievement.id);
				}
				status(localize('chatPet.achievements.developer.unlockedAll', "All enabled pet achievements unlocked"));
			}
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'chat.pet.developer.resetAchievements',
					title: localize2('chatPet.achievements.developer.reset', "Reset Pet Achievements"),
					category: Categories.Developer,
					precondition: ChatContextKeys.enabled,
					f1: true,
				});
			}

			run(accessor: ServicesAccessor): void {
				accessor.get(IChatPetService).resetAchievements();
				status(localize('chatPet.achievements.developer.resetComplete', "Pet achievements reset"));
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		if (!accessor.get(IChatPetService).enabled.get()) {
			return;
		}
		const options: IChatPetAchievementsEditorOptions = { pinned: true, tab: 'achievements' };
		await accessor.get(IEditorService).openEditor(ChatPetAchievementsEditorInput.getOrCreate(), options);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CHAT_PET_OPEN_SPRITES_COMMAND_ID,
			title: localize2('chatPet.sprites.open', "Open Pet Sprites"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatPetContextKeys.enabled),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, args?: { readonly move?: string }): Promise<void> {
		if (!accessor.get(IChatPetService).enabled.get()) {
			return;
		}
		const options: IChatPetAchievementsEditorOptions = { pinned: true, tab: 'sprites', move: typeof args?.move === 'string' ? args.move : undefined };
		await accessor.get(IEditorService).openEditor(ChatPetAchievementsEditorInput.getOrCreate(), options);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CHAT_PET_OPEN_INTERACTIONS_COMMAND_ID,
			title: localize2('chatPet.interactions.open', "Open Pet Interactions"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatPetContextKeys.enabled),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, args?: { readonly move?: string }): Promise<void> {
		if (!accessor.get(IChatPetService).enabled.get()) {
			return;
		}
		const options: IChatPetAchievementsEditorOptions = { pinned: true, tab: 'interactions', move: typeof args?.move === 'string' ? args.move : undefined };
		await accessor.get(IEditorService).openEditor(ChatPetAchievementsEditorInput.getOrCreate(), options);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'chat.pet.developer.resetSize',
			title: localize2('chatPet.developer.resetSize', "Reset Pet Size"),
			category: Categories.Developer,
			precondition: ChatContextKeys.enabled,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		const chatPetService = accessor.get(IChatPetService);
		chatPetService.resetScale();
		status(localize('chatPet.developer.resetSizeComplete', "VS Code pet size reset to {0} percent", Math.round(chatPetService.scale.get() * 100)));
	}
});

export class ChatPetContextContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPetContext';

	constructor(
		@IChatPetService chatPetService: IChatPetService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const enabledContextKey = ChatPetContextKeys.enabled.bindTo(contextKeyService);
		this._register(autorun(reader => {
			enabledContextKey.set(chatPetService.enabled.read(reader));
		}));
	}
}

const CHAT_PET_KEEP_EDIT_COMMAND_IDS = new Set([
	'chatEditing.acceptFile',
	'chatEditing.acceptAllFiles',
	'chatEditor.action.accept',
	'chatEditor.action.acceptHunk',
	'chatEditor.action.acceptAllEdits',
	'chatEditing.multidiff.acceptAllFiles',
]);

const CHAT_PET_REVIEW_EDIT_COMMAND_IDS = new Set([
	'chatEditor.action.reviewChanges',
	'chatEditing.openFileInDiff',
	'chatEditing.viewChanges',
	'chatEditing.viewAllSessionChanges',
	'workbench.changesView.action.viewChanges',
]);

const CHAT_PET_COPY_OUTPUT_COMMAND_IDS = new Set([
	'workbench.action.chat.copyAll',
	'workbench.action.chat.copyItem',
	'workbench.action.chat.copyFinalResponse',
	'workbench.action.chat.copyCodeBlock',
]);

export class ChatPetEditingAchievementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPetEditingAchievement';

	constructor(
		@ICommandService commandService: ICommandService,
		@IChatPetService chatPetService: IChatPetService,
	) {
		super();

		this._register(commandService.onDidExecuteCommand(event => {
			if (CHAT_PET_KEEP_EDIT_COMMAND_IDS.has(event.commandId)) {
				chatPetService.unlockAchievement(ChatPetAchievementIds.AgentEditKept);
			}
			if (CHAT_PET_REVIEW_EDIT_COMMAND_IDS.has(event.commandId)) {
				chatPetService.unlockAchievement(ChatPetAchievementIds.AgentChangesReviewed);
			}
			if (CHAT_PET_COPY_OUTPUT_COMMAND_IDS.has(event.commandId)) {
				chatPetService.unlockAchievement(ChatPetAchievementIds.UsefulOutputCopied);
			}
		}));
	}
}

export class ChatPetCustomizationAchievementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatPetCustomizationAchievements';
	private customizationBaselineVersion = 0;
	private customizationBaselineReady = false;
	private observedCustomizationSource: IAICustomizationItemSource | undefined;
	private observedSkillIds = new Set<string>();
	private observedInstructionIds = new Set<string>();
	private observationInitializationStarted = false;

	constructor(
		@IChatPetService private readonly chatPetService: IChatPetService,
		@IAICustomizationItemsModel private readonly customizationItemsModel: IAICustomizationItemsModel,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(autorun(reader => {
			if (!this.chatPetService.enabled.read(reader) || this.observationInitializationStarted) {
				return;
			}
			this.observationInitializationStarted = true;
			void this.initializeCustomizationObservation();
			void this.initializeMcpObservation();
		}));
	}

	private async initializeCustomizationObservation(): Promise<void> {
		const skills = this.customizationItemsModel.getItems(AICustomizationManagementSection.Skills);
		const instructions = this.customizationItemsModel.getItems(AICustomizationManagementSection.Instructions);
		let waitForLatestFetch = false;
		while (!this._store.isDisposed) {
			const source = this.customizationItemsModel.getActiveItemSource();
			if (await this.establishCustomizationBaseline(skills, instructions, source, waitForLatestFetch)) {
				break;
			}
			waitForLatestFetch = true;
		}
		if (this._store.isDisposed) {
			return;
		}

		this._register(autorun(reader => {
			this.customizationHarnessService.activeSessionResource.read(reader);
			this.customizationHarnessService.availableHarnesses.read(reader);
			const source = this.customizationItemsModel.getActiveItemSource();
			const currentSkillIds = getUserCustomizationIds(skills.read(reader));
			const currentInstructionIds = getUserCustomizationIds(instructions.read(reader));
			const enabled = this.chatPetService.enabled.read(reader);
			const unlocked = new Set(this.chatPetService.unlockedAchievements.read(reader));
			if (source !== this.observedCustomizationSource) {
				this.observedCustomizationSource = source;
				this.customizationBaselineReady = false;
				void this.establishCustomizationBaseline(skills, instructions, source, true);
				return;
			}
			if (!this.customizationBaselineReady) {
				return;
			}

			const skillAdded = hasAddedId(currentSkillIds, this.observedSkillIds);
			const instructionAdded = hasAddedId(currentInstructionIds, this.observedInstructionIds);
			this.observedSkillIds = currentSkillIds;
			this.observedInstructionIds = currentInstructionIds;
			if (enabled && skillAdded && !unlocked.has(ChatPetAchievementIds.CustomSkillPresent)) {
				this.chatPetService.unlockAchievement(ChatPetAchievementIds.CustomSkillPresent);
			}
			if (enabled && instructionAdded && !unlocked.has(ChatPetAchievementIds.InstructionPresent)) {
				this.chatPetService.unlockAchievement(ChatPetAchievementIds.InstructionPresent);
			}
		}));
	}

	private async establishCustomizationBaseline(
		skills: IObservable<readonly IAICustomizationListItem[]>,
		instructions: IObservable<readonly IAICustomizationListItem[]>,
		expectedSource: IAICustomizationItemSource,
		waitForLatestFetch: boolean,
	): Promise<boolean> {
		const version = ++this.customizationBaselineVersion;
		this.customizationBaselineReady = false;
		if (waitForLatestFetch) {
			await timeout(0);
		}
		await Promise.all([
			this.customizationItemsModel.whenSectionLoaded(AICustomizationManagementSection.Skills),
			this.customizationItemsModel.whenSectionLoaded(AICustomizationManagementSection.Instructions),
		]);
		if (this._store.isDisposed || version !== this.customizationBaselineVersion || expectedSource !== this.customizationItemsModel.getActiveItemSource()) {
			return false;
		}

		this.observedCustomizationSource = expectedSource;
		this.observedSkillIds = getUserCustomizationIds(skills.get());
		this.observedInstructionIds = getUserCustomizationIds(instructions.get());
		this.customizationBaselineReady = true;
		return true;
	}

	private async initializeMcpObservation(): Promise<void> {
		try {
			await this.mcpWorkbenchService.queryLocal();
		} catch (error) {
			this.logService.error('[ChatPetCustomizationAchievementContribution] Failed to establish the MCP server baseline', error);
			return;
		}
		if (this._store.isDisposed) {
			return;
		}

		let observedServerIds = getMcpServerIds(this.mcpWorkbenchService);
		this._register(this.mcpWorkbenchService.onChange(() => {
			const currentServerIds = getMcpServerIds(this.mcpWorkbenchService);
			const serverAdded = hasAddedId(currentServerIds, observedServerIds);
			observedServerIds = currentServerIds;
			if (this.chatPetService.enabled.get()
				&& serverAdded
				&& !this.chatPetService.unlockedAchievements.get().includes(ChatPetAchievementIds.McpServerPresent)) {
				this.chatPetService.unlockAchievement(ChatPetAchievementIds.McpServerPresent);
			}
		}));
	}
}

function getUserCustomizationIds(items: readonly IAICustomizationListItem[]): Set<string> {
	return new Set(items
		.filter(item => isUserAuthoredChatPetCustomization(item.source, item.isBuiltin))
		.map(item => item.id));
}

function getMcpServerIds(mcpWorkbenchService: IMcpWorkbenchService): Set<string> {
	return new Set(mcpWorkbenchService.local.map(server => server.id));
}

function hasAddedId(currentIds: ReadonlySet<string>, previousIds: ReadonlySet<string>): boolean {
	for (const id of currentIds) {
		if (!previousIds.has(id)) {
			return true;
		}
	}
	return false;
}

export class ChatPetAchievementsAccessibilityHelp implements IAccessibleViewImplementation {

	readonly priority = 110;
	readonly name = 'chatPetAchievements';
	readonly type = AccessibleViewType.Help;
	readonly when = ChatPetAchievementsContextKeys.focused;

	getProvider(_accessor: ServicesAccessor): AccessibleContentProvider {
		const previouslyFocusedElement = DOM.getActiveElement();
		const editorService = _accessor.get(IEditorService);
		const content = [
			localize('chatPet.achievements.accessibilityHelp.overview', "The VS Code Pet modal has three pages, Achievements, Interactions and Sprites, in a tab list at the top; use the Left and Right Arrow keys or Tab to move between them and Enter to open one. Achievements lists agent-feature achievements and their pet hat rewards. Locked cards reveal a hint and reward while keeping the achievement name and exact unlock requirement hidden."),
			localize('chatPet.achievements.accessibilityHelp.cards', "On Achievements, use Tab and Shift+Tab to move through No Hat and the achievement cards. Press Enter or Space on No Hat or an unlocked achievement to change what the pet wears. Newly unlocked cards are announced as New until you activate them. Locked achievements announce their hint and reward and cannot be selected."),
			localize('chatPet.achievements.accessibilityHelp.sprites', "Sprites lists everything the pet can show, in three sections: Taught moves, Built-in Moves and Pet Animations. Use the Up and Down Arrow keys in the list; section headers are skipped, and the selected sprite's detail follows. The detail has Play, and for taught moves Edit as Text, Copy and Forget, which asks for a second press; built-in moves have Customize and Copy. A Used by list names each event and text interaction that plays the sprite, each a link to it on the Interactions page, which is where sprites are assigned, turned off or removed; Use in an Interaction goes to that page with a form for a new interaction that plays this sprite, with Plays when chips for the event and a Phrases box for message interactions. New Move, Import from Clipboard and Edit as Text above the list make sprites: the first and last open pets.md, a text file where moves and interactions are written and saved."),
			localize('chatPet.achievements.accessibilityHelp.interactions', "Interactions lists the events that make the pet play a sprite, in two sections, and is where sprites are assigned. Built-in holds the pet's own events: clicked, request finished, confirmation needed, shaken, falls asleep, typing and responding. Each plays one sprite: select the event and, in the Plays list of pictured tiles, use the arrow keys and Enter to pick a taught or built-in move, one of the pet's own reactions, its own animation, or Nothing; the change applies at once, and Show Sprite goes to the sprite on the Sprites page. Clicked plays one of a pool at random: each sprite has a checkbox to turn it off or on, a link to it on the Sprites page and, for sprites added to the pool, a Remove button; Add Sprite opens a form with the same tiles. Text Interactions holds the phrases the pet listens for; each has a checkbox to turn it off or on and Change, Show Sprite and Remove buttons. New Text Interaction opens a form with a Phrases box, the sprite tiles, and Save and Cancel buttons; Change opens the same form for the selected interaction, with a Remove button. Edit as Text opens pets.md. Restore Defaults, which asks for a second press, puts the pet's own animation back on every built-in event and drops the sprites added to them; text interactions stay."),
			localize('chatPet.achievements.accessibilityHelp.roadmap', "The final TBD card on Achievements is informational and lists upcoming pet ideas. The VS Code pet and achievements are experimental and may change."),
			localize('chatPet.achievements.accessibilityHelp.close', "Press Escape to close the VS Code Pet modal."),
		].join('\n\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ChatPetAchievements,
			{ type: AccessibleViewType.Help },
			() => content,
			() => {
				if (DOM.isHTMLElement(previouslyFocusedElement) && previouslyFocusedElement.isConnected && previouslyFocusedElement.getClientRects().length > 0) {
					previouslyFocusedElement.focus();
				} else {
					editorService.activeEditorPane?.focus();
				}
			},
			AccessibilityVerbositySettingId.ChatPetAchievements,
		);
	}
}
