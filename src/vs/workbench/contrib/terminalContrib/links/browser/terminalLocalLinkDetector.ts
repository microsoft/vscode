/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITerminalLinkDetector, ITerminalLinkResolver, ITerminalSimpleLink, ResolvedLink, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminalContrib/links/browser/links';
import { convertLinkRangeToBuffer, getXtermLineContent, getXtermRangesByAttr, osPathModule, updateLinkWithRelativeCwd } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkHelpers';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IBufferLine, IBufferRange, Terminal } from 'xterm';
import { ITerminalBackend, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';
import { detectLinks } from 'vs/workbench/contrib/terminalContrib/links/browser/terminalLinkParsing';
import { ILogService } from 'vs/platform/log/common/log';

const enum Constants {
	/**
	 * The max line length to try extract word links from.
	 */
	MaxLineLength = 2000,

	/**
	 * The maximum number of links in a line to resolve against the file system. This limit is put
	 * in place to avoid sending excessive data when remote connections are in place.
	 */
	MaxResolvedLinksInLine = 10,

	/**
	 * The maximum length of a link to resolve against the file system. This limit is put in place
	 * to avoid sending excessive data when remote connections are in place.
	 */
	MaxResolvedLinkLength = 1024,
}

const fallbackMatchers: RegExp[] = [
	// Python style error: File "<path>", line <line>
	/^ *File (?<link>"(?<path>.+)"(, line (?<line>\d+))?)/,
	// Some C++ compile error formats:
	// C:\foo\bar baz(339) : error ...
	// C:\foo\bar baz(339,12) : error ...
	// C:\foo\bar baz(339, 12) : error ...
	// C:\foo\bar baz(339): error ...       [#178584, Visual Studio CL/NVIDIA CUDA compiler]
	// C:\foo\bar baz(339,12): ...
	// C:\foo\bar baz(339, 12): ...
	/^(?<link>(?<path>.+)\((?<line>\d+)(?:, ?(?<col>\d+))?\)) ?:/,
	// C:\foo/bar baz:339 : error ...
	// C:\foo/bar baz:339:12 : error ...
	// C:\foo/bar baz:339: error ...
	// C:\foo/bar baz:339:12: error ...     [#178584, Clang]
	/^(?<link>(?<path>.+):(?<line>\d+)(?::(?<col>\d+))?) ?:/,
	// Cmd prompt
	/^(?<link>(?<path>.+))>/,
	// The whole line is the path
	/^ *(?<link>(?<path>.+))/
];

export class TerminalLocalLinkDetector implements ITerminalLinkDetector {
	static id = 'local';

	// This was chosen as a reasonable maximum line length given the tradeoff between performance
	// and how likely it is to encounter such a large line length. Some useful reference points:
	// - Window old max length: 260 ($MAX_PATH)
	// - Linux max length: 4096 ($PATH_MAX)
	readonly maxLinkLength = 500;

	constructor(
		readonly xterm: Terminal,
		private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _processManager: Pick<ITerminalProcessManager, 'initialCwd' | 'os' | 'remoteAuthority' | 'userHome'> & { backend?: Pick<ITerminalBackend, 'getWslPath'> },
		private readonly _linkResolver: ITerminalLinkResolver,
		@ILogService private readonly _logService: ILogService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
	}

	async detect(lines: IBufferLine[], startLine: number, endLine: number): Promise<ITerminalSimpleLink[]> {
		const links: ITerminalSimpleLink[] = [];

		// Get the text representation of the wrapped line
		const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
		if (text === '' || text.length > Constants.MaxLineLength) {
			return [];
		}

		let stringIndex = -1;
		let resolvedLinkCount = 0;

		const os = this._processManager.os || OS;
		const parsedLinks = detectLinks(text, os);
		this._logService.trace('terminalLocaLinkDetector#detect text', text);
		this._logService.trace('terminalLocaLinkDetector#detect parsedLinks', parsedLinks);
		for (const parsedLink of parsedLinks) {

			// Don't try resolve any links of excessive length
			if (parsedLink.path.text.length > Constants.MaxResolvedLinkLength) {
				continue;
			}

			// Convert the link text's string index into a wrapped buffer range
			const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
				startColumn: (parsedLink.prefix?.index ?? parsedLink.path.index) + 1,
				startLineNumber: 1,
				endColumn: parsedLink.path.index + parsedLink.path.text.length + (parsedLink.suffix?.suffix.text.length ?? 0) + 1,
				endLineNumber: 1
			}, startLine);

			// Get a single link candidate if the cwd of the line is known
			const linkCandidates: string[] = [];
			const osPath = osPathModule(os);
			if (osPath.isAbsolute(parsedLink.path.text) || parsedLink.path.text.startsWith('~')) {
				linkCandidates.push(parsedLink.path.text);
			} else {
				if (this._capabilities.has(TerminalCapability.CommandDetection)) {
					const absolutePath = updateLinkWithRelativeCwd(this._capabilities, bufferRange.start.y, parsedLink.path.text, osPath, this._logService);
					// Only add a single exact link candidate if the cwd is available, this may cause
					// the link to not be resolved but that should only occur when the actual file does
					// not exist. Doing otherwise could cause unexpected results where handling via the
					// word link detector is preferable.
					if (absolutePath) {
						linkCandidates.push(...absolutePath);
					}
				}
				// Fallback to resolving against the initial cwd, removing any relative directory prefixes
				if (linkCandidates.length === 0) {
					linkCandidates.push(parsedLink.path.text);
					if (parsedLink.path.text.match(/^(\.\.[\/\\])+/)) {
						linkCandidates.push(parsedLink.path.text.replace(/^(\.\.[\/\\])+/, ''));
					}
				}
			}

			// If any candidates end with special characters that are likely to not be part of the
			// link, add a candidate excluding them.
			const specialEndCharRegex = /[\[\]"']$/;
			const trimRangeMap: Map<string, number> = new Map();
			const specialEndLinkCandidates: string[] = [];
			for (const candidate of linkCandidates) {
				let previous = candidate;
				let removed = previous.replace(specialEndCharRegex, '');
				let trimRange = 0;
				while (removed !== previous) {
					// Only trim the link if there is no suffix, otherwise the underline would be incorrect
					if (!parsedLink.suffix) {
						trimRange++;
					}
					specialEndLinkCandidates.push(removed);
					trimRangeMap.set(removed, trimRange);
					previous = removed;
					removed = removed.replace(specialEndCharRegex, '');
				}
			}
			linkCandidates.push(...specialEndLinkCandidates);
			this._logService.trace('terminalLocaLinkDetector#detect linkCandidates', linkCandidates);

			// Validate the path and convert to the outgoing type
			const simpleLink = await this._validateAndGetLink(undefined, bufferRange, linkCandidates, trimRangeMap);
			if (simpleLink) {
				simpleLink.parsedLink = parsedLink;
				simpleLink.text = text.substring(
					parsedLink.prefix?.index ?? parsedLink.path.index,
					parsedLink.suffix ? parsedLink.suffix.suffix.index + parsedLink.suffix.suffix.text.length : parsedLink.path.index + parsedLink.path.text.length
				);
				this._logService.trace('terminalLocaLinkDetector#detect verified link', simpleLink);
				links.push(simpleLink);
			}

			// Stop early if too many links exist in the line
			if (++resolvedLinkCount >= Constants.MaxResolvedLinksInLine) {
				break;
			}
		}

		// Match against the fallback matchers which are mainly designed to catch paths with spaces
		// that aren't possible using the regular mechanism.
		if (links.length === 0) {
			for (const matcher of fallbackMatchers) {
				const match = text.match(matcher);
				const group = match?.groups;
				if (!group) {
					continue;
				}
				const link = group?.link;
				const path = group?.path;
				const line = group?.line;
				const col = group?.col;
				if (!link || !path) {
					continue;
				}

				// Don't try resolve any links of excessive length
				if (link.length > Constants.MaxResolvedLinkLength) {
					continue;
				}

				// Convert the link text's string index into a wrapped buffer range
				stringIndex = text.indexOf(link);
				const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
					startColumn: stringIndex + 1,
					startLineNumber: 1,
					endColumn: stringIndex + link.length + 1,
					endLineNumber: 1
				}, startLine);

				// Validate and add link
				const suffix = line ? `:${line}${col ? `:${col}` : ''}` : '';
				const simpleLink = await this._validateAndGetLink(`${path}${suffix}`, bufferRange, [path]);
				if (simpleLink) {
					links.push(simpleLink);
				}

				// Only match a single fallback matcher
				break;
			}
		}

		// Sometimes links are styled specially in the terminal like underlined or bolded, try split
		// the line by attributes and test whether it matches a path
		if (links.length === 0) {
			const rangeCandidates = getXtermRangesByAttr(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
			for (const rangeCandidate of rangeCandidates) {
				let text = '';
				for (let y = rangeCandidate.start.y; y <= rangeCandidate.end.y; y++) {
					const line = this.xterm.buffer.active.getLine(y);
					if (!line) {
						break;
					}
					const lineStartX = y === rangeCandidate.start.y ? rangeCandidate.start.x : 0;
					const lineEndX = y === rangeCandidate.end.y ? rangeCandidate.end.x : this.xterm.cols - 1;
					text += line.translateToString(false, lineStartX, lineEndX);
				}

				// HACK: Adjust to 1-based for link API
				rangeCandidate.start.x++;
				rangeCandidate.start.y++;
				rangeCandidate.end.y++;

				// Validate and add link
				const simpleLink = await this._validateAndGetLink(text, rangeCandidate, [text]);
				if (simpleLink) {
					links.push(simpleLink);
				}

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

	private async _validateLinkCandidates(linkCandidates: string[]): Promise<ResolvedLink | undefined> {
		for (const link of linkCandidates) {
			const result = await this._linkResolver.resolveLink(this._processManager, link);
			if (result) {
				return result;
			}
		}
		return undefined;
	}

	/**
	 * Validates a set of link candidates and returns a link if validated.
	 * @param linkText The link text, this should be undefined to use the link stat value
	 * @param trimRangeMap A map of link candidates to the amount of buffer range they need trimmed.
	 */
	private async _validateAndGetLink(linkText: string | undefined, bufferRange: IBufferRange, linkCandidates: string[], trimRangeMap?: Map<string, number>): Promise<ITerminalSimpleLink | undefined> {
		const linkStat = await this._validateLinkCandidates(linkCandidates);
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

			// Offset the buffer range if the link range was trimmed
			const trimRange = trimRangeMap?.get(linkStat.link);
			if (trimRange) {
				bufferRange.end.x -= trimRange;
				if (bufferRange.end.x < 0) {
					bufferRange.end.y--;
					bufferRange.end.x += this.xterm.cols;
				}
			}

			return {
				text: linkText ?? linkStat.link,
				uri: linkStat.uri,
				bufferRange: bufferRange,
				type
			};
		}
		return undefined;
	}
}
