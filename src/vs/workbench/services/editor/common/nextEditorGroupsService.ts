/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event } from 'vs/base/common/event';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { GroupIdentifier } from 'vs/workbench/common/editor';
import { IEditorInput, IEditor, IEditorOptions } from 'vs/platform/editor/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';

export const INextEditorGroupsService = createDecorator<INextEditorGroupsService>('nextEditorGroupsService');

export interface IOpenEditorResult {
	editor: IEditor;
	whenInputSet: TPromise<boolean /* input changed */>;
}

export enum Direction {
	UP,
	DOWN,
	LEFT,
	RIGHT
}

export interface INextEditorGroup {

	readonly id: GroupIdentifier;
	readonly activeEditor: IEditor;

	openEditor(input: IEditorInput, options?: IEditorOptions): IOpenEditorResult;

	focusEditor(): void;
}

export interface INextEditorGroupsService {

	_serviceBrand: ServiceIdentifier<any>;

	readonly onDidActiveGroupChange: Event<INextEditorGroup>;

	readonly activeGroup: INextEditorGroup;
	readonly groups: INextEditorGroup[];

	getGroup(identifier: GroupIdentifier): INextEditorGroup;

	isGroupActive(group: INextEditorGroup | GroupIdentifier): boolean;
	setGroupActive(group: INextEditorGroup | GroupIdentifier): INextEditorGroup;

	addGroup(fromGroup: INextEditorGroup | GroupIdentifier, direction: Direction): INextEditorGroup;
}