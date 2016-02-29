/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import URI from 'vs/base/common/uri';
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import {IAutoFocus, Mode, IContext} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenModel, QuickOpenEntry, QuickOpenEntryGroup} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {WorkingFilesModel, WorkingFileEntry} from 'vs/workbench/parts/files/common/workingFilesModel';
import scorer = require('vs/base/common/scorer');
import {QuickOpenHandler} from 'vs/workbench/browser/quickopen';
import {ITextFileService} from 'vs/workbench/parts/files/common/files';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class WorkingFilePickerEntry extends QuickOpenEntryGroup {
	private name: string;
	private description: string;
	private workingFilesEntry: WorkingFileEntry;

	constructor(
		name: string,
		description: string,
		entry: WorkingFileEntry,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super();

		this.workingFilesEntry = entry;
		this.name = name;
		this.description = description;
	}

	public getPrefix(): string {
		if (this.workingFilesEntry.dirty) {
			return '\u25cf '; // dirty decoration
		}

		return void 0;
	}

	public getLabel(): string {
		return this.name;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, working file picker", this.getLabel());
	}

	public getDescription(): string {
		return this.description;
	}

	public getResource(): URI {
		return this.workingFilesEntry.resource;
	}

	public getWorkingFilesEntry(): WorkingFileEntry {
		return this.workingFilesEntry;
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen(context);
		}

		return super.run(mode, context);
	}

	private runOpen(context: IContext): boolean {
		let event = context.event;
		let sideBySide = (event && (event.ctrlKey || event.metaKey || (event.payload && event.payload.originalEvent && (event.payload.originalEvent.ctrlKey || event.payload.originalEvent.metaKey))));

		this.editorService.openEditor({ resource: this.workingFilesEntry.resource }, sideBySide).done(null, errors.onUnexpectedError);

		return true;
	}
}

export class WorkingFilesPicker extends QuickOpenHandler {
	private scorerCache: { [key: string]: number };

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super();

		this.scorerCache = Object.create(null);
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();

		return TPromise.as(new QuickOpenModel(this.textFileService.getWorkingFilesModel().getEntries()

			// Convert working files to quick open entries
			.map(e => {
				let label = paths.basename(e.resource.fsPath);
				let description = labels.getPathLabel(paths.dirname(e.resource.fsPath), this.contextService);
				if (description === '.') {
					description = null; // for untitled files
				}

				return this.instantiationService.createInstance(WorkingFilePickerEntry, label, description, e);
			})

			// Filter by search value
			.filter(e => {
				if (!searchValue) {
					return true;
				}

				let targetToMatch = labels.getPathLabel(e.getResource(), this.contextService);
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
					return WorkingFilesModel.compare(e1.getWorkingFilesEntry(), e2.getWorkingFilesEntry());
				}

				return QuickOpenEntry.compareByScore(e1, e2, searchValue, normalizedSearchValueLowercase, this.scorerCache);
			}).

			// Apply group label
			map((e, index) => {
				if (index === 0) {
					e.setGroupLabel(nls.localize('workingFilesGroupLabel', "working files"));
				}

				return e;
			})));
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString) {
			return nls.localize('noResultsFound', "No matching working files found");
		}

		return nls.localize('noWorkingFiles', "List of working files is currently empty");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		if (searchValue) {
			return {
				autoFocusFirstEntry: true
			};
		}

		return super.getAutoFocus(searchValue);
	}

	public onClose(canceled: boolean): void {
		this.scorerCache = Object.create(null);
	}
}