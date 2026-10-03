/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, ITransaction, observableValue, transaction } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import product from '../../../../platform/product/common/product.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { allChatPetAchievements, chatPetAchievements, ChatPetAccessoryId, ChatPetAchievementId, ChatPetAchievementIds, getChatPetAchievementForAccessory, isChatPetAccessoryId, isChatPetAchievementEnabled, isChatPetAchievementId } from './chatPetAchievements.js';
import { getChatPetBuiltInMoveNames } from './chatPetBuiltInMoves.js';
import { ChatPetMoveLimits, IChatPetMove, parseChatPetMove, serializeChatPetMove, validateChatPetMove } from './chatPetMoves.js';
import { ChatPetReactionLimits, IChatPetReaction, IChatPetReactionInput, sanitizeChatPetReaction } from './chatPetReactions.js';

const CHAT_PET_ENABLED_STORAGE_KEY = 'chat.vscodePet.enabled';
const CHAT_PET_VARIANT_STORAGE_KEY = 'chat.vscodePet.variant';
const CHAT_PET_ON_THE_RUN_STORAGE_KEY = 'chat.vscodePet.onTheRun';
const CHAT_PET_ACCESSORY_STORAGE_KEY = 'chat.vscodePet.accessory';
const CHAT_PET_ACHIEVEMENT_SEEN_STORAGE_PREFIX = 'chat.vscodePet.achievementSeen.';
const CHAT_PET_ACHIEVEMENT_CATALOG_VERSION_STORAGE_KEY = 'chat.vscodePet.achievementCatalogVersion';
const CHAT_PET_ACHIEVEMENT_CATALOG_VERSION = 4;
const CHAT_PET_LOCAL_ACHIEVEMENT_MIGRATION_VERSION_STORAGE_KEY = 'chat.vscodePet.localAchievementMigrationVersion';
const CHAT_PET_LOCAL_ACHIEVEMENT_MIGRATION_VERSION = 1;
const CHAT_PET_SCALE_STORAGE_KEY = 'chat.vscodePet.scale';
const CHAT_PET_HORIZONTAL_POSITION_STORAGE_KEY = 'chat.vscodePet.horizontalPosition';
const CHAT_PET_MOVES_STORAGE_KEY = 'chat.vscodePet.moves';
const CHAT_PET_REACTIONS_STORAGE_KEY = 'chat.vscodePet.reactions';
/** How many moves the pet can learn. */
export const CHAT_PET_MAX_MOVES = 24;
export const CHAT_PET_DEFAULT_SCALE = 1;

export type ChatPetVariant = 'stable' | 'insiders';

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

/** Reads stored moves (move file texts), skipping anything that no longer parses or validates. */
function readChatPetStoredMoves(stored: string | undefined): IChatPetMove[] {
	const moves: IChatPetMove[] = [];
	for (const text of parseStoredArray(stored)) {
		if (typeof text !== 'string' || text.length > ChatPetMoveLimits.maxSourceLength) {
			continue;
		}
		try {
			const move = parseChatPetMove(text);
			if (!validateChatPetMove(move).errors.length && !moves.some(existing => existing.name === move.name)) {
				moves.push(move);
			}
		} catch {
			// A move that doesn't parse any more is dropped.
		}
	}
	return moves.slice(0, CHAT_PET_MAX_MOVES);
}

/** Reads stored reactions, dropping malformed ones and ones whose move is gone. */
function readChatPetStoredReactions(stored: string | undefined, knownMoves: readonly string[]): IChatPetReaction[] {
	const reactions: IChatPetReaction[] = [];
	for (const item of parseStoredArray(stored)) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const { id, when, phrases, play, chance } = item as Record<string, unknown>;
		if (typeof id !== 'string' || typeof when !== 'string' || !Array.isArray(phrases) || typeof play !== 'string' || typeof chance !== 'number') {
			continue;
		}
		const sanitized = sanitizeChatPetReaction({ when, phrases: phrases.filter((phrase): phrase is string => typeof phrase === 'string'), play, chance }, knownMoves);
		if (typeof sanitized !== 'string') {
			reactions.push({ id, ...sanitized });
		}
	}
	return reactions.slice(0, ChatPetReactionLimits.maxReactions);
}

function parseStoredArray(stored: string | undefined): unknown[] {
	if (!stored) {
		return [];
	}
	try {
		const parsed = JSON.parse(stored);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function getChatPetHorizontalPosition(storedPosition: string | undefined): number | undefined {
	const position = storedPosition === undefined ? Number.NaN : Number.parseFloat(storedPosition);
	return Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : undefined;
}

export const IChatPetService = createDecorator<IChatPetService>('chatPetService');

export interface IChatPetService {
	readonly _serviceBrand: undefined;
	readonly enabled: IObservable<boolean>;
	readonly variant: IObservable<ChatPetVariant>;
	readonly onTheRun: IObservable<boolean>;
	readonly scale: IObservable<number>;
	readonly unlockedAchievements: IObservable<readonly ChatPetAchievementId[]>;
	readonly unseenAchievements: IObservable<readonly ChatPetAchievementId[]>;
	readonly selectedAccessory: IObservable<ChatPetAccessoryId | undefined>;
	readonly onDidUnlockAchievement: Event<ChatPetAchievementId>;
	readonly horizontalPosition: IObservable<number | undefined>;
	/** Moves agents taught the pet with the `teachPet` tool, shared by every window. */
	readonly moves: IObservable<readonly IChatPetMove[]>;
	/** Reactions agents taught the pet: which move to play when a chat message says certain things. */
	readonly reactions: IObservable<readonly IChatPetReaction[]>;
	toggle(): boolean;
	setVariant(variant: ChatPetVariant): void;
	setOnTheRun(onTheRun: boolean): void;
	setScale(scale: number): void;
	resetScale(): void;
	unlockAchievement(id: ChatPetAchievementId): boolean;
	markAchievementSeen(id: ChatPetAchievementId): boolean;
	setAccessory(id: ChatPetAccessoryId | undefined): void;
	resetAchievements(): void;
	setHorizontalPosition(position: number): void;
	/** Stores a move, replacing a move with the same name. `validateChatPetLesson` checks moves and limits first. */
	learnMove(move: IChatPetMove): void;
	/** Forgets a taught move and every reaction that plays it. */
	forgetMove(name: string): boolean;
	/** Stores a reaction, as `validateChatPetLesson` returns it, and returns it with its new id. */
	addReaction(reaction: IChatPetReactionInput): IChatPetReaction;
	removeReaction(id: string): boolean;
}

export class ChatPetService extends Disposable implements IChatPetService {

	declare readonly _serviceBrand: undefined;

	private readonly _enabled;
	readonly enabled: IObservable<boolean>;
	private readonly _variant;
	readonly variant: IObservable<ChatPetVariant>;
	private readonly _onTheRun;
	readonly onTheRun: IObservable<boolean>;
	private readonly _scale;
	readonly scale: IObservable<number>;
	private readonly _unlockedAchievements;
	readonly unlockedAchievements: IObservable<readonly ChatPetAchievementId[]>;
	private readonly _unseenAchievements;
	readonly unseenAchievements: IObservable<readonly ChatPetAchievementId[]>;
	private readonly _selectedAccessory;
	readonly selectedAccessory: IObservable<ChatPetAccessoryId | undefined>;
	private readonly _onDidUnlockAchievement = this._register(new Emitter<ChatPetAchievementId>());
	readonly onDidUnlockAchievement = this._onDidUnlockAchievement.event;
	private lastInvalidStoredAccessory: string | undefined;
	private locallyUnlockingAchievement = false;
	private readonly _horizontalPosition;
	readonly horizontalPosition: IObservable<number | undefined>;
	private readonly _moves;
	readonly moves: IObservable<readonly IChatPetMove[]>;
	private readonly _reactions;
	readonly reactions: IObservable<readonly IChatPetReaction[]>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._migrateAchievementStorage();
		this._enabled = observableValue(this, this.storageService.getBoolean(CHAT_PET_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false));
		this.enabled = this._enabled;
		this._variant = observableValue(this, getChatPetVariant(this.storageService.get(CHAT_PET_VARIANT_STORAGE_KEY, StorageScope.APPLICATION), product.quality));
		this.variant = this._variant;
		this._onTheRun = observableValue(this, this.storageService.getBoolean(CHAT_PET_ON_THE_RUN_STORAGE_KEY, StorageScope.APPLICATION, false));
		this.onTheRun = this._onTheRun;
		this._scale = observableValue(this, getChatPetScale(this.storageService.get(CHAT_PET_SCALE_STORAGE_KEY, StorageScope.APPLICATION)));
		this.scale = this._scale;
		this._unlockedAchievements = observableValue<readonly ChatPetAchievementId[]>(this, this._readUnlockedAchievements());
		this.unlockedAchievements = this._unlockedAchievements;
		this._unseenAchievements = observableValue<readonly ChatPetAchievementId[]>(this, this._readUnseenAchievements());
		this.unseenAchievements = this._unseenAchievements;
		this._selectedAccessory = observableValue<ChatPetAccessoryId | undefined>(this, this._readSelectedAccessory());
		this.selectedAccessory = this._selectedAccessory;
		this._horizontalPosition = observableValue(this, getChatPetHorizontalPosition(this.storageService.get(CHAT_PET_HORIZONTAL_POSITION_STORAGE_KEY, StorageScope.APPLICATION)));
		this.horizontalPosition = this._horizontalPosition;
		this._moves = observableValue<readonly IChatPetMove[]>(this, readChatPetStoredMoves(this.storageService.get(CHAT_PET_MOVES_STORAGE_KEY, StorageScope.APPLICATION_SHARED)));
		this.moves = this._moves;
		this._reactions = observableValue<readonly IChatPetReaction[]>(this, this._readReactions());
		this.reactions = this._reactions;
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, CHAT_PET_MOVES_STORAGE_KEY, this._store)(() => {
			transaction(tx => {
				this._moves.set(readChatPetStoredMoves(this.storageService.get(CHAT_PET_MOVES_STORAGE_KEY, StorageScope.APPLICATION_SHARED)), tx);
				this._reactions.set(this._readReactions(), tx);
			});
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, CHAT_PET_REACTIONS_STORAGE_KEY, this._store)(() => {
			this._reactions.set(this._readReactions(), undefined);
		}));

		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_ENABLED_STORAGE_KEY, this._store)(() => {
			this._setEnabled(this.storageService.getBoolean(CHAT_PET_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false));
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_VARIANT_STORAGE_KEY, this._store)(() => {
			this._variant.set(getChatPetVariant(this.storageService.get(CHAT_PET_VARIANT_STORAGE_KEY, StorageScope.APPLICATION), product.quality), undefined);
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, CHAT_PET_ON_THE_RUN_STORAGE_KEY, this._store)(() => {
			this._onTheRun.set(this.storageService.getBoolean(CHAT_PET_ON_THE_RUN_STORAGE_KEY, StorageScope.APPLICATION, false), undefined);
		}));
		for (const achievement of allChatPetAchievements) {
			this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, this._getAchievementStorageKey(achievement.id), this._store)(() => {
				this._refreshAchievementState(!this.locallyUnlockingAchievement);
			}));
			this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, this._getAchievementSeenStorageKey(achievement.id), this._store)(() => {
				this._refreshUnseenAchievementState();
			}));
		}
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION_SHARED, CHAT_PET_ACCESSORY_STORAGE_KEY, this._store)(() => {
			this._refreshSelectedAccessory();
		}));
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

	setVariant(variant: ChatPetVariant): void {
		this._variant.set(variant, undefined);
		this.storageService.store(CHAT_PET_VARIANT_STORAGE_KEY, variant, StorageScope.APPLICATION, StorageTarget.USER);
		status(variant === 'stable'
			? localize('chatPet.variant.stable', "VS Code pet changed to the Stable colors")
			: localize('chatPet.variant.insiders', "VS Code pet changed to the Insiders colors"));
	}

	setOnTheRun(onTheRun: boolean): void {
		this._onTheRun.set(onTheRun, undefined);
		this.storageService.store(CHAT_PET_ON_THE_RUN_STORAGE_KEY, onTheRun, StorageScope.APPLICATION, StorageTarget.USER);
		status(onTheRun
			? localize('chatPet.onTheRun', "The VS Code pet is on the run. Click the pet to bring it back.")
			: localize('chatPet.restored', "The VS Code pet is back"));
	}

	setScale(scale: number): void {
		this._scale.set(scale, undefined);
		this.storageService.store(CHAT_PET_SCALE_STORAGE_KEY, scale, StorageScope.APPLICATION, StorageTarget.USER);
	}

	resetScale(): void {
		this._scale.set(CHAT_PET_DEFAULT_SCALE, undefined);
		this.storageService.remove(CHAT_PET_SCALE_STORAGE_KEY, StorageScope.APPLICATION);
	}

	setHorizontalPosition(position: number): void {
		const normalizedPosition = Math.max(0, Math.min(1, position));
		this._horizontalPosition.set(normalizedPosition, undefined);
		this.storageService.store(CHAT_PET_HORIZONTAL_POSITION_STORAGE_KEY, normalizedPosition, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	learnMove(move: IChatPetMove): void {
		this._storeMoves([...this._moves.get().filter(existing => existing.name !== move.name), move]);
	}

	forgetMove(name: string): boolean {
		const moves = this._moves.get();
		const remaining = moves.filter(move => move.name !== name);
		const reactions = this._reactions.get();
		const remainingReactions = reactions.filter(reaction => reaction.play !== name);
		if (remaining.length === moves.length && remainingReactions.length === reactions.length) {
			return false;
		}
		transaction(tx => {
			this._storeReactions(remainingReactions, tx);
			this._storeMoves(remaining, tx);
		});
		return true;
	}

	addReaction(input: IChatPetReactionInput): IChatPetReaction {
		const reaction: IChatPetReaction = { id: generateUuid().slice(0, 8), ...input };
		this._storeReactions([...this._reactions.get(), reaction]);
		return reaction;
	}

	removeReaction(id: string): boolean {
		const reactions = this._reactions.get();
		const remaining = reactions.filter(reaction => reaction.id !== id);
		if (remaining.length === reactions.length) {
			return false;
		}
		this._storeReactions(remaining);
		return true;
	}

	private _readReactions(): IChatPetReaction[] {
		// Reactions play taught or built-in moves.
		return readChatPetStoredReactions(this.storageService.get(CHAT_PET_REACTIONS_STORAGE_KEY, StorageScope.APPLICATION_SHARED), [...this._moves.get().map(move => move.name), ...getChatPetBuiltInMoveNames()]);
	}

	private _storeMoves(moves: readonly IChatPetMove[], tx?: ITransaction): void {
		this._moves.set(moves, tx);
		if (moves.length) {
			this.storageService.store(CHAT_PET_MOVES_STORAGE_KEY, JSON.stringify(moves.map(serializeChatPetMove)), StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		} else {
			this.storageService.remove(CHAT_PET_MOVES_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
		}
	}

	private _storeReactions(reactions: readonly IChatPetReaction[], tx?: ITransaction): void {
		this._reactions.set(reactions, tx);
		if (reactions.length) {
			this.storageService.store(CHAT_PET_REACTIONS_STORAGE_KEY, JSON.stringify(reactions), StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		} else {
			this.storageService.remove(CHAT_PET_REACTIONS_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
		}
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

	setAccessory(id: ChatPetAccessoryId | undefined): void {
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
			this.storageService.store(CHAT_PET_ACCESSORY_STORAGE_KEY, id, StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		} else {
			this.storageService.remove(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
			this.storageService.remove(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION);
		}
		this.lastInvalidStoredAccessory = undefined;
		this._selectedAccessory.set(id, undefined);
	}

	resetAchievements(): void {
		this.locallyUnlockingAchievement = true;
		try {
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
		} finally {
			this.locallyUnlockingAchievement = false;
		}
		transaction(tx => {
			this._unlockedAchievements.set([], tx);
			this._unseenAchievements.set([], tx);
			this._selectedAccessory.set(undefined, tx);
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
		this._refreshSelectedAccessory();
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

	private _refreshSelectedAccessory(): void {
		this._selectedAccessory.set(this._readSelectedAccessory(), undefined);
	}

	private _readSelectedAccessory(): ChatPetAccessoryId | undefined {
		const storedAccessory = this.storageService.get(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION_SHARED)
			?? this.storageService.get(CHAT_PET_ACCESSORY_STORAGE_KEY, StorageScope.APPLICATION);
		if (storedAccessory === undefined) {
			this.lastInvalidStoredAccessory = undefined;
			return undefined;
		}
		if (isChatPetAccessoryId(storedAccessory)) {
			const achievement = getChatPetAchievementForAccessory(storedAccessory);
			if (this._unlockedAchievements.get().includes(achievement.id)) {
				this.lastInvalidStoredAccessory = undefined;
				return storedAccessory;
			}
		}
		if (this.lastInvalidStoredAccessory !== storedAccessory) {
			this.lastInvalidStoredAccessory = storedAccessory;
			this.logService.warn(`[ChatPetService] Ignoring unknown or locked stored accessory: ${storedAccessory}`);
		}
		return undefined;
	}
}
