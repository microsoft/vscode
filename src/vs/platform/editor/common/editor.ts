/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IEditorViewState } from 'vs/editor/common/editorCommon';

export const IEditorService = createDecorator<IEditorService>('editorService');

export interface IEditorService {

	_serviceBrand: any;

	/**
	 * Specific overload to open an instance of IResourceInput.
	 */
	openEditor(input: IResourceInput, sideBySide?: boolean): TPromise<IEditor>;
}

export interface IEditorModel {

	onDispose: Event<void>;

	/**
	 * Loads the model.
	 */
	load(): TPromise<IEditorModel>;

	/**
	 * Dispose associated resources
	 */
	dispose(): void;
}

export interface IBaseResourceInput {

	/**
	 * Optional options to use when opening the text input.
	 */
	options?: ITextEditorOptions;

	/**
	 * Label to show for the diff editor
	 */
	label?: string;

	/**
	 * Description to show for the diff editor
	 */
	description?: string;
}

export interface IResourceInput extends IBaseResourceInput {

	/**
	 * The resource URL of the resource to open.
	 */
	resource: URI;

	/**
	 * The encoding of the text input if known.
	 */
	encoding?: string;
}

export interface IResourceDiffInput extends IBaseResourceInput {

	/**
	 * The left hand side URI to open inside a diff editor.
	 */
	leftResource: URI;

	/**
	 * The right hand side URI to open inside a diff editor.
	 */
	rightResource: URI;
}

export interface IResourceSideBySideInput extends IBaseResourceInput {

	/**
	 * The right hand side URI to open inside a side by side editor.
	 */
	masterResource: URI;

	/**
	 * The left hand side URI to open inside a side by side editor.
	 */
	detailResource: URI;
}

export interface IEditorControl {

}

export interface IEditor {

	/**
	 * The assigned input of this editor.
	 */
	input: IEditorInput;

	/**
	 * The assigned options of this editor.
	 */
	options: IEditorOptions;

	/**
	 * The assigned position of this editor.
	 */
	position: Position;

	/**
	 * Returns the unique identifier of this editor.
	 */
	getId(): string;

	/**
	 * Returns the underlying control of this editor.
	 */
	getControl(): IEditorControl;

	/**
	 * Asks the underlying control to focus.
	 */
	focus(): void;

	/**
	 * Finds out if this editor is visible or not.
	 */
	isVisible(): boolean;
}

/**
 * Possible locations for opening an editor.
 */
export enum Position {

	/** Opens the editor in the first position replacing the input currently showing */
	ONE = 0,

	/** Opens the editor in the second position replacing the input currently showing */
	TWO = 1,

	/** Opens the editor in the third most position replacing the input currently showing */
	THREE = 2
}

export const POSITIONS = [Position.ONE, Position.TWO, Position.THREE];

export enum Direction {
	LEFT,
	RIGHT
}

export interface IEditorInput extends IDisposable {

	onDispose: Event<void>;

	/**
	 * Returns the display name of this input.
	 */
	getName(): string;

	/**
	 * Returns the display description of this input.
	 */
	getDescription(verbose?: boolean): string;

	/**
	 * Resolves the input.
	 */
	resolve(): TPromise<IEditorModel>;

	/**
	 * Returns if this input is dirty or not.
	 */
	isDirty(): boolean;

	/**
	 * Returns if the other object matches this input.
	 */
	matches(other: any): boolean;
}

export interface IEditorOptions {

	/**
	 * Tells the editor to not receive keyboard focus when the editor is being opened. By default,
	 * the editor will receive keyboard focus on open.
	 */
	preserveFocus?: boolean;

	/**
	 * Tells the editor to replace the editor input in the editor even if it is identical to the one
	 * already showing. By default, the editor will not replace the input if it is identical to the
	 * one showing.
	 */
	forceOpen?: boolean;

	/**
	 * Will reveal the editor if it is already opened and visible in any of the opened editor groups.
	 */
	revealIfVisible?: boolean;

	/**
	 * An editor that is pinned remains in the editor stack even when another editor is being opened.
	 * An editor that is not pinned will always get replaced by another editor that is not pinned.
	 */
	pinned?: boolean;

	/**
	 * The index in the document stack where to insert the editor into when opening.
	 */
	index?: number;

	/**
	 * An active editor that is opened will show its contents directly. Set to true to open an editor
	 * in the background.
	 */
	inactive?: boolean;
}

export interface ITextEditorOptions extends IEditorOptions {

	/**
	 * Text editor selection.
	 */
	selection?: {
		startLineNumber: number;
		startColumn: number;
		endLineNumber?: number;
		endColumn?: number;
	};

	/**
	 * Text editor view state.
	 */
	viewState?: IEditorViewState;

	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
	 */
	revealInCenterIfOutsideViewport?: boolean;
}