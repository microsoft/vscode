/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ISearchConfiguration, ISearchConfigurationProperties } from 'vs/platform/search/common/search';
import { SymbolInformation } from 'vs/editor/common/modes';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';
import { toResource } from 'vs/workbench/common/editor';

export interface IWorkspaceSymbolProvider {
	provideWorkspaceSymbols(search: string): TPromise<SymbolInformation[]>;
	resolveWorkspaceSymbol?: (item: SymbolInformation) => TPromise<SymbolInformation>;
}

export namespace WorkspaceSymbolProviderRegistry {

	const _supports: IWorkspaceSymbolProvider[] = [];

	export function register(support: IWorkspaceSymbolProvider): IDisposable {

		if (support) {
			_supports.push(support);
		}

		return {
			dispose() {
				if (support) {
					let idx = _supports.indexOf(support);
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

export function getWorkspaceSymbols(query: string): TPromise<[IWorkspaceSymbolProvider, SymbolInformation[]][]> {

	const result: [IWorkspaceSymbolProvider, SymbolInformation[]][] = [];

	const promises = WorkspaceSymbolProviderRegistry.all().map(support => {
		return support.provideWorkspaceSymbols(query).then(value => {
			if (Array.isArray(value)) {
				result.push([support, value]);
			}
		}, onUnexpectedError);
	});

	return TPromise.join(promises).then(_ => result);
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
export function getOutOfWorkspaceEditorResources(editorGroupService: IEditorGroupService, contextService: IWorkspaceContextService): URI[] {
	const resources: URI[] = [];

	editorGroupService.getStacksModel().groups.forEach(group => {
		const editors = group.getEditors();
		editors.forEach(editor => {
			const resource = toResource(editor, { supportSideBySide: true });
			if (resource && !contextService.isInsideWorkspace(resource)) {
				resources.push(resource);
			}
		});
	});

	return resources;
}
