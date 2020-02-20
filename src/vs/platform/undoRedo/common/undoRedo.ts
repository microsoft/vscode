/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';

export const IUndoRedoService = createDecorator<IUndoRedoService>('undoRedoService');

export interface IUndoRedoContext {
	replaceCurrentElement(others: IUndoRedoElement[]): void;
}

export interface IUndoRedoElement {
	/**
	 * None, one or multiple resources that this undo/redo element impacts.
	 */
	readonly resources: readonly URI[];

	/**
	 * The label of the undo/redo element.
	 */
	readonly label: string;

	/**
	 * Undo.
	 * Will always be called before `redo`.
	 * Can be called multiple times.
	 * e.g. `undo` -> `redo` -> `undo` -> `redo`
	 */
	undo(ctx: IUndoRedoContext): void;

	/**
	 * Redo.
	 * Will always be called after `undo`.
	 * Can be called multiple times.
	 * e.g. `undo` -> `redo` -> `undo` -> `redo`
	 */
	redo(ctx: IUndoRedoContext): void;

	/**
	 * Invalidate the edits concerning `resource`.
	 * i.e. the undo/redo stack for that particular resource has been destroyed.
	 */
	invalidate(resource: URI): void;
}

export interface IUndoRedoService {
	_serviceBrand: undefined;

	/**
	 * Add a new element to the `undo` stack.
	 * This will destroy the `redo` stack.
	 */
	pushElement(element: IUndoRedoElement): void;

	/**
	 * Get the last pushed element. If the last pushed element has been undone, returns null.
	 */
	getLastElement(resource: URI): IUndoRedoElement | null;

	/**
	 * Remove elements that target `resource`.
	 */
	removeElements(resource: URI): void;

	canUndo(resource: URI): boolean;
	undo(resource: URI): void;

	redo(resource: URI): void;
	canRedo(resource: URI): boolean;
}
