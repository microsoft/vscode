/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IProjectBoardAxis, IProjectBoardConfiguration, IProjectBoardDisplayOptions, IProjectBoardPlacement } from '../common/projectBoardConfiguration.js';

export class ProjectBoardState extends Disposable {
	static readonly STORAGE_KEY = 'sessions.projectBoard.configuration';

	private readonly _configuration = observableValue<IProjectBoardConfiguration>(this, freezeConfiguration(defaultConfiguration()));
	readonly configuration: IObservable<IProjectBoardConfiguration> = this._configuration;
	private editable = true;
	private saving = false;
	private storedValue: string | undefined;

	get canEdit(): boolean { return this.editable; }

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.load();
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, ProjectBoardState.STORAGE_KEY, this._store)(() => {
			if (!this.saving && this.editable) {
				this.load();
			}
		}));
	}

	getPlacement(cardId: string): IProjectBoardPlacement | undefined {
		const placement = this._configuration.get().placements.find(placement => placement.cardId === cardId);
		return placement ? { rowId: placement.rowId, columnId: placement.columnId } : undefined;
	}

	setDisplayOption(key: keyof IProjectBoardDisplayOptions, enabled: boolean): void {
		this.mutate(configuration => {
			if (!['showStateDuration', 'showCredits', 'showLastPrompt', 'showModelDetails', 'showPermissionDetails'].includes(key) || typeof enabled !== 'boolean') {
				throw new Error(localize('projectBoard.invalidDisplayOption', "The board display option is invalid."));
			}
			return {
				...configuration,
				display: { showStateDuration: false, showCredits: false, ...configuration.display, [key]: enabled },
			};
		});
	}

	setAutoIncludeSessions(enabled: boolean): void {
		this.mutate(configuration => {
			if (typeof enabled !== 'boolean') {
				throw new Error(localize('projectBoard.invalidAutoIncludeSessions', "The auto-include sessions option is invalid."));
			}
			return { ...configuration, autoIncludeSessions: enabled };
		});
	}

	reset(): void {
		try {
			this.save(defaultConfiguration());
		} catch (error) {
			this.report(localize('projectBoard.resetFailed', "Could not reset Project Board configuration."), error);
			throw error;
		}
	}

	moveCard(cardId: string, placement: IProjectBoardPlacement | undefined): void {
		this.moveCards([cardId], placement);
	}

	moveCards(cardIds: readonly string[], placement: IProjectBoardPlacement | undefined): void {
		this.mutate(configuration => {
			if (!cardIds.length || cardIds.some(cardId => !isIdentifier(cardId))) {
				throw new Error(localize('projectBoard.invalidCardId', "A card must have a nonempty ID."));
			}
			if (placement) {
				this.axis(configuration, 'row', placement.rowId);
				this.axis(configuration, 'column', placement.columnId);
			}
			const movedCardIds = new Set(cardIds);
			return {
				...configuration,
				placements: [
					...configuration.placements.filter(candidate => !movedCardIds.has(candidate.cardId)),
					...(placement ? [...movedCardIds].map(cardId => ({ cardId, rowId: placement.rowId, columnId: placement.columnId })) : []),
				],
			};
		});
	}

	addAxis(kind: 'row' | 'column', label: string): string {
		const id = generateUuid();
		this.mutate(configuration => ({
			...configuration,
			[this.axisKey(kind)]: [...configuration[this.axisKey(kind)], { id, label: this.label(label) }],
		}));
		return id;
	}

	renameAxis(kind: 'row' | 'column', id: string, label: string): void {
		this.mutate(configuration => {
			this.axis(configuration, kind, id);
			const trimmed = this.label(label);
			const key = this.axisKey(kind);
			return { ...configuration, [key]: configuration[key].map(axis => axis.id === id ? { id, label: trimmed } : axis) };
		});
	}

	reorderAxis(kind: 'row' | 'column', id: string, targetIndex: number): void {
		this.mutate(configuration => {
			const axis = this.axis(configuration, kind, id);
			const key = this.axisKey(kind);
			if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= configuration[key].length) {
				throw new Error(localize('projectBoard.invalidAxisIndex', "The axis position is out of range."));
			}
			const axes = configuration[key].filter(candidate => candidate.id !== id);
			axes.splice(targetIndex, 0, axis);
			return { ...configuration, [key]: axes };
		});
	}

	deleteAxis(kind: 'row' | 'column', id: string): void {
		this.mutate(configuration => {
			this.axis(configuration, kind, id);
			const key = this.axisKey(kind);
			if (configuration[key].length === 1) {
				throw new Error(localize('projectBoard.lastAxis', "The board must have at least one row and one column."));
			}
			return {
				...configuration,
				[key]: configuration[key].filter(axis => axis.id !== id),
				placements: configuration.placements.filter(placement => (kind === 'row' ? placement.rowId : placement.columnId) !== id),
			};
		});
	}

	getAffectedCardCount(kind: 'row' | 'column', id: string): number {
		const configuration = this._configuration.get();
		this.axis(configuration, kind, id);
		return configuration.placements.filter(placement => (kind === 'row' ? placement.rowId : placement.columnId) === id).length;
	}

	private axisKey(kind: 'row' | 'column'): 'rows' | 'columns' {
		if (kind !== 'row' && kind !== 'column') {
			throw new Error(localize('projectBoard.invalidAxisKind', "Unknown board axis kind."));
		}
		return kind === 'row' ? 'rows' : 'columns';
	}

	private axis(configuration: IProjectBoardConfiguration, kind: 'row' | 'column', id: string): IProjectBoardAxis {
		const axis = configuration[this.axisKey(kind)].find(axis => axis.id === id);
		if (!axis) {
			throw new Error(localize('projectBoard.unknownAxis', "The board axis no longer exists."));
		}
		return axis;
	}

	private label(label: string): string {
		if (typeof label !== 'string' || !label.trim()) {
			throw new Error(localize('projectBoard.emptyAxisLabel', "An axis label cannot be empty."));
		}
		return label.trim();
	}

	private load(): void {
		try {
			const value = this.storageService.get(ProjectBoardState.STORAGE_KEY, StorageScope.PROFILE);
			if (value === this.storedValue) {
				return;
			}
			const configuration = value === undefined ? defaultConfiguration() : parseConfiguration(value);
			this.storedValue = value;
			this._configuration.set(freezeConfiguration(configuration), undefined);
		} catch (error) {
			this.editable = false;
			this.report(localize('projectBoard.loadFailed', "Could not load Project Board configuration. Editing is disabled to protect saved data. Reset the board, or repair the stored configuration and restart."), error);
			this._configuration.set(freezeConfiguration(this._configuration.get()), undefined);
		}
	}

	private mutate(update: (configuration: IProjectBoardConfiguration) => IProjectBoardConfiguration): void {
		try {
			if (this.editable) {
				// Re-read before editing in case another window changed storage before its event arrived.
				this.load();
			}
			if (!this.editable) {
				throw new Error(localize('projectBoard.editingDisabled', "Project Board editing is disabled. Reset the board, or repair its saved configuration and restart."));
			}
			this.save(update(this._configuration.get()));
		} catch (error) {
			this.report(localize('projectBoard.saveFailed', "Could not update Project Board configuration."), error);
			throw error;
		}
	}

	private save(value: IProjectBoardConfiguration): void {
		const configuration = freezeConfiguration(value);
		const serialized = JSON.stringify(configuration);
		this.saving = true;
		try {
			this.storageService.store(ProjectBoardState.STORAGE_KEY, serialized, StorageScope.PROFILE, StorageTarget.MACHINE);
		} finally {
			this.saving = false;
		}
		this.storedValue = serialized;
		this.editable = true;
		this._configuration.set(configuration, undefined);
	}

	private report(message: string, error: unknown): void {
		this.logService.error(`[ProjectBoardState] ${message}`, error);
		this.notificationService.error(localize('projectBoard.configurationError', "{0} {1}", message, toErrorMessage(error)));
	}
}

function defaultConfiguration(): IProjectBoardConfiguration {
	return {
		version: 1,
		rows: [{ id: 'general', label: localize('projectBoard.general', "General") }],
		columns: [
			{ id: 'p0', label: localize('projectBoard.p0', "P0") },
			{ id: 'p1', label: localize('projectBoard.p1', "P1") },
			{ id: 'p2', label: localize('projectBoard.p2', "P2") },
			{ id: 'p3', label: localize('projectBoard.p3', "P3") },
		],
		placements: [],
		autoIncludeSessions: true,
	};
}

function freezeConfiguration(configuration: IProjectBoardConfiguration): IProjectBoardConfiguration {
	return Object.freeze({
		version: configuration.version,
		rows: Object.freeze(configuration.rows.map(axis => Object.freeze({ ...axis }))),
		columns: Object.freeze(configuration.columns.map(axis => Object.freeze({ ...axis }))),
		placements: Object.freeze(configuration.placements.map(placement => Object.freeze({ ...placement }))),
		autoIncludeSessions: configuration.autoIncludeSessions,
		...(configuration.display ? { display: Object.freeze({ ...configuration.display }) } : {}),
	});
}

function isIdentifier(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function hasKeys(value: unknown, keys: readonly string[], optionalKeys: readonly string[] = []): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		&& keys.every(key => Object.hasOwn(value, key))
		&& Object.keys(value).every(key => keys.includes(key) || optionalKeys.includes(key));
}

function parseConfiguration(raw: string): IProjectBoardConfiguration {
	const value: unknown = JSON.parse(raw);
	if (!hasKeys(value, ['version', 'rows', 'columns', 'placements'], ['autoIncludeSessions', 'display']) || value.version !== 1) {
		throw new Error(localize('projectBoard.invalidVersion', "The saved board format or version is not supported."));
	}
	if (Object.hasOwn(value, 'autoIncludeSessions') && typeof value.autoIncludeSessions !== 'boolean') {
		throw new Error(localize('projectBoard.invalidSavedAutoIncludeSessions', "The saved auto-include sessions option is invalid."));
	}
	let display: IProjectBoardDisplayOptions | undefined;
	if (Object.hasOwn(value, 'display')) {
		const options = value.display;
		if (!hasKeys(options, ['showStateDuration', 'showCredits'], ['showDescription', 'showLastPrompt', 'showModelDetails', 'showPermissionDetails'])
			|| typeof options.showStateDuration !== 'boolean' || typeof options.showCredits !== 'boolean'
			|| Object.values(options).some(value => typeof value !== 'boolean')) {
			throw new Error(localize('projectBoard.invalidDisplayOptions', "The saved board display options are invalid."));
		}
		display = {
			showStateDuration: options.showStateDuration, showCredits: options.showCredits,
			...(typeof options.showDescription === 'boolean' ? { showLastPrompt: options.showDescription } : {}),
			...(typeof options.showLastPrompt === 'boolean' ? { showLastPrompt: options.showLastPrompt } : {}),
			...(typeof options.showModelDetails === 'boolean' ? { showModelDetails: options.showModelDetails } : {}),
			...(typeof options.showPermissionDetails === 'boolean' ? { showPermissionDetails: options.showPermissionDetails } : {}),
		};
	}
	const validAxes = (axes: unknown): axes is IProjectBoardAxis[] => {
		if (!Array.isArray(axes) || axes.length === 0) {
			return false;
		}
		const ids = new Set<string>();
		return axes.every(axis => {
			if (!hasKeys(axis, ['id', 'label']) || !isIdentifier(axis.id) || !isIdentifier(axis.label) || axis.label !== axis.label.trim() || ids.has(axis.id)) {
				return false;
			}
			ids.add(axis.id);
			return true;
		});
	};
	if (!validAxes(value.rows) || !validAxes(value.columns) || !Array.isArray(value.placements)) {
		throw new Error(localize('projectBoard.invalidAxes', "The saved board axes or placements are invalid."));
	}
	const rowIds = new Set(value.rows.map(axis => axis.id));
	const columnIds = new Set(value.columns.map(axis => axis.id));
	const cardIds = new Set<string>();
	const placements: (IProjectBoardPlacement & { cardId: string })[] = [];
	for (const placement of value.placements) {
		if (!hasKeys(placement, ['cardId', 'rowId', 'columnId']) || !isIdentifier(placement.cardId) || !isIdentifier(placement.rowId) || !isIdentifier(placement.columnId)
			|| !rowIds.has(placement.rowId) || !columnIds.has(placement.columnId) || cardIds.has(placement.cardId)) {
			throw new Error(localize('projectBoard.invalidPlacements', "The saved board contains an invalid or duplicate placement."));
		}
		cardIds.add(placement.cardId);
		placements.push({ cardId: placement.cardId, rowId: placement.rowId, columnId: placement.columnId });
	}
	return {
		version: 1,
		rows: value.rows,
		columns: value.columns,
		placements,
		autoIncludeSessions: value.autoIncludeSessions !== false,
		...(display ? { display } : {}),
	};
}
