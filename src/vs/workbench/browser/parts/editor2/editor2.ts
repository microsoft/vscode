/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { GroupIdentifier } from 'vs/workbench/common/editor';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { INextEditorGroup } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IView } from 'vs/base/browser/ui/grid/gridview';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Dimension } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';

export interface IGroupsAccessor {
	readonly groups: INextEditorGroupView[];
	readonly activeGroup: INextEditorGroupView;

	getGroup(identifier: GroupIdentifier): INextEditorGroupView;
}

export interface INextEditorGroupView extends IDisposable, IView, INextEditorGroup {
	readonly group: EditorGroup;
	readonly dimension: Dimension;

	readonly onDidFocus: Event<void>;
	readonly onWillDispose: Event<void>;

	isEmpty(): boolean;
	setActive(isActive: boolean): void;

	shutdown(): void;
}