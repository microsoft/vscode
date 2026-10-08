/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { hasKeys, isIdentifier } from '../common/projectBoardConfiguration.js';

export type ProjectBoardSurface = 'embedded' | 'standalone';

export interface IProjectBoardViewState {
	readonly version: 1;
	readonly expandedCards: readonly string[];
	readonly expandedChats: readonly string[];
	readonly collapsedRows: readonly string[];
	readonly collapsedColumns: readonly string[];
	readonly unassignedCollapsed: boolean;
	readonly visibleCounts: readonly (readonly [string, number])[];
}

export function defaultProjectBoardViewState(): IProjectBoardViewState {
	return { version: 1, expandedCards: [], expandedChats: [], collapsedRows: [], collapsedColumns: [], unassignedCollapsed: false, visibleCounts: [] };
}

export function validateProjectBoardViewState(value: unknown): IProjectBoardViewState {
	const identifiers = (value: unknown): value is string[] => Array.isArray(value) && value.every(isIdentifier) && new Set(value).size === value.length;
	const counts = (value: unknown): value is [string, number][] => Array.isArray(value) && value.every(entry =>
		Array.isArray(entry) && entry.length === 2 && isIdentifier(entry[0]) && Number.isSafeInteger(entry[1]) && entry[1] > 0)
		&& new Set(value.map(entry => entry[0])).size === value.length;
	if (!hasKeys(value, ['version', 'expandedCards', 'expandedChats', 'collapsedRows', 'collapsedColumns', 'unassignedCollapsed', 'visibleCounts'])
		|| value.version !== 1 || !identifiers(value.expandedCards) || !identifiers(value.expandedChats)
		|| !identifiers(value.collapsedRows) || !identifiers(value.collapsedColumns)
		|| typeof value.unassignedCollapsed !== 'boolean' || !counts(value.visibleCounts)) {
		throw new Error(localize('projectBoard.invalidViewState', "The saved Agents Hub view state is invalid."));
	}
	return {
		version: 1, expandedCards: value.expandedCards, expandedChats: value.expandedChats,
		collapsedRows: value.collapsedRows, collapsedColumns: value.collapsedColumns,
		unassignedCollapsed: value.unassignedCollapsed, visibleCounts: value.visibleCounts,
	};
}

export class ProjectBoardViewState extends Disposable {
	static readonly STORAGE_PREFIX = 'sessions.agentHub.viewState.';

	static storageKey(boardId: string, surface: ProjectBoardSurface): string {
		return `${this.STORAGE_PREFIX}${encodeURIComponent(boardId)}.${surface}`;
	}

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly key: string;
	private storedValue: string | undefined;
	private editable = true;
	private saving = false;
	private _value = defaultProjectBoardViewState();
	private pending = this._value;
	get value(): IProjectBoardViewState { return this._value; }

	constructor(
		boardId: string,
		surface: ProjectBoardSurface,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.key = ProjectBoardViewState.storageKey(boardId, surface);
		this.load();
		this._register(storageService.onDidChangeValue(StorageScope.PROFILE, this.key, this._store)(() => {
			if (!this.saving && this.load()) {
				this._onDidChange.fire();
			}
		}));
	}

	save(value: IProjectBoardViewState): void {
		if (!this.editable) {
			this.notificationService.warn(localize('projectBoard.viewStateLocked', "Folding changes are temporary until the saved Agents Hub view state is repaired or reset."));
			return;
		}
		try {
			this.pending = validateProjectBoardViewState(value);
			const serialized = JSON.stringify(this.pending);
			if (serialized === this.storedValue) {
				return;
			}
			this.saving = true;
			try {
				this.storageService.store(this.key, serialized, StorageScope.PROFILE, StorageTarget.MACHINE);
			} finally {
				this.saving = false;
			}
			this.storedValue = serialized;
			this._value = this.pending;
		} catch (error) {
			this.report(localize('projectBoard.viewStateSaveFailed', "Could not save Agents Hub view state. Current folding changes are temporary."), error, false);
		}
	}

	reset(): void {
		try {
			this.saving = true;
			try {
				this.storageService.remove(this.key, StorageScope.PROFILE);
			} finally {
				this.saving = false;
			}
			this.storedValue = undefined;
			this.editable = true;
			this._value = this.pending = defaultProjectBoardViewState();
			this._onDidChange.fire();
		} catch (error) {
			this.report(localize('projectBoard.viewStateResetFailed', "Could not reset the saved Agents Hub view state."), error, true);
		}
	}

	private load(): boolean {
		try {
			const raw = this.storageService.get(this.key, StorageScope.PROFILE);
			if (this.editable && raw === this.storedValue) {
				return false;
			}
			const value = raw === undefined ? defaultProjectBoardViewState() : validateProjectBoardViewState(JSON.parse(raw));
			this._value = this.pending = value;
			this.storedValue = raw;
			this.editable = true;
			return true;
		} catch (error) {
			this.editable = false;
			this.report(localize('projectBoard.viewStateLoadFailed', "Could not restore Agents Hub view state. Saved data is preserved; folding remains available temporarily."), error, true);
			return false;
		}
	}

	private report(message: string, error: unknown, reset: boolean): void {
		this.logService.error(`[ProjectBoardViewState] ${message}`, error);
		this.notificationService.prompt(Severity.Error, localize('projectBoard.viewStateError', "{0} {1}", message, toErrorMessage(error)), [{
			label: reset ? localize('projectBoard.resetViewState', "Reset Saved View State") : localize('projectBoard.retryViewState', "Retry Saving View State"),
			run: () => reset ? this.reset() : this.save(this.pending),
		}]);
	}
}
