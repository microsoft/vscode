/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { isAbsolute, normalize } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { ITerminalLinkOpener, ITerminalSimpleLink } from 'vs/workbench/contrib/terminal/browser/links/links';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ISearchService } from 'vs/workbench/services/search/common/search';

export class TerminalSearchLinkOpener implements ITerminalLinkOpener {
	private readonly _fileQueryBuilder = this._instantiationService.createInstance(QueryBuilder);

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IEditorService private readonly _editorService: IEditorService,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _workbenchEnvironmentService: IWorkbenchEnvironmentService,
	) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		const pathSeparator = (isWindows ? '\\' : '/');
		// Remove file:/// and any leading ./ or ../ since quick access doesn't understand that format
		let text = link.text.replace(/^file:\/\/\/?/, '');
		text = normalize(text).replace(/^(\.+[\\/])+/, '');

		// Remove `:in` from the end which is how Ruby outputs stack traces
		text = text.replace(/:in$/, '');
		// If any of the names of the folders in the workspace matches
		// a prefix of the link, remove that prefix and continue
		this._workspaceContextService.getWorkspace().folders.forEach((folder) => {
			if (text.substring(0, folder.name.length + 1) === folder.name + pathSeparator) {
				text = text.substring(folder.name.length + 1);
				return;
			}
		});
		let matchLink = text;
		if (this._capabilities.has(TerminalCapability.CommandDetection)) {
			matchLink = this._updateLinkWithRelativeCwd(link.bufferRange.start.y, text, pathSeparator) || text;
		}
		const sanitizedLink = matchLink.replace(/:\d+(:\d+)?$/, '');
		try {
			const exactMatch = await this._getExactMatch(sanitizedLink, matchLink);
			if (exactMatch) {
				// If there was exactly one match, open it
				const match = matchLink.match(/:(\d+)?(:(\d+))?$/);
				const startLineNumber = match?.[1];
				const startColumn = match?.[3];
				await this._editorService.openEditor({
					resource: exactMatch,
					options: {
						pinned: true,
						revealIfOpened: true,
						selection: startLineNumber ? {
							startLineNumber: parseInt(startLineNumber),
							startColumn: startColumn ? parseInt(startColumn) : 0
						} : undefined
					}
				});
				return;
			}
		} catch {
			// Fallback to searching quick access
			return this._quickInputService.quickAccess.show(text);
		}
		// Fallback to searching quick access
		return this._quickInputService.quickAccess.show(text);
	}

	/*
	* For shells with the CwdDetection capability, the cwd relative to the line
	* of the particular link is used to narrow down the result for an exact file match, if possible.
	*/
	private _updateLinkWithRelativeCwd(y: number, text: string, pathSeparator: string): string | undefined {
		const cwd = this._capabilities.get(TerminalCapability.CommandDetection)?.getCwdForLine(y);
		if (!cwd) {
			return undefined;
		}
		if (!text.includes(pathSeparator)) {
			text = cwd + pathSeparator + text;
		} else {
			let commonDirs = 0;
			let i = 0;
			const cwdPath = cwd.split(pathSeparator).reverse();
			const linkPath = text.split(pathSeparator);
			while (i < cwdPath.length) {
				if (cwdPath[i] === linkPath[i]) {
					commonDirs++;
				}
				i++;
			}
			text = cwd + pathSeparator + linkPath.slice(commonDirs).join(pathSeparator);
		}
		return text;
	}

	private async _getExactMatch(sanitizedLink: string, link: string): Promise<URI | undefined> {
		let exactResource: URI | undefined;
		if (isAbsolute(sanitizedLink)) {
			const scheme = this._workbenchEnvironmentService.remoteAuthority ? Schemas.vscodeRemote : Schemas.file;
			const resource = URI.from({ scheme, path: sanitizedLink });
			const fileStat = await this._fileService.resolve(resource);
			if (fileStat.isFile) {
				exactResource = resource;
			}
		}
		if (!exactResource) {
			const results = await this._searchService.fileSearch(
				this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
					// Remove optional :row:col from the link as openEditor supports it
					filePattern: sanitizedLink,
					maxResults: 2
				})
			);
			if (results.results.length === 1) {
				exactResource = results.results[0].resource;
			}
		}
		return exactResource;
	}
}
