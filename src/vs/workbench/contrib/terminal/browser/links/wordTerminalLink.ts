/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TerminalLink } from 'vs/workbench/contrib/terminal/browser/links/terminalLink';
import { IBufferRange } from 'xterm';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { normalize } from 'vs/base/common/path';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ISearchService } from 'vs/workbench/services/search/common/search';
import { QueryBuilder } from 'vs/workbench/contrib/search/common/queryBuilder';
import { isWindows } from 'vs/base/common/platform';

/**
 * Represents terminal link for any word (shown only ).
 * Provided by `TerminalWordLinkProvider`.
 */
export class WordTerminalLink extends TerminalLink {
	private readonly _fileQueryBuilder = this._instantiationService.createInstance(QueryBuilder);

	constructor(
		_terminal: ITerminalInstance,
		range: IBufferRange,
		text: string,
		_viewportY: number,
		_isHighConfidenceLink: boolean,
		@IConfigurationService _configurationService: IConfigurationService,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@ISearchService private readonly _searchService: ISearchService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super(
			_terminal,
			range,
			text,
			_viewportY,
			_isHighConfidenceLink,
			_configurationService,
			_instantiationService,
		);
	}

	override async action() {
		let link = this.text;

		// Normalize the link and remove any leading ./ or ../ since quick access doesn't understand
		// that format
		link = normalize(link).replace(/^(\.+[\\/])+/, '');

		// If any of the names of the folders in the workspace matches
		// a prefix of the link, remove that prefix and continue
		this._workspaceContextService.getWorkspace().folders.forEach((folder) => {
			if (link.substr(0, folder.name.length + 1) === folder.name + (isWindows ? '\\' : '/')) {
				link = link.substring(folder.name.length + 1);
				return;
			}
		});

		const sanitizedLink = link.replace(/:\d+(:\d+)?$/, '');
		const results = await this._searchService.fileSearch(
			this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
				// Remove optional :row:col from the link as openEditor supports it
				filePattern: sanitizedLink,
				maxResults: 2
			})
		);

		// If there was exactly one match, open it
		if (results.results.length === 1) {
			const match = link.match(/:(\d+)?(:(\d+))?$/);
			const startLineNumber = match?.[1];
			const startColumn = match?.[3];
			await this._editorService.openEditor({
				resource: results.results[0].resource,
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

		// Fallback to searching quick access
		this._quickInputService.quickAccess.show(link);
	}
}
