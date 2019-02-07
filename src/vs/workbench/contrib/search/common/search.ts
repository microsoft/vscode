/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ISearchConfiguration, ISearchConfigurationProperties } from 'vs/platform/search/common/search';
import { SymbolKind, Location, ProviderResult } from 'vs/editor/common/modes';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { toResource } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CancellationToken } from 'vs/base/common/cancellation';

export interface IWorkspaceSymbol {
	name: string;
	containerName?: string;
	kind: SymbolKind;
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

export function getWorkspaceSymbols(query: string, token: CancellationToken = CancellationToken.None): Promise<[IWorkspaceSymbolProvider, IWorkspaceSymbol[]][]> {

	const result: [IWorkspaceSymbolProvider, IWorkspaceSymbol[]][] = [];

	const promises = WorkspaceSymbolProviderRegistry.all().map(support => {
		return Promise.resolve(support.provideWorkspaceSymbols(query, token)).then(value => {
			if (Array.isArray(value)) {
				result.push([support, value]);
			}
		}, onUnexpectedError);
	});

	return Promise.all(promises).then(_ => result);
}

export interface IWorkbenchSearchConfigurationProperties extends ISearchConfigurationProperties {
	quickOpen: {
		includeSymbols: boolean;
	};
}

export interface IWorkbenchSearchConfiguration extends ISearchConfiguration {
	search: IWorkbenchSearchConfigurationProperties;
}

/**
 * Helper to return all opened editors with resources not belonging to the currently opened workspace.
 */
export function getOutOfWorkspaceEditorResources(editorService: IEditorService, contextService: IWorkspaceContextService): URI[] {
	const resources: URI[] = [];

	editorService.editors.forEach(editor => {
		const resource = toResource(editor, { supportSideBySide: true });
		if (resource && !contextService.isInsideWorkspace(resource)) {
			resources.push(resource);
		}
	});

	return resources;
}
