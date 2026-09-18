/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProjectBoardCatalogService } from '../common/projectBoardCatalog.js';
import { defaultConfiguration, IProjectBoardAxis, IProjectBoardConfiguration, IProjectBoardDisplayOptions, IProjectBoardPlacement, isIdentifier } from '../common/projectBoardConfiguration.js';

/** A board-scoped view of the shared catalog; it never follows embedded selection. */
export class ProjectBoardState extends Disposable {
	private readonly _configuration;
	readonly configuration: IObservable<IProjectBoardConfiguration>;
	private readonly _isAvailable = observableValue(this, true);
	readonly isAvailable: IObservable<boolean> = this._isAvailable;

	get canEdit(): boolean { return this._isAvailable.get() && this.catalog.canEdit; }

	constructor(
		readonly boardId: string,
		@IProjectBoardCatalogService private readonly catalog: IProjectBoardCatalogService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		const board = catalog.boards.get().find(board => board.id === boardId);
		if (!board) {
			const error = new Error(localize('projectBoard.unknownBoard', "The board no longer exists."));
			this.dispose();
			this.report(error);
			throw error;
		}
		this._configuration = observableValue<IProjectBoardConfiguration>(this, board.configuration);
		this.configuration = this._configuration;
		this._register(autorun(reader => {
			const board = catalog.boards.read(reader).find(board => board.id === boardId);
			transaction(tx => {
				this._isAvailable.set(!!board, tx);
				if (board) {
					this._configuration.set(board.configuration, tx);
				}
			});
		}));
	}

	getPlacement(cardId: string): IProjectBoardPlacement | undefined {
		const placement = this._configuration.get().placements.find(placement => placement.cardId === cardId);
		return placement ? { rowId: placement.rowId, columnId: placement.columnId } : undefined;
	}

	setDisplayOption(key: keyof IProjectBoardDisplayOptions, enabled: boolean): void {
		this.mutate(configuration => {
			if (!['showSessionList', 'showStateDuration', 'showCredits', 'showLastPrompt', 'showModelDetails', 'showPermissionDetails'].includes(key) || typeof enabled !== 'boolean') {
				throw new Error(localize('projectBoard.invalidDisplayOption', "The board display option is invalid."));
			}
			return { ...configuration, display: { showStateDuration: false, showCredits: false, ...configuration.display, [key]: enabled } };
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

	setOpenChatInSidePanel(enabled: boolean): void {
		this.mutate(configuration => {
			if (typeof enabled !== 'boolean') {
				throw new Error(localize('projectBoard.invalidOpenChatInSidePanel', "The chat opening option is invalid."));
			}
			return { ...configuration, openChatInSidePanel: enabled };
		});
	}

	reset(): void {
		this.mutate(() => defaultConfiguration());
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

	private mutate(update: (configuration: IProjectBoardConfiguration) => IProjectBoardConfiguration): void {
		// The catalog validates availability against its latest storage snapshot and reports failures.
		this.catalog.updateBoard(this.boardId, update);
	}

	private report(error: unknown): void {
		this.logService.error('[ProjectBoardState] Could not open board.', error);
		this.notificationService.error(localize('projectBoard.openFailed', "Could not open board. {0}", toErrorMessage(error)));
	}
}
