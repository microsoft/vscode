/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ChatPetAccessoryId, ChatPetAchievementId } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { ChatPetAppearanceTarget, ChatPetHorizontalPosition, ChatPetVariant, ChatPetWindowKind, getChatPetAppearanceTargetWindows, IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';
import { ChatPetColor } from '../../../../contrib/chat/browser/chatPetColors.js';
import { waitForFixtureCondition } from '../fixtureUtils.js';

export interface IChatPetFixtureOptions {
	readonly enabled: boolean;
	readonly horizontalPosition?: ChatPetHorizontalPosition;
	readonly unlockedAchievements?: readonly ChatPetAchievementId[];
	readonly unseenAchievements?: readonly ChatPetAchievementId[];
	/** The hat in every window, unless {@link agentsAccessory} gives the Agents window its own. */
	readonly selectedAccessory?: ChatPetAccessoryId;
	readonly agentsAccessory?: ChatPetAccessoryId;
	readonly variant?: ChatPetVariant;
	/** The color in every window, unless {@link agentsColor} gives the Agents window its own. */
	readonly color?: ChatPetColor;
	readonly agentsColor?: ChatPetColor;
}

/** A pet service for an editor window. */
export class FixtureChatPetService extends Disposable implements IChatPetService {

	declare readonly _serviceBrand: undefined;

	private readonly enabledValue: ISettableObservable<boolean>;
	readonly enabled: IObservable<boolean>;
	private readonly windowColors: Readonly<Record<ChatPetWindowKind, ISettableObservable<ChatPetColor>>>;
	readonly color: IObservable<ChatPetColor>;
	private readonly scaleValue = observableValue(this, 1);
	readonly scale: IObservable<number> = this.scaleValue;
	private readonly horizontalPositionValue: ISettableObservable<ChatPetHorizontalPosition | undefined>;
	readonly horizontalPosition: IObservable<ChatPetHorizontalPosition | undefined>;
	private readonly unlockedAchievementsValue: ISettableObservable<readonly ChatPetAchievementId[]>;
	readonly unlockedAchievements: IObservable<readonly ChatPetAchievementId[]>;
	private readonly unseenAchievementsValue: ISettableObservable<readonly ChatPetAchievementId[]>;
	readonly unseenAchievements: IObservable<readonly ChatPetAchievementId[]>;
	private readonly windowAccessories: Readonly<Record<ChatPetWindowKind, ISettableObservable<ChatPetAccessoryId | undefined>>>;
	readonly selectedAccessory: IObservable<ChatPetAccessoryId | undefined>;
	readonly onDidUnlockAchievement = Event.None;

	constructor(options: IChatPetFixtureOptions) {
		super();
		this.enabledValue = observableValue(this, options.enabled);
		this.enabled = this.enabledValue;
		this.horizontalPositionValue = observableValue<ChatPetHorizontalPosition | undefined>(this, options.horizontalPosition);
		this.horizontalPosition = this.horizontalPositionValue;
		const color = options.color ?? options.variant ?? 'stable';
		this.windowColors = {
			editor: observableValue<ChatPetColor>(this, color),
			agents: observableValue<ChatPetColor>(this, options.agentsColor ?? color),
		};
		this.color = this.windowColors.editor;
		this.unlockedAchievementsValue = observableValue<readonly ChatPetAchievementId[]>(this, options.unlockedAchievements ?? []);
		this.unlockedAchievements = this.unlockedAchievementsValue;
		this.unseenAchievementsValue = observableValue<readonly ChatPetAchievementId[]>(this, options.unseenAchievements ?? []);
		this.unseenAchievements = this.unseenAchievementsValue;
		this.windowAccessories = {
			editor: observableValue<ChatPetAccessoryId | undefined>(this, options.selectedAccessory),
			agents: observableValue<ChatPetAccessoryId | undefined>(this, options.agentsAccessory ?? options.selectedAccessory),
		};
		this.selectedAccessory = this.windowAccessories.editor;
	}

	getWindowColor(windowKind: ChatPetWindowKind): IObservable<ChatPetColor> {
		return this.windowColors[windowKind];
	}

	getWindowAccessory(windowKind: ChatPetWindowKind): IObservable<ChatPetAccessoryId | undefined> {
		return this.windowAccessories[windowKind];
	}

	toggle(): boolean {
		const enabled = !this.enabledValue.get();
		this.enabledValue.set(enabled, undefined);
		return enabled;
	}

	setColor(color: ChatPetColor, target: ChatPetAppearanceTarget = 'both'): void {
		transaction(tx => {
			for (const windowKind of getChatPetAppearanceTargetWindows(target)) {
				this.windowColors[windowKind].set(color, tx);
			}
		});
	}

	setScale(scale: number): void {
		this.scaleValue.set(scale, undefined);
	}

	resetScale(): void {
		this.scaleValue.set(1, undefined);
	}

	setHorizontalPosition(position: ChatPetHorizontalPosition): void {
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

	setAccessory(id: ChatPetAccessoryId | undefined, target: ChatPetAppearanceTarget = 'both'): void {
		transaction(tx => {
			for (const windowKind of getChatPetAppearanceTargetWindows(target)) {
				this.windowAccessories[windowKind].set(id, tx);
			}
		});
	}

	resetAchievements(): void {
		transaction(tx => {
			this.unlockedAchievementsValue.set([], tx);
			this.unseenAchievementsValue.set([], tx);
			this.windowAccessories.editor.set(undefined, tx);
			this.windowAccessories.agents.set(undefined, tx);
		});
	}
}

export function configureChatPetFixtureFileRoot(disposableStore: DisposableStore): void {
	const previousFileRoot = globalThis._VSCODE_FILE_ROOT;
	globalThis._VSCODE_FILE_ROOT = `${mainWindow.location.origin}/src/`;
	disposableStore.add(toDisposable(() => globalThis._VSCODE_FILE_ROOT = previousFileRoot));
}

/**
 * Waits until the container shows `expectedCount` pet achievement previews and each has drawn its sprites.
 * The sprites load into detached images, so without this a screenshot races the slowest sprite and captures a blank preview.
 */
export function waitForChatPetAchievementPreviews(container: HTMLElement, expectedCount: number): Promise<void> {
	return waitForFixtureCondition(() => {
		const previews = [...container.querySelectorAll<HTMLCanvasElement>('canvas[data-rendered]')];
		return previews.length === expectedCount && previews.every(preview => preview.dataset.rendered === 'true');
	}, `Chat pet fixture: expected ${expectedCount} pet achievement previews to finish drawing.`);
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
