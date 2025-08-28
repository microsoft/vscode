/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISettableObservable } from '../../../../base/common/observableInternal/base.js';
import { URI } from '../../../../base/common/uri.js';
import { CellKind, IErdosNotebookCell } from './IErdosNotebookCell.js';
import { SelectionStateMachine } from './selectionMachine.js';
import { ILanguageRuntimeSession } from '../../runtimeSession/common/runtimeSessionService.js';
import { Event } from '../../../../base/common/event.js';

export enum KernelStatus {
	Uninitialized = 'Uninitialized',
	Connecting = 'Connecting',
	Connected = 'Connected',
	Disconnected = 'Disconnected',
	Errored = 'Errored'
}

export interface IErdosNotebookInstance {
	id: string;

	get uri(): URI;

	readonly connectedToEditor: boolean;

	readonly cellsContainer: HTMLElement | undefined;

	setCellsContainer(container: HTMLElement | undefined): void;

	cells: ISettableObservable<IErdosNotebookCell[]>;

	kernelStatus: ISettableObservable<KernelStatus>;

	currentRuntime: ISettableObservable<ILanguageRuntimeSession | undefined>;

	selectionStateMachine: SelectionStateMachine;

	isDisposed: boolean;

	readonly onDidScrollCellsContainer: Event<void>;

	runCells(cells: IErdosNotebookCell[]): Promise<void>;

	runAllCells(): Promise<void>;

	clearAllCellOutputs(): void;

	addCell(type: CellKind, index: number): void;

	insertCodeCellAndFocusContainer(aboveOrBelow: 'above' | 'below'): void;

	deleteCell(cell?: IErdosNotebookCell): void;

	setEditingCell(cell: IErdosNotebookCell | undefined): void;

	close(): void;
}
