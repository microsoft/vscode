/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService, IEditor, IEditorInput, IEditorOptions, ITextEditorOptions, Position, Direction, IResourceInput, IResourceDiffInput, IResourceSideBySideInput } from 'vs/platform/editor/common/editor';

export const IWorkbenchEditorService = createDecorator<IWorkbenchEditorService>('editorService');

export type IResourceInputType = IResourceInput | IResourceDiffInput | IResourceSideBySideInput;

/**
 * The editor service allows to open editors and work on the active
 * editor input and models.
 */
export interface IWorkbenchEditorService extends IEditorService {
	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Returns the currently active editor or null if none.
	 */
	getActiveEditor(): IEditor;

	/**
	 * Returns the currently active editor input or null if none.
	 */
	getActiveEditorInput(): IEditorInput;

	/**
	 * Returns an array of visible editors.
	 */
	getVisibleEditors(): IEditor[];

	/**
	 * Returns iff the provided input is currently visible.
	 *
	 * @param includeDiff iff set to true, will also consider diff editors to find out if the provided
	 * input is opened either on the left or right hand side of the diff editor.
	 */
	isVisible(input: IEditorInput, includeDiff: boolean): boolean;

	/**
	 * Opens an Editor on the given input with the provided options at the given position. If sideBySide parameter
	 * is provided, causes the editor service to decide in what position to open the input.
	 */
	openEditor(input: IEditorInput, options?: IEditorOptions | ITextEditorOptions, position?: Position): TPromise<IEditor>;
	openEditor(input: IEditorInput, options?: IEditorOptions | ITextEditorOptions, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Specific overload to open an instance of IResourceInput, IResourceDiffInput or IResourceSideBySideInput.
	 */
	openEditor(input: IResourceInputType, position?: Position): TPromise<IEditor>;
	openEditor(input: IResourceInputType, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Similar to #openEditor() but allows to open multiple editors for different positions at the same time. If there are
	 * more than one editor per position, only the first one will be active and the others stacked behind inactive.
	 */
	openEditors(editors: { input: IResourceInputType, position: Position }[]): TPromise<IEditor[]>;
	openEditors(editors: { input: IEditorInput, position: Position, options?: IEditorOptions | ITextEditorOptions }[]): TPromise<IEditor[]>;

	/**
	 * Given a list of editors to replace, will look across all groups where this editor is open (active or hidden)
	 * and replace it with the new editor and the provied options.
	 */
	replaceEditors(editors: { toReplace: IResourceInputType, replaceWith: IResourceInputType }[], position?: Position): TPromise<IEditor[]>;
	replaceEditors(editors: { toReplace: IEditorInput, replaceWith: IEditorInput, options?: IEditorOptions | ITextEditorOptions }[], position?: Position): TPromise<IEditor[]>;

	/**
	 * Closes the editor at the provided position.
	 */
	closeEditor(position: Position, input: IEditorInput): TPromise<void>;

	/**
	 * Closes editors of a specific group at the provided position. If the optional editor is provided to exclude, it
	 * will not be closed. The direction can be used in that case to control if all other editors should get closed,
	 * or towards a specific direction.
	 */
	closeEditors(position: Position, except?: IEditorInput, direction?: Direction): TPromise<void>;

	/**
	 * Closes all editors across all groups. The optional position allows to keep one group alive.
	 */
	closeAllEditors(except?: Position): TPromise<void>;

	/**
	 * Allows to resolve an untyped input to a workbench typed instanceof editor input
	 */
	createInput(input: IResourceInputType): TPromise<IEditorInput>;
}