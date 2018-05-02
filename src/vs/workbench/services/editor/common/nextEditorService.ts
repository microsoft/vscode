/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput, IResourceInput, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditor, IEditorOptions } from 'vs/platform/editor/common/editor';
import { GroupIdentifier } from 'vs/workbench/common/editor';

export const INextEditorService = createDecorator<INextEditorService>('nextEditorService');

export type IResourceEditor = IResourceInput | IUntitledResourceInput | IResourceDiffInput | IResourceSideBySideInput;

export const SIDE_BY_SIDE_VALUE = -1;
export type SIDE_BY_SIDE = typeof SIDE_BY_SIDE_VALUE;

// TODO@grid this should provide convinience methods on top of INextEditorGroupsService to make the 99%
// case of opening editors as simple as possible
// Candidates:
// - getVisibleEditors (text only?)
export interface INextEditorService {
	_serviceBrand: ServiceIdentifier<any>;

	// TODO@grid think about a better return type, is the IEditor needed always? Should it be ITextEditor?
	openEditor(editor: IEditorInput, options?: IEditorOptions, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;
	openEditor(editor: IResourceEditor, group?: GroupIdentifier | SIDE_BY_SIDE): Thenable<IEditor>;

	createInput(input: IResourceEditor): IEditorInput;
}