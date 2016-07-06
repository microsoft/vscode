/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {Position, IEditorInput} from 'vs/platform/editor/common/editor';
import {IEditorStacksModel, IEditorGroup} from 'vs/workbench/common/editor';
import Event from 'vs/base/common/event';
import {EditorInputEvent} from 'vs/workbench/common/editor';

export enum GroupArrangement {
	MINIMIZE_OTHERS,
	EVEN_WIDTH
}

export var IEditorGroupService = createDecorator<IEditorGroupService>('editorGroupService');

/**
 * The editor service allows to open editors and work on the active
 * editor input and models.
 */
export interface IEditorGroupService {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Emitted when editors or inputs change. Examples: opening, closing of editors. Active editor change.
	 */
	onEditorsChanged: Event<void>;

	/**
	 * Emitted when an editor is about to open.
	 */
	onEditorOpening: Event<EditorInputEvent>;

	/**
	 * Emitted when opening an editor fails.
	 */
	onEditorOpenFail: Event<IEditorInput>;

	/**
	 * Emitted when a editors are moved to another position.
	 */
	onEditorsMoved: Event<void>;

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
	 * Adds the pinned state to an editor, removing it from being a preview editor.
	 */
	pinEditor(group: IEditorGroup, input: IEditorInput): void;
	pinEditor(position: Position, input: IEditorInput): void;

	/**
	 * Removes the pinned state of an editor making it a preview editor.
	 */
	unpinEditor(group: IEditorGroup, input: IEditorInput): void;
	unpinEditor(position: Position, input: IEditorInput): void;

	/**
	 * Moves an editor from one group to another. The index in the group is optional.
	 */
	moveEditor(input: IEditorInput, from: IEditorGroup, to: IEditorGroup, index?: number): void;
	moveEditor(input: IEditorInput, from: Position, to: Position, index?: number): void;

	/**
	 * Provides access to the editor stacks model
	 */
	getStacksModel(): IEditorStacksModel;
}