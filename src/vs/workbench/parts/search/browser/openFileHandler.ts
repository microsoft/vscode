/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, PPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import URI from 'vs/base/common/uri';
import {IRange} from 'vs/editor/common/editorCommon';
import {IAutoFocus} from 'vs/base/parts/quickopen/common/quickOpen';
import {QuickOpenEntry, QuickOpenModel} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {QuickOpenHandler, EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {QueryBuilder} from 'vs/workbench/parts/search/common/searchQuery';
import {EditorInput, getOutOfWorkspaceEditorResources, IWorkbenchEditorConfiguration} from 'vs/workbench/common/editor';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IQueryOptions, ISearchService, ISearchStats} from 'vs/platform/search/common/search';
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
		@IConfigurationService private configurationService: IConfigurationService,
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

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, file picker", this.getLabel());
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

	public getInput(): IResourceInput | EditorInput {
		let input: IResourceInput = {
			resource: this.resource,
			options: {
				pinned: !this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.enablePreviewFromQuickOpen
			}
		};

		if (this.range) {
			input.options.selection = this.range;
		}

		return input;
	}
}

export class OpenFileHandler extends QuickOpenHandler {
	private queryBuilder: QueryBuilder;

	constructor(
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ISearchService private searchService: ISearchService
	) {
		super();

		this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		return this.getResultsWithStats(searchValue)
			.then(result => result[0]);
	}

	public getResultsWithStats(searchValue: string): PPromise<[QuickOpenModel, ISearchStats], QuickOpenEntry> {
		searchValue = searchValue.trim();
		let promise: TPromise<[QuickOpenEntry[], ISearchStats]>;

		// Respond directly to empty search
		if (!searchValue) {
			promise = TPromise.as(<[QuickOpenEntry[], ISearchStats]>[[], undefined]);
		} else {
			promise = this.doFindResults(searchValue);
		}

		return promise.then(result => [new QuickOpenModel(result[0]), result[1]]);
	}

	private doFindResults(searchValue: string): PPromise<[QuickOpenEntry[], ISearchStats], QuickOpenEntry> {
		const query: IQueryOptions = {
			folderResources: this.contextService.getWorkspace() ? [this.contextService.getWorkspace().resource] : [],
			extraFileResources: getOutOfWorkspaceEditorResources(this.editorGroupService, this.contextService),
			filePattern: searchValue
		};

		let results: QuickOpenEntry[] = [];
		return this.searchService.search(this.queryBuilder.file(query)).then((complete) => {
			return [results, complete.stats];
		}, null, progress => {
			const resource = progress.resource;
			if (resource) {
				const label = paths.basename(resource.fsPath);
				const description = labels.getPathLabel(paths.dirname(resource.fsPath), this.contextService);
				const fileEntry = this.instantiationService.createInstance(FileEntry, label, description, resource);
				results.push(fileEntry);
				return fileEntry;
			}
			return progress;
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