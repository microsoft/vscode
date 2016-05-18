/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import labels = require('vs/base/common/labels');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import {IAutoFocus, Mode, IContext} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenModel, QuickOpenEntry, QuickOpenEntryGroup} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import scorer = require('vs/base/common/scorer');
import {QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {EditorInput, asFileEditorInput} from 'vs/workbench/common/editor';
import {IEditorGroup} from 'vs/workbench/common/editor/editorStacksModel';

export class EditorPickerEntry extends QuickOpenEntryGroup {

	constructor(
		private editor: EditorInput,
		private _group: IEditorGroup,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super();
	}

	public getPrefix(): string {
		if (this.editor.isDirty()) {
			return '\u25cf '; // dirty decoration
		}

		return void 0;
	}

	public getLabel(): string {
		return this.editor.getName();
	}

	public get group(): IEditorGroup {
		return this._group;
	}

	public getResource(): URI {
		const fileInput = asFileEditorInput(this.editor, true);

		return fileInput && fileInput.getResource();
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, editor group picker", this.getLabel());
	}

	public getDescription(): string {
		return this.editor.getDescription();
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return super.run(mode, context);
	}

	private runOpen(context: IContext): boolean {
		this.editorService.openEditor(this.editor, null, this.editorService.getStacksModel().positionOfGroup(this.group)).done(null, errors.onUnexpectedError);

		return true;
	}
}

export abstract class BaseEditorPicker extends QuickOpenHandler {
	private scorerCache: { [key: string]: number };

	constructor(
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService
	) {
		super();

		this.scorerCache = Object.create(null);
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		const stacks = this.editorService.getStacksModel();
		if (!stacks.activeGroup) {
			return TPromise.as(null);
		}

		searchValue = searchValue.trim();
		const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();

		const entries = this.getEditorEntries().filter(e => {
			if (!searchValue) {
				return true;
			}

			let resource = e.getResource();
			let targetToMatch = resource ? labels.getPathLabel(e.getResource(), this.contextService) : e.getLabel();
			if (!scorer.matches(targetToMatch, normalizedSearchValueLowercase)) {
				return false;
			}

			const {labelHighlights, descriptionHighlights} = QuickOpenEntry.highlight(e, searchValue, true /* fuzzy highlight */);
			e.setHighlights(labelHighlights, descriptionHighlights);

			return true;
		});

		// Sorting
		if (searchValue) {
			entries.sort((e1, e2) => {
				if (e1.group !== e2.group) {
					return stacks.positionOfGroup(e1.group) - stacks.positionOfGroup(e2.group);
				}

				return QuickOpenEntry.compareByScore(e1, e2, searchValue, normalizedSearchValueLowercase, this.scorerCache);
			});
		}

		// Grouping
		let lastGroup: IEditorGroup;
		entries.forEach(e => {
			if (!lastGroup || lastGroup !== e.group) {
				e.setGroupLabel(nls.localize('groupLabel', "Group: {0}", e.group.label));
				e.setShowBorder(!!lastGroup);
				lastGroup = e.group;
			}
		});

		return TPromise.as(new QuickOpenModel(entries));
	}

	public onClose(canceled: boolean): void {
		this.scorerCache = Object.create(null);
	}

	protected abstract getEditorEntries(): EditorPickerEntry[];
}

export class EditorGroupPicker extends BaseEditorPicker {

	protected getEditorEntries(): EditorPickerEntry[] {
		const stacks = this.editorService.getStacksModel();

		return stacks.activeGroup.getEditors(true).map((editor, index) => this.instantiationService.createInstance(EditorPickerEntry, editor, stacks.activeGroup));
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString) {
			return nls.localize('noResultsFoundInGroup', "No matching opened editor found in group");
		}

		return nls.localize('noOpenedEditors', "List of opened editors is currently empty");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		if (searchValue) {
			return {
				autoFocusFirstEntry: true
			};
		}

		const stacks = this.editorService.getStacksModel();
		if (!stacks.activeGroup) {
			return super.getAutoFocus(searchValue);
		}

		return {
			autoFocusFirstEntry: stacks.activeGroup.count === 1,
			autoFocusSecondEntry: stacks.activeGroup.count > 1
		};
	}
}

export class AllEditorsPicker extends BaseEditorPicker {

	protected getEditorEntries(): EditorPickerEntry[] {
		const entries: EditorPickerEntry[] = [];

		const stacks = this.editorService.getStacksModel();
		stacks.groups.forEach((group, position) => {
			group.getEditors().forEach((editor, index) => {
				entries.push(this.instantiationService.createInstance(EditorPickerEntry, editor, group));
			});
		});

		return entries;
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString) {
			return nls.localize('noResultsFound', "No matching opened editor found");
		}

		return nls.localize('noOpenedEditors', "List of opened editors is currently empty");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		if (searchValue) {
			return {
				autoFocusFirstEntry: true
			};
		}

		return super.getAutoFocus(searchValue);
	}
}