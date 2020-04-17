/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, ILinkProvider, IViewportRange, IBufferCellPosition, ILink, IBufferLine } from 'xterm';
import { getXtermLineContent, convertLinkRangeToBuffer, convertBufferRangeToViewport, positionIsInRange, TOOLTIP_HOVER_THRESHOLD } from 'vs/workbench/contrib/terminal/browser/links/terminalLinkHelpers';
import { OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { IDisposable } from 'vs/base/common/lifecycle';

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
// '":; are allowed in paths but they are often separators so ignore them
// Also disallow \\ to prevent a catastropic backtracking case #24798
const excludedPathCharactersClause = '[^\\0\\s!$`&*()\\[\\]+\'":;\\\\]';
/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
const unixLocalLinkClause = '((' + pathPrefix + '|(' + excludedPathCharactersClause + ')+)?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + ')+)+)';

const winDrivePrefix = '(?:\\\\\\\\\\?\\\\)?[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]+\'":;]';
/** A regex that matches paths in the form \\?\c:\foo c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
const winLocalLinkClause = '((' + winPathPrefix + '|(' + winExcludedPathCharactersClause + ')+)?(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)+)';

/** As xterm reads from DOM, space in that case is nonbreaking char ASCII code - 160,
replacing space with nonBreakningSpace or space ASCII code - 32. */
const lineAndColumnClause = [
	'((\\S*)", line ((\\d+)( column (\\d+))?))', // "(file path)", line 45 [see #40468]
	'((\\S*)",((\\d+)(:(\\d+))?))', // "(file path)",45 [see #78205]
	'((\\S*) on line ((\\d+)(, column (\\d+))?))', // (file path) on line 8, column 13
	'((\\S*):line ((\\d+)(, column (\\d+))?))', // (file path):line 8, column 13
	'(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])', // (file path)(45), (file path) (45), (file path)(45,18), (file path) (45,18), (file path)(45, 18), (file path) (45, 18), also with []
	'(([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?)' // (file path):336, (file path):336:9
].join('|').replace(/ /g, `[${'\u00A0'} ]`);

export class TerminalValidatedLocalLinkProvider implements ILinkProvider {
	constructor(
		private readonly _xterm: Terminal,
		private readonly _processOperatingSystem: OperatingSystem,
		private readonly _activateFileCallback: (event: MouseEvent, link: string) => void,
		private readonly _activateDirectoryCallback: (event: MouseEvent, link: string, uri: URI) => void,
		private readonly _tooltipCallback: (event: MouseEvent, link: string, location: IViewportRange) => boolean | void,
		private readonly _validationCallback: (link: string, callback: (result: { uri: URI, isDirectory: boolean } | undefined) => void) => void
	) {
	}

	public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
		let startLine = position.y - 1;
		let endLine = startLine;

		const lines: IBufferLine[] = [
			this._xterm.buffer.active.getLine(startLine)!
		];

		while (this._xterm.buffer.active.getLine(startLine)?.isWrapped) {
			lines.unshift(this._xterm.buffer.active.getLine(startLine - 1)!);
			startLine--;
		}

		while (this._xterm.buffer.active.getLine(endLine + 1)?.isWrapped) {
			lines.push(this._xterm.buffer.active.getLine(endLine + 1)!);
			endLine++;
		}

		const text = getXtermLineContent(this._xterm.buffer.active, startLine, endLine);

		// clone regex to do a global search on text
		const rex = new RegExp(this._localLinkRegex, 'g');
		let match;
		let stringIndex = -1;
		while ((match = rex.exec(text)) !== null) {
			// const link = match[typeof matcher.matchIndex !== 'number' ? 0 : matcher.matchIndex];
			const link = match[0];
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

			// Convert the link text's string index into a wrapped buffer range
			const bufferRange = convertLinkRangeToBuffer(lines, this._xterm.cols, {
				startColumn: stringIndex + 1,
				startLineNumber: 1,
				endColumn: stringIndex + link.length + 1,
				endLineNumber: 1
			}, startLine);

			if (positionIsInRange(position, bufferRange)) {
				this._validationCallback(link, (result) => {
					if (result) {
						let timeout: number | undefined;
						let documentMouseOutListener: IDisposable | undefined;
						const clearTimer = () => {
							if (timeout !== undefined) {
								window.clearTimeout(timeout);
							}
							documentMouseOutListener?.dispose();
						};
						callback({
							text: link,
							range: bufferRange,
							activate: (event: MouseEvent, text: string) => {
								if (result.isDirectory) {
									this._activateDirectoryCallback(event, text, result.uri);
								} else {
									this._activateFileCallback(event, text);
								}
							},
							hover: (event: MouseEvent, text: string) => {
								documentMouseOutListener = addDisposableListener(document, EventType.MOUSE_OVER, () => clearTimer());
								timeout = window.setTimeout(() => {
									this._tooltipCallback(event, text, convertBufferRangeToViewport(bufferRange, this._xterm.buffer.active.viewportY));
									clearTimer();
								}, TOOLTIP_HOVER_THRESHOLD);
							},
							leave: () => clearTimer()
						});
					} else {
						callback(undefined);
					}
				});
			} else {
				callback(undefined);
			}
			return;
		}

		callback(undefined);
	}

	protected get _localLinkRegex(): RegExp {
		const baseLocalLinkClause = this._processOperatingSystem === OperatingSystem.Windows ? winLocalLinkClause : unixLocalLinkClause;
		// Append line and column number regex
		return new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);
	}
}
