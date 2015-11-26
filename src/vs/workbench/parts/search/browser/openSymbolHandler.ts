/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Promise, TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import {ThrottledDelayer} from 'vs/base/common/async';
import strings = require('vs/base/common/strings');
import URI from 'vs/base/common/uri';
import {Registry} from 'vs/platform/platform';
import {QuickOpenHandler, EditorQuickOpenEntry} from 'vs/workbench/browser/quickopen';
import {QuickOpenModel, QuickOpenEntry, IHighlight} from 'vs/base/parts/quickopen/browser/quickOpenModel';
import {IAutoFocus} from 'vs/base/parts/quickopen/browser/quickOpen';
import {IEditorModesRegistry, Extensions} from 'vs/editor/common/modes/modesRegistry';
import filters = require('vs/base/common/filters');
import {IRange} from 'vs/editor/common/editorCommon';
import {EditorInput} from 'vs/workbench/common/editor';
import labels = require('vs/base/common/labels');
import {IWorkbenchEditorService, IFileInput} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IModeService} from 'vs/editor/common/services/modeService';
import {NavigateTypesSupportRegistry, ITypeBearing, getNavigateToItems} from '../common/search';

class SymbolEntry extends EditorQuickOpenEntry {
	private name: string;
	private parameters: string;
	private description: string;
	private resource: URI;
	private type: string;
	private range: IRange;

	constructor(name: string, parameters: string, description: string, resource: URI, type: string, range: IRange, highlights: IHighlight[], editorService: IWorkbenchEditorService) {
		super(editorService);

		this.name = name;
		this.parameters = parameters;
		this.description = description;
		this.resource = resource;
		this.type = type;
		this.range = range;
		this.setHighlights(highlights);
	}

	public getLabel(): string {
		return this.name + this.parameters;
	}

	public getName(): string {
		return this.name;
	}

	public getParameters(): string {
		return this.parameters;
	}

	public getDescription(): string {
		return this.description;
	}

	public getType(): string {
		return this.type;
	}

	public getIcon(): string {
		return this.type;
	}

	public getInput(): IFileInput | EditorInput {
		let input: IFileInput = {
			resource: this.resource,
		};

		if (this.range) {
			input.options = {
				selection: {
					startLineNumber: this.range.startLineNumber,
					startColumn: this.range.startColumn
				}
			};
		}

		return input;
	}
}

export class OpenSymbolHandler extends QuickOpenHandler {

	private static SUPPORTED_OPEN_TYPES = ['class', 'interface', 'enum', 'function', 'method'];
	private static SEARCH_DELAY = 500; // This delay accommodates for the user typing a word and then stops typing to start searching

	private delayer: ThrottledDelayer;
	private isStandalone: boolean;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IModeService private modeService: IModeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super();

		this.delayer = new ThrottledDelayer(OpenSymbolHandler.SEARCH_DELAY);
		this.isStandalone = true;
	}

	public setStandalone(standalone: boolean) {
		this.delayer = standalone ? new ThrottledDelayer(OpenSymbolHandler.SEARCH_DELAY) : null;
		this.isStandalone = standalone;
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
		} else if (this.delayer) {
			promise = this.delayer.trigger(() => this.doGetResults(searchValue)); // Run search with delay as needed
		} else {
			promise = this.doGetResults(searchValue);
		}

		return promise.then(e => new QuickOpenModel(e));
	}

	private doGetResults(searchValue: string): TPromise<QuickOpenEntry[]> {

		return getNavigateToItems(searchValue).then(bearings => {
			return this.toQuickOpenEntries(bearings, searchValue);
		});
	}

	private toQuickOpenEntries(types: ITypeBearing[], searchValue: string): SymbolEntry[] {
		let results: SymbolEntry[] = [];

		// Convert to Entries
		types.forEach(element => {
			if (!OpenSymbolHandler.SUPPORTED_OPEN_TYPES.some((type: string) => element.type === type)) {
				return;
			}

			// Find Highlights
			let highlights = filters.matchesFuzzy(searchValue, element.name);
			if (highlights) {
				let resource = element.resourceUri;
				if (resource.scheme === 'file') {
					let path = labels.getPathLabel(resource, this.contextService);

					let container: string = void (0);

					// Type is top level in module with path spec, use path info then (/folder/file.ts)
					if (element.containerName === path) {
						container = path;
					}

					// Type is top level in module with url spec, find last segment to produce a short description (http://.../file.ts)
					else if (element.containerName === resource.toString() && element.containerName.indexOf('/') >= 0) {
						container = element.containerName.substr(element.containerName.lastIndexOf('/') + 1);
					}

					// Type is inside a module or other type, find last segment to produce a short description (.../folder/file.ts.CompResult)
					else if (element.containerName && element.containerName.indexOf('.') >= 0) {
						container = element.containerName.substr(element.containerName.lastIndexOf('.') + 1);
					}

					// Fallback
					else {
						container = element.containerName || path;
					}

					results.push(new SymbolEntry(element.name, element.parameters, container, resource, element.type, element.range, highlights, this.editorService));
				}
			}
		});

		// Sort (Standalone only)
		if (this.isStandalone) {
			return results.sort(this.sort.bind(this, searchValue.toLowerCase()));
		}

		return results;
	}

	private sort(searchValue: string, elementA: SymbolEntry, elementB: SymbolEntry): number {
		let elementAName = elementA.getName().toLowerCase();
		let elementBName = elementB.getName().toLowerCase();

		// Compare by name
		let r = strings.localeCompare(elementAName, elementBName);
		if (r !== 0) {
			return r;
		}

		// Sort by Type if name is identical
		let elementAType = elementA.getType();
		let elementBType = elementB.getType();
		if (elementAType !== elementBType) {
			return OpenSymbolHandler.SUPPORTED_OPEN_TYPES.indexOf(elementAType) < OpenSymbolHandler.SUPPORTED_OPEN_TYPES.indexOf(elementBType) ? -1 : 1;
		}

		return 0; // Keep default sorting order otherwise
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
