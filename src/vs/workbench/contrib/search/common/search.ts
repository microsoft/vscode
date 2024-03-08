/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ISearchConfiguration, ISearchConfigurationProperties } from 'vs/workbench/services/search/common/search';
import { SymbolKind, Location, ProviderResult, SymbolTag } from 'vs/editor/common/languages';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { EditorResourceAccessor, SideBySideEditor } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';
import { IRange, Range } from 'vs/editor/common/core/range';
import { isNumber } from 'vs/base/common/types';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { compare } from 'vs/base/common/strings';
import { groupBy } from 'vs/base/common/arrays';

export interface IWorkspaceSymbol {
	name: string;
	containerName?: string;
	kind: SymbolKind;
	tags?: SymbolTag[];
	location: Location;
}

export interface IWorkspaceSymbolProvider {
	provideWorkspaceSymbols(search: string, token: CancellationToken): ProviderResult<IWorkspaceSymbol[]>;
	resolveWorkspaceSymbol?(item: IWorkspaceSymbol, token: CancellationToken): ProviderResult<IWorkspaceSymbol>;
}

export namespace WorkspaceSymbolProviderRegistry {

	const _supports: IWorkspaceSymbolProvider[] = [];

	export function register(provider: IWorkspaceSymbolProvider): IDisposable {
		let support: IWorkspaceSymbolProvider | undefined = provider;
		if (support) {
			_supports.push(support);
		}

		return {
			dispose() {
				if (support) {
					const idx = _supports.indexOf(support);
					if (idx >= 0) {
						_supports.splice(idx, 1);
						support = undefined;
					}
				}
			}
		};
	}

	export function all(): IWorkspaceSymbolProvider[] {
		return _supports.slice(0);
	}
}

export class WorkspaceSymbolItem {
	constructor(readonly symbol: IWorkspaceSymbol, readonly provider: IWorkspaceSymbolProvider) { }
}

export async function getWorkspaceSymbols(query: string, token: CancellationToken = CancellationToken.None): Promise<WorkspaceSymbolItem[]> {

	const all: WorkspaceSymbolItem[] = [];

	const promises = WorkspaceSymbolProviderRegistry.all().map(async provider => {
		try {
			const value = await provider.provideWorkspaceSymbols(query, token);
			if (!value) {
				return;
			}
			for (const symbol of value) {
				all.push(new WorkspaceSymbolItem(symbol, provider));
			}
		} catch (err) {
			onUnexpectedExternalError(err);
		}
	});

	await Promise.all(promises);

	if (token.isCancellationRequested) {
		return [];
	}

	// de-duplicate entries

	function compareItems(a: WorkspaceSymbolItem, b: WorkspaceSymbolItem): number {
		let res = compare(a.symbol.name, b.symbol.name);
		if (res === 0) {
			res = a.symbol.kind - b.symbol.kind;
		}
		if (res === 0) {
			res = compare(a.symbol.location.uri.toString(), b.symbol.location.uri.toString());
		}
		if (res === 0) {
			if (a.symbol.location.range && b.symbol.location.range) {
				if (!Range.areIntersecting(a.symbol.location.range, b.symbol.location.range)) {
					res = Range.compareRangesUsingStarts(a.symbol.location.range, b.symbol.location.range);
				}
			} else if (a.provider.resolveWorkspaceSymbol && !b.provider.resolveWorkspaceSymbol) {
				res = -1;
			} else if (!a.provider.resolveWorkspaceSymbol && b.provider.resolveWorkspaceSymbol) {
				res = 1;
			}
		}
		if (res === 0) {
			res = compare(a.symbol.containerName ?? '', b.symbol.containerName ?? '');
		}
		return res;
	}

	return groupBy(all, compareItems).map(group => group[0]).flat();
}

export interface IWorkbenchSearchConfigurationProperties extends ISearchConfigurationProperties {
	quickOpen: {
		includeSymbols: boolean;
		includeHistory: boolean;
		history: {
			filterSortOrder: 'default' | 'recency';
		};
	};
}

export interface IWorkbenchSearchConfiguration extends ISearchConfiguration {
	search: IWorkbenchSearchConfigurationProperties;
}

/**
 * Helper to return all opened editors with resources not belonging to the currently opened workspace.
 */
export function getOutOfWorkspaceEditorResources(accessor: ServicesAccessor): URI[] {
	const editorService = accessor.get(IEditorService);
	const contextService = accessor.get(IWorkspaceContextService);
	const fileService = accessor.get(IFileService);

	const resources = editorService.editors
		.map(editor => EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }))
		.filter(resource => !!resource && !contextService.isInsideWorkspace(resource) && fileService.hasProvider(resource));

	return resources as URI[];
}

// Supports patterns of <path><#|:|(><line><#|:|,><col?><:?>
const LINE_COLON_PATTERN = /\s?[#:\(](?:line )?(\d*)(?:[#:,](\d*))?\)?:?\s*$/;

export interface IFilterAndRange {
	filter: string;
	range: IRange;
}

export function extractRangeFromFilter(filter: string, unless?: string[]): IFilterAndRange | undefined {
	// Ignore when the unless character not the first character or is before the line colon pattern
	if (!filter || unless?.some(value => {
		const unlessCharPos = filter.indexOf(value);
		return unlessCharPos === 0 || unlessCharPos > 0 && !LINE_COLON_PATTERN.test(filter.substring(unlessCharPos + 1));
	})) {
		return undefined;
	}

	let range: IRange | undefined = undefined;

	// Find Line/Column number from search value using RegExp
	const patternMatch = LINE_COLON_PATTERN.exec(filter);

	if (patternMatch) {
		const startLineNumber = parseInt(patternMatch[1] ?? '', 10);

		// Line Number
		if (isNumber(startLineNumber)) {
			range = {
				startLineNumber: startLineNumber,
				startColumn: 1,
				endLineNumber: startLineNumber,
				endColumn: 1
			};

			// Column Number
			const startColumn = parseInt(patternMatch[2] ?? '', 10);
			if (isNumber(startColumn)) {
				range = {
					startLineNumber: range.startLineNumber,
					startColumn: startColumn,
					endLineNumber: range.endLineNumber,
					endColumn: startColumn
				};
			}
		}

		// User has typed "something:" or "something#" without a line number, in this case treat as start of file
		else if (patternMatch[1] === '') {
			range = {
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: 1
			};
		}
	}

	if (patternMatch && range) {
		return {
			filter: filter.substr(0, patternMatch.index), // clear range suffix from search value
			range
		};
	}

	return undefined;
}

export enum SearchUIState {
	Idle,
	Searching,
	SlowSearch
}

export const SearchStateKey = new RawContextKey<SearchUIState>('searchState', SearchUIState.Idle);

export interface NotebookPriorityInfo {
	isFromSettings: boolean;
	filenamePatterns: string[];
}
