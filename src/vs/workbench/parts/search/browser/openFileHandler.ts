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
import filters = require('vs/base/common/filters');
import comparers = require('vs/base/common/comparers');
import {QuickOpenHandler, EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {FileMatch, SearchResult} from 'vs/workbench/parts/search/common/searchModel';
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

	constructor(name: string, resource: URI, highlights: IHighlight[],
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(editorService);

		this.resource = resource;
		this.name = name;
		this.description = labels.getPathLabel(paths.dirname(this.resource.fsPath), contextService);
		this.setHighlights(highlights);
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
	private delayer: ThrottledDelayer;
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
		this.delayer = new ThrottledDelayer(OpenFileHandler.SEARCH_DELAY);
		this.isStandalone = true;
	}

	public setStandalone(standalone: boolean) {
		this.delayer = standalone ? new ThrottledDelayer(OpenFileHandler.SEARCH_DELAY) : null;
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
			let searchResult = this.instantiationService.createInstance(SearchResult, null);
			searchResult.append(complete.results);

			// Sort (standalone only)
			let matches = searchResult.matches();
			if (this.isStandalone) {
				matches = matches.sort((elementA, elementB) => this.sort(elementA, elementB, searchValue.toLowerCase()));
			}

			// Highlight
			let results: QuickOpenEntry[] = [];
			for (let i = 0; i < matches.length; i++) {
				let fileMatch = matches[i];
				let highlights = filters.matchesFuzzy(searchValue, fileMatch.name());

				results.push(this.instantiationService.createInstance(FileEntry, fileMatch.name(), fileMatch.resource(), highlights));
			}

			return results;
		});
	}

	private sort(elementA: FileMatch, elementB: FileMatch, searchValue: string): number {
		let elementAName = elementA.name().toLowerCase();
		let elementBName = elementB.name().toLowerCase();

		// Sort matches that have search value in beginning to the top
		let elementAPrefixMatch = elementAName.indexOf(searchValue) === 0;
		let elementBPrefixMatch = elementBName.indexOf(searchValue) === 0;
		if (elementAPrefixMatch !== elementBPrefixMatch) {
			return elementAPrefixMatch ? -1 : 1;
		}

		// Compare by name
		let r = comparers.compareFileNames(elementAName, elementBName);
		if (r !== 0) {
			return r;
		}

		// Otherwise do full compare with path info
		return strings.localeCompare(elementA.resource().fsPath, elementB.resource().fsPath);
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