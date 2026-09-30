/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ChatPetAccessoryId, ChatPetAchievementId } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { IChatPetMove } from '../../../../contrib/chat/browser/chatPetMoves.js';
import { ChatPetBuiltInAnimation, ChatPetBuiltInTrigger, ChatPetBuiltInTriggerAnimations, getChatPetBuiltInReactionKey, IChatPetReaction, IChatPetReactionInput } from '../../../../contrib/chat/browser/chatPetReactions.js';
import { ChatPetVariant, IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';

export interface IChatPetFixtureOptions {
	readonly enabled: boolean;
	readonly unlockedAchievements?: readonly ChatPetAchievementId[];
	readonly unseenAchievements?: readonly ChatPetAchievementId[];
	readonly selectedAccessory?: ChatPetAccessoryId;
	readonly variant?: ChatPetVariant;
	readonly moves?: readonly IChatPetMove[];
	readonly reactions?: readonly IChatPetReaction[];
	readonly disabledBuiltInReactions?: readonly string[];
}

export class FixtureChatPetService extends Disposable implements IChatPetService {

	declare readonly _serviceBrand: undefined;

	private readonly enabledValue: ISettableObservable<boolean>;
	readonly enabled: IObservable<boolean>;
	private readonly variantValue: ISettableObservable<ChatPetVariant>;
	readonly variant: IObservable<ChatPetVariant>;
	private readonly onTheRunValue = observableValue(this, false);
	readonly onTheRun: IObservable<boolean> = this.onTheRunValue;
	private readonly scaleValue = observableValue(this, 1);
	readonly scale: IObservable<number> = this.scaleValue;
	private readonly horizontalPositionValue = observableValue<number | undefined>(this, undefined);
	readonly horizontalPosition: IObservable<number | undefined> = this.horizontalPositionValue;
	private readonly unlockedAchievementsValue: ISettableObservable<readonly ChatPetAchievementId[]>;
	readonly unlockedAchievements: IObservable<readonly ChatPetAchievementId[]>;
	private readonly unseenAchievementsValue: ISettableObservable<readonly ChatPetAchievementId[]>;
	readonly unseenAchievements: IObservable<readonly ChatPetAchievementId[]>;
	private readonly selectedAccessoryValue: ISettableObservable<ChatPetAccessoryId | undefined>;
	readonly selectedAccessory: IObservable<ChatPetAccessoryId | undefined>;
	readonly onDidUnlockAchievement = Event.None;
	private readonly movesValue: ISettableObservable<readonly IChatPetMove[]>;
	readonly moves: IObservable<readonly IChatPetMove[]>;
	private readonly reactionsValue: ISettableObservable<readonly IChatPetReaction[]>;
	readonly reactions: IObservable<readonly IChatPetReaction[]>;
	private readonly disabledBuiltInReactionsValue: ISettableObservable<readonly string[]>;
	readonly disabledBuiltInReactions: IObservable<readonly string[]>;

	constructor(options: IChatPetFixtureOptions) {
		super();
		this.enabledValue = observableValue(this, options.enabled);
		this.enabled = this.enabledValue;
		this.variantValue = observableValue(this, options.variant ?? 'stable');
		this.variant = this.variantValue;
		this.unlockedAchievementsValue = observableValue<readonly ChatPetAchievementId[]>(this, options.unlockedAchievements ?? []);
		this.unlockedAchievements = this.unlockedAchievementsValue;
		this.unseenAchievementsValue = observableValue<readonly ChatPetAchievementId[]>(this, options.unseenAchievements ?? []);
		this.unseenAchievements = this.unseenAchievementsValue;
		this.selectedAccessoryValue = observableValue<ChatPetAccessoryId | undefined>(this, options.selectedAccessory);
		this.selectedAccessory = this.selectedAccessoryValue;
		this.movesValue = observableValue<readonly IChatPetMove[]>(this, options.moves ?? []);
		this.moves = this.movesValue;
		this.reactionsValue = observableValue<readonly IChatPetReaction[]>(this, options.reactions ?? []);
		this.reactions = this.reactionsValue;
		this.disabledBuiltInReactionsValue = observableValue<readonly string[]>(this, options.disabledBuiltInReactions ?? []);
		this.disabledBuiltInReactions = this.disabledBuiltInReactionsValue;
	}

	toggle(): boolean {
		const enabled = !this.enabledValue.get();
		this.enabledValue.set(enabled, undefined);
		return enabled;
	}

	setVariant(variant: ChatPetVariant): void {
		this.variantValue.set(variant, undefined);
	}

	setOnTheRun(onTheRun: boolean): void {
		this.onTheRunValue.set(onTheRun, undefined);
	}

	setScale(scale: number): void {
		this.scaleValue.set(scale, undefined);
	}

	resetScale(): void {
		this.scaleValue.set(1, undefined);
	}

	setHorizontalPosition(position: number): void {
		this.horizontalPositionValue.set(position, undefined);
	}

	unlockAchievement(id: ChatPetAchievementId): boolean {
		if (!this.enabledValue.get() || this.unlockedAchievementsValue.get().includes(id)) {
			return false;
		}
		this.unlockedAchievementsValue.set([...this.unlockedAchievementsValue.get(), id], undefined);
		this.unseenAchievementsValue.set([...this.unseenAchievementsValue.get(), id], undefined);
		return true;
	}

	markAchievementSeen(id: ChatPetAchievementId): boolean {
		if (!this.unseenAchievementsValue.get().includes(id)) {
			return false;
		}
		this.unseenAchievementsValue.set(this.unseenAchievementsValue.get().filter(candidate => candidate !== id), undefined);
		return true;
	}

	setAccessory(id: ChatPetAccessoryId | undefined): void {
		this.selectedAccessoryValue.set(id, undefined);
	}

	resetAchievements(): void {
		this.unlockedAchievementsValue.set([], undefined);
		this.unseenAchievementsValue.set([], undefined);
		this.selectedAccessoryValue.set(undefined, undefined);
	}

	learnMove(move: IChatPetMove): void {
		this.movesValue.set([...this.movesValue.get().filter(existing => existing.name !== move.name), move], undefined);
	}

	forgetMove(name: string): boolean {
		this.movesValue.set(this.movesValue.get().filter(move => move.name !== name), undefined);
		this.reactionsValue.set(this.reactionsValue.get().filter(reaction => reaction.play !== name), undefined);
		return true;
	}

	addReaction(reaction: IChatPetReactionInput): IChatPetReaction {
		const added: IChatPetReaction = { id: `fixture-${this.reactionsValue.get().length + 1}`, ...reaction, enabled: reaction.enabled ?? true };
		this.reactionsValue.set([...this.reactionsValue.get(), added], undefined);
		return added;
	}

	updateReaction(id: string, reaction: IChatPetReactionInput): boolean {
		this.reactionsValue.set(this.reactionsValue.get().map(existing => existing.id === id ? { id, ...reaction, enabled: reaction.enabled ?? existing.enabled } : existing), undefined);
		return true;
	}

	setReactionEnabled(id: string, enabled: boolean): boolean {
		this.reactionsValue.set(this.reactionsValue.get().map(existing => existing.id === id ? { ...existing, enabled } : existing), undefined);
		return true;
	}

	removeReaction(id: string): boolean {
		this.reactionsValue.set(this.reactionsValue.get().filter(reaction => reaction.id !== id), undefined);
		return true;
	}

	setBuiltInReactionEnabled(trigger: ChatPetBuiltInTrigger, animation: ChatPetBuiltInAnimation, enabled: boolean): void {
		const key = getChatPetBuiltInReactionKey(trigger, animation);
		this.disabledBuiltInReactionsValue.set([...this.disabledBuiltInReactionsValue.get().filter(candidate => candidate !== key), ...(enabled ? [] : [key])], undefined);
	}

	setTriggerSprite(trigger: ChatPetBuiltInTrigger, sprite: { readonly kind: 'own' | 'nothing' } | { readonly kind: 'sprite'; readonly play: string }): void {
		const remaining = this.reactionsValue.get().filter(reaction => reaction.trigger !== trigger);
		this.reactionsValue.set(sprite.kind === 'sprite' ? [...remaining, { id: `fixture-${this.reactionsValue.get().length + 1}`, trigger, when: '', phrases: [], play: sprite.play, enabled: true }] : remaining, undefined);
		this.setBuiltInReactionEnabled(trigger, ChatPetBuiltInTriggerAnimations[trigger][0], sprite.kind !== 'nothing');
	}

	resetBuiltInReactions(): void {
		this.reactionsValue.set(this.reactionsValue.get().filter(reaction => reaction.trigger === 'message'), undefined);
		this.disabledBuiltInReactionsValue.set([], undefined);
	}

	replaceTaught(moves: readonly IChatPetMove[], reactions: readonly IChatPetReactionInput[]): void {
		this.movesValue.set(moves, undefined);
		this.reactionsValue.set(reactions.map((reaction, index): IChatPetReaction => ({ id: `fixture-${index + 1}`, ...reaction, enabled: reaction.enabled ?? true })), undefined);
	}
}

export function configureChatPetFixtureFileRoot(disposableStore: DisposableStore): void {
	const previousFileRoot = globalThis._VSCODE_FILE_ROOT;
	globalThis._VSCODE_FILE_ROOT = `${mainWindow.location.origin}/src/`;
	disposableStore.add(toDisposable(() => globalThis._VSCODE_FILE_ROOT = previousFileRoot));
}

/** Fails loudly when the pet is missing, unpainted or cropped, which the screenshot alone would bake in as correct. */
export function assertChatPetInScreenshot(container: HTMLElement): void {
	const pet = container.querySelector('.chat-pet-button');
	if (!pet) {
		throw new Error('Chat pet fixture: the pet did not render.');
	}
	// A sprite stays hidden until its image loads and passes dimension validation.
	const sprite = container.querySelector<HTMLImageElement>('.chat-pet-sprite:not(.hidden) img.chat-pet-spritesheet');
	if (!sprite?.complete || sprite.naturalWidth === 0) {
		throw new Error('Chat pet fixture: no pet sprite was painted, so the screenshot would show an empty pet.');
	}
	const petBounds = pet.getBoundingClientRect();
	const bounds = container.getBoundingClientRect();
	if (petBounds.top < bounds.top || petBounds.bottom > bounds.bottom || petBounds.left < bounds.left || petBounds.right > bounds.right) {
		throw new Error(`Chat pet fixture: the pet falls outside the screenshot. Pet ${JSON.stringify(petBounds)}, container ${JSON.stringify(bounds)}.`);
	}
}
