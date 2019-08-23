/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GroupIdentifier, IWorkbenchEditorConfiguration, EditorOptions, TextEditorOptions, IEditorInput, IEditorIdentifier, IEditorCloseEvent, IEditor, IEditorPartOptions } from 'vs/workbench/common/editor';
import { EditorGroup } from 'vs/workbench/common/editor/editorGroup';
import { IEditorGroup, GroupDirection, IAddGroupOptions, IMergeGroupOptions, GroupsOrder } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Dimension } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { ISerializableView } from 'vs/base/browser/ui/grid/grid';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export const EDITOR_TITLE_HEIGHT = 35;

export interface IEditorPartCreationOptions {
	restorePreviousState: boolean;
}

export const DEFAULT_EDITOR_MIN_DIMENSIONS = new Dimension(220, 70);
export const DEFAULT_EDITOR_MAX_DIMENSIONS = new Dimension(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

export const DEFAULT_EDITOR_PART_OPTIONS: IEditorPartOptions = {
	showTabs: true,
	highlightModifiedTabs: false,
	tabCloseButton: 'right',
	tabSizing: 'fit',
	focusRecentEditorAfterClose: true,
	showIcons: true,
	enablePreview: true,
	openPositioning: 'right',
	openSideBySideDirection: 'right',
	closeEmptyGroups: true,
	labelFormat: 'default',
	iconTheme: 'vs-seti'
};

export function impactsEditorPartOptions(event: IConfigurationChangeEvent): boolean {
	return event.affectsConfiguration('workbench.editor') || event.affectsConfiguration('workbench.iconTheme');
}

export function getEditorPartOptions(config: IWorkbenchEditorConfiguration): IEditorPartOptions {
	const options: IEditorPartOptions = assign(Object.create(null), DEFAULT_EDITOR_PART_OPTIONS);

	if (!config || !config.workbench) {
		return options;
	}

	if (typeof config.workbench.iconTheme === 'string') {
		options.iconTheme = config.workbench.iconTheme;
	}

	if (config.workbench.editor) {
		assign(options, config.workbench.editor);
	}

	return options;
}

export interface IEditorPartOptionsChangeEvent {
	oldPartOptions: IEditorPartOptions;
	newPartOptions: IEditorPartOptions;
}

export interface IEditorOpeningEvent extends IEditorIdentifier {
	options?: IEditorOptions;

	/**
	 * Allows to prevent the opening of an editor by providing a callback
	 * that will be executed instead. By returning another editor promise
	 * it is possible to override the opening with another editor. It is ok
	 * to return a promise that resolves to `undefined` to prevent the opening
	 * alltogether.
	 */
	prevent(callback: () => undefined | Promise<IEditor | undefined>): void;
}

export interface IEditorGroupsAccessor {

	readonly groups: IEditorGroupView[];
	readonly activeGroup: IEditorGroupView;

	readonly partOptions: IEditorPartOptions;
	readonly onDidEditorPartOptionsChange: Event<IEditorPartOptionsChangeEvent>;

	readonly onDidVisibilityChange: Event<boolean>;

	getGroup(identifier: GroupIdentifier): IEditorGroupView | undefined;
	getGroups(order: GroupsOrder): IEditorGroupView[];

	activateGroup(identifier: IEditorGroupView | GroupIdentifier): IEditorGroupView;

	addGroup(location: IEditorGroupView | GroupIdentifier, direction: GroupDirection, options?: IAddGroupOptions): IEditorGroupView;
	mergeGroup(group: IEditorGroupView | GroupIdentifier, target: IEditorGroupView | GroupIdentifier, options?: IMergeGroupOptions): IEditorGroupView;

	moveGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView;
	copyGroup(group: IEditorGroupView | GroupIdentifier, location: IEditorGroupView | GroupIdentifier, direction: GroupDirection): IEditorGroupView;

	removeGroup(group: IEditorGroupView | GroupIdentifier): void;
}

export interface IEditorGroupView extends IDisposable, ISerializableView, IEditorGroup {
	readonly group: EditorGroup;
	readonly whenRestored: Promise<void>;
	readonly disposed: boolean;

	readonly isEmpty: boolean;
	readonly isMinimized: boolean;

	readonly onDidFocus: Event<void>;
	readonly onWillDispose: Event<void>;
	readonly onWillOpenEditor: Event<IEditorOpeningEvent>;
	readonly onDidOpenEditorFail: Event<IEditorInput>;
	readonly onWillCloseEditor: Event<IEditorCloseEvent>;
	readonly onDidCloseEditor: Event<IEditorCloseEvent>;

	setActive(isActive: boolean): void;

	notifyIndexChanged(newIndex: number): void;

	relayout(): void;
}

export function getActiveTextEditorOptions(group: IEditorGroup, expectedActiveEditor?: IEditorInput, presetOptions?: EditorOptions): EditorOptions {
	const activeGroupCodeEditor = group.activeControl ? getCodeEditor(group.activeControl.getControl()) : undefined;
	if (activeGroupCodeEditor) {
		if (!expectedActiveEditor || expectedActiveEditor.matches(group.activeEditor)) {
			return TextEditorOptions.fromEditor(activeGroupCodeEditor, presetOptions);
		}
	}

	return presetOptions || new EditorOptions();
}

/**
 * A sub-interface of IEditorService to hide some workbench-core specific
 * events from clients.
 */
export interface EditorServiceImpl extends IEditorService {

	/**
	 * Emitted when an editor is closed.
	 */
	readonly onDidCloseEditor: Event<IEditorCloseEvent>;

	/**
	 * Emitted when an editor failed to open.
	 */
	readonly onDidOpenEditorFail: Event<IEditorIdentifier>;
}
