/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { ChatPetAchievementsEditor, IChatPetAchievementsEditorOptions } from '../../../../contrib/chat/browser/chatPetAchievementsEditor.js';
import { ChatPetAchievementsEditorInput } from '../../../../contrib/chat/browser/chatPetAchievementsEditorInput.js';
import { chatPetAchievements, ChatPetAccessoryIds, ChatPetAchievementIds } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { getChatPetBuiltInMoves } from '../../../../contrib/chat/browser/chatPetBuiltInMoves.js';
import { ChatPetMovePoses, IChatPetMove, parseChatPetMove } from '../../../../contrib/chat/browser/chatPetMoves.js';
import { IChatPetReaction } from '../../../../contrib/chat/browser/chatPetReactions.js';
import { IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';
import { IChatPetWidgetService } from '../../../../contrib/chat/browser/widget/chatPetWidgetService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { configureChatPetFixtureFileRoot, FixtureChatPetService, IChatPetFixtureOptions } from './chatPetFixtureUtils.js';

interface IAchievementsEditorFixtureOptions extends IChatPetFixtureOptions, Pick<IChatPetAchievementsEditorOptions, 'tab' | 'move' | 'interaction'> {
	readonly width?: number;
	readonly height?: number;
	/** Opens the reaction form, through the button with this label; on the Sprites page, Use in an Interaction leads to the Interactions page's. */
	readonly openForm?: string;
}

function createMockEditorGroup(): IEditorGroup {
	return new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}();
}

async function renderAchievementsEditor(context: ComponentFixtureContext, options: IAchievementsEditorFixtureOptions): Promise<void> {
	const width = options.width ?? 900;
	const height = options.height ?? 600;
	context.container.style.width = `${width}px`;
	context.container.style.height = `${height}px`;
	configureChatPetFixtureFileRoot(context.disposableStore);

	const chatPetService = context.disposableStore.add(new FixtureChatPetService(options));
	const instantiationService = createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: registry => {
			registerWorkbenchServices(registry);
			registry.defineInstance(IChatPetService, chatPetService);
			// No pet is on the page to play a sprite; Play has nothing to do.
			registry.defineInstance(IChatPetWidgetService, new class extends mock<IChatPetWidgetService>() {
				override playReaction(): boolean {
					return true;
				}
			}());
			registry.define(IListService, ListService);
		},
	});
	const editor = context.disposableStore.add(instantiationService.createInstance(ChatPetAchievementsEditor, createMockEditorGroup()));
	editor.create(context.container);
	editor.layout(new Dimension(width, height));
	const input = context.disposableStore.add(ChatPetAchievementsEditorInput.getOrCreate());
	await editor.setInput(input, { tab: options.tab, move: options.move, interaction: options.interaction }, {}, CancellationToken.None);
	if (options.tab === 'sprites' || options.tab === 'interactions') {
		await waitForChatPetSprites(context.container);
	}
	if (options.openForm) {
		const open = Array.from(context.container.querySelectorAll<HTMLElement>('.chat-pet-interactions .monaco-button')).find(button => button.textContent === options.openForm);
		if (!open) {
			throw new Error(`Chat pet fixture: the ${options.openForm} button did not render.`);
		}
		open.click();
		// The form scrolls into view and focuses its first field in a microtask; the screenshot must not come first.
		await new Promise(resolve => mainWindow.setTimeout(resolve, 0));
		if (!context.container.querySelector('.chat-pet-trigger-form')) {
			throw new Error('Chat pet fixture: the reaction form did not open.');
		}
		// The button may have led to the other page, whose sprites load in turn.
		await waitForChatPetSprites(context.container);
	}
}

/** Built-in reactions draw their sprites once loaded; the screenshot must not come first. */
async function waitForChatPetSprites(container: HTMLElement): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (container.querySelector('[data-loading]')) {
		if (Date.now() > deadline) {
			throw new Error('Chat pet interactions fixture: a built-in reaction sprite did not load.');
		}
		await new Promise(resolve => mainWindow.setTimeout(resolve, 20));
	}
}

/** A taught move to picture: a built-in move's frames under another name and story. */
function createTaughtMove(name: string, about: string, from: string): IChatPetMove {
	const source = getChatPetBuiltInMoves().find(move => move.name === from)!;
	return { ...source, name, about };
}

const bounce = parseChatPetMove(`name: bounce\nabout: Bobs up and down on the spot.\nloop: yes\n\nframe 400\n${ChatPetMovePoses.idle.join('\n')}\n\nframe 400\n${ChatPetMovePoses.crouch.join('\n')}\n`);
const taughtMoves: IChatPetMove[] = [
	createTaughtMove('angry', 'Gets furious and turns red, steam puffing out of its antennae, then cools down.', 'zapped'),
	createTaughtMove('yes-sir', 'Snaps a salute as a gold YES SIR! pops up.', 'yes'),
	bounce,
];
const taughtReactions: IChatPetReaction[] = [
	{ id: 'r1', trigger: 'message', when: 'whenever I say bugs or broken', phrases: ['bug', 'bugs', 'broken', 'it\'s broken'], play: 'angry', enabled: true },
	{ id: 'r2', trigger: 'click', when: 'sometimes when I click you', phrases: [], play: 'angry', enabled: false },
	{ id: 'r3', trigger: 'message', when: 'when I tell you to execute the plan', phrases: ['do it', 'go ahead', 'ship it'], play: 'yes-sir', enabled: true },
	{ id: 'r4', trigger: 'message', when: '', phrases: ['howdy'], play: 'cowboy', enabled: true },
	{ id: 'r5', trigger: 'requestDone', when: 'when a request finishes', phrases: [], play: 'yes-sir', enabled: true },
	{ id: 'r6', trigger: 'sleep', when: '', phrases: [], play: 'bounce', enabled: true },
];
/** The worried click reaction is off, as is the angry move added to clicks; the pet does nothing when shaken. */
const disabledBuiltIns = ['click/worry', 'dizzy/dizzy'];

export default defineThemedFixtureGroup({ path: 'chat/petAchievements/standaloneModal/' }, {
	AllLocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, { enabled: true }),
	}),
	MixedNoHat: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: [ChatPetAchievementIds.RequestRevision, ChatPetAchievementIds.FirstChatMessage],
			unseenAchievements: [ChatPetAchievementIds.FirstChatMessage],
		}),
	}),
	MixedSelected: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: [ChatPetAchievementIds.RequestRevision, ChatPetAchievementIds.FirstChatMessage],
			unseenAchievements: [ChatPetAchievementIds.FirstChatMessage],
			selectedAccessory: ChatPetAccessoryIds.TopHatMonocle,
		}),
	}),
	MediumMixed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: [ChatPetAchievementIds.RequestRevision, ChatPetAchievementIds.FirstChatMessage],
			unseenAchievements: [ChatPetAchievementIds.FirstChatMessage],
			selectedAccessory: ChatPetAccessoryIds.CowboyHat,
			width: 700,
			height: 500,
		}),
	}),
	AllUnlocked: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: chatPetAchievements.map(achievement => achievement.id),
			selectedAccessory: ChatPetAccessoryIds.Crown,
			variant: 'insiders',
		}),
	}),
	NarrowMixed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			unlockedAchievements: [ChatPetAchievementIds.IntegratedBrowserShared],
			width: 550,
			height: 500,
		}),
	}),
	SpritesTaughtMove: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'sprites',
			move: 'angry',
			moves: taughtMoves,
			reactions: taughtReactions,
			disabledBuiltInReactions: disabledBuiltIns,
			width: 1000,
			height: 720,
		}),
	}),
	SpritesBuiltInMove: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'sprites',
			move: 'cowboy',
			moves: taughtMoves,
			reactions: taughtReactions,
			variant: 'insiders',
		}),
	}),
	SpritesOwnAnimation: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'sprites',
			move: 'celebrate',
			moves: taughtMoves,
			reactions: taughtReactions,
			disabledBuiltInReactions: disabledBuiltIns,
		}),
	}),
	SpritesEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'sprites',
		}),
	}),
	InteractionsBuiltInTrigger: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'interactions',
			moves: taughtMoves,
			reactions: taughtReactions,
			disabledBuiltInReactions: disabledBuiltIns,
			width: 1000,
			height: 720,
		}),
	}),
	InteractionsTextInteraction: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'interactions',
			interaction: 'reaction:r3',
			moves: taughtMoves,
			reactions: taughtReactions,
			disabledBuiltInReactions: disabledBuiltIns,
			width: 1000,
			height: 680,
		}),
	}),
	InteractionsEmpty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'interactions',
		}),
	}),
	InteractionsAddSpriteForm: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'interactions',
			interaction: 'trigger:click',
			moves: taughtMoves,
			reactions: taughtReactions,
			openForm: 'Add Sprite\u2026',
			width: 1000,
			height: 760,
		}),
	}),
	/** An event that plays one sprite: the salute picked in place of the button press, from the tiles. */
	InteractionsAssignedSprite: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'interactions',
			interaction: 'trigger:requestDone',
			moves: taughtMoves,
			reactions: taughtReactions,
			disabledBuiltInReactions: disabledBuiltIns,
			width: 1000,
			height: 900,
		}),
	}),
	/** Use in an Interaction on the Sprites page leads here: the form for a new interaction, with the sprite set. */
	InteractionsNewInteractionFromSprite: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'sprites',
			move: 'yes-sir',
			moves: taughtMoves,
			reactions: taughtReactions,
			openForm: 'Use in an Interaction\u2026',
			width: 1000,
			height: 760,
		}),
	}),
	InteractionsNarrow: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAchievementsEditor(context, {
			enabled: true,
			tab: 'interactions',
			interaction: 'reaction:r1',
			moves: taughtMoves,
			reactions: taughtReactions,
			width: 550,
			height: 700,
		}),
	}),
});
