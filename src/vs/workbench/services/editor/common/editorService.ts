/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {IEditorService, IEditor, IEditorInput, IEditorOptions, Position, IResourceInput, IEditorModel, ITextEditorModel} from 'vs/platform/editor/common/editor';

export enum EditorArrangement {
	MINIMIZE_OTHERS,
	EVEN_WIDTH
}

export var IWorkbenchEditorService = createDecorator<IWorkbenchEditorService>('editorService');

/**
 * The editor service allows to open editors and work on the active
 * editor input and models.
 */
export interface IWorkbenchEditorService extends IEditorService {
	serviceId : ServiceIdentifier<any>;

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
	 * Opens an Editor on the given input with the provided options at the given position. If the input parameter
	 * is null, will cause the currently opened editor at the position to close. If sideBySide parameter is provided,
	 * causes the editor service to decide in what position to open the input.
	 */
	openEditor(input: IEditorInput, options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	openEditor(input: IEditorInput, options?: IEditorOptions, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Specific overload to open an instance of IResourceInput.
	 */
	openEditor(input: IResourceInput, position?: Position): TPromise<IEditor>;
	openEditor(input: IResourceInput, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Opens the set of inputs replacing any other editor that is currently open. Use #openEditor() instead to open
	 * a single editor.
	 */
	setEditors(inputs: IEditorInput[]): TPromise<IEditor[]>;
	setEditors(inputs: IResourceInput[]): TPromise<IEditor[]>;

	/**
	 * Closes the editor at the provided position. If position is not provided, the current active editor is closed.
	 */
	closeEditor(editor?: IEditor): TPromise<IEditor>;
	closeEditor(position?: Position): TPromise<IEditor>;

	/**
	 * Closes all editors or only others that are not active.
	 */
	closeEditors(othersOnly?: boolean): TPromise<void>;

	/**
	 * Focus the editor at the provided position. If position is not provided, the current active editor is focused.
	 */
	focusEditor(editor?: IEditor): TPromise<IEditor>;
	focusEditor(position?: Position): TPromise<IEditor>;

	/**
	 * Activate the editor at the provided position without moving focus.
	 */
	activateEditor(editor: IEditor): void;
	activateEditor(position: Position): void;

	/**
	 * Allows to move the editor at position 1 to position 2.
	 */
	moveEditor(from: Position, to: Position): void;

	/**
	 * Allows to arrange editors according to the EditorArrangement enumeration.
	 */
	arrangeEditors(arrangement: EditorArrangement): void;

	/**
	 * Resolves an input to its model representation. The optional parameter refresh allows to specify
	 * if a cached model should be returned (false) or a new version (true). The default is returning a
	 * cached version.
	 */
	resolveEditorModel(input: IEditorInput, refresh?: boolean): TPromise<IEditorModel>;

	/**
	 * Specific overload to resolve a IResourceInput to an editor model with a text representation.
	 */
	resolveEditorModel(input: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel>;

	/**
	 * Allows to resolve an untyped input to a workbench typed instanceof editor input
	 */
	inputToType(input: IResourceInput): TPromise<IEditorInput>;
}