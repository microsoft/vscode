/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILinkComputerTarget, LinkComputer } from '../../../../../editor/common/languages/linkComputer.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ITerminalLinkDetector, ITerminalLinkResolver, ITerminalSimpleLink, TerminalBuiltinLinkType } from './links.js';
import { convertLinkRangeToBuffer, getXtermLineContent } from './terminalLinkHelpers.js';
import { getTerminalLinkType } from './terminalLocalLinkDetector.js';
import { ITerminalProcessManager } from '../../../terminal/common/terminal.js';
import type { IBufferLine, Terminal } from '@xterm/xterm';
import { ITerminalBackend, ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';

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
		private readonly _processManager: Pick<ITerminalProcessManager, 'initialCwd' | 'os' | 'remoteAuthority' | 'userHome'> & { backend?: Pick<ITerminalBackend, 'getWslPath'> },
		private readonly _linkResolver: ITerminalLinkResolver,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
	}

	async detect(lines: IBufferLine[], startLine: number, endLine: number): Promise<ITerminalSimpleLink[]> {
		const links: ITerminalSimpleLink[] = [];

		const linkComputerTarget = new TerminalLinkAdapter(this.xterm, startLine, endLine);
		const computedLinks = LinkComputer.computeLinks(linkComputerTarget);

		let resolvedLinkCount = 0;
		this._logService.trace('terminalUriLinkDetector#detect computedLinks', computedLinks);
		for (const computedLink of computedLinks) {
			const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, computedLink.range, startLine);

			// Check if the link is within the mouse position
			const uri = computedLink.url
				? (typeof computedLink.url === 'string' ? URI.parse(this._excludeLineAndColSuffix(computedLink.url)) : computedLink.url)
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

			// As a fallback URI, treat the authority as local to the workspace. This is required
			// for `ls --hyperlink` support for example which includes the hostname in the URI like
			// `file://Some-Hostname/mnt/c/foo/bar`.
			const uriCandidates: URI[] = [uri];
			if (uri.authority.length > 0) {
				uriCandidates.push(URI.from({ ...uri, authority: undefined }));
			}

			// Iterate over all candidates, pushing the candidate on the first that's verified
			this._logService.trace('terminalUriLinkDetector#detect uriCandidates', uriCandidates);
			for (const uriCandidate of uriCandidates) {
				const linkStat = await this._linkResolver.resolveLink(this._processManager, text, uriCandidate);

				// Create the link if validated
				if (linkStat) {
					const type = getTerminalLinkType(uriCandidate, linkStat.isDirectory, this._uriIdentityService, this._workspaceContextService);
					const simpleLink: ITerminalSimpleLink = {
						// Use computedLink.url if it's a string to retain the line/col suffix
						text: typeof computedLink.url === 'string' ? computedLink.url : linkStat.link,
						uri: uriCandidate,
						bufferRange,
						type
					};
					this._logService.trace('terminalUriLinkDetector#detect verified link', simpleLink);
					links.push(simpleLink);
					resolvedLinkCount++;
					break;
				}
			}

			// Stop early if too many links exist in the line
			if (++resolvedLinkCount >= Constants.MaxResolvedLinksInLine) {
				break;
			}
		}

		return links;
	}

	private _excludeLineAndColSuffix(path: string): string {
		return path.replace(/:\d+(:\d+)?$/, '');
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
