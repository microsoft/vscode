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

export class EditorGroupPickerEntry extends QuickOpenEntryGroup {
	private editor: EditorInput;

	constructor(
		editor: EditorInput,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super();

		this.editor = editor;
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
		this.editorService.openEditor(this.editor).done(null, errors.onUnexpectedError);

		return true;
	}
}

export class EditorGroupPicker extends QuickOpenHandler {
	private scorerCache: { [key: string]: number };

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
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

		return TPromise.as(new QuickOpenModel(stacks.activeGroup.getEditors(true)

			// Convert to quick open entries
			.map(e => this.instantiationService.createInstance(EditorGroupPickerEntry, e))

			// Filter by search value
			.filter(e => {
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
			}).

			// Sort by search value score or natural order if not searching
			sort((e1, e2) => {
				if (!searchValue) {
					return 0;
				}

				return QuickOpenEntry.compareByScore(e1, e2, searchValue, normalizedSearchValueLowercase, this.scorerCache);
			}).

			// Apply group label
			map((e, index) => {
				if (index === 0) {
					e.setGroupLabel(nls.localize('groupLabel', "Group: {0}", stacks.activeGroup.label));
				}

				return e;
			})));
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString) {
			return nls.localize('noResultsFound', "No matching opened editor found in group");
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

	public onClose(canceled: boolean): void {
		this.scorerCache = Object.create(null);
	}
}