/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, find, mergeSort } from 'vs/base/common/arrays';
import { CancelablePromise } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import * as glob from 'vs/base/common/glob';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditor, IRevertOptions, ISaveOptions, IEditorInput } from 'vs/workbench/common/editor';
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

	getCustomEditor(viewType: string): CustomEditorInfo | undefined;
	getContributedCustomEditors(resource: URI): CustomEditorInfoCollection;
	getUserConfiguredCustomEditors(resource: URI): CustomEditorInfoCollection;

	createInput(resource: URI, viewType: string, group: IEditorGroup | undefined, options?: { readonly customClasses: string }): IEditorInput;

	openWith(resource: URI, customEditorViewType: string, options?: ITextEditorOptions, group?: IEditorGroup): Promise<IEditor | undefined>;
	promptOpenWith(resource: URI, options?: ITextEditorOptions, group?: IEditorGroup): Promise<IEditor | undefined>;
}

export type CustomEditorEdit = number;

export interface ICustomEditorModelManager {
	get(resource: URI, viewType: string): ICustomEditorModel | undefined;

	resolve(resource: URI, viewType: string): Promise<ICustomEditorModel>;

	disposeModel(model: ICustomEditorModel): void;

	disposeAllModelsForView(viewType: string): void;
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
	readonly viewType: string;

	readonly onUndo: Event<{ edits: readonly CustomEditorEdit[], trigger: any | undefined }>;
	readonly onApplyEdit: Event<{ edits: readonly CustomEditorEdit[], trigger: any | undefined }>;
	readonly onDisposeEdits: Event<{ edits: readonly CustomEditorEdit[] }>;

	readonly onWillSave: Event<CustomEditorSaveEvent>;
	readonly onWillSaveAs: Event<CustomEditorSaveAsEvent>;

	onBackup(f: () => CancelablePromise<boolean>): void;

	undo(): void;
	redo(): void;
	revert(options?: IRevertOptions): Promise<boolean>;

	save(options?: ISaveOptions): Promise<boolean>;
	saveAs(resource: URI, targetResource: URI, currentOptions?: ISaveOptions): Promise<boolean>;

	pushEdit(edit: CustomEditorEdit, trigger: any): void;
}

export const enum CustomEditorPriority {
	default = 'default',
	builtin = 'builtin',
	option = 'option',
}

export interface CustomEditorSelector {
	readonly filenamePattern?: string;
}

export class CustomEditorInfo {

	public readonly id: string;
	public readonly displayName: string;
	public readonly priority: CustomEditorPriority;
	public readonly selector: readonly CustomEditorSelector[];

	constructor(descriptor: {
		readonly id: string;
		readonly displayName: string;
		readonly priority: CustomEditorPriority;
		readonly selector: readonly CustomEditorSelector[];
	}) {
		this.id = descriptor.id;
		this.displayName = descriptor.displayName;
		this.priority = descriptor.priority;
		this.selector = descriptor.selector;
	}

	matches(resource: URI): boolean {
		return this.selector.some(selector => CustomEditorInfo.selectorMatches(selector, resource));
	}

	static selectorMatches(selector: CustomEditorSelector, resource: URI): boolean {
		if (selector.filenamePattern) {
			if (glob.match(selector.filenamePattern.toLowerCase(), basename(resource).toLowerCase())) {
				return true;
			}
		}
		return false;
	}
}

export class CustomEditorInfoCollection {

	public readonly allEditors: readonly CustomEditorInfo[];

	constructor(
		editors: readonly CustomEditorInfo[],
	) {
		this.allEditors = distinct(editors, editor => editor.id);
	}

	public get length(): number { return this.allEditors.length; }

	/**
	 * Find the single default editor to use (if any) by looking at the editor's priority and the
	 * other contributed editors.
	 */
	public get defaultEditor(): CustomEditorInfo | undefined {
		return find(this.allEditors, editor => {
			switch (editor.priority) {
				case CustomEditorPriority.default:
				case CustomEditorPriority.builtin:
					// A default editor must have higher priority than all other contributed editors.
					return this.allEditors.every(otherEditor =>
						otherEditor === editor || isLowerPriority(otherEditor, editor));

				default:
					return false;
			}
		});
	}

	/**
	 * Find the best available editor to use.
	 *
	 * Unlike the `defaultEditor`, a bestAvailableEditor can exist even if there are other editors with
	 * the same priority.
	 */
	public get bestAvailableEditor(): CustomEditorInfo | undefined {
		const editors = mergeSort(Array.from(this.allEditors), (a, b) => {
			return priorityToRank(a.priority) - priorityToRank(b.priority);
		});
		return editors[0];
	}
}

function isLowerPriority(otherEditor: CustomEditorInfo, editor: CustomEditorInfo): unknown {
	return priorityToRank(otherEditor.priority) < priorityToRank(editor.priority);
}

function priorityToRank(priority: CustomEditorPriority): number {
	switch (priority) {
		case CustomEditorPriority.default: return 3;
		case CustomEditorPriority.builtin: return 2;
		case CustomEditorPriority.option: return 1;
	}
}
