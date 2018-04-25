/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { IEditorInput, IEditor, IEditorOptions } from 'vs/platform/editor/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';

export const INextEditorPartService = createDecorator<INextEditorPartService>('nextEditorPartService');

export interface INextEditor {
	editor: IEditor;
	whenInputSet: TPromise<void>;
}

export enum SplitDirection {
	UP,
	DOWN,
	LEFT,
	RIGHT
}

export interface INextEditorGroup {

	readonly id: GroupIdentifier;

	openEditor(input: IEditorInput, options?: IEditorOptions): INextEditor;

	splitGroup(direction: SplitDirection): INextEditorGroup;
}

export interface INextEditorPartService {

	_serviceBrand: ServiceIdentifier<any>;

	readonly activeGroup: INextEditorGroup;
	readonly groups: INextEditorGroup[];

	// addGroup(group: GroupIdentifier, direction: SplitDirection): INextEditorGroup;

	getGroup(identifier: GroupIdentifier): INextEditorGroup;
}