/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator, ServiceIdentifier, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput, IResourceInput, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditor, IEditorOptions } from 'vs/platform/editor/common/editor';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { Event } from 'vs/base/common/event';
import { IEditor as ICodeEditor } from 'vs/editor/common/editorCommon';

export const INextEditorService = createDecorator<INextEditorService>('nextEditorService');

export type IResourceEditor = IResourceInput | IUntitledResourceInput | IResourceDiffInput | IResourceSideBySideInput;

export const SIDE_BY_SIDE_VALUE = -1;
export type SIDE_BY_SIDE = typeof SIDE_BY_SIDE_VALUE;

export interface IEditorInputWithOptions {
	editor: IEditorInput;
	options?: IEditorOptions;
}

export interface INextEditorService {
	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Emitted when the current active editor changes.
	 */
	readonly onDidActiveEditorChange: Event<void>;

	/**
	 * Emitted when the set of currently visible editors changes.
	 */
	readonly onDidVisibleEditorsChange: Event<void>;

	/**
	 * Emitted when an editor is closed.
	 */
	readonly onDidCloseEditor: Event<IEditorInput>;

	/**
	 * The currently active editor control if any.
	 */
	readonly activeControl: IEditor;

	/**
	 * The currently active text editor control if there is a control active
	 * and it is an instance of the code text editor.
	 */
	readonly activeTextEditorControl: ICodeEditor;

	/**
	 * The currently active editor if any.
	 */
	readonly activeEditor: IEditorInput;

	/**
	 * All controls that are currently visible across all editor groups.
	 */
	readonly visibleControls: ReadonlyArray<IEditor>;

	/**
	 * All editors that are currently visible across all editor groups.
	 */
	readonly visibleEditors: ReadonlyArray<IEditorInput>;

	/**
	 * Open an editor in an editor group.
	 *
	 * @param editor the editor to open
	 * @param options the options to use for the editor
	 * @param group the target group. If unspecified, the editor will open in the currently
	 * active group. Use `SIDE_BY_SIDE` to open the editor in a new editor group to the side
	 * of the currently active group.
	 */
	openEditor(editor: IEditorInput, options?: IEditorOptions, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;

	/**
	 * Open an editor in an editor group.
	 *
	 * @param editor the editor to open
	 * @param group the target group. If unspecified, the editor will open in the currently
	 * active group. Use `SIDE_BY_SIDE` to open the editor in a new editor group to the side
	 * of the currently active group.
	 */
	openEditor(editor: IResourceEditor, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;

	/**
	 * Open editors in an editor group.
	 *
	 * @param editors the editors to open with associated options
	 * @param group the target group. If unspecified, the editor will open in the currently
	 * active group. Use `SIDE_BY_SIDE` to open the editor in a new editor group to the side
	 * of the currently active group.
	 */
	openEditors(editors: IEditorInputWithOptions[], group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;
	openEditors(editors: IResourceEditor[], group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;

	/**
	 * Find out if the provided editor (or resource of an editor) is opened in any group.
	 *
	 * Note: An editor can be opened but not actively visible.
	 */
	isOpen(editor: IEditorInput | IResourceInput | IUntitledResourceInput): boolean;

	/**
	 * Invoke a function in the context of the services of the active editor.
	 */
	invokeWithinEditorContext<T>(fn: (accessor: ServicesAccessor) => T): T;

	/**
	 * Converts a lightweight input to a workbench editor input.
	 */
	createInput(input: IResourceEditor): IEditorInput;
}