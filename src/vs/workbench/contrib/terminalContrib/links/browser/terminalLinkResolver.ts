/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalLinkResolver, ResolvedLink } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { removeLinkSuffix, removeLinkQueryString, winDrivePrefix } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkParsing';
import { URI } from 'vs/base/common/uri';
import { ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { Schemas } from 'vs/base/common/network';
import { isWindows, OperatingSystem, OS } from 'vs/base/common/platform';
import { IFileService } from 'vs/platform/files/common/files';
import { IPath, posix, win32 } from 'vs/base/common/path';
import { ITerminalBackend } from 'vs/platform/terminal/common/terminal';
import { mainWindow } from 'vs/base/browser/window';

export class TerminalLinkResolver implements ITerminalLinkResolver {
	// Link cache could be shared across all terminals, but that could lead to weird results when
	// both local and remote terminals are present
	private readonly _resolvedLinkCaches: Map<string, LinkCache> = new Map();

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) {
	}

	async resolveLink(processManager: Pick<ITerminalProcessManager, 'initialCwd' | 'os' | 'remoteAuthority' | 'userHome'> & { backend?: Pick<ITerminalBackend, 'getWslPath'> }, link: string, uri?: URI): Promise<ResolvedLink> {
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
			let uri: URI;
			if (processManager.remoteAuthority) {
				uri = URI.from({
					scheme: Schemas.vscodeRemote,
					authority: processManager.remoteAuthority,
					path: linkUrl
				});
			} else {
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
		} catch {
			// Errors in parsing the path
			cache.set(link, null);
			return null;
		}
	}

	protected _preprocessPath(link: string, initialCwd: string, os: OperatingSystem | undefined, userHome: string | undefined): string | null {
		const osPath = this._getOsPath(os);
		if (link.charAt(0) === '~') {
			// Resolve ~ -> userHome
			if (!userHome) {
				return null;
			}
			link = osPath.join(userHome, link.substring(1));
		} else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
			// Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>
			if (os === OperatingSystem.Windows) {
				if (!link.match('^' + winDrivePrefix) && !link.startsWith('\\\\?\\')) {
					if (!initialCwd) {
						// Abort if no workspace is open
						return null;
					}
					link = osPath.join(initialCwd, link);
				} else {
					// Remove \\?\ from paths so that they share the same underlying
					// uri and don't open multiple tabs for the same file
					link = link.replace(/^\\\\\?\\/, '');
				}
			} else {
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

	private _getOsPath(os: OperatingSystem | undefined): IPath {
		return (os ?? OS) === OperatingSystem.Windows ? win32 : posix;
	}
}

const enum LinkCacheConstants {
	/**
	 * How long to cache links for in milliseconds, the TTL resets whenever a new value is set in
	 * the cache.
	 */
	TTL = 10000
}

class LinkCache {
	private readonly _cache = new Map<string, ResolvedLink>();
	private _cacheTilTimeout = 0;

	set(link: string | URI, value: ResolvedLink) {
		// Reset cached link TTL on any set
		if (this._cacheTilTimeout) {
			mainWindow.clearTimeout(this._cacheTilTimeout);
		}
		this._cacheTilTimeout = mainWindow.setTimeout(() => this._cache.clear(), LinkCacheConstants.TTL);
		this._cache.set(this._getKey(link), value);
	}

	get(link: string | URI): ResolvedLink | undefined {
		return this._cache.get(this._getKey(link));
	}

	private _getKey(link: string | URI): string {
		if (URI.isUri(link)) {
			return link.toString();
		}
		return link;
	}
}
