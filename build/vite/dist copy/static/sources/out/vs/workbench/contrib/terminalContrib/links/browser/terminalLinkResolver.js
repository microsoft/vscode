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
import { removeLinkSuffix, removeLinkQueryString, winDrivePrefix } from './terminalLinkParsing.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWindows, OS } from '../../../../../base/common/platform.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { posix, win32 } from '../../../../../base/common/path.js';
import { mainWindow } from '../../../../../base/browser/window.js';
let TerminalLinkResolver = class TerminalLinkResolver {
    constructor(_fileService) {
        this._fileService = _fileService;
        // Link cache could be shared across all terminals, but that could lead to weird results when
        // both local and remote terminals are present
        this._resolvedLinkCaches = new Map();
    }
    async resolveLink(processManager, link, uri) {
        // Correct scheme and authority for remote terminals
        if (uri && uri.scheme === Schemas.file && processManager.remoteAuthority) {
            uri = uri.with({
                scheme: Schemas.vscodeRemote,
                authority: processManager.remoteAuthority
            });
        }
        // Get the link cache
        let cache = this._resolvedLinkCaches.get(processManager.remoteAuthority ?? '');
        if (!cache) {
            cache = new LinkCache();
            this._resolvedLinkCaches.set(processManager.remoteAuthority ?? '', cache);
        }
        // Check resolved link cache first
        const cached = cache.get(uri || link);
        if (cached !== undefined) {
            return cached;
        }
        if (uri) {
            try {
                const stat = await this._fileService.stat(uri);
                const result = { uri, link, isDirectory: stat.isDirectory };
                cache.set(uri, result);
                return result;
            }
            catch (e) {
                // Does not exist
                cache.set(uri, null);
                return null;
            }
        }
        // Remove any line/col suffix
        let linkUrl = removeLinkSuffix(link);
        // Remove any query string
        linkUrl = removeLinkQueryString(linkUrl);
        // Exit early if the link is determines as not valid already
        if (linkUrl.length === 0) {
            cache.set(link, null);
            return null;
        }
        // If the link looks like a /mnt/ WSL path and this is a Windows frontend, use the backend
        // to get the resolved path from the wslpath util.
        if (isWindows && link.match(/^\/mnt\/[a-z]/i) && processManager.backend) {
            linkUrl = await processManager.backend.getWslPath(linkUrl, 'unix-to-win');
        }
        // Skip preprocessing if it looks like a special Windows -> WSL link
        else if (isWindows && link.match(/^(?:\/\/|\\\\)wsl(?:\$|\.localhost)(\/|\\)/)) {
            // No-op, it's already the right format
        }
        // Handle all non-WSL links
        else {
            const preprocessedLink = this._preprocessPath(linkUrl, processManager.initialCwd, processManager.os, processManager.userHome);
            if (!preprocessedLink) {
                cache.set(link, null);
                return null;
            }
            linkUrl = preprocessedLink;
        }
        try {
            let uri;
            if (processManager.remoteAuthority) {
                uri = URI.from({
                    scheme: Schemas.vscodeRemote,
                    authority: processManager.remoteAuthority,
                    path: linkUrl
                });
            }
            else {
                uri = URI.file(linkUrl);
            }
            try {
                const stat = await this._fileService.stat(uri);
                const result = { uri, link, isDirectory: stat.isDirectory };
                cache.set(link, result);
                return result;
            }
            catch (e) {
                // Does not exist
                cache.set(link, null);
                return null;
            }
        }
        catch {
            // Errors in parsing the path
            cache.set(link, null);
            return null;
        }
    }
    _preprocessPath(link, initialCwd, os, userHome) {
        const osPath = this._getOsPath(os);
        if (link.charAt(0) === '~') {
            // Resolve ~ -> userHome
            if (!userHome) {
                return null;
            }
            link = osPath.join(userHome, link.substring(1));
        }
        else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
            // Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>
            if (os === 1 /* OperatingSystem.Windows */) {
                if (!link.match('^' + winDrivePrefix) && !link.startsWith('\\\\?\\')) {
                    if (!initialCwd) {
                        // Abort if no workspace is open
                        return null;
                    }
                    link = osPath.join(initialCwd, link);
                }
                else {
                    // Remove \\?\ from paths so that they share the same underlying
                    // uri and don't open multiple tabs for the same file
                    link = link.replace(/^\\\\\?\\/, '');
                }
            }
            else {
                if (!initialCwd) {
                    // Abort if no workspace is open
                    return null;
                }
                link = osPath.join(initialCwd, link);
            }
        }
        link = osPath.normalize(link);
        return link;
    }
    _getOsPath(os) {
        return (os ?? OS) === 1 /* OperatingSystem.Windows */ ? win32 : posix;
    }
};
TerminalLinkResolver = __decorate([
    __param(0, IFileService)
], TerminalLinkResolver);
export { TerminalLinkResolver };
var LinkCacheConstants;
(function (LinkCacheConstants) {
    /**
     * How long to cache links for in milliseconds, the TTL resets whenever a new value is set in
     * the cache.
     */
    LinkCacheConstants[LinkCacheConstants["TTL"] = 10000] = "TTL";
})(LinkCacheConstants || (LinkCacheConstants = {}));
class LinkCache {
    constructor() {
        this._cache = new Map();
        this._cacheTilTimeout = 0;
    }
    set(link, value) {
        // Reset cached link TTL on any set
        if (this._cacheTilTimeout) {
            mainWindow.clearTimeout(this._cacheTilTimeout);
        }
        this._cacheTilTimeout = mainWindow.setTimeout(() => this._cache.clear(), 10000 /* LinkCacheConstants.TTL */);
        this._cache.set(this._getKey(link), value);
    }
    get(link) {
        return this._cache.get(this._getKey(link));
    }
    _getKey(link) {
        if (URI.isUri(link)) {
            return link.toString();
        }
        return link;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rUmVzb2x2ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvbGlua3MvYnJvd3Nlci90ZXJtaW5hbExpbmtSZXNvbHZlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsY0FBYyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbkcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFtQixFQUFFLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFTLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUV6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFNUQsSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBb0I7SUFLaEMsWUFDZSxZQUEyQztRQUExQixpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUwxRCw2RkFBNkY7UUFDN0YsOENBQThDO1FBQzdCLHdCQUFtQixHQUEyQixJQUFJLEdBQUcsRUFBRSxDQUFDO0lBS3pFLENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVyxDQUFDLGNBQXdKLEVBQUUsSUFBWSxFQUFFLEdBQVM7UUFDbE0sb0RBQW9EO1FBQ3BELElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLElBQUksSUFBSSxjQUFjLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUUsR0FBRyxH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