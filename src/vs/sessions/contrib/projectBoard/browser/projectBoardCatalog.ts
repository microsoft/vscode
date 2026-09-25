/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/objects.js';
import { equals as arrayEquals } from '../../../../base/common/arrays.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { DEFAULT_PROJECT_BOARD_ID, IProjectBoardCatalogService, IProjectBoardCollection, IProjectBoardRecord } from '../common/projectBoardCatalog.js';
import { defaultConfiguration, freezeConfiguration, hasKeys, IProjectBoardConfiguration, isIdentifier, validateConfiguration } from '../common/projectBoardConfiguration.js';

export class ProjectBoardCatalogService extends Disposable implements IProjectBoardCatalogService {
	declare readonly _serviceBrand: undefined;
	static readonly STORAGE_KEY = 'sessions.agentHub.configuration';
	static readonly LEGACY_STORAGE_KEY = 'sessions.projectBoard.configuration';

	private readonly collection = observableValue<IProjectBoardCollection>(this, freezeCollection({ version: 2, boards: [] }));
	readonly boards = derived(this, reader => this.collection.read(reader).boards);
	readonly selectedBoardId = derived(this, reader => this.collection.read(reader).selectedBoardId);
	private editable = true;
	private saving = false;
	private loaded = false;
	private storedValue: string | undefined;

	get canEdit(): boolean { return this.editable; }

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.load();
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, ProjectBoardCatalogService.STORAGE_KEY, this._store)(() => {
			if (!this.saving && this.editable) {
				this.load();
			}
		}));
	}

	createBoard(name: string): string {
		const id = generateUuid();
		this.mutate(collection => ({
			...collection,
			boards: [...collection.boards, { id, name: this.name(name), configuration: defaultConfiguration() }],
			selectedBoardId: collection.selectedBoardId ?? id,
		}));
		return id;
	}

	renameBoard(boardId: string, name: string): void {
		this.mutate(collection => {
			this.board(collection, boardId);
			const trimmed = this.name(name);
			return { ...collection, boards: collection.boards.map(board => board.id === boardId ? { ...board, name: trimmed } : board) };
		});
	}

	deleteBoard(boardId: string): void {
		this.mutate(collection => {
			this.board(collection, boardId);
			const boards = collection.boards.filter(board => board.id !== boardId);
			const selectedBoardId = collection.selectedBoardId === boardId ? boards[0]?.id : collection.selectedBoardId;
			return { version: 2, boards, ...(selectedBoardId !== undefined ? { selectedBoardId } : {}) };
		});
	}

	selectBoard(boardId: string): void {
		this.mutate(collection => {
			this.board(collection, boardId);
			return { ...collection, selectedBoardId: boardId };
		});
	}

	updateBoard(boardId: string, update: (configuration: IProjectBoardConfiguration) => IProjectBoardConfiguration): void {
		this.mutate(collection => {
			const board = this.board(collection, boardId);
			const configuration = update(board.configuration);
			return { ...collection, boards: collection.boards.map(candidate => candidate.id === boardId ? { ...candidate, configuration } : candidate) };
		});
	}

	removeCardPlacements(cardIds: readonly string[]): void {
		this.mutate(collection => {
			if (cardIds.some(id => !isIdentifier(id))) {
				throw new Error(localize('projectBoard.invalidCardId', "A card must have a nonempty ID."));
			}
			const removed = new Set(cardIds);
			return {
				...collection,
				boards: collection.boards.map(board => ({
					...board,
					configuration: { ...board.configuration, placements: board.configuration.placements.filter(placement => !removed.has(placement.cardId)) },
				})),
			};
		});
	}

	replaceCardPlacements(from: string, to: string): void {
		if (from === to && isIdentifier(from)) {
			return;
		}
		this.mutate(collection => {
			if (!isIdentifier(from) || !isIdentifier(to)) {
				throw new Error(localize('projectBoard.invalidCardId', "A card must have a nonempty ID."));
			}
			return {
				...collection,
				boards: collection.boards.map(board => {
					const placements = board.configuration.placements;
					const hasTarget = placements.some(placement => placement.cardId === to);
					return {
						...board,
						configuration: {
							...board.configuration,
							placements: placements.flatMap(placement => placement.cardId !== from ? [placement] : hasTarget ? [] : [{ ...placement, cardId: to }]),
						},
					};
				}),
			};
		});
	}

	reset(): void {
		try {
			this.save(defaultCollection());
		} catch (error) {
			this.report(localize('projectBoard.catalogResetFailed', "Could not reset Agents Hub configuration."), error);
			throw error;
		}
	}

	private board(collection: IProjectBoardCollection, boardId: string): IProjectBoardRecord {
		const board = collection.boards.find(board => board.id === boardId);
		if (!board) {
			throw new Error(localize('projectBoard.unknownBoard', "The board no longer exists."));
		}
		return board;
	}

	private name(name: string): string {
		if (!isIdentifier(name)) {
			throw new Error(localize('projectBoard.emptyBoardName', "A board name cannot be empty."));
		}
		return name.trim();
	}

	private load(): void {
		try {
			const raw = this.storageService.get(ProjectBoardCatalogService.STORAGE_KEY, StorageScope.PROFILE);
			if (this.loaded && raw === this.storedValue) {
				return;
			}
			if (raw === undefined) {
				const legacy = this.storageService.get(ProjectBoardCatalogService.LEGACY_STORAGE_KEY, StorageScope.PROFILE);
				if (legacy !== undefined) {
					const migrated = defaultCollection(validateConfiguration(JSON.parse(legacy)));
					// The legacy bytes remain an untouched recovery backup, including on save failure.
					this.save(migrated);
					return;
				}
			}
			const collection = raw === undefined ? defaultCollection() : validateCollection(JSON.parse(raw));
			this.storedValue = raw;
			this.loaded = true;
			this.collection.set(freezeCollection(collection, this.collection.get()), undefined);
		} catch (error) {
			this.editable = false;
			this.report(localize('projectBoard.catalogLoadFailed', "Could not load Agents Hub configuration. Editing is disabled to protect saved data. Reset the Hub, or repair the stored configuration and restart."), error);
			this.collection.set(freezeCollection(this.collection.get()), undefined);
		}
	}

	private mutate(update: (collection: IProjectBoardCollection) => IProjectBoardCollection): void {
		try {
			if (this.editable) {
				// Storage notifications may lag another window's write.
				this.load();
			}
			if (!this.editable) {
				throw new Error(localize('projectBoard.catalogEditingDisabled', "Agents Hub editing is disabled. Reset the Hub, or repair its saved configuration and restart."));
			}
			this.save(update(this.collection.get()));
		} catch (error) {
			this.report(localize('projectBoard.catalogSaveFailed', "Could not update Agents Hub configuration."), error);
			throw error;
		}
	}

	private save(value: IProjectBoardCollection): void {
		const collection = freezeCollection(validateCollection(value), this.editable ? this.collection.get() : undefined);
		const serialized = JSON.stringify(collection);
		if (this.editable && serialized === this.storedValue) {
			return;
		}
		this.saving = true;
		try {
			this.storageService.store(ProjectBoardCatalogService.STORAGE_KEY, serialized, StorageScope.PROFILE, StorageTarget.MACHINE);
		} finally {
			this.saving = false;
		}
		this.storedValue = serialized;
		this.loaded = true;
		this.editable = true;
		this.collection.set(collection, undefined);
	}

	private report(message: string, error: unknown): void {
		this.logService.error(`[ProjectBoardCatalogService] ${message}`, error);
		this.notificationService.error(localize('projectBoard.configurationError', "{0} {1}", message, toErrorMessage(error)));
	}
}

function defaultCollection(configuration = defaultConfiguration()): IProjectBoardCollection {
	return {
		version: 2,
		boards: [{ id: DEFAULT_PROJECT_BOARD_ID, name: localize('projectBoard.defaultName', "Default"), configuration }],
		selectedBoardId: DEFAULT_PROJECT_BOARD_ID,
	};
}

function validateCollection(value: unknown): IProjectBoardCollection {
	if (!hasKeys(value, ['version', 'boards'], ['selectedBoardId']) || value.version !== 2 || !Array.isArray(value.boards)) {
		throw new Error(localize('projectBoard.invalidCollection', "The saved Hub format or version is not supported."));
	}
	const ids = new Set<string>();
	const boards: IProjectBoardRecord[] = [];
	for (const board of value.boards) {
		if (!hasKeys(board, ['id', 'name', 'configuration'])
			|| !isIdentifier(board.id) || board.id !== board.id.trim()
			|| !isIdentifier(board.name) || board.name !== board.name.trim() || ids.has(board.id)) {
			throw new Error(localize('projectBoard.invalidBoard', "The saved Hub contains an invalid or duplicate board."));
		}
		ids.add(board.id);
		boards.push({ id: board.id, name: board.name, configuration: validateConfiguration(board.configuration) });
	}
	if (Object.hasOwn(value, 'selectedBoardId') && (!isIdentifier(value.selectedBoardId) || !ids.has(value.selectedBoardId))) {
		throw new Error(localize('projectBoard.invalidSelection', "The saved Hub selection is invalid."));
	}
	return { version: 2, boards, ...(typeof value.selectedBoardId === 'string' ? { selectedBoardId: value.selectedBoardId } : {}) };
}

function freezeCollection(collection: IProjectBoardCollection, previous?: IProjectBoardCollection): IProjectBoardCollection {
	const oldBoards = new Map(previous?.boards.map(board => [board.id, board]));
	const records = collection.boards.map(board => {
		const old = oldBoards.get(board.id);
		const configuration = old && equals(old.configuration, board.configuration) ? old.configuration : freezeConfiguration(board.configuration);
		return old && old.name === board.name && old.configuration === configuration
			? old
			: Object.freeze({ ...board, configuration });
	});
	const boards = previous && arrayEquals(records, previous.boards) ? previous.boards : Object.freeze(records);
	if (previous && boards === previous.boards && collection.selectedBoardId === previous.selectedBoardId) {
		return previous;
	}
	return Object.freeze({
		...collection,
		boards,
	});
}

registerSingleton(IProjectBoardCatalogService, ProjectBoardCatalogService, InstantiationType.Delayed);
