/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITerminalLinkDetector, ITerminalSimpleLink, ResolvedLink, TerminalBuiltinLinkType } from 'vs/workbench/contrib/terminal/browser/links/links';
import { convertLinkRangeToBuffer, getXtermLineContent, osPathModule, updateLinkWithRelativeCwd } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IBufferLine, Terminal } from 'xterm';

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

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
// '":; are allowed in paths but they are often separators so ignore them
// Also disallow \\ to prevent a catastropic backtracking case #24795
const excludedPathCharactersClause = '[^\\0\\s!`&*()\\[\\]\'":;\\\\]';
/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
export const unixLocalLinkClause = '((' + pathPrefix + '|(' + excludedPathCharactersClause + ')+)?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + ')+)+)';

export const winDrivePrefix = '(?:\\\\\\\\\\?\\\\)?[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!`&*()\\[\\]\'":;]';
/** A regex that matches paths in the form \\?\c:\foo c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
export const winLocalLinkClause = '((' + winPathPrefix + '|(' + winExcludedPathCharactersClause + ')+)?(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)+)';

/** As xterm reads from DOM, space in that case is nonbreaking char ASCII code - 160,
replacing space with nonBreakningSpace or space ASCII code - 32. */
export const lineAndColumnClause = [
	'((\\S*)[\'"], line ((\\d+)( column (\\d+))?))', // "(file path)", line 45 [see #40468]
	'((\\S*)[\'"],((\\d+)(:(\\d+))?))', // "(file path)",45 [see #78205]
	'((\\S*) on line ((\\d+)(, column (\\d+))?))', // (file path) on line 8, column 13
	'((\\S*):line ((\\d+)(, column (\\d+))?))', // (file path):line 8, column 13
	'(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])', // (file path)(45), (file path) (45), (file path)(45,18), (file path) (45,18), (file path)(45, 18), (file path) (45, 18), also with []
	'(([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?)' // (file path):336, (file path):336:9
].join('|').replace(/ /g, `[${'\u00A0'} ]`);

// Changing any regex may effect this value, hence changes this as well if required.
export const winLineAndColumnMatchIndex = 12;
export const unixLineAndColumnMatchIndex = 11;

// Each line and column clause have 6 groups (ie no. of expressions in round brackets)
export const lineAndColumnClauseGroupCount = 6;

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
		private readonly _os: OperatingSystem,
		private readonly _resolvePath: (link: string) => Promise<ResolvedLink>,
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

			// Convert the link text's string index into a wrapped buffer range
			const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
				startColumn: stringIndex + 1,
				startLineNumber: 1,
				endColumn: stringIndex + link.length + 1,
				endLineNumber: 1
			}, startLine);


			// Don't try resolve any links of excessive length
			if (link.length > Constants.MaxResolvedLinkLength) {
				continue;
			}

			// Get a single link candidate if the cwd of the line is known
			const linkCandidates: string[] = [];
			if (osPathModule(this._os).isAbsolute(link)) {
				linkCandidates.push(link);
			} else {
				if (this._capabilities.has(TerminalCapability.CommandDetection)) {
					const absolutePath = updateLinkWithRelativeCwd(this._capabilities, bufferRange.start.y, link, osPathModule(this._os).sep);
					// Only add a single exact link candidate if the cwd is available, this may cause
					// the link to not be resolved but that should only occur when the actual file does
					// not exist. Doing otherwise could cause unexpected results where handling via the
					// word link detector is preferable.
					if (absolutePath) {
						linkCandidates.push(absolutePath);
					}
				} else {
					// Fallback to resolving against the initial cwd, removing any relative directory prefixes
					linkCandidates.push(link);
					if (link.match(/^(\.\.[\/\\])+/)) {
						linkCandidates.push(link.replace(/^(\.\.[\/\\])+/, ''));
					}
				}
			}
			const linkStat = await this._validateLinkCandidates(linkCandidates);

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

	private async _validateLinkCandidates(linkCandidates: string[]): Promise<ResolvedLink | undefined> {
		for (const link of linkCandidates) {
			const result = await this._resolvePath(link);
			if (result) {
				return result;
			}
		}
		return undefined;
	}
}

export function getLocalLinkRegex(os: OperatingSystem): RegExp {
	const baseLocalLinkClause = os === OperatingSystem.Windows ? winLocalLinkClause : unixLocalLinkClause;
	// Append line and column number regex
	return new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);
}
