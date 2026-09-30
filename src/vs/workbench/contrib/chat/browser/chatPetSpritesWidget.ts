/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { describeChatPetBuiltInMove, getChatPetBuiltInMoves } from './chatPetBuiltInMoves.js';
import { CHAT_PET_OPEN_DOCUMENT_COMMAND_ID, createChatPetMoveTemplate, IChatPetOpenDocumentArgs, readChatPetSharedMove } from './chatPetDocument.js';
import { getChatPetReactionRowId, getChatPetTriggerRowId } from './chatPetInteractionsWidget.js';
import { ChatPetListItem, ChatPetListPage, IChatPetListRow, IChatPetPageHost, IChatPetPageState, renderChatPetDetailEmpty, renderChatPetDetailHeading, renderChatPetDetailSection } from './chatPetListPage.js';
import { getChatPetMoveDuration, IChatPetMove, serializeChatPetMove } from './chatPetMoves.js';
import { ChatPetBuiltInAnimation, ChatPetBuiltInAnimations, ChatPetBuiltInTrigger, ChatPetBuiltInTriggers, describeChatPetTrigger, getChatPetTriggerPool, IChatPetReaction, isChatPetBuiltInReaction } from './chatPetReactions.js';
import { CHAT_PET_MAX_MOVES, IChatPetService } from './chatPetService.js';
import { addChatPetDetailButton, ChatPetPicture, describeChatPetSprite, quoteChatPetPhrases, renderChatPetUseEntry } from './chatPetSpriteUi.js';
import { IChatPetWidgetService } from './widget/chatPetWidgetService.js';

/** A sprite the pet can show: a move it was taught, a move it comes with, or one of its own animations. */
export type ChatPetSprite =
	| { readonly kind: 'taught'; readonly move: IChatPetMove; readonly animation?: undefined }
	| { readonly kind: 'builtInMove'; readonly move: IChatPetMove; readonly animation?: undefined }
	| { readonly kind: 'animation'; readonly animation: ChatPetBuiltInAnimation; readonly move?: undefined };

export interface IChatPetSpriteRow extends IChatPetListRow {
	/** Undefined for the stand-in row of the Taught section while it is empty. */
	readonly sprite: ChatPetSprite | undefined;
}

/** Where a sprite is used: by a taught interaction, or as one of the pet's own animations for a trigger. */
type ChatPetSpriteUse =
	| { readonly kind: 'reaction'; readonly reaction: IChatPetReaction }
	| { readonly kind: 'builtIn'; readonly trigger: ChatPetBuiltInTrigger; readonly enabled: boolean };

const CHAT_PET_TAUGHT_PLACEHOLDER_ID = 'placeholder:taught';

/** The name a sprite is stored and played under. */
export function getChatPetSpriteName(sprite: ChatPetSprite): string {
	return sprite.kind === 'animation' ? sprite.animation : sprite.move.name;
}

/** Every sprite the pet can show, taught moves first, then the built-in moves they don't replace, then its own animations. */
export function getChatPetSprites(moves: readonly IChatPetMove[]): ChatPetSprite[] {
	return [
		...moves.map((move): ChatPetSprite => ({ kind: 'taught', move })),
		...getChatPetBuiltInMoves().filter(move => !moves.some(taught => taught.name === move.name)).map((move): ChatPetSprite => ({ kind: 'builtInMove', move })),
		...ChatPetBuiltInAnimations.map((animation): ChatPetSprite => ({ kind: 'animation', animation })),
	];
}

/**
 * What plays a sprite: the built-in events it plays for, whether as the pet's own animation or
 * as the sprite assigned to them, then the text interactions taught to play it. A sprite an
 * event no longer plays, its own animation replaced or a reaction turned off on an event that
 * plays one sprite, isn't listed.
 */
export function getChatPetSpriteUses(name: string, reactions: readonly IChatPetReaction[], disabledBuiltIns: readonly string[]): ChatPetSpriteUse[] {
	const uses: ChatPetSpriteUse[] = [];
	for (const trigger of ChatPetBuiltInTriggers) {
		for (const entry of getChatPetTriggerPool(trigger, reactions, disabledBuiltIns)) {
			const pick = entry.pick;
			if ((pick.animation ?? pick.move) !== name) {
				continue;
			}
			if (pick.animation) {
				uses.push({ kind: 'builtIn', trigger, enabled: entry.enabled });
			} else {
				const reaction = reactions.find(candidate => candidate.id === pick.reactionId);
				if (reaction) {
					uses.push({ kind: 'reaction', reaction });
				}
			}
		}
	}
	for (const reaction of reactions) {
		if (reaction.trigger === 'message' && reaction.play === name) {
			uses.push({ kind: 'reaction', reaction });
		}
	}
	return uses;
}

function getUseLabel(use: ChatPetSpriteUse): string {
	return use.kind === 'builtIn'
		? describeChatPetTrigger(use.trigger).label
		: use.reaction.trigger === 'message' ? quoteChatPetPhrases(use.reaction.phrases) : describeChatPetTrigger(use.reaction.trigger).label;
}

function isUseEnabled(use: ChatPetSpriteUse): boolean {
	return use.kind === 'builtIn' ? use.enabled : use.reaction.enabled;
}

function describeUse(use: ChatPetSpriteUse): string {
	const label = getUseLabel(use);
	return isUseEnabled(use) ? label : localize('chatPet.sprites.useOff', "{0} (off)", label);
}

function toPicture(sprite: ChatPetSprite): ChatPetPicture {
	return sprite.move ? { move: sprite.move } : { animation: sprite.animation };
}

/** Whether the pet can play the sprite on request; the states it holds while something goes on only play then. */
function isPlayable(sprite: ChatPetSprite): boolean {
	return sprite.kind !== 'animation' || isChatPetBuiltInReaction(sprite.animation);
}

/** The rows of the Sprites page: what the pet can show, and what uses each. */
export function getChatPetSpriteItems(state: IChatPetPageState): ChatPetListItem<IChatPetSpriteRow>[] {
	const sprites = getChatPetSprites(state.moves);
	const toRow = (sprite: ChatPetSprite): IChatPetSpriteRow => {
		const name = getChatPetSpriteName(sprite);
		const uses = getChatPetSpriteUses(name, state.reactions, state.disabledBuiltIns);
		const title = describeChatPetSprite(name);
		const summary = uses.length ? uses.map(describeUse).join(' · ') : localize('chatPet.sprites.unused', "Not used by an interaction");
		return {
			kind: 'row',
			id: name,
			sprite,
			title,
			summary,
			picture: toPicture(sprite),
			off: uses.length > 0 && !uses.some(isUseEnabled),
			placeholder: false,
			ariaLabel: localize('chatPet.sprites.rowAriaLabel', "{0}, {1}", title, summary),
		};
	};
	const taught = sprites.filter(sprite => sprite.kind === 'taught').map(toRow);
	const placeholderTitle = localize('chatPet.sprites.noneTaught', "No taught moves yet");
	const placeholderSummary = localize('chatPet.sprites.noneTaughtSummary', "Draw one, paste one, or ask the agent");
	return [
		{ kind: 'header', id: 'header:taught', label: localize('chatPet.sprites.taught', "Taught"), count: taught.length },
		...(taught.length ? taught : [{ kind: 'row', id: CHAT_PET_TAUGHT_PLACEHOLDER_ID, sprite: undefined, title: placeholderTitle, summary: placeholderSummary, picture: undefined, off: false, placeholder: true, ariaLabel: `${placeholderTitle}, ${placeholderSummary}` } satisfies IChatPetSpriteRow]),
		{ kind: 'header', id: 'header:builtInMoves', label: localize('chatPet.sprites.builtInMoves', "Built-in Moves"), count: undefined },
		...sprites.filter(sprite => sprite.kind === 'builtInMove').map(toRow),
		{ kind: 'header', id: 'header:animations', label: localize('chatPet.sprites.animations', "Pet Animations"), count: undefined },
		...sprites.filter(sprite => sprite.kind === 'animation').map(toRow),
	];
}

/**
 * The Sprites page of the pet's modal: everything the pet can show, what each is used by, and
 * where new sprites are drawn, pasted or customized from built-in ones. It only tells what uses a
 * sprite: which interactions play which sprites is decided on the Interactions page, where Use in
 * an Interaction leads.
 */
export class ChatPetSpritesWidget extends ChatPetListPage<IChatPetSpriteRow> {

	/** The sprite whose Forget button asked for a second click. */
	private forgetting: string | undefined;

	constructor(
		parent: HTMLElement,
		host: IChatPetPageHost,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatPetService chatPetService: IChatPetService,
		@IThemeService themeService: IThemeService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@IChatPetWidgetService private readonly chatPetWidgetService: IChatPetWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@IClipboardService private readonly clipboardService: IClipboardService,
	) {
		super(
			parent,
			'chat-pet-sprites',
			localize('chatPet.sprites.title', "Sprites"),
			localize('chatPet.sprites.intro', "Everything the pet can show: moves it was taught, moves it comes with, and its own animations. Pick one to see what uses it. New sprites are drawn as text in pets.md, pasted from the clipboard, or made by asking the agent in chat; which interactions play them is decided on the Interactions page."),
			localize('chatPet.sprites.listAriaLabel', "Sprites"),
			host,
			instantiationService,
			chatPetService,
			themeService,
			accessibilityService,
		);
	}

	protected override getItems(state: IChatPetPageState): ChatPetListItem<IChatPetSpriteRow>[] {
		return getChatPetSpriteItems(state);
	}

	protected override onDidSelect(): void {
		this.forgetting = undefined;
	}

	protected override renderToolbar(store: DisposableStore, state: IChatPetPageState): void {
		this.addToolbarButton(store, localize('chatPet.sprites.newMove', "New Move"), localize('chatPet.sprites.newMoveTitle', "Adds a move to draw in pets.md; it is taught when you save"), false, () => this.newMove(state.moves));
		this.addToolbarButton(store, localize('chatPet.sprites.import', "Import from Clipboard"), localize('chatPet.sprites.importTitle', "Teaches a move copied as text, or shared in a chat message"), true, () => this.importFromClipboard());
		this.addToolbarButton(store, localize('chatPet.sprites.editAsText', "Edit as Text"), localize('chatPet.sprites.editAsTextTitle', "Opens pets.md, where taught moves and interactions are written"), true, () => this.openDocument({}));
	}

	protected override renderDetailContent(row: IChatPetSpriteRow | undefined, state: IChatPetPageState): void {
		const content = this.detailContent;
		if (!row) {
			return;
		}
		const sprite = row.sprite;
		if (!sprite) {
			this.renderStage(undefined, state);
			renderChatPetDetailHeading(content, localize('chatPet.sprites.teachTitle', "Teach the pet a move"), undefined);
			DOM.append(content, DOM.$('p.chat-pet-interaction-description')).textContent = localize('chatPet.sprites.teachDescription', "A move is a few frames drawn as text, one letter per pixel. Start one from a template, paste one someone shared, customize a built-in move, or ask the agent in chat to draw one for you.");
			const actions = DOM.append(content, DOM.$('.chat-pet-interaction-actions'));
			addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.newMove', "New Move"), '', false, () => this.newMove(state.moves));
			addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.import', "Import from Clipboard"), '', true, () => this.importFromClipboard());
			return;
		}

		const name = getChatPetSpriteName(sprite);
		this.renderStage(toPicture(sprite), state);
		renderChatPetDetailHeading(content, describeChatPetSprite(name), sprite.kind === 'taught'
			? { label: localize('chatPet.sprites.customBadge', "Custom"), custom: true }
			: { label: localize('chatPet.sprites.builtInBadge', "Built-in"), custom: false });
		const description = sprite.kind === 'animation'
			? (isChatPetBuiltInReaction(sprite.animation)
				? localize('chatPet.sprites.reactionDescription', "One of the pet's own reactions. Interactions can play it like any move.")
				: localize('chatPet.sprites.stateDescription', "One of the pet's own animations, held while its trigger goes on."))
			: sprite.kind === 'builtInMove' ? describeChatPetBuiltInMove(sprite.move.name) ?? sprite.move.about : sprite.move.about;
		if (description) {
			DOM.append(content, DOM.$('p.chat-pet-interaction-description')).textContent = description;
		}
		if (sprite.move) {
			const move = sprite.move;
			const size = `${move.frames[0].rows[0].length}\u00d7${move.frames[0].rows.length}`;
			DOM.append(content, DOM.$('p.chat-pet-interaction-meta')).textContent = move.loop
				? localize('chatPet.sprites.metaLoop', "{0} frames, {1} ms, loops · {2} pixels", move.frames.length, getChatPetMoveDuration(move), size)
				: localize('chatPet.sprites.metaOnce', "{0} frames, {1} ms, plays once · {2} pixels", move.frames.length, getChatPetMoveDuration(move), size);
		}

		const actions = DOM.append(content, DOM.$('.chat-pet-interaction-actions'));
		if (isPlayable(sprite)) {
			this.registerFocusable('play', addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.play', "Play"), localize('chatPet.sprites.playTitle', "The pet plays it now"), false, () => this.play(name)).element);
		}
		if (sprite.kind === 'taught') {
			addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.editAsText', "Edit as Text"), localize('chatPet.sprites.editMoveTitle', "Opens pets.md at this move"), true, () => this.openDocument({ revealMove: name }));
			addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.copy', "Copy"), localize('chatPet.sprites.copyTitle', "Copies the move as text, to share or paste into a chat"), true, () => this.copy(sprite.move));
			if (this.forgetting === name) {
				this.registerFocusable('forget', addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.forgetConfirm', "Forget {0}", name), localize('chatPet.sprites.forgetConfirmTitle', "Forgets the move and every interaction that plays it; this can't be undone"), false, () => this.forget(name)).element);
				addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.keep', "Keep"), '', true, () => {
					this.forgetting = undefined;
					this.rerender();
				});
			} else {
				this.registerFocusable('forget', addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.forget', "Forget"), localize('chatPet.sprites.forgetTitle', "Forgets the move and every interaction that plays it"), true, () => {
					this.forgetting = name;
					this.rerender();
				}).element);
			}
		} else if (sprite.kind === 'builtInMove') {
			addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.customize', "Customize"), localize('chatPet.sprites.customizeTitle', "Adds a copy to pets.md to change; saved under the same name, it replaces the built-in move"), true, () => this.openDocument({ insertMove: serializeChatPetMove(sprite.move) }));
			addChatPetDetailButton(this.detailStore, actions, localize('chatPet.sprites.copy', "Copy"), localize('chatPet.sprites.copyTitle', "Copies the move as text, to share or paste into a chat"), true, () => this.copy(sprite.move));
		}

		const { section, list } = renderChatPetDetailSection(content, localize('chatPet.sprites.usedBy', "Used by"));
		const uses = getChatPetSpriteUses(name, state.reactions, state.disabledBuiltIns);
		if (!uses.length) {
			renderChatPetDetailEmpty(section, localize('chatPet.sprites.noUses', "No interaction plays this sprite yet."));
		}
		// The list only tells; each use links to the Interactions page, where it is turned off or removed.
		for (const use of uses) {
			const enabled = isUseEnabled(use);
			const rowId = use.kind === 'builtIn' ? getChatPetTriggerRowId(use.trigger)
				: use.reaction.trigger === 'message' ? getChatPetReactionRowId(use.reaction.id) : getChatPetTriggerRowId(use.reaction.trigger);
			const description = use.kind === 'builtIn' ? localize('chatPet.sprites.useBuiltIn', "The pet's own animation for it")
				: use.reaction.trigger === 'message' ? localize('chatPet.sprites.useMessage', "When a message you send contains one of these")
					: describeChatPetTrigger(use.reaction.trigger).description;
			const { label: labelContainer } = renderChatPetUseEntry(this.detailStore, list, { picture: undefined, variant: state.variant, enabled });
			this.addDetailLink(labelContainer, getUseLabel(use), localize('chatPet.sprites.openInteraction', "Shows it on the Interactions page"), () => this.host.showPage('interactions', rowId));
			DOM.append(labelContainer, DOM.$('span.chat-pet-interaction-pool-detail')).textContent = enabled ? description : localize('chatPet.sprites.useOffDetail', "Off · {0}", description);
		}
		if (isPlayable(sprite)) {
			this.registerFocusable('use', addChatPetDetailButton(this.detailStore, section, localize('chatPet.sprites.use', "Use in an Interaction…"), localize('chatPet.sprites.useTitle', "Goes to the Interactions page, to play this sprite when a message says something or on one of the pet's own triggers"), false, () => this.host.newInteraction(name)).element);
		} else {
			renderChatPetDetailEmpty(section, localize('chatPet.sprites.notUsable', "The pet holds this animation on its own; no other interaction can play it."));
		}
	}

	private play(name: string): void {
		this.notify(this.chatPetWidgetService.playReaction(name) ? undefined : localize('chatPet.sprites.cannotPlay', "The pet can't play right now. Bring it back, or wait until it is done."), 'error');
	}

	private newMove(moves: readonly IChatPetMove[]): void {
		if (moves.length >= CHAT_PET_MAX_MOVES) {
			this.notify(localize('chatPet.sprites.tooManyMoves', "The pet can know at most {0} moves; forget one first.", CHAT_PET_MAX_MOVES), 'error');
			return;
		}
		this.openDocument({ insertMove: serializeChatPetMove(createChatPetMoveTemplate([...moves.map(move => move.name), ...getChatPetBuiltInMoves().map(move => move.name)])) });
	}

	private openDocument(args: IChatPetOpenDocumentArgs): void {
		this.notify(undefined);
		void this.commandService.executeCommand(CHAT_PET_OPEN_DOCUMENT_COMMAND_ID, args);
	}

	private async importFromClipboard(): Promise<void> {
		const result = readChatPetSharedMove(await this.clipboardService.readText());
		if (this._store.isDisposed) {
			return;
		}
		if (result.error !== undefined) {
			this.notify(result.error, 'error');
			return;
		}
		const moves = this.chatPetService.moves.get();
		if (!moves.some(move => move.name === result.move.name) && moves.length >= CHAT_PET_MAX_MOVES) {
			this.notify(localize('chatPet.sprites.tooManyMoves', "The pet can know at most {0} moves; forget one first.", CHAT_PET_MAX_MOVES), 'error');
			return;
		}
		this.chatPetService.learnMove(result.move);
		this.select(result.move.name);
		this.notify(localize('chatPet.sprites.imported', "The pet learned {0}.", result.move.name));
	}

	private async copy(move: IChatPetMove): Promise<void> {
		await this.clipboardService.writeText(serializeChatPetMove(move));
		this.notify(localize('chatPet.sprites.copied', "Copied {0} as text.", move.name));
	}

	private forget(name: string): void {
		this.forgetting = undefined;
		if (this.chatPetService.forgetMove(name)) {
			this.notify(localize('chatPet.sprites.forgot', "The pet forgot {0}.", name));
		}
	}
}
