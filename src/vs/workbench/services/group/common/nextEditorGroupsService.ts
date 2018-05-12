/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event } from 'vs/base/common/event';
import { createDecorator, ServiceIdentifier, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { GroupIdentifier, IEditorOpeningEvent, IEditorInputWithOptions } from 'vs/workbench/common/editor';
import { IEditorInput, IEditor, IEditorOptions, Direction } from 'vs/platform/editor/common/editor';

export const INextEditorGroupsService = createDecorator<INextEditorGroupsService>('nextEditorGroupsService');

export enum GroupDirection {
	UP,
	DOWN,
	LEFT,
	RIGHT
}

export enum GroupOrientation {
	HORIZONTAL,
	VERTICAL
}

export enum GroupsArrangement {

	/**
	 * Make the current active group consume the maximum
	 * amount of space possible.
	 */
	MINIMIZE_OTHERS,

	/**
	 * Size all groups evenly.
	 */
	EVEN
}

export interface IMoveEditorOptions {
	index?: number;
	inactive?: boolean;
	preserveFocus?: boolean;
}

export interface ICopyEditorOptions extends IMoveEditorOptions { }

export interface IAddGroupOptions {
	activate?: boolean;
	copyGroup?: boolean;
}

export enum MergeGroupMode {
	COPY_EDITORS,
	MOVE_EDITORS_REMOVE_GROUP,
	MOVE_EDITORS_KEEP_GROUP
}

export interface IMergeGroupOptions {
	mode?: MergeGroupMode;
}

export type ICloseEditorsFilter = {
	except?: IEditorInput,
	direction?: Direction,
	savedOnly?: boolean
};

export interface IEditorReplacement {
	editor: IEditorInput;
	replacement: IEditorInput;
	options?: IEditorOptions;
}

export enum GroupsOrder {
	MOST_RECENTLY_ACTIVE,
	GRID_ORDER
}

export interface INextEditorGroupsService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * An event for when the active editor group changes. The active editor
	 * group is the default location for new editors to open.
	 */
	readonly onDidActiveGroupChange: Event<INextEditorGroup>;

	/**
	 * An event for when a new group was added.
	 */
	readonly onDidAddGroup: Event<INextEditorGroup>;

	/**
	 * An event for when a group was removed.
	 */
	readonly onDidRemoveGroup: Event<INextEditorGroup>;

	/**
	 * An event for when a group was moved.
	 */
	readonly onDidMoveGroup: Event<INextEditorGroup>;

	/**
	 * An active group is the default location for new editors to open.
	 */
	readonly activeGroup: INextEditorGroup;

	/**
	 * All groups that are currently visible in the editor area.
	 */
	readonly groups: ReadonlyArray<INextEditorGroup>;

	/**
	 * The number of editor groups that are currently opened.
	 */
	readonly count: number;

	/**
	 * The current layout orientation of the root group.
	 */
	readonly orientation: GroupOrientation;

	/**
	 * Get all groups that are currently visible in the editor area optionally
	 * sorted by being most recent active or grid order.
	 */
	getGroups(order?: GroupsOrder): ReadonlyArray<INextEditorGroup>;

	/**
	 * Allows to convert a group identifier to a group.
	 */
	getGroup(identifier: GroupIdentifier): INextEditorGroup;

	/**
	 * Move keyboard focus into the provided group.
	 */
	focusGroup(group: INextEditorGroup | GroupIdentifier): INextEditorGroup;

	/**
	 * Set a group as active. An active group is the default location for new editors to open.
	 */
	activateGroup(group: INextEditorGroup | GroupIdentifier): INextEditorGroup;

	/**
	 * Resize the group given the provided size delta.
	 */
	resizeGroup(group: INextEditorGroup | GroupIdentifier, sizeDelta: number): INextEditorGroup;

	/**
	 * Arrange all groups according to the provided arrangement.
	 */
	arrangeGroups(arrangement: GroupsArrangement): void;

	/**
	 * Sets the orientation of the root group to be either vertical or horizontal.
	 */
	setGroupOrientation(orientation: GroupOrientation): void;

	/**
	 * Add a new group to the editor area. A new group is added by splitting a provided one in
	 * one of the four directions.
	 *
	 * @param location the group from which to split to add a new group
	 * @param direction the direction of where to split to
	 * @param options configure the newly group with options
	 */
	addGroup(location: INextEditorGroup | GroupIdentifier, direction: GroupDirection, options?: IAddGroupOptions): INextEditorGroup;

	/**
	 * Remove a group from the editor area.
	 */
	removeGroup(group: INextEditorGroup | GroupIdentifier): void;

	/**
	 * Move a group to a new group in the editor area.
	 *
	 * @param group the group to move
	 * @param location the group from which to split to add the moved group
	 * @param direction the direction of where to split to
	 */
	moveGroup(group: INextEditorGroup | GroupIdentifier, location: INextEditorGroup | GroupIdentifier, direction: GroupDirection): INextEditorGroup;

	/**
	 * Merge the editors of a group into a target group. By default, all editors will
	 * move and the source group will close. This behaviour can be configured via the
	 * `IMergeGroupOptions` options.
	 *
	 * @param group the group to merge
	 * @param target the target group to merge into
	 * @param options controls how the merge should be performed. by default all editors
	 * will be moved over to the target and the source group will close. Configure to
	 * `MOVE_EDITORS_KEEP_GROUP` to prevent the source group from closing. Set to
	 * `COPY_EDITORS` to copy the editors into the target instead of moding them.
	 */
	mergeGroup(group: INextEditorGroup | GroupIdentifier, target: INextEditorGroup | GroupIdentifier, options?: IMergeGroupOptions): INextEditorGroup;

	/**
	 * Copy a group to a new group in the editor area.
	 *
	 * @param group the group to copy
	 * @param location the group from which to split to add the copied group
	 * @param direction the direction of where to split to
	 */
	copyGroup(group: INextEditorGroup | GroupIdentifier, location: INextEditorGroup | GroupIdentifier, direction: GroupDirection): INextEditorGroup;
}

export interface INextEditorGroup {

	/**
	 * A unique identifier of this group that remains identical even if the
	 * group is moved to different locations.
	 */
	readonly id: GroupIdentifier;

	/**
	 * The active control is the currently visible control of the group.
	 */
	readonly activeControl: IEditor;

	/**
	 * The active editor is the currently visible editor of the group
	 * within the current active control.
	 */
	readonly activeEditor: IEditorInput;

	/**
	 * The number of opend editors in this group.
	 */
	readonly count: number;

	/**
	 * All opened editors in the group. There can only be one editor active.
	 */
	readonly editors: ReadonlyArray<IEditorInput>;

	/**
	 * Emitted when this group is being disposed.
	 */
	readonly onWillDispose: Event<void>;

	/**
	 * Emitted when the active editor of this group changed.
	 */
	readonly onDidActiveEditorChange: Event<void>;

	/**
	 * Emitted when an editor of this group is closed.
	 */
	readonly onDidCloseEditor: Event<IEditorInput>;

	/**
	 * Emitted when an editor is about to open. This can be prevented from
	 * the provided event.
	 */
	readonly onWillOpenEditor: Event<IEditorOpeningEvent>;

	/**
	 * Emitted when an editor failed to open.
	 */
	readonly onDidOpenEditorFail: Event<IEditorInput>;

	/**
	 * Returns the editor at a specific index of the group.
	 */
	getEditor(index: number): IEditorInput;

	/**
	 * Returns the index of the editor in the group or -1 if not opened.
	 */
	getIndexOfEditor(editor: IEditorInput): number;

	/**
	 * Open an editor in this group.
	 *
	 * @returns a promise that is resolved when the active editor (if any)
	 * has finished loading
	 */
	openEditor(editor: IEditorInput, options?: IEditorOptions): Thenable<void>;

	/**
	 * Opens editors in this group.
	 *
	 * @returns a promise that is resolved when the active editor (if any)
	 * has finished loading
	 */
	openEditors(editors: IEditorInputWithOptions[]): Thenable<void>;

	/**
	 * Find out if the provided editor is opened in the group.
	 *
	 * Note: An editor can be opened but not actively visible.
	 */
	isOpened(editor: IEditorInput): boolean;

	/**
	 * Find out if the provided editor is pinned in the group.
	 */
	isPinned(editor: IEditorInput): boolean;

	/**
	 * Find out if the provided editor is active in the group.
	 */
	isActive(editor: IEditorInput): boolean;

	/**
	 * Move an editor from this group either within this group or to another group.
	 */
	moveEditor(editor: IEditorInput, target: INextEditorGroup, options?: IMoveEditorOptions): void;

	/**
	 * Copy an editor from this group to another group.
	 *
	 * Note: It is currently not supported to show the same editor more than once in the same group.
	 */
	copyEditor(editor: IEditorInput, target: INextEditorGroup, options?: ICopyEditorOptions): void;

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

	/**
	 * Closes specific editors in this group. This may trigger a confirmation dialog if
	 * there are dirty editors and thus returns a promise as value.
	 *
	 * @returns a promise when all editors are closed.
	 */
	closeEditors(editors: IEditorInput[] | ICloseEditorsFilter): Thenable<void>;

	/**
	 * Closes all editors from the group. This may trigger a confirmation dialog if
	 * there are dirty editors and thus returns a promise as value.
	 *
	 * @returns a promise when all editors are closed.
	 */
	closeAllEditors(): Thenable<void>;

	/**
	 * Replaces editors in this group with the provided replacement.
	 *
	 * @param editors the editors to replace
	 *
	 * @returns a promise that is resolved when the replaced active
	 * editor (if any) has finished loading.
	 */
	replaceEditors(editors: IEditorReplacement[]): Thenable<void>;

	/**
	 * Set an editor to be pinned. A pinned editor is not replaced
	 * when another editor opens at the same location.
	 *
	 * @param editor the editor to pin, or the currently active editor
	 * if unspecified.
	 */
	pinEditor(editor?: IEditorInput): void;

	/**
	 * Move keyboard focus into the group.
	 */
	focus(): void;

	/**
	 * Invoke a function in the context of the services of this group.
	 */
	invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T;
}