/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { GroupIdentifier, IWorkbenchEditorConfiguration, IWorkbenchEditorPartConfiguration, EditorOptions, TextEditorOptions } from 'vs/workbench/common/editor';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { INextEditorGroup, GroupDirection } from 'vs/workbench/services/group/common/nextEditorGroupsService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Dimension } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { ISerializableView } from 'vs/base/browser/ui/grid/grid';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { IEditorInput } from 'vs/platform/editor/common/editor';

export const EDITOR_TITLE_HEIGHT = 35;

export const EDITOR_MIN_DIMENSIONS = new Dimension(170, 70);
export const EDITOR_MAX_DIMENSIONS = new Dimension(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

export interface INextEditorPartOptions extends IWorkbenchEditorPartConfiguration {
	iconTheme?: string;
}

export const DEFAULT_EDITOR_PART_OPTIONS: INextEditorPartOptions = {
	showTabs: true,
	tabCloseButton: 'right',
	tabSizing: 'fit',
	showIcons: true,
	enablePreview: true,
	labelFormat: 'default',
	iconTheme: 'vs-seti',
	revealIfOpen: false
};

export function impactsEditorPartOptions(event: IConfigurationChangeEvent): boolean {
	return event.affectsConfiguration('workbench.editor') || event.affectsConfiguration('workbench.iconTheme');
}

export function getEditorPartOptions(config: IWorkbenchEditorConfiguration): INextEditorPartOptions {
	const options: INextEditorPartOptions = assign(Object.create(null), DEFAULT_EDITOR_PART_OPTIONS);

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

export interface INextEditorPartOptionsChangeEvent {
	oldPartOptions: INextEditorPartOptions;
	newPartOptions: INextEditorPartOptions;
}

export interface INextEditorGroupsAccessor {
	readonly groups: INextEditorGroupView[];
	readonly activeGroup: INextEditorGroupView;

	readonly partOptions: INextEditorPartOptions;
	readonly onDidEditorPartOptionsChange: Event<INextEditorPartOptionsChangeEvent>;

	getGroup(identifier: GroupIdentifier): INextEditorGroupView;

	addGroup(location: INextEditorGroupView | GroupIdentifier, direction: GroupDirection, copyGroup?: boolean): INextEditorGroup;
}

export interface INextEditorGroupView extends IDisposable, ISerializableView, INextEditorGroup {
	readonly group: EditorGroup;
	readonly dimension: Dimension;
	readonly whenRestored: Thenable<void>;

	readonly onDidFocus: Event<void>;
	readonly onWillDispose: Event<void>;

	isEmpty(): boolean;
	setActive(isActive: boolean): void;

	shutdown(): void;
}

export function getActiveTextEditorOptions(group: INextEditorGroup, expectedActiveEditor?: IEditorInput, presetOptions?: EditorOptions): EditorOptions {
	const activeGroupControl = getCodeEditor(group.activeControl);
	if (activeGroupControl) {
		if (!expectedActiveEditor || expectedActiveEditor.matches(group.activeEditor)) {
			return TextEditorOptions.fromEditor(activeGroupControl, presetOptions);
		}
	}

	return presetOptions || new EditorOptions();
}