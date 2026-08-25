/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { ChatPetAccessoryId, ChatPetAchievementId } from '../../../../contrib/chat/browser/chatPetAchievements.js';
import { ChatPetVariant, IChatPetService } from '../../../../contrib/chat/browser/chatPetService.js';

export interface IChatPetFixtureOptions {
	readonly enabled: boolean;
	readonly unlockedAchievements?: readonly ChatPetAchievementId[];
	readonly unseenAchievements?: readonly ChatPetAchievementId[];
	readonly selectedAccessory?: ChatPetAccessoryId;
	readonly variant?: ChatPetVariant;
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
}

export function configureChatPetFixtureFileRoot(disposableStore: DisposableStore): void {
	const previousFileRoot = globalThis._VSCODE_FILE_ROOT;
	globalThis._VSCODE_FILE_ROOT = `${mainWindow.location.origin}/src/`;
	disposableStore.add(toDisposable(() => globalThis._VSCODE_FILE_ROOT = previousFileRoot));
}
