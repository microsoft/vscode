/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import product from '../../../../platform/product/common/product.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { allChatPetAchievements, chatPetAchievements, ChatPetAccessoryId, ChatPetAchievementId, ChatPetAchievementIds, getChatPetAchievementForAccessory, isChatPetAccessoryId, isChatPetAchievementEnabled, isChatPetAchievementId } from './chatPetAchievements.js';
import { ChatPetColor, ChatPetVariant, chatPetColorPresets, isDefaultChatPetColor, parseChatPetColor } from './chatPetColors.js';

export type { ChatPetVariant } from './chatPetColors.js';

export interface ChatPetHorizontalAnchor {
	readonly edge: 'left' | 'right';
	readonly inset: number;
}

export type ChatPetHorizontalPosition = number | ChatPetHorizontalAnchor;

/** The kind of window that shows the pet. */
export type ChatPetWindowKind = 'editor' | 'agents';

/** The window kinds that a pet appearance change applies to. */
export type ChatPetAppearanceTarget = ChatPetWindowKind | 'both';

export const chatPetWindowKinds: readonly ChatPetWindowKind[] = ['editor', 'agents'];

export function getChatPetAppearanceTargetWindows(target: ChatPetAppearanceTarget): readonly ChatPetWindowKind[] {
	return target === 'both' ? chatPetWindowKinds : [target];
}

const CHAT_PET_ENABLED_STORAGE_KEY = 'chat.vscodePet.enabled';
const CHAT_PET_VARIANT_STORAGE_KEY = 'chat.vscodePet.variant';
/** Shared by both window kinds. A window-specific key such as `chat.vscodePet.color.agents` overrides it. */
const CHAT_PET_COLOR_STORAGE_KEY = 'chat.vscodePet.color';
const CHAT_PET_OBSOLETE_ON_THE_RUN_STORAGE_KEY = 'chat.vscodePet.onTheRun';
/** Shared by both window kinds. A window-specific key such as `chat.vscodePet.accessory.agents` overrides it. */
const CHAT_PET_ACCESSORY_STORAGE_KEY = 'chat.vscodePet.accessory';
/** Stored in a window-specific accessory key when that window's pet wears no hat. */
const CHAT_PET_NO_ACCESSORY = 'none';
const CHAT_PET_ACHIEVEMENT_SEEN_STORAGE_PREFIX = 'chat.vscodePet.achievementSeen.';
const CHAT_PET_ACHIEVEMENT_CATALOG_VERSION_STORAGE_KEY = 'chat.vscodePet.achievementCatalogVersion';
const CHAT_PET_ACHIEVEMENT_CATALOG_VERSION = 4;
const CHAT_PET_LOCAL_ACHIEVEMENT_MIGRATION_VERSION_STORAGE_KEY = 'chat.vscodePet.localAchievementMigrationVersion';
const CHAT_PET_LOCAL_ACHIEVEMENT_MIGRATION_VERSION = 1;
const CHAT_PET_SCALE_STORAGE_KEY = 'chat.vscodePet.scale';
const CHAT_PET_HORIZONTAL_POSITION_STORAGE_KEY = 'chat.vscodePet.horizontalPosition';
export const CHAT_PET_DEFAULT_SCALE = 1;

export const ChatPetContextKeys = {
	enabled: new RawContextKey<boolean>('chatPetEnabled', false, localize('chatPet.context.enabled', "Whether the VS Code pet is enabled")),
};

type ChatPetEnablementEvent = {
	enabled: boolean;
	source: 'startup' | 'change';
};

type ChatPetEnablementClassification = {
	owner: 'justschen';
	comment: 'Tracks VS Code pet enablement so adoption can be measured.';
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the VS Code pet is enabled.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the state was observed at startup or changed while VS Code was running.' };
};

export function getChatPetVariant(configuredVariant: string | undefined, productQuality: string | undefined): ChatPetVariant {
	if (configuredVariant === 'stable' || configuredVariant === 'insiders') {
		return configuredVariant;
	}
	return productQuality === 'stable' ? 'stable' : 'insiders';
}

function getChatPetScale(storedScale: string | undefined): number {
	const scale = storedScale === undefined ? Number.NaN : Number.parseFloat(storedScale);
	return Number.isFinite(scale) && scale > 0 ? scale : CHAT_PET_DEFAULT_SCALE;
}

function getChatPetHorizontalPosition(storedPosition: string | undefined): ChatPetHorizontalPosition | undefined {
	const anchorMatch = /^(?<edge>left|right):(?<inset>\d+(?:\.\d+)?)$/.exec(storedPosition ?? '');
	const inset = Number.parseFloat(anchorMatch?.groups?.inset ?? '');
	if ((anchorMatch?.groups?.edge === 'left' || anchorMatch?.groups?.edge === 'right') && Number.isFinite(inset)) {
		return { edge: anchorMatch.groups.edge, inset };
	}
	const position = storedPosition === undefined ? Number.NaN : Number.parseFloat(storedPosition);
	return Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : undefined;
}

function getChatPetWindowStorageKey(key: string, windowKind: ChatPetWindowKind): string {
	return `${key}.${windowKind}`;
}

function getChatPetWindowStorageKeys(key: string): readonly string[] {
	return chatPetWindowKinds.map(windowKind => getChatPetWindowStorageKey(key, windowKind));
}

export const IChatPetService = createDecorator<IChatPetService>('chatPetService');

export interface IChatPetService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	/** The pet's color in the current window. */
	readonly color: IObservable<ChatPetColor>;
	readonly scale: IObservable<number>;
	readonly unlockedAchievements: IObservable<readonly ChatPetAchievementId[]>;
	readonly unseenAchievements: IObservable<readonly ChatPetAchievementId[]>;
	/** The hat that the pet wears in the current window. */
	readonly selectedAccessory: IObservable<ChatPetAccessoryId | undefined>;
	readonly onDidUnlockAchievement: Event<ChatPetAchievementId>;
	readonly horizontalPosition: IObservable<ChatPetHorizontalPosition | undefined>;
	/** The pet's color in windows of the given kind. */
	getWindowColor(windowKind: ChatPetWindowKind): IObservable<ChatPetColor>;
	/** The hat that the pet wears in windows of the given kind. */
	getWindowAccessory(windowKind: ChatPetWindowKind): IObservable<ChatPetAccessoryId | undefined>;
	toggle(): boolean;
	/** Changes the pet's color in the target windows, which defaults to both window kinds. */
	setColor(color: ChatPetColor, target?: ChatPetAppearanceTarget): void;
	setScale(scale: number): void;
	resetScale(): void;
	unlockAchievement(id: ChatPetAchievementId): boolean;
	markAchievementSeen(id: ChatPetAchievementId): boolean;
	/** Changes the pet's hat in the target windows, which defaults to both window kinds. */
	setAccessory(id: ChatPetAccessoryId | undefined, target?: ChatPetAppearanceTarget): void;
	resetAchievements(): void;
	setHorizontalPosition(position: ChatPetHorizontalPosition): void;
}

export class ChatPetService extends Disposable implements IChatPetService {

	declare readonly _serviceBrand: undefined;

	private readonly _enabled;
	readonly enabled: IObservable<boolean>;
	private readonly _windowKind: ChatPetWindowKind;
	private readonly _windowColors: Readonly<Record<ChatPetWindowKind, ISettableObservable<ChatPetColor>>>;
	readonly color: IObservable<ChatPetColor>;
	private readonly _scale;
	readonly scale: IObservable<number>;
	private readonly _unlockedAchievements;
	readonly unlockedAchievements: IObservable<readonly ChatPetAchievementId[]>;
	private readonly _unseenAchievements;
	readonly unseenAchievements: IObservable<readonly ChatPetAchievementId[]>;
	private readonly _windowAccessories: Readonly<Record<ChatPetWindowKind, ISettableObservable<ChatPetAccessoryId | undefined>>>;
	readonly selectedAccessory: IObservable<ChatPetAccessoryId | undefined>;
	private readonly _onDidUnlockAchievement = this._register(new Emitter<ChatPetAchievementId>());
	readonly onDidUnlockAchievement = this._onDidUnlockAchievement.event;
	/** The last invalid value reported for each storage key, so that each one is only logged once. */
	private readonly lastInvalidStoredValues = new Map<string, string>();
	private locallyUnlockingAchievement = false;
	private locallyChangingAppearance = false;
	private readonly _horizontalPosition;
	readonly horizontalPosition: IObservable<ChatPetHorizontalPosition | undefined>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._migrateAchievementStorage();
		// The pet can no longer be sent on the run.
		this.storageService.remove(CHAT_PET_OBSOLETE_ON_THE_RUN_STORAGE_KEY, StorageScope.APPLICATION);
		this._windowKind = environmentService.isSessionsWindow ? 'agents' : 'editor';
		this._enabled = observableValue(this, this.storageService.getBoolean(CHAT_PET_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false));
		this.enabled = this._enabled;
		this._windowColors = {
			editor: observableValue(this, this._readColor('editor')),
			agents: observableValue(this, this._readColor('agents')),
		};
		this.color = this._windowColors[this._windowKind];
		this._scale = observableValue(this, getChatPetScale(this.storageService.get(CHAT_PET_SCALE_STORAGE_KEY, StorageScope.APPLICATION)));
		this.scale = this._scale;
		this._unlockedAchievements = observableValue<readonly ChatPetAchievementId[]>(this, this._readUnlockedAchievements());
		this.unlockedAchievements = this._unlockedAchievements;
		this._unseenAchievements = observableValue<readonly ChatPetAchievementId[]>(this, this._readUnseenAchievements());
		this.unseenAchievements = this._unseenAchievements;
		this._windowAccessories = {
			editor: observableValue<ChatPetAccessoryId | undefined>(this, this._readAccessory('editor')),
			agents: observableValue<ChatPetAccessoryId | undefined>(this, this._readAccessory('agents')),
		};
		this.selectedAccessory = this._windowAccessories[this._windowKind];
		this._horizontalPosition = observableValue(this, getChatPetHorizontalPosition(this.storageService.get(CHAT_PET_HORIZONTAL_POSITION_STORAGE_KEY, StorageScope.APPLICATION)));
		this.horizontalPosition = this._horizontalPosition;

		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_ENABLED_STORAGE_KEY, this._store)(() => {
			this._setEnabled(this.storageService.getBoolean(CHAT_PET_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false));
		}));
		for (const key of [CHAT_PET_VARIANT_STORAGE_KEY, CHAT_PET_COLOR_STORAGE_KEY, ...getChatPetWindowStorageKeys(CHAT_PET_COLOR_STORAGE_KEY)]) {
			this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, key, this._store)(() => {
				this._refreshAppearance();
			}));
		}
		for (const achievement of allChatPetAchievements) {
			this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, this._getAchievementStorageKey(achievement.id), this._store)(() => {
				this._refreshAchievementState(!this.locallyUnlockingAchievement);
			}));
			this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, this._getAchievementSeenStorageKey(achievement.id), this._store)(() => {
				this._refreshUnseenAchievementState();
			}));
		}
		for (const key of [CHAT_PET_ACCESSORY_STORAGE_KEY, ...getChatPetWindowStorageKeys(CHAT_PET_ACCESSORY_STORAGE_KEY)]) {
			this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, key, this._store)(() => {
				this._refreshAppearance();
			}));
		}
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_SCALE_STORAGE_KEY, this._store)(() => {
			this._scale.set(getChatPetScale(this.storageService.get(CHAT_PET_SCALE_STORAGE_KEY, StorageScope.APPLICATION)), undefined);
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_HORIZONTAL_POSITION_STORAGE_KEY, this._store)(() => {
			this._horizontalPosition.set(getChatPetHorizontalPosition(this.storageService.get(CHAT_PET_HORIZONTAL_POSITION_STORAGE_KEY, StorageScope.APPLICATION)), undefined);
		}));
		this._logEnablement(this._enabled.get(), 'startup');
	}

	toggle(): boolean {
		const enabled = !this._enabled.get();
		this._setEnabled(enabled);
		this.storageService.store(CHAT_PET_ENABLED_STORAGE_KEY, enabled, StorageScope.APPLICATION, StorageTarget.USER);
		status(enabled
			? localize('chatPet.enabled', "VS Code pet enabled. Click the pet to interact with it, or use the Left and Right Arrow keys to move it.")
			: localize('chatPet.disabled', "VS Code pet disabled"));
		return enabled;
	}

	private _setEnabled(enabled: boolean): void {
		if (enabled === this._enabled.get()) {
			return;
		}
		this._enabled.set(enabled, undefined);
		this._logEnablement(enabled, 'change');
	}

	private _logEnablement(enabled: boolean, source: ChatPetEnablementEvent['source']): void {
		this.telemetryService.publicLog2<ChatPetEnablementEvent, ChatPetEnablementClassification>('chatPetEnablement', { enabled, source });
	}

	getWindowColor(windowKind: ChatPetWindowKind): IObservable<ChatPetColor> {
		return this._windowColors[windowKind];
	}

	getWindowAccessory(windowKind: ChatPetWindowKind): IObservable<ChatPetAccessoryId | undefined> {
		return this._windowAccessories[windowKind];
	}

	setColor(color: ChatPetColor, target: ChatPetAppearanceTarget = 'both'): void {
		const normalizedColor = parseChatPetColor(color);
		if (!normalizedColor) {
			throw new Error(`Invalid chat pet color: ${color}`);
		}
		if (!isDefaultChatPetColor(normalizedColor) && !this._unlockedAchievements.get().includes(ChatPetAchievementIds.Blobby)) {
			throw new Error(localize('chatPet.color.locked', "Use /blobby in Chat to unlock color customization."));
		}
		this._changeAppearance(() => {
			if (target !== 'both') {
				this.storageService.store(getChatPetWindowStorageKey(CHAT_PET_COLOR_STORAGE_KEY, target), normalizedColor, StorageScope.APPLICATION, StorageTarget.USER);
				return;
			}
			// Store the shared color before removing overrides, so other windows never show an intermediate color.
			this.storageService.store(CHAT_PET_COLOR_STORAGE_KEY, normalizedColor, StorageScope.APPLICATION, StorageTarget.USER);
			for (const key of getChatPetWindowStorageKeys(CHAT_PET_COLOR_STORAGE_KEY)) {
				this.storageService.remove(key, StorageScope.APPLICATION);
			}
		});
		const label = chatPetColorPresets.find(preset => preset.color === normalizedColor)?.label ?? normalizedColor;
		status(target === 'editor'
			? localize('chatPet.color.changedInEditor', "Blobby's color in editor windows changed to {0}", label)
			: target === 'agents'
				? localize('chatPet.color.changedInAgents', "Blobby's color in the Agents window changed to {0}", label)
				: localize('chatPet.color.changed', "Blobby's color changed to {0}", label));
	}

	private _readColor(windowKind: ChatPetWindowKind): ChatPetColor {
		return this._readStoredColor(getChatPetWindowStorageKey(CHAT_PET_COLOR_STORAGE_KEY, windowKind))
			?? this._readStoredColor(CHAT_PET_COLOR_STORAGE_KEY)
			?? getChatPetVariant(this.storageService.get(CHAT_PET_VARIANT_STORAGE_KEY, StorageScope.APPLICATION), product.quality);
	}

	private _readStoredColor(key: string): ChatPetColor | undefined {
		const storedColor = this.storageService.get(key, StorageScope.APPLICATION);
		if (storedColor === undefined) {
			this.lastInvalidStoredValues.delete(key);
			return undefined;
		}
		const color = parseChatPetColor(storedColor);
		if (color && (isDefaultChatPetColor(color) || this._isAchievementStored(ChatPetAchievementIds.Blobby))) {
			this.lastInvalidStoredValues.delete(key);
			return color;
		}
		this._warnInvalidStoredValue(key, storedColor, `[ChatPetService] Ignoring invalid or locked stored color: ${storedColor}`);
		return undefined;
	}

	private _warnInvalidStoredValue(key: string, storedValue: string, message: string): void {
		if (this.lastInvalidStoredValues.get(key) !== storedValue) {
			this.lastInvalidStoredValues.set(key, storedValue);
			this.logService.warn(message);
		}
	}

	setScale(scale: number): void {
		this._scale.set(scale, undefined);
		this.storageService.store(CHAT_PET_SCALE_STORAGE_KEY, scale, StorageScope.APPLICATION, StorageTarget.USER);
	}

	resetScale(): void {
		this._scale.set(CHAT_PET_DEFAULT_SCALE, undefined);
		this.storageService.remove(CHAT_PET_SCALE_STORAGE_KEY, StorageScope.APPLICATION);
	}

	setHorizontalPosition(position: ChatPetHorizontalPosition): void {
		const normalizedPosition = typeof position === 'number'
			? Math.max(0, Math.min(1, position))
			: { edge: position.edge, inset: Math.max(0, position.inset) } satisfies ChatPetHorizontalAnchor;
		this._horizontalPosition.set(normalizedPosition, undefined);
		this.storageService.store(
			CHAT_PET_HORIZONTAL_POSITION_STORAGE_KEY,
			typeof normalizedPosition === 'number' ? normalizedPosition : `${normalizedPosition.edge}:${normalizedPosition.inset}`,
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
	}

	unlockAchievement(id: ChatPetAchievementId): boolean {
		if (!isChatPetAchievementId(id)) {
			throw new Error(`Unknown chat pet achievement: ${id}`);
		}
		if (!isChatPetAchievementEnabled(id)) {
			return false;
		}
		if (!this._enabled.get()) {
			return false;
		}
		if (this._isAchievementStored(id)) {
			this._refreshAchievementState();
			return false;
		}

		this.locallyUnlockingAchievement = true;
		try {
			this.storageService.store(this._getAchievementStorageKey(id), true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		} finally {
			this.locallyUnlockingAchievement = false;
		}
		this._refreshAchievementState();
		this._onDidUnlockAchievement.fire(id);
		return true;
	}

	markAchievementSeen(id: ChatPetAchievementId): boolean {
		if (!this._unseenAchievements.get().includes(id)) {
			return false;
		}
		this.storageService.store(this._getAchievementSeenStorageKey(id), true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		this._refreshUnseenAchievementState();
		return true;
	}

	setAccessory(id: ChatPetAccessoryId | undefined, target: ChatPetAppearanceTarget = 'both'): void {
		if (id !== undefined) {
			if (!isChatPetAccessoryId(id)) {
				throw new Error(`Unknown chat pet accessory: ${id}`);
			}
			const achievement = getChatPetAchievementForAccessory(id);
			if (!achievement.enabled) {
				throw new Error(`Chat pet accessory is disabled: ${id}`);
			}
			if (!this._unlockedAchievements.get().includes(achievement.id)) {
				throw new Error(`Chat pet accessory is locked: ${id}`);
			}
		}
		this._changeAppearance(() => {
			if (target !== 'both') {
				this.storageService.store(getChatPetWindowStorageKey(CHAT_PET_ACCESSORY_STORAGE_KEY, target), id ?? CHAT_PET_NO_ACCESSORY, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
				return;
			}
			// Store the shared hat before removing overrides, so other windows never show an intermediate hat.
			if (id !== undefined) {
				this.storageService.store(CHAT_PET_ACCESSORY_STORAGE_KEY, id, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
			} else {
				this.storageService.remove(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
				this.storageService.remove(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION);
			}
			for (const key of getChatPetWindowStorageKeys(CHAT_PET_ACCESSORY_STORAGE_KEY)) {
				this.storageService.remove(key, StorageScope.APPLICATION_SHARED);
			}
		});
	}

	resetAchievements(): void {
		this.locallyUnlockingAchievement = true;
		this.locallyChangingAppearance = true;
		try {
			for (const key of [CHAT_PET_COLOR_STORAGE_KEY, ...getChatPetWindowStorageKeys(CHAT_PET_COLOR_STORAGE_KEY)]) {
				const storedColor = this.storageService.get(key, StorageScope.APPLICATION);
				if (storedColor !== 'stable' && storedColor !== 'insiders') {
					this.storageService.remove(key, StorageScope.APPLICATION);
				}
			}
			for (const achievement of allChatPetAchievements) {
				const key = this._getAchievementStorageKey(achievement.id);
				this.storageService.remove(key, StorageScope.APPLICATION_SHARED);
				this.storageService.remove(key, StorageScope.APPLICATION);
				const seenKey = this._getAchievementSeenStorageKey(achievement.id);
				this.storageService.remove(seenKey, StorageScope.APPLICATION_SHARED);
				this.storageService.remove(seenKey, StorageScope.APPLICATION);
			}
			this.storageService.remove('chat.vscodePet.achievement.checkpointRestore', StorageScope.APPLICATION_SHARED);
			this.storageService.remove('chat.vscodePet.achievement.checkpointRestore', StorageScope.APPLICATION);
			this.storageService.remove('chat.vscodePet.achievement.integratedBrowserOpened', StorageScope.APPLICATION_SHARED);
			this.storageService.remove('chat.vscodePet.achievement.integratedBrowserOpened', StorageScope.APPLICATION);
			this.storageService.remove('chat.vscodePet.achievement.chatFork', StorageScope.APPLICATION_SHARED);
			this.storageService.remove('chat.vscodePet.achievement.chatFork', StorageScope.APPLICATION);
			this.storageService.remove(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
			this.storageService.remove(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION);
			for (const key of getChatPetWindowStorageKeys(CHAT_PET_ACCESSORY_STORAGE_KEY)) {
				this.storageService.remove(key, StorageScope.APPLICATION_SHARED);
			}
		} finally {
			this.locallyUnlockingAchievement = false;
			this.locallyChangingAppearance = false;
		}
		transaction(tx => {
			this._unlockedAchievements.set([], tx);
			this._unseenAchievements.set([], tx);
			for (const windowKind of chatPetWindowKinds) {
				this._windowColors[windowKind].set(this._readColor(windowKind), tx);
				this._windowAccessories[windowKind].set(undefined, tx);
			}
		});
	}

	/** Applies local storage writes, then updates every window's appearance at once. */
	private _changeAppearance(write: () => void): void {
		this.locallyChangingAppearance = true;
		try {
			write();
		} finally {
			this.locallyChangingAppearance = false;
		}
		this._refreshAppearance();
	}

	private _refreshAppearance(): void {
		if (this.locallyChangingAppearance) {
			return;
		}
		transaction(tx => {
			for (const windowKind of chatPetWindowKinds) {
				this._windowColors[windowKind].set(this._readColor(windowKind), tx);
				this._windowAccessories[windowKind].set(this._readAccessory(windowKind), tx);
			}
		});
	}

	private _getAchievementStorageKey(id: ChatPetAchievementId): string {
		return `chat.vscodePet.achievement.${id}`;
	}

	private _getAchievementSeenStorageKey(id: ChatPetAchievementId): string {
		return `${CHAT_PET_ACHIEVEMENT_SEEN_STORAGE_PREFIX}${id}`;
	}

	private _migrateAchievementStorage(): void {
		this._migrateLocalAchievementStorage();

		const version = this.storageService.getNumber(CHAT_PET_ACHIEVEMENT_CATALOG_VERSION_STORAGE_KEY, StorageScope.APPLICATION_SHARED, 0);
		if (version >= CHAT_PET_ACHIEVEMENT_CATALOG_VERSION) {
			return;
		}

		const wasUnlocked = (id: string) => this.storageService.getBoolean(`chat.vscodePet.achievement.${id}`, StorageScope.APPLICATION_SHARED, false);
		this._storeLegacyAchievementRewards(
			wasUnlocked('checkpointRestore'),
			wasUnlocked('chatFork'),
			wasUnlocked(ChatPetAchievementIds.RequestRevision),
			wasUnlocked(ChatPetAchievementIds.ModelSwitch),
		);
		this.storageService.store(CHAT_PET_ACHIEVEMENT_CATALOG_VERSION_STORAGE_KEY, CHAT_PET_ACHIEVEMENT_CATALOG_VERSION, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
	}

	private _migrateLocalAchievementStorage(): void {
		const version = this.storageService.getNumber(CHAT_PET_LOCAL_ACHIEVEMENT_MIGRATION_VERSION_STORAGE_KEY, StorageScope.APPLICATION, 0);
		if (version >= CHAT_PET_LOCAL_ACHIEVEMENT_MIGRATION_VERSION) {
			return;
		}

		const localUnlockedAchievements = allChatPetAchievements
			.filter(achievement => this.storageService.getBoolean(this._getAchievementStorageKey(achievement.id), StorageScope.APPLICATION, false))
			.map(achievement => achievement.id);
		const checkpointRestoreUnlocked = this.storageService.getBoolean('chat.vscodePet.achievement.checkpointRestore', StorageScope.APPLICATION, false);
		const chatForkUnlocked = this.storageService.getBoolean('chat.vscodePet.achievement.chatFork', StorageScope.APPLICATION, false);
		const localAccessory = this.storageService.get(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION);

		for (const id of localUnlockedAchievements) {
			this.storageService.store(this._getAchievementStorageKey(id), true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		}
		this._storeLegacyAchievementRewards(
			checkpointRestoreUnlocked,
			chatForkUnlocked,
			localUnlockedAchievements.includes(ChatPetAchievementIds.RequestRevision),
			localUnlockedAchievements.includes(ChatPetAchievementIds.ModelSwitch),
		);
		if (localAccessory !== undefined && this.storageService.get(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION_SHARED) === undefined) {
			this.storageService.store(CHAT_PET_ACCESSORY_STORAGE_KEY, localAccessory, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		}
		this.storageService.store(CHAT_PET_LOCAL_ACHIEVEMENT_MIGRATION_VERSION_STORAGE_KEY, CHAT_PET_LOCAL_ACHIEVEMENT_MIGRATION_VERSION, StorageScope.APPLICATION, StorageTarget.USER);
	}

	private _storeLegacyAchievementRewards(checkpointRestoreUnlocked: boolean, chatForkUnlocked: boolean, requestRevisionUnlocked: boolean, modelSwitchUnlocked: boolean): void {
		if (checkpointRestoreUnlocked || chatForkUnlocked) {
			this.storageService.store(this._getAchievementStorageKey(ChatPetAchievementIds.FirstChatMessage), true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		}
		if (requestRevisionUnlocked) {
			this.storageService.store(this._getAchievementStorageKey(ChatPetAchievementIds.ChatOutputCopied), true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		}
		if (modelSwitchUnlocked) {
			this.storageService.store(this._getAchievementStorageKey(ChatPetAchievementIds.QueueOrSteeringMessage), true, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		}
	}

	private _readUnlockedAchievements(): readonly ChatPetAchievementId[] {
		return chatPetAchievements
			.filter(achievement => this._isAchievementStored(achievement.id))
			.map(achievement => achievement.id);
	}

	private _isAchievementStored(id: ChatPetAchievementId): boolean {
		const achievementKey = this._getAchievementStorageKey(id);
		return this.storageService.getBoolean(achievementKey, StorageScope.APPLICATION_SHARED, false)
			|| this.storageService.getBoolean(achievementKey, StorageScope.APPLICATION, false);
	}

	private _refreshAchievementState(fireUnlockEvents = false): void {
		const previousAchievements = this._unlockedAchievements.get();
		const unlockedAchievements = this._readUnlockedAchievements();
		if (!this._haveSameAchievements(previousAchievements, unlockedAchievements)) {
			this._unlockedAchievements.set(unlockedAchievements, undefined);
			if (fireUnlockEvents) {
				const previous = new Set(previousAchievements);
				for (const id of unlockedAchievements) {
					if (!previous.has(id)) {
						this._onDidUnlockAchievement.fire(id);
					}
				}
			}
		}
		this._refreshUnseenAchievementState();
		this._refreshAppearance();
	}

	private _readUnseenAchievements(): readonly ChatPetAchievementId[] {
		const unlocked = new Set(this._unlockedAchievements.get());
		return chatPetAchievements
			.filter(achievement => unlocked.has(achievement.id) && !this.storageService.getBoolean(this._getAchievementSeenStorageKey(achievement.id), StorageScope.APPLICATION_SHARED, false))
			.map(achievement => achievement.id);
	}

	private _refreshUnseenAchievementState(): void {
		const unseenAchievements = this._readUnseenAchievements();
		if (!this._haveSameAchievements(this._unseenAchievements.get(), unseenAchievements)) {
			this._unseenAchievements.set(unseenAchievements, undefined);
		}
	}

	private _haveSameAchievements(first: readonly ChatPetAchievementId[], second: readonly ChatPetAchievementId[]): boolean {
		return first.length === second.length && first.every((id, index) => id === second[index]);
	}

	private _readAccessory(windowKind: ChatPetWindowKind): ChatPetAccessoryId | undefined {
		const overrideKey = getChatPetWindowStorageKey(CHAT_PET_ACCESSORY_STORAGE_KEY, windowKind);
		const accessory = this._readStoredAccessory(overrideKey, this.storageService.get(overrideKey, StorageScope.APPLICATION_SHARED))
			?? this._readStoredAccessory(CHAT_PET_ACCESSORY_STORAGE_KEY, this.storageService.get(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION_SHARED)
				?? this.storageService.get(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION));
		return accessory === CHAT_PET_NO_ACCESSORY ? undefined : accessory;
	}

	/** Returns `undefined` when nothing usable is stored, and {@link CHAT_PET_NO_ACCESSORY} for a stored choice of no hat. */
	private _readStoredAccessory(key: string, storedAccessory: string | undefined): ChatPetAccessoryId | typeof CHAT_PET_NO_ACCESSORY | undefined {
		if (storedAccessory === undefined || storedAccessory === CHAT_PET_NO_ACCESSORY) {
			this.lastInvalidStoredValues.delete(key);
			return storedAccessory;
		}
		if (isChatPetAccessoryId(storedAccessory) && this._unlockedAchievements.get().includes(getChatPetAchievementForAccessory(storedAccessory).id)) {
			this.lastInvalidStoredValues.delete(key);
			return storedAccessory;
		}
		this._warnInvalidStoredValue(key, storedAccessory, `[ChatPetService] Ignoring unknown or locked stored accessory: ${storedAccessory}`);
		return undefined;
	}
}
