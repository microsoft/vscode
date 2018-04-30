/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event } from 'vs/base/common/event';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { GroupIdentifier, IEditorOpeningEvent } from 'vs/workbench/common/editor';
import { IEditorInput, IEditor, IEditorOptions } from 'vs/platform/editor/common/editor';

export const INextEditorGroupsService = createDecorator<INextEditorGroupsService>('nextEditorGroupsService');

export enum Direction {
	UP,
	DOWN,
	LEFT,
	RIGHT
}

export interface INextEditorGroup {

	readonly onDidActiveEditorChange: Event<IEditorInput>;
	readonly onWillOpenEditor: Event<IEditorOpeningEvent>;
	readonly onDidOpenEditorFail: Event<IEditorInput>;

	readonly id: GroupIdentifier;

	readonly activeControl: IEditor;
	readonly activeEditor: IEditorInput;

	openEditor(editor: IEditorInput, options?: IEditorOptions): Thenable<void>;

	/**
	 * Close an editor from the group. This may trigger a confirmation dialog if
	 * the editor is dirty and thus returns a promise as value.
	 *
	 * @param editor the editor to close, or the currently active editor
	 * if unspecified.
	 *
	 * @returns a promise when the editor is closed.
	 */
	closeEditor(editor?: IEditorInput): Thenable<void>;

	focusActiveEditor(): void;

	/**
	 * Set an editor to be pinned. A pinned editor is not replaced
	 * when another editor opens at the same location.
	 *
	 * @param editor the editor to pin, or the currently active editor
	 * if unspecified.
	 */
	pinEditor(editor?: IEditorInput): void;
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
	removeGroup(group: INextEditorGroup | GroupIdentifier): void;
}