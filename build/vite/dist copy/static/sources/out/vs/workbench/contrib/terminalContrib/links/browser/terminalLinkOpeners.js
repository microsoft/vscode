/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { osPathModule, updateLinkWithRelativeCwd } from './terminalLinkHelpers.js';
import { getTerminalLinkType } from './terminalLocalLinkDetector.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { QueryBuilder } from '../../../../services/search/common/queryBuilder.js';
import { ISearchService } from '../../../../services/search/common/search.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { detectLinks, getLinkSuffix } from './terminalLinkParsing.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
let TerminalLocalFileLinkOpener = class TerminalLocalFileLinkOpener {
    constructor(_editorService) {
        this._editorService = _editorService;
    }
    async open(link) {
        if (!link.uri) {
            throw new Error('Tried to open file link without a resolved URI');
        }
        const linkSuffix = link.parsedLink ? link.parsedLink.suffix : getLinkSuffix(link.text);
        let selection = link.selection;
        if (!selection) {
            selection = linkSuffix?.row === undefined ? undefined : {
                startLineNumber: linkSuffix.row ?? 1,
                startColumn: linkSuffix.col ?? 1,
                endLineNumber: linkSuffix.rowEnd,
                endColumn: linkSuffix.colEnd
            };
        }
        await this._editorService.openEditor({
            resource: link.uri,
            options: { pinned: true, selection, revealIfOpened: true }
        });
    }
};
TerminalLocalFileLinkOpener = __decorate([
    __param(0, IEditorService)
], TerminalLocalFileLinkOpener);
export { TerminalLocalFileLinkOpener };
let TerminalLocalFolderInWorkspaceLinkOpener = class TerminalLocalFolderInWorkspaceLinkOpener {
    constructor(_commandService) {
        this._commandService = _commandService;
    }
    async open(link) {
        if (!link.uri) {
            throw new Error('Tried to open folder in workspace link without a resolved URI');
        }
        await this._commandService.executeCommand('revealInExplorer', link.uri);
    }
};
TerminalLocalFolderInWorkspaceLinkOpener = __decorate([
    __param(0, ICommandService)
], TerminalLocalFolderInWorkspaceLinkOpener);
export { TerminalLocalFolderInWorkspaceLinkOpener };
let TerminalLocalFolderOutsideWorkspaceLinkOpener = class TerminalLocalFolderOutsideWorkspaceLinkOpener {
    constructor(_hostService) {
        this._hostService = _hostService;
    }
    async open(link) {
        if (!link.uri) {
            throw new Error('Tried to open folder in workspace link without a resolved URI');
        }
        this._hostService.openWindow([{ folderUri: link.uri }], { forceNewWindow: true });
    }
};
TerminalLocalFolderOutsideWorkspaceLinkOpener = __decorate([
    __param(0, IHostService)
], TerminalLocalFolderOutsideWorkspaceLinkOpener);
export { TerminalLocalFolderOutsideWorkspaceLinkOpener };
let TerminalSearchLinkOpener = class TerminalSearchLinkOpener {
    constructor(_capabilities, _initialCwd, _localFileOpener, _localFolderInWorkspaceOpener, _getOS, _fileService, instantiationService, _quickInputService, _searchService, _logService, _workbenchEnvironmentService, _workspaceContextService) {
        this._capabilities = _capabilities;
        this._initialCwd = _initialCwd;
        this._localFileOpener = _localFileOpener;
        this._localFolderInWorkspaceOpener = _localFolderInWorkspaceOpener;
        this._getOS = _getOS;
        this._fileService = _fileService;
        this._quickInputService = _quickInputService;
        this._searchService = _searchService;
        this._logService = _logService;
        this._workbenchEnvironmentService = _workbenchEnvironmentService;
        this._workspaceContextService = _workspaceContextService;
        this._fileQueryBuilder = instantiationService.createInstance(QueryBuilder);
    }
    async open(link) {
        const osPath = osPathModule(this._getOS());
        const pathSeparator = osPath.sep;
        // Remove file:/// and any leading ./ or ../ since quick access doesn't understand that format
        let text = link.text.replace(/^file:\/\/\/?/, '');
        text = osPath.normalize(text).replace(/^(\.+[\\/])+/, '');
        // Try extract any trailing line and column numbers by matching the text against parsed
        // links. This will give a search link `foo` on a line like `"foo", line 10` to open the
        // quick pick with `foo:10` as the contents.
        //
        // This also normalizes the path to remove suffixes like :10 or :5.0-4
        if (link.contextLine) {
            // Skip suffix parsing if the text looks like it contains an ISO 8601 timestamp format
            const iso8601Pattern = /:\d{2}:\d{2}[+-]\d{2}:\d{2}\.[a-z]+/;
            if (!iso8601Pattern.test(link.text)) {
                const parsedLinks = detectLinks(link.contextLine, this._getOS());
                // Optimistically check that the link _starts with_ the parsed link text. If so,
                // continue to use the parsed link
                const matchingParsedLink = parsedLinks.find(parsedLink => parsedLink.suffix && link.text.startsWith(parsedLink.path.text));
                if (matchingParsedLink) {
                    if (matchingParsedLink.suffix?.row !== undefined) {
                        // Normalize the path based on the parsed link
                        text = matchingParsedLink.path.text;
                        text += `:${matchingParsedLink.suffix.row}`;
                        if (matchingParsedLink.suffix?.col !== undefined) {
                            text += `:${matchingParsedLink.suffix.col}`;
                        }
                    }
                }
            }
        }
        // Remove `:<one or more non number characters>` from the end of the link.
        // Examples:
        // - Ruby stack traces: <link>:in ...
        // - Grep output: <link>:<result line>
        // This only happens when the colon is _not_ followed by a forward- or back-slash as that
        // would break absolute Windows paths (eg. `C:/Users/...`).
        text = text.replace(/:[^\\/\d][^\d]*$/, '');
        // Remove any trailing periods after the line/column numbers, to prevent breaking the search feature, #200257
        // Examples:
        // "Check your code Test.tsx:12:45." -> Test.tsx:12:45
        // "Check your code Test.tsx:12." -> Test.tsx:12
        text = text.replace(/\.$/, '');
        // If any of the names of the folders in the workspace matches
        // a prefix of the link, remove that prefix and continue
        this._workspaceContextService.getWorkspace().folders.forEach((folder) => {
            if (text.substring(0, folder.name.length + 1) === folder.name + pathSeparator) {
                text = text.substring(folder.name.length + 1);
                return;
            }
        });
        let cwdResolvedText = text;
        if (this._capabilities.has(2 /* TerminalCapability.CommandDetection */)) {
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
    async _getExactMatch(sanitizedLink) {
        // Make the link relative to the cwd if it isn't absolute
        const os = this._getOS();
        const pathModule = osPathModule(os);
        const isAbsolute = pathModule.isAbsolute(sanitizedLink);
        let absolutePath = isAbsolute ? sanitizedLink : undefined;
        if (!isAbsolute && this._initialCwd.length > 0) {
            absolutePath = pathModule.join(this._initialCwd, sanitizedLink);
        }
        // Try open as an absolute link
        let resourceMatch;
        if (absolutePath) {
            let normalizedAbsolutePath = absolutePath;
            if (os === 1 /* OperatingSystem.Windows */) {
                normalizedAbsolutePath = absolutePath.replace(/\\/g, '/');
                if (normalizedAbsolutePath.match(/[a-z]:/i)) {
                    normalizedAbsolutePath = `/${normalizedAbsolutePath}`;
                }
            }
            let uri;
            if (this._workbenchEnvironmentService.remoteAuthority) {
                uri = URI.from({
                    scheme: Schemas.vscodeRemote,
                    authority: this._workbenchEnvironmentService.remoteAuthority,
                    path: normalizedAbsolutePath
                });
            }
            else {
                uri = URI.file(normalizedAbsolutePath);
            }
            try {
                const fileStat = await this._fileService.stat(uri);
                resourceMatch = { uri, isDirectory: fileStat.isDirectory };
            }
            catch {
                // File or dir doesn't exist, continue on
            }
        }
        // Search the workspace if an exact match based on the absolute path was not found
        if (!resourceMatch) {
            const results = await this._searchService.fileSearch(this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
                filePattern: sanitizedLink,
                maxResults: 2
            }));
            if (results.results.length > 0) {
                if (results.results.length === 1) {
                    // If there's exactly 1 search result, return it regardless of whether it's
                    // exact or partial.
                    resourceMatch = { uri: results.results[0].resource };
                }
                else if (!isAbsolute) {
                    // For non-absolute links, exact link matching is allowed only if there is a single an exact
                    // file match. For example searching for `foo.txt` when there is no cwd information
                    // available (ie. only the initial cwd) should open the file directly only if there is a
                    // single file names `foo.txt` anywhere within the folder. These same rules apply to
                    // relative paths with folders such as `src/foo.txt`.
                    const results = await this._searchService.fileSearch(this._fileQueryBuilder.file(this._workspaceContextService.getWorkspace().folders, {
                        filePattern: `**/${sanitizedLink}`
                    }));
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
    async _tryOpenExactLink(text, link) {
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
        }
        catch {
            return false;
        }
        return false;
    }
};
TerminalSearchLinkOpener = __decorate([
    __param(5, IFileService),
    __param(6, IInstantiationService),
    __param(7, IQuickInputService),
    __param(8, ISearchService),
    __param(9, ITerminalLogService),
    __param(10, IWorkbenchEnvironmentService),
    __param(11, IWorkspaceContextService)
], TerminalSearchLinkOpener);
export { TerminalSearchLinkOpener };
let TerminalUrlLinkOpener = class TerminalUrlLinkOpener {
    constructor(_isRemote, _localFileOpener, _localFolderInWorkspaceOpener, _localFolderOutsideWorkspaceOpener, _openerService, _configurationService, _fileService, _uriIdentityService, _workspaceContextService, _logService) {
        this._isRemote = _isRemote;
        this._localFileOpener = _localFileOpener;
        this._localFolderInWorkspaceOpener = _localFolderInWorkspaceOpener;
        this._localFolderOutsideWorkspaceOpener = _localFolderOutsideWorkspaceOpener;
        this._openerService = _openerService;
        this._configurationService = _configurationService;
        this._fileService = _fileService;
        this._uriIdentityService = _uriIdentityService;
        this._workspaceContextService = _workspaceContextService;
        this._logService = _logService;
    }
    async open(link) {
        if (!link.uri) {
            throw new Error('Tried to open a url without a resolved URI');
        }
        // Handle file:// URIs by delegating to appropriate file/folder openers
        if (link.uri.scheme === Schemas.file) {
            return this._openFileSchemeLink(link);
        }
        // It's important to use the raw string value here to avoid converting pre-encoded values
        // from the URL like `%2B` -> `+`.
        this._openerService.open(link.text, {
            allowTunneling: this._isRemote && this._configurationService.getValue('remote.forwardOnOpen'),
            allowContributedOpeners: true,
            openExternal: true
        });
    }
    async _openFileSchemeLink(link) {
        if (!link.uri) {
            return;
        }
        try {
            const stat = await this._fileService.stat(link.uri);
            const isDirectory = stat.isDirectory;
            const linkType = getTerminalLinkType(link.uri, isDirectory, this._uriIdentityService, this._workspaceContextService);
            // Delegate to appropriate opener based on link type
            switch (linkType) {
                case "LocalFile" /* TerminalBuiltinLinkType.LocalFile */:
                    await this._localFileOpener.open(link);
                    return;
                case "LocalFolderInWorkspace" /* TerminalBuiltinLinkType.LocalFolderInWorkspace */:
                    await this._localFolderInWorkspaceOpener.open(link);
                    return;
                case "LocalFolderOutsideWorkspace" /* TerminalBuiltinLinkType.LocalFolderOutsideWorkspace */:
                    await this._localFolderOutsideWorkspaceOpener.open(link);
                    return;
                case "Url" /* TerminalBuiltinLinkType.Url */:
                    await this.open(link);
                    return;
            }
        }
        catch (error) {
            this._logService.warn('Open file via native file explorer');
        }
        this._openerService.open(link.text, {
            allowTunneling: this._isRemote && this._configurationService.getValue('remote.forwardOnOpen'),
            allowContributedOpeners: true,
            openExternal: true
        });
    }
};
TerminalUrlLinkOpener = __decorate([
    __param(4, IOpenerService),
    __param(5, IConfigurationService),
    __param(6, IFileService),
    __param(7, IUriIdentityService),
    __param(8, IWorkspaceContextService),
    __param(9, ITerminalLogService)
], TerminalUrlLinkOpener);
export { TerminalUrlLinkOpener };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rT3BlbmVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy9icm93c2VyL3Rlcm1pbmFsTGlua09wZW5lcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFdEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUVqRyxPQUFPLEVBQUUsWUFBWSxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbkYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0RBQW9ELENB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