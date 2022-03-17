/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITerminalLinkOpener, ITerminalSimpleLink } from 'vs/workbench/contrib/terminal/browser/links/links';
import { osPathModule, updateLinkWithRelativeCwd } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { ILineColumnInfo } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkManager';
import { getLocalLinkRegex, lineAndColumnClause, lineAndColumnClauseGroupCount, unixLineAndColumnMatchIndex, winLineAndColumnMatchIndex } from 'vs/workbench/contrib/terminal/browser/links/terminalLocalLinkDetector';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { ISearchService } from 'vs/workbench/services/search/common/search';

export class TerminalLocalFileLinkOpener implements ITerminalLinkOpener {
	constructor(
		private readonly _os: OperatingSystem,
		@IEditorService private readonly _editorService: IEditorService,
	) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		if (!link.uri) {
			throw new Error('Tried to open file link without a resolved URI');
		}
		const lineColumnInfo: ILineColumnInfo = this.extractLineColumnInfo(link.text);
		const selection: ITextEditorSelection = {
			startLineNumber: lineColumnInfo.lineNumber,
			startColumn: lineColumnInfo.columnNumber
		};
		await this._editorService.openEditor({
			resource: link.uri,
			options: { pinned: true, selection, revealIfOpened: true }
		});
	}

	/**
	 * Returns line and column number of URl if that is present, otherwise line 1 column 1.
	 *
	 * @param link Url link which may contain line and column number.
	 */
	extractLineColumnInfo(link: string): ILineColumnInfo {
		const matches: string[] | null = getLocalLinkRegex(this._os).exec(link);
		const lineColumnInfo: ILineColumnInfo = {
			lineNumber: 1,
			columnNumber: 1
		};

		if (!matches) {
			return lineColumnInfo;
		}

		const lineAndColumnMatchIndex = this._os === OperatingSystem.Windows ? winLineAndColumnMatchIndex : unixLineAndColumnMatchIndex;
		for (let i = 0; i < lineAndColumnClause.length; i++) {
			const lineMatchIndex = lineAndColumnMatchIndex + (lineAndColumnClauseGroupCount * i);
			const rowNumber = matches[lineMatchIndex];
			if (rowNumber) {
				lineColumnInfo['lineNumber'] = parseInt(rowNumber, 10);
				// Check if column number exists
				const columnNumber = matches[lineMatchIndex + 2];
				if (columnNumber) {
					lineColumnInfo['columnNumber'] = parseInt(columnNumber, 10);
				}
				break;
			}
		}

		return lineColumnInfo;
	}
}

export class TerminalLocalFolderInWorkspaceLinkOpener implements ITerminalLinkOpener {
	constructor(@ICommandService private readonly _commandService: ICommandService) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		if (!link.uri) {
			throw new Error('Tried to open folder in workspace link without a resolved URI');
		}
		await this._commandService.executeCommand('revealInExplorer', link.uri);
	}
}

export class TerminalLocalFolderOutsideWorkspaceLinkOpener implements ITerminalLinkOpener {
	constructor(@IHostService private readonly _hostService: IHostService) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		if (!link.uri) {
			throw new Error('Tried to open folder in workspace link without a resolved URI');
		}
		this._hostService.openWindow([{ folderUri: link.uri }], { forceNewWindow: true });
	}
}

export class TerminalSearchLinkOpener implements ITerminalLinkOpener {
	private readonly _fileQueryBuilder = this._instantiationService.createInstance(QueryBuilder);

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _localFileOpener: TerminalLocalFileLinkOpener,
		private readonly _localFolderInWorkspaceOpener: TerminalLocalFolderInWorkspaceLinkOpener,
		private readonly _os: OperatingSystem,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _workbenchEnvironmentService: IWorkbenchEnvironmentService,
	) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		const pathSeparator = osPathModule(this._os).sep;
		// Remove file:/// and any leading ./ or ../ since quick access doesn't understand that format
		let text = link.text.replace(/^file:\/\/\/?/, '');
		text = osPathModule(this._os).normalize(text).replace(/^(\.+[\\/])+/, '');

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
			matchLink = updateLinkWithRelativeCwd(this._capabilities, link.bufferRange.start.y, text, pathSeparator) || text;
		}
		const sanitizedLink = matchLink.replace(/:\d+(:\d+)?$/, '');
		try {
			const result = await this._getExactMatch(sanitizedLink);
			if (result) {
				const { uri, isDirectory } = result;
				const linkToOpen = {
					text: matchLink,
					uri,
					bufferRange: link.bufferRange,
					type: link.type
				};
				if (uri) {
					return isDirectory ? this._localFolderInWorkspaceOpener.open(linkToOpen) : this._localFileOpener.open(linkToOpen);
				}
			}
		} catch {
			// Fallback to searching quick access
			return this._quickInputService.quickAccess.show(text);
		}
		// Fallback to searching quick access
		return this._quickInputService.quickAccess.show(text);
	}

	private async _getExactMatch(sanitizedLink: string): Promise<IResourceMatch | undefined> {
		let resourceMatch: IResourceMatch | undefined;
		if (osPathModule(this._os).isAbsolute(sanitizedLink)) {
			const scheme = this._workbenchEnvironmentService.remoteAuthority ? Schemas.vscodeRemote : Schemas.file;
			const uri = URI.from({ scheme, path: sanitizedLink });
			try {
				const fileStat = await this._fileService.stat(uri);
				resourceMatch = { uri, isDirectory: fileStat.isDirectory };
			} catch {
				// File or dir doesn't exist, continue on
			}
		}
		if (!resourceMatch) {
			const results = await this._searchService.fileSearch(
				this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
					// Remove optional :row:col from the link as openEditor supports it
					filePattern: sanitizedLink,
					maxResults: 2
				})
			);
			if (results.results.length === 1) {
				resourceMatch = { uri: results.results[0].resource };
			}
		}
		return resourceMatch;
	}
}

interface IResourceMatch {
	uri: URI | undefined;
	isDirectory?: boolean;
}

export class TerminalUrlLinkOpener implements ITerminalLinkOpener {
	constructor(
		private readonly _isRemote: boolean,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		if (!link.uri) {
			throw new Error('Tried to open a url without a resolved URI');
		}
		this._openerService.open(link.uri || URI.parse(link.text), {
			allowTunneling: this._isRemote,
			allowContributedOpeners: true,
		});
	}
}
