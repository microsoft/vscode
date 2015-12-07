/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, Promise, PPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {ThrottledDelayer} from 'vs/base/common/async';
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import strings = require('vs/base/common/strings');
import URI from 'vs/base/common/uri';
import {IRange} from 'vs/editor/common/editorCommon';
import {IAutoFocus} from 'vs/base/parts/quickopen/browser/quickOpen';
import {QuickOpenEntry, QuickOpenModel, IHighlight} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import comparers = require('vs/base/common/comparers');
import {QuickOpenHandler, EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {QueryBuilder} from 'vs/workbench/parts/search/common/searchQuery';
import {ITextFileService} from 'vs/workbench/parts/files/common/files';
import {EditorInput} from 'vs/workbench/common/editor';
import {IWorkbenchEditorService, IFileInput} from 'vs/workbench/services/editor/common/editorService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService} from 'vs/platform/message/common/message';
import {IQueryOptions, ISearchService, ISearchComplete, ISearchProgressItem} from 'vs/platform/search/common/search';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class FileEntry extends EditorQuickOpenEntry {
	private name: string;
	private description: string;
	private resource: URI;
	private range: IRange;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(editorService);

		this.resource = resource;
		this.name = name;
		this.description = description;
	}

	public getLabel(): string {
		return this.name;
	}

	public getDescription(): string {
		return this.description;
	}

	public getIcon(): string {
		return 'file';
	}

	public getResource(): URI {
		return this.resource;
	}

	public setRange(range: IRange): void {
		this.range = range;
	}

	public getInput(): IFileInput | EditorInput {
		let input: IFileInput = {
			resource: this.resource,
		};

		if (this.range) {
			input.options = {
				selection: this.range
			};
		}

		return input;
	}
}

export class OpenFileHandler extends QuickOpenHandler {

	private static SEARCH_DELAY = 500; // This delay accommodates for the user typing a word and then stops typing to start searching

	private queryBuilder: QueryBuilder;
	private delayer: ThrottledDelayer<QuickOpenEntry[]>;
	private isStandalone: boolean;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITextFileService private textFileService: ITextFileService,
		@ISearchService private searchService: ISearchService
	) {
		super();

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		this.delayer = new ThrottledDelayer<QuickOpenEntry[]>(OpenFileHandler.SEARCH_DELAY);
		this.isStandalone = true;
	}

	public setStandalone(standalone: boolean) {
		this.delayer = standalone ? new ThrottledDelayer<QuickOpenEntry[]>(OpenFileHandler.SEARCH_DELAY) : null;
		this.isStandalone = standalone;
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();
		let promise: TPromise<QuickOpenEntry[]>;

		// Respond directly to empty search
		if (!searchValue) {
			promise = TPromise.as([]);
		} else if (this.delayer) {
			promise = this.delayer.trigger(() => this.doFindResults(searchValue)); // Run search with delay as needed
		} else {
			promise = this.doFindResults(searchValue);
		}

		return promise.then(e => new QuickOpenModel(e));
	}

	private doFindResults(searchValue: string): TPromise<QuickOpenEntry[]> {
		let rootResources = this.textFileService.getWorkingFilesModel().getOutOfWorkspaceContextEntries().map((e) => e.resource);
		if (this.contextService.getWorkspace()) {
			rootResources.push(this.contextService.getWorkspace().resource);
		}

		let query: IQueryOptions = { filePattern: searchValue, rootResources: rootResources };

		return this.queryBuilder.file(query).then((query) => this.searchService.search(query)).then((complete) => {

			// Highlight
			let results: QuickOpenEntry[] = [];
			for (let i = 0; i < complete.results.length; i++) {
				let fileMatch = complete.results[i];

				let label = paths.basename(fileMatch.resource.fsPath);
				let description = labels.getPathLabel(paths.dirname(fileMatch.resource.fsPath), this.contextService);

				let entry = this.instantiationService.createInstance(FileEntry, label, description, fileMatch.resource);

				// Apply highlights
				let {labelHighlights, descriptionHighlights} = QuickOpenEntry.highlight(entry, searchValue);
				entry.setHighlights(labelHighlights, descriptionHighlights);

				results.push(entry);
			}

			// Sort (standalone only)
			if (this.isStandalone) {
				results = results.sort((elementA, elementB) => QuickOpenEntry.compare(elementA, elementB, searchValue));
			}

			return results;
		});
	}

	public getGroupLabel(): string {
		return nls.localize('searchResults', "search results");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true
		};
	}
}