/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem, OS } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITerminalLinkDetector, ITerminalLinkResolverService, ITerminalSimpleLink, ResolvedLink, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { convertLinkRangeToBuffer, getXtermLineContent, getXtermRangesByAttr, osPathModule, updateLinkWithRelativeCwd } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IBufferLine, IBufferRange, Terminal } from 'xterm';
import { ITerminalBackend, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';

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

const enum RegexPathConstants {
	PathPrefix = '(\\.\\.?|\\~)',
	PathSeparatorClause = '\\/',
	// '":; are allowed in paths but they are often separators so ignore them
	// Also disallow \\ to prevent a catastropic backtracking case #24795
	ExcludedPathCharactersClause = '[^\\0\\s!`&*()\'":;\\\\]',
	ExcludedStartPathCharactersClause = '[^\\0\\s!`&*()\\[\\]\'":;\\\\]',
	WinOtherPathPrefix = '\\.\\.?|\\~',
	WinPathSeparatorClause = '(\\\\|\\/)',
	WinExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!`&*()\'":;]',
	WinExcludedStartPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!`&*()\\[\\]\'":;]',
}

/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
export const unixLocalLinkClause = '((' + RegexPathConstants.PathPrefix + '|(' + RegexPathConstants.ExcludedStartPathCharactersClause + RegexPathConstants.ExcludedPathCharactersClause + '*))?(' + RegexPathConstants.PathSeparatorClause + '(' + RegexPathConstants.ExcludedPathCharactersClause + ')+)+)';

export const winDrivePrefix = '(?:\\\\\\\\\\?\\\\)?[a-zA-Z]:';
/** A regex that matches paths in the form \\?\c:\foo c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
export const winLocalLinkClause = '((' + `(${winDrivePrefix}|${RegexPathConstants.WinOtherPathPrefix})` + '|(' + RegexPathConstants.WinExcludedStartPathCharactersClause + RegexPathConstants.WinExcludedPathCharactersClause + '*))?(' + RegexPathConstants.WinPathSeparatorClause + '(' + RegexPathConstants.WinExcludedPathCharactersClause + ')+)+)';

// TODO: This should eventually move to the more structured terminalLinkParsing
/** As xterm reads from DOM, space in that case is nonbreaking char ASCII code - 160,
replacing space with nonBreakningSpace or space ASCII code - 32. */
export const lineAndColumnClause = [
	'(([^:\\s\\(\\)<>\'\"\\[\\]]*) ((\\d+))(:(\\d+)))', // (file path) 336:9 [see #140780]
	'((\\S*)[\'"], line ((\\d+)( column (\\d+))?))', // "(file path)", line 45 [see #40468]
	'((\\S*)[\'"],((\\d+)(:(\\d+))?))', // "(file path)",45 [see #78205]
	'((\\S*) on line ((\\d+)(, column (\\d+))?))', // (file path) on line 8, column 13
	'((\\S*):\\s?line ((\\d+)(, col(?:umn)? (\\d+))?))', // (file path):line 8, column 13, (file path): line 8, col 13
	'(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])', // (file path)(45), (file path) (45), (file path)(45,18), (file path) (45,18), (file path)(45, 18), (file path) (45, 18), also with []
	'(([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?)' // (file path):336, (file path):336:9
].join('|').replace(/ /g, `[${'\u00A0'} ]`);

const fallbackMatchers: RegExp[] = [
	// Python style error: File "<path>", line <line>
	/^ *File (?<link>"(?<path>.+)"(, line (?<line>\d+))?)/,
	// A C++ compile error
	/^(?<link>(?<path>.+)\((?<line>\d+),(?<col>\d+)\)) :/,
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

	private _os: OperatingSystem;

	constructor(
		readonly xterm: Terminal,
		private readonly _capabilities: ITerminalCapabilityStore,
		private readonly _processManager: Pick<ITerminalProcessManager, 'initialCwd' | 'os' | 'remoteAuthority' | 'userHome'> & { backend?: Pick<ITerminalBackend, 'getWslPath'> },
		@ITerminalLinkResolverService private readonly _terminalLinkResolverService: ITerminalLinkResolverService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
		this._os = _processManager.os || OS;
	}

	async detect(lines: IBufferLine[], startLine: number, endLine: number): Promise<ITerminalSimpleLink[]> {
		const links: ITerminalSimpleLink[] = [];

		// Get the text representation of the wrapped line
		const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
		if (text === '' || text.length > Constants.MaxLineLength) {
			return [];
		}

		// clone regex to do a global search on text
		const rex = new RegExp(getLocalLinkRegex(this._os), 'g');
		let match;
		let stringIndex = -1;
		let resolvedLinkCount = 0;
		while ((match = rex.exec(text)) !== null) {
			// const link = match[typeof matcher.matchIndex !== 'number' ? 0 : matcher.matchIndex];
			let link = match[0];
			if (!link) {
				// something matched but does not comply with the given matchIndex
				// since this is most likely a bug the regex itself we simply do nothing here
				// this._logService.debug('match found without corresponding matchIndex', match, matcher);
				break;
			}

			// Get index, match.index is for the outer match which includes negated chars
			// therefore we cannot use match.index directly, instead we search the position
			// of the match group in text again
			// also correct regex and string search offsets for the next loop run
			stringIndex = text.indexOf(link, stringIndex + 1);
			rex.lastIndex = stringIndex + link.length;
			if (stringIndex < 0) {
				// invalid stringIndex (should not have happened)
				break;
			}

			// HACK: In order to support both links containing [ and ] characters as well as the
			// `<file>[<line>, <col>]` pattern, we need to detect the part after the comma and fix
			// up the link here as before that will be matched as a regular file path.
			if (link.match(/\[\d+,$/)) {
				const partialText = text.slice(rex.lastIndex);
				const suffixMatch = partialText.match(/^ \d+\]/);
				if (suffixMatch) {
					link += suffixMatch[0];
				}
			}

			// Adjust the link range to exclude a/ and b/ if it looks like a git diff
			if (
				// --- a/foo/bar
				// +++ b/foo/bar
				((text.startsWith('--- a/') || text.startsWith('+++ b/')) && stringIndex === 4) ||
				// diff --git a/foo/bar b/foo/bar
				(text.startsWith('diff --git') && (link.startsWith('a/') || link.startsWith('b/')))
			) {
				link = link.substring(2);
				stringIndex += 2;
			}

			// Don't try resolve any links of excessive length
			if (link.length > Constants.MaxResolvedLinkLength) {
				continue;
			}

			// Convert the link text's string index into a wrapped buffer range
			const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
				startColumn: stringIndex + 1,
				startLineNumber: 1,
				endColumn: stringIndex + link.length + 1,
				endLineNumber: 1
			}, startLine);

			// Get a single link candidate if the cwd of the line is known
			const linkCandidates: string[] = [];
			if (osPathModule(this._os).isAbsolute(link) || link.startsWith('~')) {
				linkCandidates.push(link);
			} else {
				if (this._capabilities.has(TerminalCapability.CommandDetection)) {
					const osModule = osPathModule(this._os);
					const absolutePath = updateLinkWithRelativeCwd(this._capabilities, bufferRange.start.y, link, osModule);
					// Only add a single exact link candidate if the cwd is available, this may cause
					// the link to not be resolved but that should only occur when the actual file does
					// not exist. Doing otherwise could cause unexpected results where handling via the
					// word link detector is preferable.
					if (absolutePath) {
						linkCandidates.push(...absolutePath);
					}
				} else {
					// Fallback to resolving against the initial cwd, removing any relative directory prefixes
					linkCandidates.push(link);
					if (link.match(/^(\.\.[\/\\])+/)) {
						linkCandidates.push(link.replace(/^(\.\.[\/\\])+/, ''));
					}
				}
			}

			// If any candidates end with special characters that are likely to not be part of the
			// link, add a candidate excluding them.
			const specialEndCharRegex = /[\[\]]$/;
			const trimRangeMap: Map<string, number> = new Map();
			const specialEndLinkCandidates: string[] = [];
			for (const candidate of linkCandidates) {
				let previous = candidate;
				let removed = previous.replace(specialEndCharRegex, '');
				let trimRange = 0;
				while (removed !== previous) {
					trimRange++;
					specialEndLinkCandidates.push(removed);
					trimRangeMap.set(removed, trimRange);
					previous = removed;
					removed = removed.replace(specialEndCharRegex, '');
				}
			}
			linkCandidates.push(...specialEndLinkCandidates);

			// Validate and add link
			const simpleLink = await this._validateAndGetLink(undefined, bufferRange, linkCandidates, trimRangeMap);
			if (simpleLink) {
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
			const result = await this._terminalLinkResolverService.resolveLink(this._processManager, link);
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

export function getLocalLinkRegex(os: OperatingSystem): RegExp {
	const baseLocalLinkClause = os === OperatingSystem.Windows ? winLocalLinkClause : unixLocalLinkClause;
	// Append line and column number regex
	return new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);
}
