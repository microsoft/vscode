/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {ThrottledDelayer} from 'vs/base/common/async';
import {QuickOpenHandler, EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {QuickOpenModel, QuickOpenEntry} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {IAutoFocus/*, Mode, IEntryRunContext*/} from 'vs/base/parts/quickopen/common/quickOpen';
import filters = require('vs/base/common/filters');
import {Range} from 'vs/editor/common/core/range';
import {EditorInput, IWorkbenchEditorConfiguration} from 'vs/workbench/common/editor';
import labels = require('vs/base/common/labels');
import {IResourceInput} from 'vs/platform/editor/common/editor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ITypeBearing, INavigateTypesSupport, getNavigateToItems} from 'vs/workbench/parts/search/common/search';

class SymbolEntry extends EditorQuickOpenEntry {

	constructor(
		private _bearing: ITypeBearing,
		private _provider: INavigateTypesSupport,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IWorkspaceContextService private _contextService: IWorkspaceContextService
	) {
		super(editorService);
	}

	public getLabel(): string {
		return this._bearing.name;
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, symbols picker", this.getLabel());
	}

	public getDescription(): string {
		let result = this._bearing.containerName;
		if (!result) {
			result = labels.getPathLabel(this._bearing.resourceUri, this._contextService);
		}
		return result;
	}

	public getIcon(): string {
		return this._bearing.type;
	}

	public getInput(): IResourceInput | EditorInput {
		let input: IResourceInput = {
			resource: this._bearing.resourceUri,
			options: {
				pinned: !this._configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor.enablePreviewFromQuickOpen
			}
		};

		if (this._bearing.range) {
			input.options.selection = Range.collapseToStart(this._bearing.range);
		}

		return input;
	}

	public static compare(elementA: SymbolEntry, elementB: SymbolEntry, searchValue: string): number {

		// Sort by Type if name is identical
		const elementAName = elementA.getLabel().toLowerCase();
		const elementBName = elementB.getLabel().toLowerCase();
		if (elementAName === elementBName) {
			let elementAType = elementA._bearing.type;
			let elementBType = elementB._bearing.type;
			return elementAType.localeCompare(elementBType);
		}

		return QuickOpenEntry.compare(elementA, elementB, searchValue);
	}
}

export interface IOpenSymbolOptions {
	skipSorting: boolean;
	skipLocalSymbols: boolean;
	skipDelay: boolean;
}

export class OpenSymbolHandler extends QuickOpenHandler {

	private static SEARCH_DELAY = 500; // This delay accommodates for the user typing a word and then stops typing to start searching

	private delayer: ThrottledDelayer<QuickOpenEntry[]>;
	private options: IOpenSymbolOptions;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IModeService private modeService: IModeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super();

		this.delayer = new ThrottledDelayer<QuickOpenEntry[]>(OpenSymbolHandler.SEARCH_DELAY);
		this.options = Object.create(null);
	}

	public setOptions(options: IOpenSymbolOptions) {
		this.options = options;
	}

	public canRun(): boolean | string {
		return true;
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		let promise: TPromise<QuickOpenEntry[]>;

		// Respond directly to empty search
		if (!searchValue) {
			promise = TPromise.as([]);
		} else if (!this.options.skipDelay) {
			promise = this.delayer.trigger(() => this.doGetResults(searchValue)); // Run search with delay as needed
		} else {
			promise = this.doGetResults(searchValue);
		}

		return promise.then(e => new QuickOpenModel(e));
	}

	private doGetResults(searchValue: string): TPromise<SymbolEntry[]> {
		return getNavigateToItems(searchValue).then(bearings => {
			return this.toQuickOpenEntries(bearings, searchValue);
		});
	}

	private toQuickOpenEntries(types: ITypeBearing[], searchValue: string): SymbolEntry[] {
		const results: SymbolEntry[] = [];

		// Convert to Entries
		for (const element of types) {

			if (this.options.skipLocalSymbols && !!element.containerName) {
				continue; // ignore local symbols if we are told so
			}

			const entry = this.instantiationService.createInstance(SymbolEntry, element, undefined);
			entry.setHighlights(filters.matchesFuzzy(searchValue, entry.getLabel()));
			results.push(entry);
		}

		// Sort (Standalone only)
		if (!this.options.skipSorting) {
			searchValue = searchValue.toLowerCase();
			return results.sort((a, b) => SymbolEntry.compare(a, b, searchValue));
		}

		return results;
	}

	public getGroupLabel(): string {
		return nls.localize('symbols', "symbol results");
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noSymbolsMatching', "No symbols matching");
		}
		return nls.localize('noSymbolsWithoutInput', "Type to search for symbols");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true,
			autoFocusPrefixMatch: searchValue.trim()
		};
	}
}
