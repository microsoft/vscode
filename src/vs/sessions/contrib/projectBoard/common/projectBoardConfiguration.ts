/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

export interface IProjectBoardAxis {
	readonly id: string;
	readonly label: string;
}

export interface IProjectBoardPlacement {
	readonly rowId: string;
	readonly columnId: string;
}

export interface IProjectBoardConfiguration {
	readonly version: 1;
	readonly rows: readonly IProjectBoardAxis[];
	readonly columns: readonly IProjectBoardAxis[];
	readonly placements: readonly (IProjectBoardPlacement & { readonly cardId: string })[];
	readonly autoIncludeSessions: boolean;
	readonly openChatInSidePanel?: boolean;
	readonly display?: IProjectBoardDisplayOptions;
}

export interface IProjectBoardDisplayOptions {
	readonly showSessionList?: boolean;
	readonly showStateDuration: boolean;
	readonly showCredits: boolean;
	readonly showLastPrompt?: boolean;
	readonly showModelDetails?: boolean;
	readonly showPermissionDetails?: boolean;
}

export function defaultConfiguration(): IProjectBoardConfiguration {
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

export function freezeConfiguration(configuration: IProjectBoardConfiguration): IProjectBoardConfiguration {
	return Object.freeze({
		version: configuration.version,
		rows: Object.freeze(configuration.rows.map(axis => Object.freeze({ ...axis }))),
		columns: Object.freeze(configuration.columns.map(axis => Object.freeze({ ...axis }))),
		placements: Object.freeze(configuration.placements.map(placement => Object.freeze({ ...placement }))),
		autoIncludeSessions: configuration.autoIncludeSessions,
		...(configuration.openChatInSidePanel !== undefined ? { openChatInSidePanel: configuration.openChatInSidePanel } : {}),
		...(configuration.display ? { display: Object.freeze({ ...configuration.display }) } : {}),
	});
}

export function isIdentifier(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export function hasKeys(value: unknown, keys: readonly string[], optionalKeys: readonly string[] = []): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		&& keys.every(key => Object.hasOwn(value, key))
		&& Object.keys(value).every(key => keys.includes(key) || optionalKeys.includes(key));
}

/** Validates both current v1 configurations and their supported legacy preferences. */
export function validateConfiguration(value: unknown): IProjectBoardConfiguration {
	if (!hasKeys(value, ['version', 'rows', 'columns', 'placements'], ['autoIncludeSessions', 'display', 'openChatInSidePanel']) || value.version !== 1) {
		throw new Error(localize('projectBoard.invalidVersion', "The saved board format or version is not supported."));
	}
	if (Object.hasOwn(value, 'autoIncludeSessions') && typeof value.autoIncludeSessions !== 'boolean') {
		throw new Error(localize('projectBoard.invalidSavedAutoIncludeSessions', "The saved auto-include sessions option is invalid."));
	}
	if (Object.hasOwn(value, 'openChatInSidePanel') && typeof value.openChatInSidePanel !== 'boolean') {
		throw new Error(localize('projectBoard.invalidSavedOpenChatInSidePanel', "The saved chat opening option is invalid."));
	}
	let display: IProjectBoardDisplayOptions | undefined;
	if (Object.hasOwn(value, 'display')) {
		const options = value.display;
		if (!hasKeys(options, ['showStateDuration', 'showCredits'], ['showDescription', 'showLastPrompt', 'showModelDetails', 'showPermissionDetails', 'showSessionList'])
			|| typeof options.showStateDuration !== 'boolean' || typeof options.showCredits !== 'boolean'
			|| Object.values(options).some(value => typeof value !== 'boolean')) {
			throw new Error(localize('projectBoard.invalidDisplayOptions', "The saved board display options are invalid."));
		}
		display = {
			showStateDuration: options.showStateDuration, showCredits: options.showCredits,
			...(typeof options.showSessionList === 'boolean' ? { showSessionList: options.showSessionList } : {}),
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
		...(typeof value.openChatInSidePanel === 'boolean' ? { openChatInSidePanel: value.openChatInSidePanel } : {}),
		...(display ? { display } : {}),
	};
}
