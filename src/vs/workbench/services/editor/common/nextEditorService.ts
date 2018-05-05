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

	openEditor(editor: IEditorInput, options?: IEditorOptions, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;
	openEditor(editor: IResourceEditor, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;

	createInput(input: IResourceEditor): IEditorInput;
}