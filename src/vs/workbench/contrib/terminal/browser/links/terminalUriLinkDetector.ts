/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { ILinkComputerTarget, LinkComputer } from 'vs/editor/common/languages/linkComputer';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITerminalLinkDetector, ITerminalSimpleLink, ResolvedLink, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { convertLinkRangeToBuffer, getXtermLineContent } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { IBufferLine, Terminal } from 'xterm';

const enum Constants {
	/**
	 * The maximum number of links in a line to resolve against the file system. This limit is put
	 * in place to avoid sending excessive data when remote connections are in place.
	 */
	MaxResolvedLinksInLine = 10
}

export class TerminalUriLinkDetector implements ITerminalLinkDetector {
	static id = 'uri';

	// 2048 is the maximum URL length
	readonly maxLinkLength = 2048;

	constructor(
		readonly xterm: Terminal,
		private readonly _resolvePath: (link: string, uri?: URI) => Promise<ResolvedLink>,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
	}

	async detect(lines: IBufferLine[], startLine: number, endLine: number): Promise<ITerminalSimpleLink[]> {
		const links: ITerminalSimpleLink[] = [];

		const linkComputerTarget = new TerminalLinkAdapter(this.xterm, startLine, endLine);
		const computedLinks = LinkComputer.computeLinks(linkComputerTarget);

		let resolvedLinkCount = 0;
		for (const computedLink of computedLinks) {
			const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, computedLink.range, startLine);

			// Check if the link is within the mouse position
			const uri = computedLink.url
				? (typeof computedLink.url === 'string' ? URI.parse(computedLink.url) : computedLink.url)
				: undefined;

			if (!uri) {
				continue;
			}

			const text = computedLink.url?.toString() || '';

			// Don't try resolve any links of excessive length
			if (text.length > this.maxLinkLength) {
				continue;
			}

			// Handle non-file scheme links
			if (uri.scheme !== Schemas.file) {
				links.push({
					text,
					uri,
					bufferRange,
					type: TerminalBuiltinLinkType.Url
				});
				continue;
			}

			// Filter out URI with unrecognized authorities
			if (uri.authority.length !== 2 && uri.authority.endsWith(':')) {
				continue;
			}

			const linkStat = await this._resolvePath(text, uri);

			// Create the link if validated
			if (linkStat) {
				let type: TerminalBuiltinLinkType;
				if (linkStat.isDirectory) {
					if (this._isDirectoryInsideWorkspace(linkStat.uri)) {
						type = TerminalBuiltinLinkType.LocalFolderInWorkspace;
					} else {
						type = TerminalBuiltinLinkType.LocalFolderOutsideWorkspace;
					}
				} else {
					type = TerminalBuiltinLinkType.LocalFile;
				}
				links.push({
					text: linkStat.link,
					uri: linkStat.uri,
					bufferRange,
					type
				});

				// Stop early if too many links exist in the line
				if (++resolvedLinkCount >= Constants.MaxResolvedLinksInLine) {
					break;
				}
			}
		}

		return links;
	}

	private _isDirectoryInsideWorkspace(uri: URI) {
		const folders = this._workspaceContextService.getWorkspace().folders;
		for (let i = 0; i < folders.length; i++) {
			if (this._uriIdentityService.extUri.isEqualOrParent(uri, folders[i].uri)) {
				return true;
			}
		}
		return false;
	}
}

class TerminalLinkAdapter implements ILinkComputerTarget {
	constructor(
		private _xterm: Terminal,
		private _lineStart: number,
		private _lineEnd: number
	) { }

	getLineCount(): number {
		return 1;
	}

	getLineContent(): string {
		return getXtermLineContent(this._xterm.buffer.active, this._lineStart, this._lineEnd, this._xterm.cols);
	}
}
