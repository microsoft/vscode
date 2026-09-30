/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getBaseLayerHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { describeChatPetBuiltInMove, findChatPetMove, getChatPetBuiltInMoveNames, getChatPetBuiltInMoves } from './chatPetBuiltInMoves.js';
import { CHAT_PET_MOVE_CELL_SIZE, CHAT_PET_MOVE_EYE_COLOR, getChatPetMoveStillIndex, IChatPetMove } from './chatPetMoves.js';
import { ChatPetBuiltInAnimation, ChatPetBuiltInReactions, ChatPetBuiltInTrigger, ChatPetBuiltInTriggerAnimations, ChatPetBuiltInTriggers, ChatPetReactionLimits, ChatPetReactionTrigger, ChatPetTriggerPick, describeChatPetBuiltInAnimation, describeChatPetTrigger, getChatPetTriggerPool, hasChatPetTriggerPool, IChatPetReaction, isChatPetBuiltInAnimation, sanitizeChatPetReaction } from './chatPetReactions.js';
import { ChatPetVariant, IChatPetService } from './chatPetService.js';
import { paintChatPetMoveFrame } from './widget/chatPetMoveSprites.js';
import { getChatPetBuiltInAnimationImage } from './widget/chatPetWidget.js';

/**
 * What the Sprites and Interactions pages of the pet's modal share: how a sprite is pictured, a
 * sprite being a move drawn in the move format or one of the pet's own animations, and the form
 * of an interaction, which the Interactions page shows to assign a sprite.
 */

/** Something the pet can show in a picture: a move's frame, or one of its own animations. */
export type ChatPetPicture = { readonly move: IChatPetMove; readonly animation?: undefined } | { readonly move?: undefined; readonly animation: ChatPetBuiltInAnimation };

/** The preview shows one logical pixel as a 6 px square. */
export const CHAT_PET_PREVIEW_CELL_SIZE = 6;
/** The pause before a one-shot move replays in the preview. */
const CHAT_PET_REPLAY_PAUSE_MS = 800;
/** Thumbnails in a detail pane's lists fit a square this big. */
const CHAT_PET_USE_THUMB_SIZE = 28;
/** The pet draws its blinking eyes at the idle eyes' place, over sheets that have none. */
const CHAT_PET_EYE_COLUMNS = [5, 8];
const CHAT_PET_EYE_ROW = 8;

/** What a sprite is called, as users see it: a move's name, or the label of one of the pet's own animations. */
export function describeChatPetSprite(name: string): string {
	return isChatPetBuiltInAnimation(name) ? describeChatPetBuiltInAnimation(name) : name;
}

/** What a pick shows, as text: a move's name or an animation's label. */
export function describeChatPetPick(pick: ChatPetTriggerPick): string {
	return pick.animation ? describeChatPetBuiltInAnimation(pick.animation) : describeChatPetSprite(pick.move);
}

export function quoteChatPetPhrases(phrases: readonly string[]): string {
	return phrases.map(phrase => `\u201c${phrase}\u201d`).join(', ');
}

/** What a sprite looks like: a taught or built-in move by name, or one of the pet's own reactions. */
export function getChatPetSpritePicture(name: string, moves: readonly IChatPetMove[]): ChatPetPicture | undefined {
	if (isChatPetBuiltInAnimation(name)) {
		return { animation: name };
	}
	const move = findChatPetMove(moves, name);
	return move ? { move } : undefined;
}

/** What a pick looks like: a built-in animation, or the sprite it names. */
export function toChatPetPicture(pick: ChatPetTriggerPick, moves: readonly IChatPetMove[]): ChatPetPicture | undefined {
	return pick.animation ? { animation: pick.animation } : getChatPetSpritePicture(pick.move, moves);
}

/** How many screen pixels a logical pixel of a picture gets, so it fits a box `width` by `height`. */
export function getChatPetPictureCellSize(picture: ChatPetPicture, variant: ChatPetVariant, width: number, height = width): number {
	let columns: number;
	let rows: number;
	if (picture.move) {
		columns = picture.move.frames[0].rows[0].length;
		rows = picture.move.frames[0].rows.length;
	} else {
		const image = getChatPetBuiltInAnimationImage(picture.animation, variant);
		columns = image.frameWidth / CHAT_PET_MOVE_CELL_SIZE;
		rows = image.frameHeight / CHAT_PET_MOVE_CELL_SIZE;
	}
	return Math.max(1, Math.floor(Math.min(width / columns, height / rows)));
}

function sizeChatPetCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
	canvas.width = width;
	canvas.height = height;
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
}

/** Draws frame `frameIndex` of `image`, a sheet of frames side by side, onto the whole canvas, with the pet's eyes over it when it draws them. */
function paintChatPetSheetFrame(canvas: HTMLCanvasElement, image: HTMLImageElement, frameIndex: number, frameWidth: number, frameHeight: number, cellSize: number, eyesDrawnOver: boolean): void {
	const context = canvas.getContext('2d');
	if (!context) {
		return;
	}
	context.imageSmoothingEnabled = false;
	context.clearRect(0, 0, canvas.width, canvas.height);
	context.drawImage(image, frameIndex * frameWidth, 0, frameWidth, frameHeight, 0, 0, canvas.width, canvas.height);
	if (eyesDrawnOver) {
		context.fillStyle = CHAT_PET_MOVE_EYE_COLOR;
		for (const column of CHAT_PET_EYE_COLUMNS) {
			context.fillRect(column * cellSize, CHAT_PET_EYE_ROW * cellSize, cellSize, 2 * cellSize);
		}
	}
}

/**
 * Loads one of the pet's own sprites into `canvas`, sized for it, and paints it when it arrives.
 * While it loads, `container` is marked `data-loading`; a row recycled before then is unmarked.
 */
function loadChatPetSheet(container: HTMLElement, canvas: HTMLCanvasElement, url: string, frameWidth: number, frameHeight: number, cellSize: number, paint: (image: HTMLImageElement) => void): IDisposable {
	sizeChatPetCanvas(canvas, Math.round(frameWidth * cellSize / CHAT_PET_MOVE_CELL_SIZE), Math.round(frameHeight * cellSize / CHAT_PET_MOVE_CELL_SIZE));
	container.dataset.loading = 'true';
	const store = new DisposableStore();
	const image = container.ownerDocument.createElement('img');
	store.add(DOM.addDisposableListener(image, 'load', () => {
		delete container.dataset.loading;
		paint(image);
	}));
	store.add(DOM.addDisposableListener(image, 'error', () => {
		delete container.dataset.loading;
	}));
	store.add(toDisposable(() => delete container.dataset.loading));
	image.src = url;
	return store;
}

/**
 * Draws a picture: a move's still frame, or one of the pet's own sprites, with the eyes the pet
 * draws over some of them. While a sprite loads, the container is marked `data-loading`.
 */
export function renderChatPetPicture(container: HTMLElement, picture: ChatPetPicture, variant: ChatPetVariant, cellSize: number): IDisposable {
	clearChatPetPicture(container);
	const canvas = DOM.append(container, DOM.$('canvas')) as HTMLCanvasElement;
	if (picture.move) {
		paintChatPetMoveFrame(canvas, picture.move, getChatPetMoveStillIndex(picture.move), variant, cellSize);
		canvas.style.width = `${canvas.width}px`;
		canvas.style.height = `${canvas.height}px`;
		return Disposable.None;
	}
	const source = getChatPetBuiltInAnimationImage(picture.animation, variant);
	return loadChatPetSheet(container, canvas, source.url, source.frameWidth, source.frameHeight, cellSize, image => paintChatPetSheetFrame(canvas, image, 0, source.frameWidth, source.frameHeight, cellSize, source.eyesDrawnOver));
}

export function clearChatPetPicture(container: HTMLElement): void {
	DOM.clearNode(container);
	delete container.dataset.loading;
}

/** Plays a move's frames on a canvas, over and over, or shows its still frame for reduced motion. */
export class ChatPetMovePreview extends Disposable {

	private readonly timer = this._register(new MutableDisposable());

	constructor(
		private readonly canvas: HTMLCanvasElement,
		private readonly move: IChatPetMove,
		private readonly variant: ChatPetVariant,
		animate: boolean,
	) {
		super();
		if (animate && move.frames.length > 1) {
			this.show(0);
		} else {
			this.paint(getChatPetMoveStillIndex(move));
		}
	}

	private paint(frameIndex: number): void {
		paintChatPetMoveFrame(this.canvas, this.move, frameIndex, this.variant, CHAT_PET_PREVIEW_CELL_SIZE);
		this.canvas.style.width = `${this.canvas.width}px`;
		this.canvas.style.height = `${this.canvas.height}px`;
	}

	private show(frameIndex: number): void {
		this.paint(frameIndex);
		const next = (frameIndex + 1) % this.move.frames.length;
		const pause = next === 0 && !this.move.loop ? CHAT_PET_REPLAY_PAUSE_MS : 0;
		this.timer.value = disposableTimeout(() => this.show(next), this.move.frames[frameIndex].durationMs + pause);
	}
}

/**
 * Plays one of the pet's own animations on a canvas from its sheet, over and over, with the pet's
 * eyes drawn over the frames that need them, or shows its still frame for reduced motion.
 */
export class ChatPetAnimationPreview extends Disposable {

	private readonly timer = this._register(new MutableDisposable());

	constructor(container: HTMLElement, canvas: HTMLCanvasElement, animation: ChatPetBuiltInAnimation, variant: ChatPetVariant, animate: boolean) {
		super();
		const source = getChatPetBuiltInAnimationImage(animation, variant);
		const sheet = animate ? source.sheet : undefined;
		if (!sheet) {
			this._register(loadChatPetSheet(container, canvas, source.url, source.frameWidth, source.frameHeight, CHAT_PET_PREVIEW_CELL_SIZE, image => paintChatPetSheetFrame(canvas, image, 0, source.frameWidth, source.frameHeight, CHAT_PET_PREVIEW_CELL_SIZE, source.eyesDrawnOver)));
			return;
		}
		this._register(loadChatPetSheet(container, canvas, sheet.url, source.frameWidth, source.frameHeight, CHAT_PET_PREVIEW_CELL_SIZE, image => {
			const show = (frameIndex: number) => {
				paintChatPetSheetFrame(canvas, image, frameIndex, source.frameWidth, source.frameHeight, CHAT_PET_PREVIEW_CELL_SIZE, sheet.frames[frameIndex].eyesDrawnOver);
				canvas.dataset.frame = String(frameIndex);
				const next = (frameIndex + 1) % sheet.frames.length;
				// A reaction the pet plays once replays after a pause, as a move does.
				const pause = next === 0 && !sheet.loops ? CHAT_PET_REPLAY_PAUSE_MS : 0;
				this.timer.value = disposableTimeout(() => show(next), sheet.frames[frameIndex].durationMs + pause);
			};
			show(0);
		}));
	}
}

/**
 * The stage at the top of a detail pane: a move or one of the pet's own animations playing on the
 * chat input's edge. Empty when nothing plays.
 */
export function renderChatPetStage(container: HTMLElement, picture: ChatPetPicture | undefined, variant: ChatPetVariant, animate: boolean): IDisposable {
	const stage = DOM.append(container, DOM.$('.chat-pet-interaction-stage'));
	stage.setAttribute('aria-hidden', 'true');
	if (!picture) {
		stage.classList.add('empty');
		return Disposable.None;
	}
	const canvas = DOM.append(stage, DOM.$('canvas.chat-pet-interaction-preview')) as HTMLCanvasElement;
	return picture.move
		? new ChatPetMovePreview(canvas, picture.move, variant, animate)
		: new ChatPetAnimationPreview(stage, canvas, picture.animation, variant, animate);
}

/** A button in a detail pane, sized to its label. */
export function addChatPetDetailButton(store: DisposableStore, container: HTMLElement, label: string, title: string, secondary: boolean, onClick: () => void): Button {
	const button = store.add(new Button(container, { ...defaultButtonStyles, secondary, title }));
	button.label = label;
	store.add(button.onDidClick(onClick));
	return button;
}

/** A reaction being written or changed in a detail pane, kept across re-renders until saved or cancelled. */
export interface IChatPetReactionDraft {
	/** The reaction being changed, or undefined for a new one. */
	readonly reactionId: string | undefined;
	trigger: ChatPetReactionTrigger;
	/** Phrases as typed, separated by commas. */
	phrases: string;
	play: string;
	/** What the user wrote as the reaction's reason, kept when changing a reaction an agent taught. */
	readonly when: string;
	error: string | undefined;
	/** True until the form has shown once, so it takes focus then, not when it re-renders as things change. */
	fresh: boolean;
}

export function createChatPetReactionDraft(preset: { readonly trigger?: ChatPetReactionTrigger; readonly play?: string }, defaultPlay: string): IChatPetReactionDraft {
	return { reactionId: undefined, trigger: preset.trigger ?? 'message', phrases: '', play: preset.play ?? defaultPlay, when: '', error: undefined, fresh: true };
}

export function toChatPetReactionDraft(reaction: IChatPetReaction): IChatPetReactionDraft {
	return { reactionId: reaction.id, trigger: reaction.trigger, phrases: reaction.phrases.join(', '), play: reaction.play, when: reaction.when, error: undefined, fresh: true };
}

export function splitChatPetPhrases(value: string): string[] {
	return value.split(',').map(phrase => phrase.trim()).filter(Boolean);
}

/** One thing to choose in a {@link renderChatPetChoice} control: a sprite, an event, or nothing. */
export interface IChatPetChoiceOption<T> {
	/** Tells the option apart from the others; the selection is kept by it. */
	readonly id: string;
	readonly value: T;
	readonly label: string;
	/** Shown on hover. */
	readonly detail?: string;
	/** For tiles: what the option looks like; none draws an empty frame, as for nothing. */
	readonly picture?: ChatPetPicture;
}

export interface IChatPetChoiceGroup<T> {
	/** A caption over the group's options; none runs the group into the one before. */
	readonly label?: string;
	readonly options: readonly IChatPetChoiceOption<T>[];
}

/** Sprite names as tiles carry them: the id of a sprite's option. */
export function getChatPetSpriteChoiceId(name: string): string {
	return `sprite:${name}`;
}

/**
 * Everything a reaction can play, but `exclude`, as pictured tiles in the groups of the Sprites
 * page: taught moves, built-in moves, and the pet's own reactions.
 */
export function getChatPetSpriteChoices(moves: readonly IChatPetMove[], exclude: readonly string[] = []): IChatPetChoiceGroup<string>[] {
	const toOption = (name: string, label: string, detail: string | undefined, picture: ChatPetPicture): IChatPetChoiceOption<string> => ({ id: getChatPetSpriteChoiceId(name), value: name, label, detail, picture });
	const groups: IChatPetChoiceGroup<string>[] = [
		{ label: localize('chatPet.choice.taught', "Taught"), options: moves.map(move => toOption(move.name, move.name, move.about || undefined, { move })) },
		{ label: localize('chatPet.choice.builtInMoves', "Built-in Moves"), options: getChatPetBuiltInMoves().filter(move => !moves.some(taught => taught.name === move.name)).map(move => toOption(move.name, move.name, describeChatPetBuiltInMove(move.name), { move })) },
		{ label: localize('chatPet.choice.animations', "Pet Animations"), options: ChatPetBuiltInReactions.map(name => toOption(name, describeChatPetBuiltInAnimation(name), localize('chatPet.interactions.builtInReactionDetail', "The pet's own reaction"), { animation: name })) },
	];
	return groups.map(group => ({ ...group, options: group.options.filter(option => !exclude.includes(option.value)) })).filter(group => group.options.length);
}

/** The first sprite of the choices, for a draft to start on. */
export function getChatPetFirstSpriteChoice(groups: readonly IChatPetChoiceGroup<string>[]): string | undefined {
	return groups[0]?.options[0]?.value;
}

export interface IChatPetChoiceRenderOptions<T> {
	readonly ariaLabel: string;
	/** Tiles show a picture over a name, for sprites; chips show a name, for events. */
	readonly kind: 'tiles' | 'chips';
	readonly variant: ChatPetVariant;
	readonly groups: readonly IChatPetChoiceGroup<T>[];
	/** The id of the option chosen now. */
	readonly selected: string | undefined;
	readonly onDidSelect: (option: IChatPetChoiceOption<T>) => void;
}

export interface IChatPetChoice {
	readonly root: HTMLElement;
	/** Gives focus to the chosen option, or the first. */
	focusSelected(): void;
	/** Marks another option as chosen, without telling `onDidSelect`. */
	setSelected(id: string | undefined): void;
}

/** Row thumbnails of a tile fit this box. */
const CHAT_PET_CHOICE_THUMB_WIDTH = 48;
const CHAT_PET_CHOICE_THUMB_HEIGHT = 40;

/**
 * A choice among pictured tiles or text chips, laid out in rows that wrap: a listbox whose options
 * are reached with the arrow keys and chosen with Enter, Space or a click, in place of a dropdown
 * that would hide what is being chosen.
 */
export function renderChatPetChoice<T>(store: DisposableStore, container: HTMLElement, options: IChatPetChoiceRenderOptions<T>): IChatPetChoice {
	const root = DOM.append(container, DOM.$(`.chat-pet-choice.${options.kind}`));
	root.setAttribute('role', 'listbox');
	root.setAttribute('aria-label', options.ariaLabel);
	const entries: { readonly option: IChatPetChoiceOption<T>; readonly element: HTMLElement }[] = [];
	let selectedId = options.selected;

	const apply = () => {
		for (const { option, element } of entries) {
			const isSelected = option.id === selectedId;
			element.classList.toggle('selected', isSelected);
			element.setAttribute('aria-selected', String(isSelected));
			element.tabIndex = isSelected ? 0 : -1;
		}
		// Without a choice yet, the first option is where Tab lands.
		if (entries.length && !entries.some(({ option }) => option.id === selectedId)) {
			entries[0].element.tabIndex = 0;
		}
	};
	const select = (entry: { readonly option: IChatPetChoiceOption<T>; readonly element: HTMLElement }) => {
		entry.element.focus();
		if (entry.option.id === selectedId) {
			return;
		}
		selectedId = entry.option.id;
		apply();
		options.onDidSelect(entry.option);
	};

	for (const group of options.groups) {
		if (!group.options.length) {
			continue;
		}
		const groupElement = DOM.append(root, DOM.$('.chat-pet-choice-group'));
		if (group.label) {
			DOM.append(groupElement, DOM.$('.chat-pet-choice-group-label')).textContent = group.label;
		}
		const list = DOM.append(groupElement, DOM.$('.chat-pet-choice-options'));
		for (const option of group.options) {
			const element = DOM.append(list, DOM.$('.chat-pet-choice-option'));
			element.setAttribute('role', 'option');
			if (options.kind === 'tiles') {
				const thumb = DOM.append(element, DOM.$('.chat-pet-choice-thumb'));
				if (option.picture) {
					store.add(renderChatPetPicture(thumb, option.picture, options.variant, getChatPetPictureCellSize(option.picture, options.variant, CHAT_PET_CHOICE_THUMB_WIDTH, CHAT_PET_CHOICE_THUMB_HEIGHT)));
				} else {
					thumb.classList.add('empty');
				}
			}
			DOM.append(element, DOM.$('span.chat-pet-choice-label')).textContent = option.label;
			if (option.detail) {
				store.add(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), element, option.detail));
			}
			const entry = { option, element };
			store.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, e => {
				DOM.EventHelper.stop(e, true);
				select(entry);
			}));
			entries.push(entry);
		}
	}

	// The option a vertical arrow lands on: the nearest one in the next or previous row of the wrapped layout.
	const findVertically = (from: HTMLElement, direction: 1 | -1): HTMLElement | undefined => {
		const bounds = from.getBoundingClientRect();
		const rows = entries.map(({ element }) => ({ element, bounds: element.getBoundingClientRect() })).filter(({ bounds: other }) => direction > 0 ? other.top > bounds.bottom - 1 : other.bottom < bounds.top + 1);
		if (!rows.length) {
			return undefined;
		}
		const rowTop = direction > 0 ? Math.min(...rows.map(({ bounds }) => bounds.top)) : Math.max(...rows.map(({ bounds }) => bounds.top));
		const center = bounds.left + bounds.width / 2;
		return rows.filter(({ bounds }) => bounds.top === rowTop).reduce((best, candidate) => Math.abs(candidate.bounds.left + candidate.bounds.width / 2 - center) < Math.abs(best.bounds.left + best.bounds.width / 2 - center) ? candidate : best).element;
	};
	store.add(DOM.addDisposableListener(root, DOM.EventType.KEY_DOWN, e => {
		const index = entries.findIndex(({ element }) => element === e.target);
		if (index < 0) {
			return;
		}
		const event = new StandardKeyboardEvent(e);
		let next: HTMLElement | undefined;
		switch (event.keyCode) {
			case KeyCode.RightArrow: next = entries[Math.min(entries.length - 1, index + 1)].element; break;
			case KeyCode.LeftArrow: next = entries[Math.max(0, index - 1)].element; break;
			case KeyCode.DownArrow: next = findVertically(entries[index].element, 1) ?? entries[entries.length - 1].element; break;
			case KeyCode.UpArrow: next = findVertically(entries[index].element, -1) ?? entries[0].element; break;
			case KeyCode.Home: next = entries[0].element; break;
			case KeyCode.End: next = entries[entries.length - 1].element; break;
			case KeyCode.Enter:
			case KeyCode.Space:
				DOM.EventHelper.stop(e, true);
				select(entries[index]);
				return;
			default:
				return;
		}
		DOM.EventHelper.stop(e, true);
		next.focus();
	}));
	apply();
	return {
		root,
		focusSelected: () => (entries.find(({ option }) => option.id === selectedId) ?? entries[0])?.element.focus(),
		setSelected: id => {
			selectedId = id;
			apply();
		},
	};
}

/** What a sprite on a built-in trigger does, for the form: joins a click's pool, or plays in place of the pet's own animation. */
export function describeChatPetTriggerAssignment(trigger: ChatPetBuiltInTrigger): string {
	const { description } = describeChatPetTrigger(trigger);
	if (hasChatPetTriggerPool(trigger)) {
		return localize('chatPet.interactions.form.poolHint', "{0} The sprite joins what plays for it, and one of those plays at random; each can be turned off.", description);
	}
	return localize('chatPet.interactions.form.singleHint', "{0} The sprite plays then in place of {1}, the pet's own, for as long as it lasts.", description, describeChatPetBuiltInAnimation(ChatPetBuiltInTriggerAnimations[trigger][0]));
}

export interface IChatPetReactionFormOptions {
	readonly draft: IChatPetReactionDraft;
	readonly moves: readonly IChatPetMove[];
	/** The pet's colors, for the sprite tiles. */
	readonly variant: ChatPetVariant;
	/** Whether the trigger can be chosen; a form in a row's detail fixes it to what the row is about. */
	readonly chooseTrigger: boolean;
	/** Sprites left out of the choice, such as those a trigger already plays. */
	readonly excludePlays?: readonly string[];
	/** Called as another sprite is chosen, so the stage can show it. */
	readonly onDidChangePlay: (play: string) => void;
	readonly onSave: () => void;
	readonly onCancel: () => void;
	readonly onRemove: (() => void) | undefined;
	/** Scrolls the form into view when it takes focus. */
	readonly reveal: (element: HTMLElement) => void;
	/** Renders, under the sprite field, the way to a new sprite: the Sprites page, where sprites are made. */
	readonly renderNewSpriteLink: (container: HTMLElement) => void;
}

/**
 * The form for a new or changed reaction, in the detail pane rather than a quick pick, so the
 * modal stays the one place to look. Returns the form and how to show an error in it.
 */
export function renderChatPetReactionForm(store: DisposableStore, container: HTMLElement, options: IChatPetReactionFormOptions): { readonly form: HTMLElement; readonly fail: (message: string) => void } {
	const { draft } = options;
	const isNew = draft.reactionId === undefined;
	const form = DOM.append(container, DOM.$('.chat-pet-trigger-form'));
	form.setAttribute('role', 'group');
	const titleId = `chat-pet-trigger-form-title-${draft.reactionId ?? 'new'}`;
	form.setAttribute('aria-labelledby', titleId);
	const title = DOM.append(form, DOM.$('h4'));
	title.id = titleId;
	title.textContent = !isNew ? localize('chatPet.interactions.form.editTitle', "Change this interaction")
		: options.chooseTrigger ? localize('chatPet.interactions.form.newTitle', "New interaction")
			: draft.trigger === 'message' ? localize('chatPet.interactions.form.newTextTitle', "New text interaction")
				: localize('chatPet.interactions.form.addSpriteTitle', "Add a sprite");

	const field = (label: string): { readonly row: HTMLElement; readonly control: HTMLElement } => {
		const row = DOM.append(form, DOM.$('.chat-pet-trigger-field'));
		DOM.append(row, DOM.$('span.chat-pet-trigger-field-label')).textContent = label;
		return { row, control: DOM.append(row, DOM.$('.chat-pet-trigger-field-control')) };
	};
	// Shown under the fields, once Save finds something to fix.
	const error = DOM.$('p.chat-pet-trigger-form-error');
	error.setAttribute('role', 'alert');
	error.textContent = draft.error ?? '';
	error.classList.toggle('hidden', !draft.error);
	const clearError = () => {
		draft.error = undefined;
		error.classList.add('hidden');
	};

	const triggers: readonly ChatPetReactionTrigger[] = ['message', ...ChatPetBuiltInTriggers];
	const describeTriggerOption = (trigger: ChatPetReactionTrigger) => trigger === 'message' ? localize('chatPet.interactions.form.message', "A message contains phrases") : describeChatPetTrigger(trigger).label;
	let triggerChoice: IChatPetChoice | undefined;
	const triggerField = field(localize('chatPet.interactions.form.trigger', "Plays when"));
	if (!options.chooseTrigger) {
		DOM.append(triggerField.control, DOM.$('span.chat-pet-trigger-field-value')).textContent = describeTriggerOption(draft.trigger);
	}

	const phrasesField = field(localize('chatPet.interactions.form.phrases', "Phrases"));
	const phrases = store.add(new InputBox(phrasesField.control, undefined, {
		inputBoxStyles: defaultInputBoxStyles,
		placeholder: localize('chatPet.interactions.form.phrasesPlaceholder', "do it, go ahead, ship it"),
		ariaLabel: localize('chatPet.interactions.form.phrasesAriaLabel', "Phrases a message may contain, separated by commas"),
	}));
	phrases.value = draft.phrases;
	DOM.append(phrasesField.control, DOM.$('p.chat-pet-trigger-field-hint')).textContent = localize('chatPet.interactions.form.phrasesHint', "Separated by commas. Each matches whole words in a message you send, ignoring case and punctuation. A sprite alone on its phrases always plays.");
	store.add(phrases.onDidChange(value => {
		draft.phrases = value;
		phrases.hideMessage();
		clearError();
	}));
	const triggerHint = DOM.append(form, DOM.$('p.chat-pet-trigger-field-hint.chat-pet-trigger-hint'));
	const showTrigger = () => {
		phrasesField.row.classList.toggle('hidden', draft.trigger !== 'message');
		triggerHint.classList.toggle('hidden', draft.trigger === 'message');
		if (draft.trigger !== 'message') {
			triggerHint.textContent = describeChatPetTriggerAssignment(draft.trigger);
		}
	};
	showTrigger();

	const playField = field(localize('chatPet.interactions.form.play', "Sprite"));
	const groups = getChatPetSpriteChoices(options.moves, options.excludePlays);
	if (!groups.some(group => group.options.some(option => option.value === draft.play))) {
		const first = getChatPetFirstSpriteChoice(groups);
		if (first !== undefined) {
			draft.play = first;
			options.onDidChangePlay(draft.play);
		}
	}
	const playChoice = renderChatPetChoice(store, playField.control, {
		ariaLabel: localize('chatPet.interactions.form.play', "Sprite"),
		kind: 'tiles',
		variant: options.variant,
		groups,
		selected: getChatPetSpriteChoiceId(draft.play),
		onDidSelect: option => {
			draft.play = option.value;
			clearError();
			options.onDidChangePlay(draft.play);
		},
	});
	if (options.chooseTrigger) {
		triggerChoice = renderChatPetChoice(store, triggerField.control, {
			ariaLabel: localize('chatPet.interactions.form.trigger', "Plays when"),
			kind: 'chips',
			variant: options.variant,
			groups: [{ options: triggers.map((trigger): IChatPetChoiceOption<ChatPetReactionTrigger> => ({ id: trigger, value: trigger, label: describeTriggerOption(trigger), detail: describeChatPetTrigger(trigger).description })) }],
			selected: draft.trigger,
			onDidSelect: option => {
				draft.trigger = option.value;
				clearError();
				showTrigger();
			},
		});
	}
	const newSpriteHint = DOM.append(playField.control, DOM.$('p.chat-pet-trigger-field-hint'));
	newSpriteHint.textContent = localize('chatPet.interactions.form.newSpriteHint', "Sprites are made on the Sprites page.");
	newSpriteHint.appendChild(DOM.$('span', undefined, ' '));
	options.renderNewSpriteLink(newSpriteHint);

	form.appendChild(error);
	const actions = DOM.append(form, DOM.$('.chat-pet-trigger-form-actions'));
	addChatPetDetailButton(store, actions, localize('chatPet.interactions.form.save', "Save"), '', false, options.onSave);
	addChatPetDetailButton(store, actions, localize('chatPet.interactions.form.cancel', "Cancel"), '', true, options.onCancel);
	if (options.onRemove) {
		addChatPetDetailButton(store, actions, localize('chatPet.interactions.form.remove', "Remove"), localize('chatPet.interactions.form.removeTitle', "The pet stops playing this; the sprite stays"), true, options.onRemove);
	}

	// Enter saves from the phrases and Escape leaves the form, not the modal around it.
	store.add(DOM.addDisposableListener(form, DOM.EventType.KEY_DOWN, e => {
		const event = new StandardKeyboardEvent(e);
		if (event.keyCode === KeyCode.Escape) {
			DOM.EventHelper.stop(e, true);
			options.onCancel();
		} else if (event.keyCode === KeyCode.Enter && event.target === phrases.inputElement) {
			DOM.EventHelper.stop(e, true);
			options.onSave();
		}
	}));
	if (draft.fresh) {
		// A form just opened scrolls into view and takes focus; one re-rendered as things change keeps its draft and leaves focus where it is.
		draft.fresh = false;
		queueMicrotask(() => {
			if (!store.isDisposed && form.isConnected) {
				options.reveal(form);
				if (draft.trigger === 'message') {
					phrases.focus();
				} else if (triggerChoice) {
					triggerChoice.focusSelected();
				} else {
					playChoice.focusSelected();
				}
			}
		});
	}

	const fail = (message: string) => {
		draft.error = message;
		error.textContent = message;
		error.classList.remove('hidden');
		if (draft.trigger === 'message') {
			phrases.showMessage({ content: message, type: MessageType.ERROR });
			phrases.focus();
		}
	};
	return { form, fail };
}

/** Scrolls a pane the least it needs for `element` to be in view. */
export function revealChatPetElement(pane: HTMLElement, getScrollTop: () => number, setScrollTop: (scrollTop: number) => void, element: HTMLElement): void {
	const paneBounds = pane.getBoundingClientRect();
	const target = element.getBoundingClientRect();
	const scrollTop = getScrollTop();
	if (target.bottom > paneBounds.bottom) {
		setScrollTop(scrollTop + Math.min(target.bottom - paneBounds.bottom, target.top - paneBounds.top));
	} else if (target.top < paneBounds.top) {
		setScrollTop(scrollTop - (paneBounds.top - target.top));
	}
}

/**
 * Stores a draft as a new reaction, or as the change of the one it is for. Returns what must be
 * fixed first, or undefined and the stored reaction's id once it is stored.
 */
export function saveChatPetReactionDraft(draft: IChatPetReactionDraft, chatPetService: IChatPetService): { readonly error: string; readonly id?: undefined } | { readonly error?: undefined; readonly id: string } {
	const reactions = chatPetService.reactions.get();
	const existing = draft.reactionId === undefined ? undefined : reactions.find(reaction => reaction.id === draft.reactionId);
	const sanitized = sanitizeChatPetReaction({
		trigger: draft.trigger,
		when: draft.when,
		phrases: splitChatPetPhrases(draft.phrases),
		play: draft.play,
		enabled: existing?.enabled,
	}, [...chatPetService.moves.get().map(move => move.name), ...getChatPetBuiltInMoveNames()]);
	if (typeof sanitized === 'string') {
		return { error: sanitized };
	}
	if (sanitized.trigger !== 'message') {
		// A click plays each sprite once, and a second entry for it would only weight the draw; any other trigger already plays its one sprite.
		const pool = getChatPetTriggerPool(sanitized.trigger, reactions.filter(reaction => reaction.id !== draft.reactionId), chatPetService.disabledBuiltInReactions.get());
		const same = pool.find(entry => (entry.pick.animation ?? entry.pick.move) === sanitized.play);
		if (same) {
			const label = describeChatPetTrigger(sanitized.trigger).label.toLowerCase();
			return {
				error: same.enabled
					? localize('chatPet.interactions.form.duplicate', "{0} already plays when {1}.", describeChatPetSprite(sanitized.play), label)
					: localize('chatPet.interactions.form.duplicateOff', "{0} is turned off for {1}; turn it on there instead.", describeChatPetSprite(sanitized.play), label),
			};
		}
	}
	if (existing) {
		chatPetService.updateReaction(existing.id, sanitized);
		return { id: existing.id };
	}
	if (reactions.length >= ChatPetReactionLimits.maxReactions) {
		return { error: localize('chatPet.interactions.form.tooMany', "The pet can have at most {0} interactions; remove one first.", ChatPetReactionLimits.maxReactions) };
	}
	return { id: chatPetService.addReaction(sanitized).id };
}

export interface IChatPetUseEntryOptions {
	/** The sprite shown before the label, if any. */
	readonly picture: ChatPetPicture | undefined;
	readonly variant: ChatPetVariant;
	readonly enabled: boolean;
	/** A checkbox before the label that turns the entry off and on. Without one, the entry only tells. */
	readonly toggle?: { readonly title: string; readonly onToggle: (enabled: boolean) => void };
	/** A button after the label, such as one that takes a sprite off a trigger. */
	readonly action?: { readonly label: string; readonly title: string; readonly onClick: () => void };
}

/**
 * An entry of a list inside the detail pane: a trigger's sprite, or an interaction a sprite is
 * used by. Its label is left for the caller to fill.
 */
export function renderChatPetUseEntry(store: DisposableStore, list: HTMLElement, options: IChatPetUseEntryOptions): { readonly entry: HTMLElement; readonly label: HTMLElement; readonly checkbox: Checkbox | undefined } {
	const entry = DOM.append(list, DOM.$('li.chat-pet-interaction-pool-entry'));
	entry.classList.toggle('off', !options.enabled);
	let checkbox: Checkbox | undefined;
	if (options.toggle) {
		const { title, onToggle } = options.toggle;
		const toggle = store.add(new Checkbox(title, options.enabled, defaultCheckboxStyles));
		entry.appendChild(toggle.domNode);
		store.add(toggle.onChange(() => onToggle(toggle.checked)));
		checkbox = toggle;
	}
	if (options.picture) {
		const thumb = DOM.append(entry, DOM.$('.chat-pet-interaction-pool-thumb'));
		store.add(renderChatPetPicture(thumb, options.picture, options.variant, getChatPetPictureCellSize(options.picture, options.variant, CHAT_PET_USE_THUMB_SIZE)));
	}
	const label = DOM.append(entry, DOM.$('.chat-pet-interaction-pool-label'));
	if (options.action) {
		addChatPetDetailButton(store, entry, options.action.label, options.action.title, true, options.action.onClick);
	}
	return { entry, label, checkbox };
}
