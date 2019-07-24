/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editorpicker';
import * as nls from 'vs/nls';
import { IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IAutoFocus, Mode, IEntryRunContext, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntry, QuickOpenEntryGroup, QuickOpenItemAccessor } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IModeService } from 'vs/editor/common/services/modeService';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService, IEditorGroup, EditorsOrder, GroupsOrder } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorInput, toResource, SideBySideEditor } from 'vs/workbench/common/editor';
import { compareItemsByScore, scoreItem, ScorerCache, prepareQuery } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { withNullAsUndefined } from 'vs/base/common/types';

export class EditorPickerEntry extends QuickOpenEntryGroup {

	constructor(
		private editor: EditorInput,
		private _group: IEditorGroup,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService
	) {
		super();
	}

	getLabelOptions(): IIconLabelValueOptions {
		return {
			extraClasses: getIconClasses(this.modelService, this.modeService, this.getResource()),
			italic: !this._group.isPinned(this.editor)
		};
	}

	getLabel() {
		return withNullAsUndefined(this.editor.getName());
	}

	getIcon(): string {
		return this.editor.isDirty() ? 'dirty' : '';
	}

	get group(): IEditorGroup {
		return this._group;
	}

	getResource() {
		return toResource(this.editor, { supportSideBySide: SideBySideEditor.MASTER });
	}

	getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, editor group picker", this.getLabel());
	}

	getDescription() {
		return this.editor.getDescription();
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return super.run(mode, context);
	}

	private runOpen(context: IEntryRunContext): boolean {
		this._group.openEditor(this.editor);

		return true;
	}
}

export abstract class BaseEditorPicker extends QuickOpenHandler {
	private scorerCache: ScorerCache;

	constructor(
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IEditorService protected editorService: IEditorService,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService
	) {
		super();

		this.scorerCache = Object.create(null);
	}

	getResults(searchValue: string, token: CancellationToken): Promise<QuickOpenModel | null> {
		const editorEntries = this.getEditorEntries();
		if (!editorEntries.length) {
			return Promise.resolve(null);
		}

		// Prepare search for scoring
		const query = prepareQuery(searchValue);

		const entries = editorEntries.filter(e => {
			if (!query.value) {
				return true;
			}

			const itemScore = scoreItem(e, query, true, QuickOpenItemAccessor, this.scorerCache);
			if (!itemScore.score) {
				return false;
			}

			e.setHighlights(itemScore.labelMatch || [], itemScore.descriptionMatch);

			return true;
		});

		// Sorting
		if (query.value) {
			const groups = this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE);
			entries.sort((e1, e2) => {
				if (e1.group !== e2.group) {
					return groups.indexOf(e1.group) - groups.indexOf(e2.group); // older groups first
				}

				return compareItemsByScore(e1, e2, query, true, QuickOpenItemAccessor, this.scorerCache);
			});
		}

		// Grouping (for more than one group)
		if (this.editorGroupService.count > 1) {
			let lastGroup: IEditorGroup;
			entries.forEach(e => {
				if (!lastGroup || lastGroup !== e.group) {
					e.setGroupLabel(e.group.label);
					e.setShowBorder(!!lastGroup);
					lastGroup = e.group;
				}
			});
		}

		return Promise.resolve(new QuickOpenModel(entries));
	}

	onClose(canceled: boolean): void {
		this.scorerCache = Object.create(null);
	}

	protected abstract getEditorEntries(): EditorPickerEntry[];
}

export class ActiveEditorGroupPicker extends BaseEditorPicker {

	static readonly ID = 'workbench.picker.activeEditors';

	protected getEditorEntries(): EditorPickerEntry[] {
		return this.group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map((editor, index) => this.instantiationService.createInstance(EditorPickerEntry, editor, this.group));
	}

	private get group(): IEditorGroup {
		return this.editorGroupService.activeGroup;
	}

	getEmptyLabel(searchString: string): string {
		if (searchString) {
			return nls.localize('noResultsFoundInGroup', "No matching opened editor found in group");
		}

		return nls.localize('noOpenedEditors', "List of opened editors is currently empty in group");
	}

	getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		if (searchValue || !context.quickNavigateConfiguration) {
			return {
				autoFocusFirstEntry: true
			};
		}

		const isShiftNavigate = (context.quickNavigateConfiguration && context.quickNavigateConfiguration.keybindings.some(k => {
			const [firstPart, chordPart] = k.getParts();
			if (chordPart) {
				return false;
			}

			return firstPart.shiftKey;
		}));

		if (isShiftNavigate) {
			return {
				autoFocusLastEntry: true
			};
		}

		const editors = this.group.count;
		return {
			autoFocusFirstEntry: editors === 1,
			autoFocusSecondEntry: editors > 1
		};
	}
}

export class AllEditorsPicker extends BaseEditorPicker {

	static readonly ID = 'workbench.picker.editors';

	protected getEditorEntries(): EditorPickerEntry[] {
		const entries: EditorPickerEntry[] = [];

		this.editorGroupService.getGroups(GroupsOrder.GRID_APPEARANCE).forEach(group => {
			group.editors.forEach(editor => {
				entries.push(this.instantiationService.createInstance(EditorPickerEntry, editor, group));
			});
		});

		return entries;
	}

	getEmptyLabel(searchString: string): string {
		if (searchString) {
			return nls.localize('noResultsFound', "No matching opened editor found");
		}

		return nls.localize('noOpenedEditorsAllGroups', "List of opened editors is currently empty");
	}

	getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		if (searchValue) {
			return {
				autoFocusFirstEntry: true
			};
		}

		return super.getAutoFocus(searchValue, context);
	}
}
