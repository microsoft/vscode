/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProjectBoardConfiguration } from './projectBoardConfiguration.js';

export const DEFAULT_PROJECT_BOARD_ID = 'default';

export interface IProjectBoardRecord {
	readonly id: string;
	readonly name: string;
	readonly configuration: IProjectBoardConfiguration;
}

export interface IProjectBoardCollection {
	readonly version: 2;
	readonly boards: readonly IProjectBoardRecord[];
	/** Embedded Hub selection only; standalone windows retain their own board ID. */
	readonly selectedBoardId?: string;
}

export const IProjectBoardCatalogService = createDecorator<IProjectBoardCatalogService>('projectBoardCatalogService');

export interface IProjectBoardCatalogService {
	readonly _serviceBrand: undefined;
	readonly boards: IObservable<readonly IProjectBoardRecord[]>;
	readonly selectedBoardId: IObservable<string | undefined>;
	readonly canEdit: boolean;

	createBoard(name: string): string;
	renameBoard(boardId: string, name: string): void;
	deleteBoard(boardId: string): void;
	selectBoard(boardId: string): void;
	updateBoard(boardId: string, update: (configuration: IProjectBoardConfiguration) => IProjectBoardConfiguration): void;
	removeCardPlacements(cardIds: readonly string[]): void;
	/** Explicit recovery of an unreadable Hub collection. */
	reset(): void;
}
