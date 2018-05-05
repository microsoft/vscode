/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput, IResourceInput, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditor, IEditorOptions } from 'vs/platform/editor/common/editor';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { Event } from 'vs/base/common/event';

export const INextEditorService = createDecorator<INextEditorService>('nextEditorService');

export type IResourceEditor = IResourceInput | IUntitledResourceInput | IResourceDiffInput | IResourceSideBySideInput;

export const SIDE_BY_SIDE_VALUE = -1;
export type SIDE_BY_SIDE = typeof SIDE_BY_SIDE_VALUE;

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
	 * The currently active editor control if any.
	 */
	readonly activeControl: IEditor;

	/**
	 * The currently active editor if any.
	 */
	readonly activeEditor: IEditorInput;

	/**
	 * All controls that are currently visible across all editor groups.
	 */
	readonly visibleControls: IEditor[];

	/**
	 * All editors that are currently visible across all editor groups.
	 */
	readonly visibleEditors: IEditorInput[];

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
	 * Converts a lightweight input to a workbench editor input.
	 */
	createInput(input: IResourceEditor): IEditorInput;
}