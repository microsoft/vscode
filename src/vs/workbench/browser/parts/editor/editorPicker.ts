/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/editorpicker';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import labels = require('vs/base/common/labels');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import {IAutoFocus, Mode, IEntryRunContext, IQuickNavigateConfiguration} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenModel, QuickOpenEntry, QuickOpenEntryGroup} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import scorer = require('vs/base/common/scorer');
import {QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {Position} from 'vs/platform/editor/common/editor';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {EditorInput, asFileEditorInput, IEditorGroup, IEditorStacksModel} from 'vs/workbench/common/editor';

export class EditorPickerEntry extends QuickOpenEntryGroup {
	private stacks: IEditorStacksModel;

	constructor(
		private editor: EditorInput,
		private _group: IEditorGroup,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super();

		this.stacks = editorGroupService.getStacksModel();
	}

	public getIcon(): string {
		return this.editor.isDirty() ? 'dirty' : '';
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

	public getExtraClass(): string {
		return this._group.isPreview(this.editor) ? 'editor-preview' : '';
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return super.run(mode, context);
	}

	private runOpen(context: IEntryRunContext): boolean {
		this.editorService.openEditor(this.editor, null, this.stacks.positionOfGroup(this.group)).done(null, errors.onUnexpectedError);

		return true;
	}
}

export abstract class BaseEditorPicker extends QuickOpenHandler {
	private scorerCache: { [key: string]: number };

	constructor(
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService
	) {
		super();

		this.scorerCache = Object.create(null);
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();
		const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();

		const editorEntries = this.getEditorEntries();
		if (!editorEntries.length) {
			return TPromise.as(null);
		}

		const stacks = this.editorGroupService.getStacksModel();

		const entries = editorEntries.filter(e => {
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

		// Grouping (for more than one group)
		if (stacks.groups.length > 1) {
			let lastGroup: IEditorGroup;
			entries.forEach(e => {
				if (!lastGroup || lastGroup !== e.group) {
					e.setGroupLabel(nls.localize('groupLabel', "Group: {0}", e.group.label));
					e.setShowBorder(!!lastGroup);
					lastGroup = e.group;
				}
			});
		}

		return TPromise.as(new QuickOpenModel(entries));
	}

	public onClose(canceled: boolean): void {
		this.scorerCache = Object.create(null);
	}

	protected abstract getEditorEntries(): EditorPickerEntry[];
}

export abstract class EditorGroupPicker extends BaseEditorPicker {

	protected getEditorEntries(): EditorPickerEntry[] {
		const stacks = this.editorGroupService.getStacksModel();
		const group = stacks.groupAt(this.getPosition());
		if (!group) {
			return [];
		}

		return group.getEditors(true).map((editor, index) => this.instantiationService.createInstance(EditorPickerEntry, editor, group));
	}

	protected abstract getPosition(): Position;

	public getEmptyLabel(searchString: string): string {
		if (searchString) {
			return nls.localize('noResultsFoundInGroup', "No matching opened editor found in group");
		}

		return nls.localize('noOpenedEditors', "List of opened editors is currently empty");
	}

	public getAutoFocus(searchValue: string, quickNavigateConfiguration: IQuickNavigateConfiguration): IAutoFocus {
		if (searchValue || !quickNavigateConfiguration) {
			return {
				autoFocusFirstEntry: true
			};
		}

		const stacks = this.editorGroupService.getStacksModel();
		const group = stacks.groupAt(this.getPosition());
		if (!group) {
			return super.getAutoFocus(searchValue);
		}

		const isShiftNavigate = (quickNavigateConfiguration && quickNavigateConfiguration.keybindings.some(k => k.hasShift()));
		if (isShiftNavigate) {
			return {
				autoFocusLastEntry: true
			};
		}

		return {
			autoFocusFirstEntry: group.count === 1,
			autoFocusSecondEntry: group.count > 1
		};
	}
}

export class LeftEditorGroupPicker extends EditorGroupPicker {

	protected getPosition(): Position {
		return Position.LEFT;
	}
}

export class CenterEditorGroupPicker extends EditorGroupPicker {

	protected getPosition(): Position {
		const stacks = this.editorGroupService.getStacksModel();

		return stacks.groups.length > 2 ? Position.CENTER : -1; // with 2 groups open, the center one is not available
	}
}

export class RightEditorGroupPicker extends EditorGroupPicker {

	protected getPosition(): Position {
		const stacks = this.editorGroupService.getStacksModel();

		return stacks.groups.length > 2 ? Position.RIGHT : Position.CENTER;
	}
}

export class AllEditorsPicker extends BaseEditorPicker {

	protected getEditorEntries(): EditorPickerEntry[] {
		const entries: EditorPickerEntry[] = [];

		const stacks = this.editorGroupService.getStacksModel();
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