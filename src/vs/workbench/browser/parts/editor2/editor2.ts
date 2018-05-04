/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { GroupIdentifier, IWorkbenchEditorConfiguration, IWorkbenchEditorPartConfiguration } from 'vs/workbench/common/editor';
import { EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { INextEditorGroup } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { IView } from 'vs/base/browser/ui/grid/gridview';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Dimension } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';

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
	let options: INextEditorPartOptions = assign(Object.create(null), DEFAULT_EDITOR_PART_OPTIONS);

	if (!config || !config.workbench) {
		return options;
	}

	if (typeof config.workbench.iconTheme === 'string') {
		options.iconTheme = config.workbench.iconTheme;
	}

	if (config.workbench.editor) {
		options = assign(options, config.workbench.editor);
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