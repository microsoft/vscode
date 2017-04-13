/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/editorpicker';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import labels = require('vs/base/common/labels');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import { IIconLabelOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IAutoFocus, Mode, IEntryRunContext, IQuickNavigateConfiguration } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntry, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import scorer = require('vs/base/common/scorer');
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/workbench/browser/labels';
import { IModelService } from 'vs/editor/common/services/modelService';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { Position } from 'vs/platform/editor/common/editor';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorInput, toResource, IEditorGroup, IEditorStacksModel } from 'vs/workbench/common/editor';

export class EditorPickerEntry extends QuickOpenEntryGroup {
	private stacks: IEditorStacksModel;

	constructor(
		private editor: EditorInput,
		private _group: IEditorGroup,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
		@IEditorGroupService editorGroupService: IEditorGroupService
	) {
		super();

		this.stacks = editorGroupService.getStacksModel();
	}

	public getLabelOptions(): IIconLabelOptions {
		return {
			extraClasses: getIconClasses(this.modelService, this.modeService, this.getResource()),
			italic: this._group.isPreview(this.editor)
		};
	}

	public getLabel(): string {
		return this.editor.getName();
	}

	public getIcon(): string {
		return this.editor.isDirty() ? 'dirty' : '';
	}

	public get group(): IEditorGroup {
		return this._group;
	}

	public getResource(): URI {
		return toResource(this.editor, { supportSideBySide: true });
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, editor group picker", this.getLabel());
	}

	public getDescription(): string {
		return this.editor.getDescription();
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

			const resource = e.getResource();
			const targetToMatch = resource ? labels.getPathLabel(e.getResource(), this.contextService) : e.getLabel();
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

		return nls.localize('noOpenedEditors', "List of opened editors is currently empty in group");
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

		const isShiftNavigate = (quickNavigateConfiguration && quickNavigateConfiguration.keybindings.some(k => !k.isChord() && k.hasShiftModifier()));
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

export class GroupOnePicker extends EditorGroupPicker {

	protected getPosition(): Position {
		return Position.ONE;
	}
}

export class GroupTwoPicker extends EditorGroupPicker {

	protected getPosition(): Position {
		return Position.TWO;
	}
}

export class GroupThreePicker extends EditorGroupPicker {

	protected getPosition(): Position {
		return Position.THREE;
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

		return nls.localize('noOpenedEditorsAllGroups', "List of opened editors is currently empty");
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