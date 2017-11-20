/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator, ServiceIdentifier, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Position, IEditorInput } from 'vs/platform/editor/common/editor';
import { IEditorStacksModel, IEditorGroup, IEditorOpeningEvent } from 'vs/workbench/common/editor';
import Event from 'vs/base/common/event';

export enum GroupArrangement {
	MINIMIZE_OTHERS,
	EVEN
}

export type GroupOrientation = 'vertical' | 'horizontal';

export const IEditorGroupService = createDecorator<IEditorGroupService>('editorGroupService');

export interface IEditorTabOptions {
	showTabs?: boolean;
	tabCloseButton?: 'left' | 'right' | 'off';
	showIcons?: boolean;
	previewEditors?: boolean;
	labelFormat?: 'default' | 'short' | 'medium' | 'long';
}

export interface IMoveOptions {
	index?: number;
	inactive?: boolean;
	preserveFocus?: boolean;
}

/**
 * The editor service allows to open editors and work on the active
 * editor input and models.
 */
export interface IEditorGroupService {
	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Emitted when editors or inputs change. Examples: opening, closing of editors. Active editor change.
	 */
	onEditorsChanged: Event<void>;

	/**
	 * Emitted when an editor is opening. Allows to prevent/replace the opening via the event method.
	 */
	onEditorOpening: Event<IEditorOpeningEvent>;

	/**
	 * Emitted when opening an editor fails.
	 */
	onEditorOpenFail: Event<IEditorInput>;

	/**
	 * Emitted when an entire editor group is moved to another position.
	 */
	onEditorGroupMoved: Event<void>;

	/**
	 * Emitted when the editor group orientation was changed.
	 */
	onGroupOrientationChanged: Event<void>;

	/**
	 * Emitted when tab options changed.
	 */
	onTabOptionsChanged: Event<IEditorTabOptions>;

	/**
	 * Keyboard focus the editor group at the provided position.
	 */
	focusGroup(group: IEditorGroup): void;
	focusGroup(position: Position): void;

	/**
	 * Activate the editor group at the provided position without moving focus.
	 */
	activateGroup(group: IEditorGroup): void;
	activateGroup(position: Position): void;

	/**
	 * Allows to move the editor group from one position to another.
	 */
	moveGroup(from: IEditorGroup, to: IEditorGroup): void;
	moveGroup(from: Position, to: Position): void;

	/**
	 * Allows to arrange editor groups according to the GroupArrangement enumeration.
	 */
	arrangeGroups(arrangement: GroupArrangement): void;

	/**
	 * Changes the editor group layout between vertical and horizontal orientation. Only applies
	 * if more than one editor is opened.
	 */
	setGroupOrientation(orientation: GroupOrientation): void;

	/**
	 * Returns the current editor group layout.
	 */
	getGroupOrientation(): GroupOrientation;

	/**
	 * Resize visible editor groups
	 */
	resizeGroup(position: Position, groupSizeChange: number): void;

	/**
	 * Adds the pinned state to an editor, removing it from being a preview editor.
	 */
	pinEditor(group: IEditorGroup, input: IEditorInput): void;
	pinEditor(position: Position, input: IEditorInput): void;

	/**
	 * Moves an editor from one group to another. The index in the group is optional.
	 * The inactive option is applied when moving across groups.
	 */
	moveEditor(input: IEditorInput, from: IEditorGroup, to: IEditorGroup, moveOptions?: IMoveOptions): void;
	moveEditor(input: IEditorInput, from: Position, to: Position, moveOptions?: IMoveOptions): void;

	/**
	 * Provides access to the editor stacks model
	 */
	getStacksModel(): IEditorStacksModel;

	/**
	 * Returns tab options.
	 */
	getTabOptions(): IEditorTabOptions;

	/**
	 * Invoke a function in the context of the active editor.
	 */
	invokeWithinEditorContext<T>(fn: (accessor: ServicesAccessor) => T): T;
}