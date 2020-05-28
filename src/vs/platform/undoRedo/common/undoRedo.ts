/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';

export const IUndoRedoService = createDecorator<IUndoRedoService>('undoRedoService');

export const enum UndoRedoElementType {
	Resource,
	Workspace
}

export interface IResourceUndoRedoElement {
	readonly type: UndoRedoElementType.Resource;
	readonly resource: URI;
	readonly label: string;
	undo(): Promise<void> | void;
	redo(): Promise<void> | void;
}

export interface IWorkspaceUndoRedoElement {
	readonly type: UndoRedoElementType.Workspace;
	readonly resources: readonly URI[];
	readonly label: string;
	undo(): Promise<void> | void;
	redo(): Promise<void> | void;
	split(): IResourceUndoRedoElement[];

	/**
	 * If implemented, will be invoked before calling `undo()` or `redo()`.
	 * This is a good place to prepare everything such that the calls to `undo()` or `redo()` are synchronous.
	 * If a disposable is returned, it will be invoked to clean things up.
	 */
	prepareUndoRedo?(): Promise<IDisposable> | IDisposable | void;
}

export type IUndoRedoElement = IResourceUndoRedoElement | IWorkspaceUndoRedoElement;

export interface IPastFutureElements {
	past: IUndoRedoElement[];
	future: IUndoRedoElement[];
}

export interface UriComparisonKeyComputer {
	/**
	 * Return `null` if you don't own this URI.
	 */
	getComparisonKey(uri: URI): string | null;
}

export interface IUndoRedoService {
	_serviceBrand: undefined;

	registerUriComparisonKeyComputer(uriComparisonKeyComputer: UriComparisonKeyComputer): IDisposable;

	/**
	 * Add a new element to the `undo` stack.
	 * This will destroy the `redo` stack.
	 */
	pushElement(element: IUndoRedoElement): void;

	/**
	 * Get the last pushed element. If the last pushed element has been undone, returns null.
	 */
	getLastElement(resource: URI): IUndoRedoElement | null;

	getElements(resource: URI): IPastFutureElements;

	hasElements(resource: URI): boolean;

	setElementsIsValid(resource: URI, isValid: boolean): void;

	/**
	 * Remove elements that target `resource`.
	 */
	removeElements(resource: URI): void;

	canUndo(resource: URI): boolean;
	undo(resource: URI): Promise<void> | void;

	canRedo(resource: URI): boolean;
	redo(resource: URI): Promise<void> | void;
}
