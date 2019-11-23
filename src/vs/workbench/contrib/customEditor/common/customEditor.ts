/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput, IEditor, ISaveOptions, IRevertOptions } from 'vs/workbench/common/editor';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopyService';

export const ICustomEditorService = createDecorator<ICustomEditorService>('customEditorService');

export const CONTEXT_HAS_CUSTOM_EDITORS = new RawContextKey<boolean>('hasCustomEditors', false);
export const CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE = new RawContextKey<boolean>('focusedCustomEditorIsEditable', false);

export interface ICustomEditor {
	readonly resource: URI;
	readonly viewType: string;
}

export interface ICustomEditorService {
	_serviceBrand: any;

	readonly models: ICustomEditorModelManager;

	readonly activeCustomEditor: ICustomEditor | undefined;

	getContributedCustomEditors(resource: URI): readonly CustomEditorInfo[];
	getUserConfiguredCustomEditors(resource: URI): readonly CustomEditorInfo[];

	createInput(resource: URI, viewType: string, group: IEditorGroup | undefined, options?: { readonly customClasses: string }): EditorInput;

	openWith(resource: URI, customEditorViewType: string, options?: ITextEditorOptions, group?: IEditorGroup): Promise<IEditor | undefined>;
	promptOpenWith(resource: URI, options?: ITextEditorOptions, group?: IEditorGroup): Promise<IEditor | undefined>;
}

export type CustomEditorEdit = { source?: any, data: any };

export interface ICustomEditorModelManager {
	get(resource: URI, viewType: string): ICustomEditorModel | undefined;

	loadOrCreate(resource: URI, viewType: string): Promise<ICustomEditorModel>;

	disposeModel(model: ICustomEditorModel): void;
}

export interface CustomEditorSaveEvent {
	readonly resource: URI;
	readonly waitUntil: (until: Promise<any>) => void;
}

export interface CustomEditorSaveAsEvent {
	readonly resource: URI;
	readonly targetResource: URI;
	readonly waitUntil: (until: Promise<any>) => void;
}

export interface ICustomEditorModel extends IWorkingCopy {
	readonly onUndo: Event<readonly CustomEditorEdit[]>;
	readonly onApplyEdit: Event<readonly CustomEditorEdit[]>;
	readonly onWillSave: Event<CustomEditorSaveEvent>;
	readonly onWillSaveAs: Event<CustomEditorSaveAsEvent>;

	undo(): void;
	redo(): void;
	revert(options?: IRevertOptions): Promise<boolean>;

	save(options?: ISaveOptions): Promise<boolean>;
	saveAs(resource: URI, targetResource: URI, currentOptions?: ISaveOptions): Promise<boolean>;

	makeEdit(edit: CustomEditorEdit): void;
}

export const enum CustomEditorPriority {
	default = 'default',
	builtin = 'builtin',
	option = 'option',
}

export interface CustomEditorSelector {
	readonly filenamePattern?: string;
}

export interface CustomEditorInfo {
	readonly id: string;
	readonly displayName: string;
	readonly priority: CustomEditorPriority;
	readonly selector: readonly CustomEditorSelector[];
}
