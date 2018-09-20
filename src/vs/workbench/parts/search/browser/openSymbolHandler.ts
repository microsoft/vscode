/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ThrottledDelayer } from 'vs/base/common/async';
import { QuickOpenHandler, EditorQuickOpenEntry } from 'vs/workbench/browser/quickopen';
import { QuickOpenModel, QuickOpenEntry, compareEntries } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus, Mode, IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';
import * as filters from 'vs/base/common/filters';
import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { symbolKindToCssClass } from 'vs/editor/common/modes';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceSymbolProvider, getWorkspaceSymbols, IWorkspaceSymbol } from 'vs/workbench/parts/search/common/search';
import { basename } from 'vs/base/common/paths';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILabelService } from 'vs/platform/label/common/label';
import { CancellationToken } from 'vs/base/common/cancellation';

class SymbolEntry extends EditorQuickOpenEntry {
	private bearingResolve: Thenable<this>;

	constructor(
		private bearing: IWorkspaceSymbol,
		private provider: IWorkspaceSymbolProvider,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService editorService: IEditorService,
		@ILabelService private labelService: ILabelService
	) {
		super(editorService);
	}

	getLabel(): string {
		return this.bearing.name;
	}

	getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, symbols picker", this.getLabel());
	}

	getDescription(): string {
		const containerName = this.bearing.containerName;
		if (this.bearing.location.uri) {
			if (containerName) {
				return `${containerName} — ${basename(this.bearing.location.uri.fsPath)}`;
			}

			return this.labelService.getUriLabel(this.bearing.location.uri, { relative: true });
		}

		return containerName;
	}

	getIcon(): string {
		return symbolKindToCssClass(this.bearing.kind);
	}

	getResource(): URI {
		return this.bearing.location.uri;
	}

	run(mode: Mode, context: IEntryRunContext): boolean {

		// resolve this type bearing if neccessary
		if (!this.bearingResolve && typeof this.provider.resolveWorkspaceSymbol === 'function' && !this.bearing.location.range) {
			this.bearingResolve = Promise.resolve(this.provider.resolveWorkspaceSymbol(this.bearing, CancellationToken.None)).then(result => {
				this.bearing = result || this.bearing;

				return this;
			}, onUnexpectedError);
		}

		TPromise.as(this.bearingResolve)
			.then(() => super.run(mode, context))
			.then(void 0, onUnexpectedError);

		// hide if OPEN
		return mode === Mode.OPEN;
	}

	getInput(): IResourceInput {
		const input: IResourceInput = {
			resource: this.bearing.location.uri,
			options: {
				pinned: !this.configurationService.getValue<IWorkbenchEditorConfiguration>().workbench.editor.enablePreviewFromQuickOpen
			}
		};

		if (this.bearing.location.range) {
			input.options.selection = Range.collapseToStart(this.bearing.location.range);
		}

		return input;
	}

	static compare(elementA: SymbolEntry, elementB: SymbolEntry, searchValue: string): number {

		// Sort by Type if name is identical
		const elementAName = elementA.getLabel().toLowerCase();
		const elementBName = elementB.getLabel().toLowerCase();
		if (elementAName === elementBName) {
			let elementAType = symbolKindToCssClass(elementA.bearing.kind);
			let elementBType = symbolKindToCssClass(elementB.bearing.kind);
			return elementAType.localeCompare(elementBType);
		}

		return compareEntries(elementA, elementB, searchValue);
	}
}

export interface IOpenSymbolOptions {
	skipSorting: boolean;
	skipLocalSymbols: boolean;
	skipDelay: boolean;
}

export class OpenSymbolHandler extends QuickOpenHandler {

	static readonly ID = 'workbench.picker.symbols';

	private static readonly TYPING_SEARCH_DELAY = 200; // This delay accommodates for the user typing a word and then stops typing to start searching

	private delayer: ThrottledDelayer<QuickOpenEntry[]>;
	private options: IOpenSymbolOptions;

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		super();

		this.delayer = new ThrottledDelayer<QuickOpenEntry[]>(OpenSymbolHandler.TYPING_SEARCH_DELAY);
		this.options = Object.create(null);
	}

	setOptions(options: IOpenSymbolOptions) {
		this.options = options;
	}

	canRun(): boolean | string {
		return true;
	}

	getResults(searchValue: string, token: CancellationToken): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();

		let promise: TPromise<QuickOpenEntry[]>;
		if (!this.options.skipDelay) {
			promise = this.delayer.trigger(() => {
				if (token.isCancellationRequested) {
					return TPromise.wrap([]);
				}

				return this.doGetResults(searchValue, token);
			});
		} else {
			promise = this.doGetResults(searchValue, token);
		}

		return promise.then(e => new QuickOpenModel(e));
	}

	private doGetResults(searchValue: string, token: CancellationToken): TPromise<SymbolEntry[]> {
		return getWorkspaceSymbols(searchValue, token).then(tuples => {
			if (token.isCancellationRequested) {
				return [];
			}

			const result: SymbolEntry[] = [];
			for (let tuple of tuples) {
				const [provider, bearings] = tuple;
				this.fillInSymbolEntries(result, provider, bearings, searchValue);
			}

			// Sort (Standalone only)
			if (!this.options.skipSorting) {
				searchValue = searchValue ? strings.stripWildcards(searchValue.toLowerCase()) : searchValue;
				return result.sort((a, b) => SymbolEntry.compare(a, b, searchValue));
			}

			return result;
		});
	}

	private fillInSymbolEntries(bucket: SymbolEntry[], provider: IWorkspaceSymbolProvider, types: IWorkspaceSymbol[], searchValue: string): void {

		// Convert to Entries
		for (let element of types) {
			if (this.options.skipLocalSymbols && !!element.containerName) {
				continue; // ignore local symbols if we are told so
			}

			const entry = this.instantiationService.createInstance(SymbolEntry, element, provider);
			entry.setHighlights(filters.matchesFuzzy(searchValue, entry.getLabel()));
			bucket.push(entry);
		}
	}

	getGroupLabel(): string {
		return nls.localize('symbols', "symbol results");
	}

	getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noSymbolsMatching', "No symbols matching");
		}
		return nls.localize('noSymbolsWithoutInput', "Type to search for symbols");
	}

	getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: true,
			autoFocusPrefixMatch: searchValue.trim()
		};
	}
}
