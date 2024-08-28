/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { EventEmitter } from 'events';
import { StringDecoder } from 'string_decoder';
import { coalesce, mapArrayOrNot } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { groupBy } from 'vs/base/common/collections';
import { splitGlobAware } from 'vs/base/common/glob';
import { createRegExp, escapeRegExpCharacters } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { Progress } from 'vs/platform/progress/common/progress';
import { DEFAULT_MAX_SEARCH_RESULTS, IExtendedExtensionSearchOptions, ITextSearchPreviewOptions, SearchError, SearchErrorCode, serializeSearchError, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { Range, TextSearchCompleteNew, TextSearchContextNew, TextSearchMatchNew, TextSearchProviderOptions, TextSearchQueryNew, TextSearchResultNew } from 'vs/workbench/services/search/common/searchExtTypes';
import { AST as ReAST, RegExpParser, RegExpVisitor } from 'vscode-regexpp';
import { rgPath } from '@vscode/ripgrep';
import { anchorGlob, IOutputChannel, Maybe, rangeToSearchRange, searchRangeToRange } from './ripgrepSearchUtils';
import type { RipgrepTextSearchOptions } from 'vs/workbench/services/search/common/searchExtTypesInternal';
import { newToOldPreviewOptions } from 'vs/workbench/services/search/common/searchExtConversionTypes';

// If @vscode/ripgrep is in an .asar file, then the binary is unpacked.
const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');

export class RipgrepTextSearchEngine {

	constructor(private outputChannel: IOutputChannel, private readonly _numThreads?: number | undefined) { }

	provideTextSearchResults(query: TextSearchQueryNew, options: TextSearchProviderOptions, progress: Progress<TextSearchResultNew>, token: CancellationToken): Promise<TextSearchCompleteNew> {
		return Promise.all(options.folderOptions.map(folderOption => {
			const extendedOptions: RipgrepTextSearchOptions = {
				folderOptions: folderOption,
				numThreads: this._numThreads,
				maxResults: options.maxResults,
				previewOptions: options.previewOptions,
				maxFileSize: options.maxFileSize,
				surroundingContext: options.surroundingContext
			};
			return this.provideTextSearchResultsWithRgOptions(query, extendedOptions, progress, token);
		})).then((e => {
			const complete: TextSearchCompleteNew = {
				// todo: get this to actually check
				limitHit: e.some(complete => !!complete && complete.limitHit)
			};
			return complete;
		}));
	}

	provideTextSearchResultsWithRgOptions(query: TextSearchQueryNew, options: RipgrepTextSearchOptions, progress: Progress<TextSearchResultNew>, token: CancellationToken): Promise<TextSearchCompleteNew> {
		this.outputChannel.appendLine(`provideTextSearchResults ${query.pattern}, ${JSON.stringify({
			...options,
			...{
				folder: options.folderOptions.folder.toString()
			}
		})}`);

		return new Promise((resolve, reject) => {
			token.onCancellationRequested(() => cancel());

			const extendedOptions: RipgrepTextSearchOptions = {
				...options,
				numThreads: this._numThreads
			};
			const rgArgs = getRgArgs(query, extendedOptions);

			const cwd = options.folderOptions.folder.fsPath;

			const escapedArgs = rgArgs
				.map(arg => arg.match(/^-/) ? arg : `'${arg}'`)
				.join(' ');
			this.outputChannel.appendLine(`${rgDiskPath} ${escapedArgs}\n - cwd: ${cwd}`);

			let rgProc: Maybe<cp.ChildProcess> = cp.spawn(rgDiskPath, rgArgs, { cwd });
			rgProc.on('error', e => {
				console.error(e);
				this.outputChannel.appendLine('Error: ' + (e && e.message));
				reject(serializeSearchError(new SearchError(e && e.message, SearchErrorCode.rgProcessError)));
			});

			let gotResult = false;
			const ripgrepParser = new RipgrepParser(options.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS, options.folderOptions.folder, newToOldPreviewOptions(options.previewOptions));
			ripgrepParser.on('result', (match: TextSearchResultNew) => {
				gotResult = true;
				dataWithoutResult = '';
				progress.report(match);
			});

			let isDone = false;
			const cancel = () => {
				isDone = true;

				rgProc?.kill();

				ripgrepParser?.cancel();
			};

			let limitHit = false;
			ripgrepParser.on('hitLimit', () => {
				limitHit = true;
				cancel();
			});

			let dataWithoutResult = '';
			rgProc.stdout!.on('data', data => {
				ripgrepParser.handleData(data);
				if (!gotResult) {
					dataWithoutResult += data;
				}
			});

			let gotData = false;
			rgProc.stdout!.once('data', () => gotData = true);

			let stderr = '';
			rgProc.stderr!.on('data', data => {
				const message = data.toString();
				this.outputChannel.appendLine(message);

				if (stderr.length + message.length < 1e6) {
					stderr += message;
				}
			});

			rgProc.on('close', () => {
				this.outputChannel.appendLine(gotData ? 'Got data from stdout' : 'No data from stdout');
				this.outputChannel.appendLine(gotResult ? 'Got result from parser' : 'No result from parser');
				if (dataWithoutResult) {
					this.outputChannel.appendLine(`Got data without result: ${dataWithoutResult}`);
				}

				this.outputChannel.appendLine('');

				if (isDone) {
					resolve({ limitHit });
				} else {
					// Trigger last result
					ripgrepParser.flush();
					rgProc = null;
					let searchError: Maybe<SearchError>;
					if (stderr && !gotData && (searchError = rgErrorMsgForDisplay(stderr))) {
						reject(serializeSearchError(new SearchError(searchError.message, searchError.code)));
					} else {
						resolve({ limitHit });
					}
				}
			});
		});
	}
}

/**
 * Read the first line of stderr and return an error for display or undefined, based on a list of
 * allowed properties.
 * Ripgrep produces stderr output which is not from a fatal error, and we only want the search to be
 * "failed" when a fatal error was produced.
 */
function rgErrorMsgForDisplay(msg: string): Maybe<SearchError> {
	const lines = msg.split('\n');
	const firstLine = lines[0].trim();

	if (lines.some(l => l.startsWith('regex parse error'))) {
		return new SearchError(buildRegexParseError(lines), SearchErrorCode.regexParseError);
	}

	const match = firstLine.match(/grep config error: unknown encoding: (.*)/);
	if (match) {
		return new SearchError(`Unknown encoding: ${match[1]}`, SearchErrorCode.unknownEncoding);
	}

	if (firstLine.startsWith('error parsing glob')) {
		// Uppercase first letter
		return new SearchError(firstLine.charAt(0).toUpperCase() + firstLine.substr(1), SearchErrorCode.globParseError);
	}

	if (firstLine.startsWith('the literal')) {
		// Uppercase first letter
		return new SearchError(firstLine.charAt(0).toUpperCase() + firstLine.substr(1), SearchErrorCode.invalidLiteral);
	}

	if (firstLine.startsWith('PCRE2: error compiling pattern')) {
		return new SearchError(firstLine, SearchErrorCode.regexParseError);
	}

	return undefined;
}

function buildRegexParseError(lines: string[]): string {
	const errorMessage: string[] = ['Regex parse error'];
	const pcre2ErrorLine = lines.filter(l => (l.startsWith('PCRE2:')));
	if (pcre2ErrorLine.length >= 1) {
		const pcre2ErrorMessage = pcre2ErrorLine[0].replace('PCRE2:', '');
		if (pcre2ErrorMessage.indexOf(':') !== -1 && pcre2ErrorMessage.split(':').length >= 2) {
			const pcre2ActualErrorMessage = pcre2ErrorMessage.split(':')[1];
			errorMessage.push(':' + pcre2ActualErrorMessage);
		}
	}

	return errorMessage.join('');
}


export class RipgrepParser extends EventEmitter {
	private remainder = '';
	private isDone = false;
	private hitLimit = false;
	private stringDecoder: StringDecoder;

	private numResults = 0;

	constructor(private maxResults: number, private root: URI, private previewOptions: ITextSearchPreviewOptions) {
		super();
		this.stringDecoder = new StringDecoder();
	}

	cancel(): void {
		this.isDone = true;
	}

	flush(): void {
		this.handleDecodedData(this.stringDecoder.end());
	}


	override on(event: 'result', listener: (result: TextSearchResultNew) => void): this;
	override on(event: 'hitLimit', listener: () => void): this;
	override on(event: string, listener: (...args: any[]) => void): this {
		super.on(event, listener);
		return this;
	}

	handleData(data: Buffer | string): void {
		if (this.isDone) {
			return;
		}

		const dataStr = typeof data === 'string' ? data : this.stringDecoder.write(data);
		this.handleDecodedData(dataStr);
	}

	private handleDecodedData(decodedData: string): void {
		// check for newline before appending to remainder
		let newlineIdx = decodedData.indexOf('\n');

		// If the previous data chunk didn't end in a newline, prepend it to this chunk
		const dataStr = this.remainder + decodedData;

		if (newlineIdx >= 0) {
			newlineIdx += this.remainder.length;
		} else {
			// Shortcut
			this.remainder = dataStr;
			return;
		}

		let prevIdx = 0;
		while (newlineIdx >= 0) {
			this.handleLine(dataStr.substring(prevIdx, newlineIdx).trim());
			prevIdx = newlineIdx + 1;
			newlineIdx = dataStr.indexOf('\n', prevIdx);
		}

		this.remainder = dataStr.substring(prevIdx);
	}


	private handleLine(outputLine: string): void {
		if (this.isDone || !outputLine) {
			return;
		}

		let parsedLine: IRgMessage;
		try {
			parsedLine = JSON.parse(outputLine);
		} catch (e) {
			throw new Error(`malformed line from rg: ${outputLine}`);
		}

		if (parsedLine.type === 'match') {
			const matchPath = bytesOrTextToString(parsedLine.data.path);
			const uri = URI.joinPath(this.root, matchPath);
			const result = this.createTextSearchMatch(parsedLine.data, uri);
			this.onResult(result);

			if (this.hitLimit) {
				this.cancel();
				this.emit('hitLimit');
			}
		} else if (parsedLine.type === 'context') {
			const contextPath = bytesOrTextToString(parsedLine.data.path);
			const uri = URI.joinPath(this.root, contextPath);
			const result = this.createTextSearchContexts(parsedLine.data, uri);
			result.forEach(r => this.onResult(r));
		}
	}

	private createTextSearchMatch(data: IRgMatch, uri: URI): TextSearchMatchNew {
		const lineNumber = data.line_number - 1;
		const fullText = bytesOrTextToString(data.lines);
		const fullTextBytes = Buffer.from(fullText);

		let prevMatchEnd = 0;
		let prevMatchEndCol = 0;
		let prevMatchEndLine = lineNumber;

		// it looks like certain regexes can match a line, but cause rg to not
		// emit any specific submatches for that line.
		// https://github.com/microsoft/vscode/issues/100569#issuecomment-738496991
		if (data.submatches.length === 0) {
			data.submatches.push(
				fullText.length
					? { start: 0, end: 1, match: { text: fullText[0] } }
					: { start: 0, end: 0, match: { text: '' } }
			);
		}

		const ranges = coalesce(data.submatches.map((match, i) => {
			if (this.hitLimit) {
				return null;
			}

			this.numResults++;
			if (this.numResults >= this.maxResults) {
				// Finish the line, then report the result below
				this.hitLimit = true;
			}

			const matchText = bytesOrTextToString(match.match);

			const inBetweenText = fullTextBytes.slice(prevMatchEnd, match.start).toString();
			const inBetweenStats = getNumLinesAndLastNewlineLength(inBetweenText);
			const startCol = inBetweenStats.numLines > 0 ?
				inBetweenStats.lastLineLength :
				inBetweenStats.lastLineLength + prevMatchEndCol;

			const stats = getNumLinesAndLastNewlineLength(matchText);
			const startLineNumber = inBetweenStats.numLines + prevMatchEndLine;
			const endLineNumber = stats.numLines + startLineNumber;
			const endCol = stats.numLines > 0 ?
				stats.lastLineLength :
				stats.lastLineLength + startCol;

			prevMatchEnd = match.end;
			prevMatchEndCol = endCol;
			prevMatchEndLine = endLineNumber;

			return new Range(startLineNumber, startCol, endLineNumber, endCol);
		}));

		const searchRange = mapArrayOrNot(<Range[]>ranges, rangeToSearchRange);

		const internalResult = new TextSearchMatch(fullText, searchRange, this.previewOptions);
		return new TextSearchMatchNew(
			uri,
			internalResult.rangeLocations.map(e => (
				{
					sourceRange: searchRangeToRange(e.source),
					previewRange: searchRangeToRange(e.preview),
				}
			)),
			internalResult.previewText);
	}

	private createTextSearchContexts(data: IRgMatch, uri: URI): TextSearchContextNew[] {
		const text = bytesOrTextToString(data.lines);
		const startLine = data.line_number;
		return text
			.replace(/\r?\n$/, '')
			.split('\n')
			.map((line, i) => new TextSearchContextNew(uri, line, startLine + i));
	}

	private onResult(match: TextSearchResultNew): void {
		this.emit('result', match);
	}
}

function bytesOrTextToString(obj: any): string {
	return obj.bytes ?
		Buffer.from(obj.bytes, 'base64').toString() :
		obj.text;
}

function getNumLinesAndLastNewlineLength(text: string): { numLines: number; lastLineLength: number } {
	const re = /\n/g;
	let numLines = 0;
	let lastNewlineIdx = -1;
	let match: ReturnType<typeof re.exec>;
	while (match = re.exec(text)) {
		numLines++;
		lastNewlineIdx = match.index;
	}

	const lastLineLength = lastNewlineIdx >= 0 ?
		text.length - lastNewlineIdx - 1 :
		text.length;

	return { numLines, lastLineLength };
}

// exported for testing
export function getRgArgs(query: TextSearchQueryNew, options: RipgrepTextSearchOptions): string[] {
	const args = ['--hidden', '--no-require-git'];
	args.push(query.isCaseSensitive ? '--case-sensitive' : '--ignore-case');

	const { doubleStarIncludes, otherIncludes } = groupBy(
		options.folderOptions.includes,
		(include: string) => include.startsWith('**') ? 'doubleStarIncludes' : 'otherIncludes');

	if (otherIncludes && otherIncludes.length) {
		const uniqueOthers = new Set<string>();
		otherIncludes.forEach(other => { uniqueOthers.add(other); });

		args.push('-g', '!*');
		uniqueOthers
			.forEach(otherIncude => {
				spreadGlobComponents(otherIncude)
					.map(anchorGlob)
					.forEach(globArg => {
						args.push('-g', globArg);
					});
			});
	}

	if (doubleStarIncludes && doubleStarIncludes.length) {
		doubleStarIncludes.forEach(globArg => {
			args.push('-g', globArg);
		});
	}

	options.folderOptions.excludes.map(e => typeof (e) === 'string' ? e : e.pattern)
		.map(anchorGlob)
		.forEach(rgGlob => args.push('-g', `!${rgGlob}`));

	if (options.maxFileSize) {
		args.push('--max-filesize', options.maxFileSize + '');
	}

	if (options.folderOptions.useIgnoreFiles.local) {
		if (!options.folderOptions.useIgnoreFiles.parent) {
			args.push('--no-ignore-parent');
		}
	} else {
		// Don't use .gitignore or .ignore
		args.push('--no-ignore');
	}

	if (options.folderOptions.followSymlinks) {
		args.push('--follow');
	}

	if (options.folderOptions.encoding && options.folderOptions.encoding !== 'utf8') {
		args.push('--encoding', options.folderOptions.encoding);
	}

	if (options.numThreads) {
		args.push('--threads', `${options.numThreads}`);
	}

	// Ripgrep handles -- as a -- arg separator. Only --.
	// - is ok, --- is ok, --some-flag is also ok. Need to special case.
	if (query.pattern === '--') {
		query.isRegExp = true;
		query.pattern = '\\-\\-';
	}

	if (query.isMultiline && !query.isRegExp) {
		query.pattern = escapeRegExpCharacters(query.pattern);
		query.isRegExp = true;
	}

	if ((<IExtendedExtensionSearchOptions>options).usePCRE2) {
		args.push('--pcre2');
	}

	// Allow $ to match /r/n
	args.push('--crlf');

	if (query.isRegExp) {
		query.pattern = unicodeEscapesToPCRE2(query.pattern);
		args.push('--engine', 'auto');
	}

	let searchPatternAfterDoubleDashes: Maybe<string>;
	if (query.isWordMatch) {
		const regexp = createRegExp(query.pattern, !!query.isRegExp, { wholeWord: query.isWordMatch });
		const regexpStr = regexp.source.replace(/\\\//g, '/'); // RegExp.source arbitrarily returns escaped slashes. Search and destroy.
		args.push('--regexp', regexpStr);
	} else if (query.isRegExp) {
		let fixedRegexpQuery = fixRegexNewline(query.pattern);
		fixedRegexpQuery = fixNewline(fixedRegexpQuery);
		args.push('--regexp', fixedRegexpQuery);
	} else {
		searchPatternAfterDoubleDashes = query.pattern;
		args.push('--fixed-strings');
	}

	args.push('--no-config');
	if (!options.folderOptions.useIgnoreFiles.global) {
		args.push('--no-ignore-global');
	}

	args.push('--json');

	if (query.isMultiline) {
		args.push('--multiline');
	}

	if (options.surroundingContext) {
		args.push('--before-context', options.surroundingContext + '');
		args.push('--after-context', options.surroundingContext + '');
	}

	// Folder to search
	args.push('--');

	if (searchPatternAfterDoubleDashes) {
		// Put the query after --, in case the query starts with a dash
		args.push(searchPatternAfterDoubleDashes);
	}

	args.push('.');

	return args;
}

/**
 * `"foo/*bar/something"` -> `["foo", "foo/*bar", "foo/*bar/something", "foo/*bar/something/**"]`
 */
function spreadGlobComponents(globComponent: string): string[] {
	const globComponentWithBraceExpansion = performBraceExpansionForRipgrep(globComponent);

	return globComponentWithBraceExpansion.flatMap((globArg) => {
		const components = splitGlobAware(globArg, '/');
		return components.map((_, i) => components.slice(0, i + 1).join('/'));
	});

}

export function unicodeEscapesToPCRE2(pattern: string): string {
	// Match \u1234
	const unicodePattern = /((?:[^\\]|^)(?:\\\\)*)\\u([a-z0-9]{4})/gi;

	while (pattern.match(unicodePattern)) {
		pattern = pattern.replace(unicodePattern, `$1\\x{$2}`);
	}

	// Match \u{1234}
	// \u with 5-6 characters will be left alone because \x only takes 4 characters.
	const unicodePatternWithBraces = /((?:[^\\]|^)(?:\\\\)*)\\u\{([a-z0-9]{4})\}/gi;
	while (pattern.match(unicodePatternWithBraces)) {
		pattern = pattern.replace(unicodePatternWithBraces, `$1\\x{$2}`);
	}

	return pattern;
}

export interface IRgMessage {
	type: 'match' | 'context' | string;
	data: IRgMatch;
}

export interface IRgMatch {
	path: IRgBytesOrText;
	lines: IRgBytesOrText;
	line_number: number;
	absolute_offset: number;
	submatches: IRgSubmatch[];
}

export interface IRgSubmatch {
	match: IRgBytesOrText;
	start: number;
	end: number;
}

export type IRgBytesOrText = { bytes: string } | { text: string };

const isLookBehind = (node: ReAST.Node) => node.type === 'Assertion' && node.kind === 'lookbehind';

export function fixRegexNewline(pattern: string): string {
	// we parse the pattern anew each tiem
	let re: ReAST.Pattern;
	try {
		re = new RegExpParser().parsePattern(pattern);
	} catch {
		return pattern;
	}

	let output = '';
	let lastEmittedIndex = 0;
	const replace = (start: number, end: number, text: string) => {
		output += pattern.slice(lastEmittedIndex, start) + text;
		lastEmittedIndex = end;
	};

	const context: ReAST.Node[] = [];
	const visitor = new RegExpVisitor({
		onCharacterEnter(char) {
			if (char.raw !== '\\n') {
				return;
			}

			const parent = context[0];
			if (!parent) {
				// simple char, \n -> \r?\n
				replace(char.start, char.end, '\\r?\\n');
			} else if (context.some(isLookBehind)) {
				// no-op in a lookbehind, see #100569
			} else if (parent.type === 'CharacterClass') {
				if (parent.negate) {
					// negative bracket expr, [^a-z\n] -> (?![a-z]|\r?\n)
					const otherContent = pattern.slice(parent.start + 2, char.start) + pattern.slice(char.end, parent.end - 1);
					if (parent.parent?.type === 'Quantifier') {
						// If quantified, we can't use a negative lookahead in a quantifier.
						// But `.` already doesn't match new lines, so we can just use that
						// (with any other negations) instead.
						replace(parent.start, parent.end, otherContent ? `[^${otherContent}]` : '.');
					} else {
						replace(parent.start, parent.end, '(?!\\r?\\n' + (otherContent ? `|[${otherContent}]` : '') + ')');
					}
				} else {
					// positive bracket expr, [a-z\n] -> (?:[a-z]|\r?\n)
					const otherContent = pattern.slice(parent.start + 1, char.start) + pattern.slice(char.end, parent.end - 1);
					replace(parent.start, parent.end, otherContent === '' ? '\\r?\\n' : `(?:[${otherContent}]|\\r?\\n)`);
				}
			} else if (parent.type === 'Quantifier') {
				replace(char.start, char.end, '(?:\\r?\\n)');
			}
		},
		onQuantifierEnter(node) {
			context.unshift(node);
		},
		onQuantifierLeave() {
			context.shift();
		},
		onCharacterClassRangeEnter(node) {
			context.unshift(node);
		},
		onCharacterClassRangeLeave() {
			context.shift();
		},
		onCharacterClassEnter(node) {
			context.unshift(node);
		},
		onCharacterClassLeave() {
			context.shift();
		},
		onAssertionEnter(node) {
			if (isLookBehind(node)) {
				context.push(node);
			}
		},
		onAssertionLeave(node) {
			if (context[0] === node) {
				context.shift();
			}
		},
	});

	visitor.visit(re);
	output += pattern.slice(lastEmittedIndex);
	return output;
}

export function fixNewline(pattern: string): string {
	return pattern.replace(/\n/g, '\\r?\\n');
}

// brace expansion for ripgrep

/**
 * Split string given first opportunity for brace expansion in the string.
 * - If the brace is prepended by a \ character, then it is escaped.
 * - Does not process escapes that are within the sub-glob.
 * - If two unescaped `{` occur before `}`, then ripgrep will return an error for brace nesting, so don't split on those.
 */
function getEscapeAwareSplitStringForRipgrep(pattern: string): { fixedStart?: string; strInBraces: string; fixedEnd?: string } {
	let inBraces = false;
	let escaped = false;
	let fixedStart = '';
	let strInBraces = '';
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		switch (char) {
			case '\\':
				if (escaped) {
					// If we're already escaped, then just leave the escaped slash and the preceeding slash that escapes it.
					// The two escaped slashes will result in a single slash and whatever processes the glob later will properly process the escape
					if (inBraces) {
						strInBraces += '\\' + char;
					} else {
						fixedStart += '\\' + char;
					}
					escaped = false;
				} else {
					escaped = true;
				}
				break;
			case '{':
				if (escaped) {
					// if we escaped this opening bracket, then it is to be taken literally. Remove the `\` because we've acknowleged it and add the `{` to the appropriate string
					if (inBraces) {
						strInBraces += char;
					} else {
						fixedStart += char;
					}
					escaped = false;
				} else {
					if (inBraces) {
						// ripgrep treats this as attempting to do a nested alternate group, which is invalid. Return with pattern including changes from escaped braces.
						return { strInBraces: fixedStart + '{' + strInBraces + '{' + pattern.substring(i + 1) };
					} else {
						inBraces = true;
					}
				}
				break;
			case '}':
				if (escaped) {
					// same as `}`, but for closing bracket
					if (inBraces) {
						strInBraces += char;
					} else {
						fixedStart += char;
					}
					escaped = false;
				} else if (inBraces) {
					// we found an end bracket to a valid opening bracket. Return the appropriate strings.
					return { fixedStart, strInBraces, fixedEnd: pattern.substring(i + 1) };
				} else {
					// if we're not in braces and not escaped, then this is a literal `}` character and we're still adding to fixedStart.
					fixedStart += char;
				}
				break;
			default:
				// similar to the `\\` case, we didn't do anything with the escape, so we should re-insert it into the appropriate string
				// to be consumed later when individual parts of the glob are processed
				if (inBraces) {
					strInBraces += (escaped ? '\\' : '') + char;
				} else {
					fixedStart += (escaped ? '\\' : '') + char;
				}
				escaped = false;
				break;
		}
	}


	// we are haven't hit the last brace, so no splitting should occur. Return with pattern including changes from escaped braces.
	return { strInBraces: fixedStart + (inBraces ? ('{' + strInBraces) : '') };
}

/**
 * Parses out curly braces and returns equivalent globs. Only supports one level of nesting.
 * Exported for testing.
 */
export function performBraceExpansionForRipgrep(pattern: string): string[] {
	const { fixedStart, strInBraces, fixedEnd } = getEscapeAwareSplitStringForRipgrep(pattern);
	if (fixedStart === undefined || fixedEnd === undefined) {
		return [strInBraces];
	}

	let arr = splitGlobAware(strInBraces, ',');

	if (!arr.length) {
		// occurs if the braces are empty.
		arr = [''];
	}

	const ends = performBraceExpansionForRipgrep(fixedEnd);

	return arr.flatMap((elem) => {
		const start = fixedStart + elem;
		return ends.map((end) => {
			return start + end;
		});
	});
}
