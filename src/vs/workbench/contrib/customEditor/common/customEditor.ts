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

export type CustomEditorEdit = string;

export interface ICustomEditorModelManager {
	get(resource: URI, viewType: string): ICustomEditorModel | undefined;

	loadOrCreate(resource: URI, viewType: string): Promise<ICustomEditorModel>;

	disposeModel(model: ICustomEditorModel): void;
}

export interface ICustomEditorModel extends IWorkingCopy {
	readonly onUndo: Event<CustomEditorEdit>;
	readonly onRedo: Event<CustomEditorEdit>;
	readonly onWillSave: Event<{ waitUntil: (until: Promise<any>) => void }>;

	undo(): void;
	redo(): void;
	revert(options?: IRevertOptions): Promise<boolean>;

	save(options?: ISaveOptions): Promise<boolean>;

	makeEdit(data: string): void;
}

export const enum CustomEditorPriority {
	default = 'default',
	builtin = 'builtin',
	option = 'option',
}

export interface CustomEditorSelector {
	readonly filenamePattern?: string;
	readonly mime?: string;
}

export interface CustomEditorInfo {
	readonly id: string;
	readonly displayName: string;
	readonly priority: CustomEditorPriority;
	readonly selector: readonly CustomEditorSelector[];
}
