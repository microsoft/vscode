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
import { ITerminalLinkOpener, ITerminalSimpleLink } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { osPathModule, updateLinkWithRelativeCwd } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkHelpers';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { QueryBuilder } from 'vs/workbench/services/search/common/queryBuilder';
import { ISearchService } from 'vs/workbench/services/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getLinkSuffix } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkParsing';
import { ILogService } from 'vs/platform/log/common/log';

export class TerminalLocalFileLinkOpener implements ITerminalLinkOpener {
	constructor(
		@IEditorService private readonly _editorService: IEditorService,
	) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		if (!link.uri) {
			throw new Error('Tried to open file link without a resolved URI');
		}
		const linkSuffix = link.parsedLink ? link.parsedLink.suffix : getLinkSuffix(link.text);
		const selection: ITextEditorSelection | undefined = linkSuffix?.row === undefined ? undefined : {
			startLineNumber: linkSuffix?.row ?? 1,
			startColumn: linkSuffix?.col ?? 1
		};
		await this._editorService.openEditor({
			resource: link.uri,
			options: { pinned: true, selection, revealIfOpened: true }
		});
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
	protected _fileQueryBuilder = this._instantiationService.createInstance(QueryBuilder);

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _initialCwd: string,
		private readonly _localFileOpener: TerminalLocalFileLinkOpener,
		private readonly _localFolderInWorkspaceOpener: TerminalLocalFolderInWorkspaceLinkOpener,
		private readonly _getOS: () => OperatingSystem,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly _workbenchEnvironmentService: IWorkbenchEnvironmentService,
	) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		const osPath = osPathModule(this._getOS());
		const pathSeparator = osPath.sep;
		// Remove file:/// and any leading ./ or ../ since quick access doesn't understand that format
		let text = link.text.replace(/^file:\/\/\/?/, '');
		text = osPath.normalize(text).replace(/^(\.+[\\/])+/, '');

		// Remove `:<one or more non number characters>` from the end of the link.
		// Examples:
		// - Ruby stack traces: <link>:in ...
		// - Grep output: <link>:<result line>
		// This only happens when the colon is _not_ followed by a forward- or back-slash as that
		// would break absolute Windows paths (eg. `C:/Users/...`).
		text = text.replace(/:[^\\/][^\d]+$/, '');

		// If any of the names of the folders in the workspace matches
		// a prefix of the link, remove that prefix and continue
		this._workspaceContextService.getWorkspace().folders.forEach((folder) => {
			if (text.substring(0, folder.name.length + 1) === folder.name + pathSeparator) {
				text = text.substring(folder.name.length + 1);
				return;
			}
		});
		let cwdResolvedText = text;
		if (this._capabilities.has(TerminalCapability.CommandDetection)) {
			cwdResolvedText = updateLinkWithRelativeCwd(this._capabilities, link.bufferRange.start.y, text, osPath, this._logService)?.[0] || text;
		}

		// Try open the cwd resolved link first
		if (await this._tryOpenExactLink(cwdResolvedText, link)) {
			return;
		}

		// If the cwd resolved text didn't match, try find the link without the cwd resolved, for
		// example when a command prints paths in a sub-directory of the current cwd
		if (text !== cwdResolvedText) {
			if (await this._tryOpenExactLink(text, link)) {
				return;
			}
		}

		// Fallback to searching quick access
		return this._quickInputService.quickAccess.show(text);
	}

	private async _getExactMatch(sanitizedLink: string): Promise<IResourceMatch | undefined> {
		// Make the link relative to the cwd if it isn't absolute
		const os = this._getOS();
		const pathModule = osPathModule(os);
		const isAbsolute = pathModule.isAbsolute(sanitizedLink);
		let absolutePath: string | undefined = isAbsolute ? sanitizedLink : undefined;
		if (!isAbsolute && this._initialCwd.length > 0) {
			absolutePath = pathModule.join(this._initialCwd, sanitizedLink);
		}

		// Try open as an absolute link
		let resourceMatch: IResourceMatch | undefined;
		if (absolutePath) {
			let normalizedAbsolutePath: string = absolutePath;
			if (os === OperatingSystem.Windows) {
				normalizedAbsolutePath = absolutePath.replace(/\\/g, '/');
				if (normalizedAbsolutePath.match(/[a-z]:/i)) {
					normalizedAbsolutePath = `/${normalizedAbsolutePath}`;
				}
			}
			let uri: URI;
			if (this._workbenchEnvironmentService.remoteAuthority) {
				uri = URI.from({
					scheme: Schemas.vscodeRemote,
					authority: this._workbenchEnvironmentService.remoteAuthority,
					path: normalizedAbsolutePath
				});
			} else {
				uri = URI.file(normalizedAbsolutePath);
			}
			try {
				const fileStat = await this._fileService.stat(uri);
				resourceMatch = { uri, isDirectory: fileStat.isDirectory };
			} catch {
				// File or dir doesn't exist, continue on
			}
		}

		// Search the workspace if an exact match based on the absolute path was not found
		if (!resourceMatch) {
			const results = await this._searchService.fileSearch(
				this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
					filePattern: sanitizedLink,
					maxResults: 2
				})
			);
			if (results.results.length > 0) {
				if (results.results.length === 1) {
					// If there's exactly 1 search result, return it regardless of whether it's
					// exact or partial.
					resourceMatch = { uri: results.results[0].resource };
				} else if (!isAbsolute) {
					// For non-absolute links, exact link matching is allowed only if there is a single an exact
					// file match. For example searching for `foo.txt` when there is no cwd information
					// available (ie. only the initial cwd) should open the file directly only if there is a
					// single file names `foo.txt` anywhere within the folder. These same rules apply to
					// relative paths with folders such as `src/foo.txt`.
					const results = await this._searchService.fileSearch(
						this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
							filePattern: `**/${sanitizedLink}`
						})
					);
					// Find an exact match if it exists
					const exactMatches = results.results.filter(e => e.resource.toString().endsWith(sanitizedLink));
					if (exactMatches.length === 1) {
						resourceMatch = { uri: exactMatches[0].resource };
					}
				}
			}
		}
		return resourceMatch;
	}

	private async _tryOpenExactLink(text: string, link: ITerminalSimpleLink): Promise<boolean> {
		const sanitizedLink = text.replace(/:\d+(:\d+)?$/, '');
		try {
			const result = await this._getExactMatch(sanitizedLink);
			if (result) {
				const { uri, isDirectory } = result;
				const linkToOpen = {
					// Use the absolute URI's path here so the optional line/col get detected
					text: result.uri.path + (text.match(/:\d+(:\d+)?$/)?.[0] || ''),
					uri,
					bufferRange: link.bufferRange,
					type: link.type
				};
				if (uri) {
					await (isDirectory ? this._localFolderInWorkspaceOpener.open(linkToOpen) : this._localFileOpener.open(linkToOpen));
					return true;
				}
			}
		} catch {
			return false;
		}
		return false;
	}
}

interface IResourceMatch {
	uri: URI;
	isDirectory?: boolean;
}

export class TerminalUrlLinkOpener implements ITerminalLinkOpener {
	constructor(
		private readonly _isRemote: boolean,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
	}

	async open(link: ITerminalSimpleLink): Promise<void> {
		if (!link.uri) {
			throw new Error('Tried to open a url without a resolved URI');
		}
		// It's important to use the raw string value here to avoid converting pre-encoded values
		// from the URL like `%2B` -> `+`.
		this._openerService.open(link.text, {
			allowTunneling: this._isRemote && this._configurationService.getValue('remote.forwardOnOpen'),
			allowContributedOpeners: true,
			openExternal: true
		});
	}
}
