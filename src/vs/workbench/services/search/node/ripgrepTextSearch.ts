/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EventEmitter } from 'events';
import * as path from 'path';
import { StringDecoder, NodeStringDecoder } from 'string_decoder';

import * as cp from 'child_process';
import { rgPath } from 'vscode-ripgrep';

import objects = require('vs/base/common/objects');
import platform = require('vs/base/common/platform');
import * as strings from 'vs/base/common/strings';
import * as paths from 'vs/base/common/paths';
import * as extfs from 'vs/base/node/extfs';
import * as encoding from 'vs/base/node/encoding';
import * as glob from 'vs/base/common/glob';
import { ILineMatch, ISearchLog } from 'vs/platform/search/common/search';
import { TPromise } from 'vs/base/common/winjs.base';

import { ISerializedFileMatch, ISerializedSearchComplete, IRawSearch, IFolderSearch } from './search';

export class RipgrepEngine {
	private isDone = false;
	private rgProc: cp.ChildProcess;
	private postProcessExclusions: glob.ParsedExpression;

	private ripgrepParser: RipgrepParser;

	private resultsHandledP: TPromise<any> = TPromise.wrap(null);

	constructor(private config: IRawSearch) {
	}

	cancel(): void {
		this.isDone = true;
		this.ripgrepParser.cancel();
		this.rgProc.kill();
	}

	// TODO@Rob - make promise-based once the old search is gone, and I don't need them to have matching interfaces anymore
	search(onResult: (match: ISerializedFileMatch) => void, onMessage: (message: ISearchLog) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		if (!this.config.folderQueries.length && !this.config.extraFiles.length) {
			done(null, {
				limitHit: false,
				stats: null
			});
			return;
		}

		const rgArgs = getRgArgs(this.config);
		if (rgArgs.siblingClauses) {
			this.postProcessExclusions = glob.parseToAsync(rgArgs.siblingClauses, { trimForExclusions: true });
		}

		const cwd = platform.isWindows ? 'c:/' : '/';
		process.nextTick(() => { // Allow caller to register progress callback
			const escapedArgs = rgArgs.globArgs
				.map(arg => arg.match(/^-/) ? arg : `'${arg}'`)
				.join(' ');

			const rgCmd = `rg ${escapedArgs}\n - cwd: ${cwd}\n`;
			onMessage({ message: rgCmd });
			if (rgArgs.siblingClauses) {
				onMessage({ message: ` - Sibling clauses: ${JSON.stringify(rgArgs.siblingClauses)}\n` });
			}
		});
		this.rgProc = cp.spawn(rgPath, rgArgs.globArgs, { cwd });

		this.ripgrepParser = new RipgrepParser(this.config.maxResults, cwd);
		this.ripgrepParser.on('result', (match: ISerializedFileMatch) => {
			if (this.postProcessExclusions) {
				const handleResultP = (<TPromise<string>>this.postProcessExclusions(match.path, undefined, () => getSiblings(match.path)))
					.then(globMatch => {
						if (!globMatch) {
							onResult(match);
						}
					});

				this.resultsHandledP = TPromise.join([this.resultsHandledP, handleResultP]);
			} else {
				onResult(match);
			}
		});
		this.ripgrepParser.on('hitLimit', () => {
			this.cancel();
			done(null, {
				limitHit: true,
				stats: null
			});
		});

		this.rgProc.stdout.on('data', data => {
			this.ripgrepParser.handleData(data);
		});

		let gotData = false;
		this.rgProc.stdout.once('data', () => gotData = true);

		let stderr = '';
		this.rgProc.stderr.on('data', data => {
			const message = data.toString();
			onMessage({ message });
			stderr += message;
		});

		this.rgProc.on('close', code => {
			// Trigger last result, then wait on async result handling
			this.ripgrepParser.flush();
			this.resultsHandledP.then(() => {
				this.rgProc = null;
				if (!this.isDone) {
					this.isDone = true;
					let displayMsg: string;
					if (stderr && !gotData && (displayMsg = this.rgErrorMsgForDisplay(stderr))) {
						done(new Error(displayMsg), {
							limitHit: false,
							stats: null
						});
					} else {
						done(null, {
							limitHit: false,
							stats: null
						});
					}
				}
			});
		});
	}

	/**
	 * Read the first line of stderr and return an error for display or undefined, based on a whitelist.
	 * Ripgrep produces stderr output which is not from a fatal error, and we only want the search to be
	 * "failed" when a fatal error was produced.
	 */
	private rgErrorMsgForDisplay(msg: string): string | undefined {
		const firstLine = msg.split('\n')[0];

		if (strings.startsWith(firstLine, 'Error parsing regex')) {
			return firstLine;
		}

		if (strings.startsWith(firstLine, 'error parsing glob')) {
			return firstLine;
		}

		return undefined;
	}
}

export class RipgrepParser extends EventEmitter {
	private static RESULT_REGEX = /^\u001b\[m(\d+)\u001b\[m:(.*)(\r?)/;
	private static FILE_REGEX = /^\u001b\[m(.+)\u001b\[m$/;

	public static MATCH_START_MARKER = '\u001b[m\u001b[31m';
	public static MATCH_END_MARKER = '\u001b[m';

	private fileMatch: FileMatch;
	private remainder: string;
	private isDone: boolean;
	private stringDecoder: NodeStringDecoder;

	private numResults = 0;

	constructor(private maxResults: number, private rootFolder: string) {
		super();
		this.stringDecoder = new StringDecoder();
	}

	public cancel(): void {
		this.isDone = true;
	}

	public flush(): void {
		this.handleDecodedData(this.stringDecoder.end());

		if (this.fileMatch) {
			this.onResult();
		}
	}

	public handleData(data: Buffer | string): void {
		const dataStr = typeof data === 'string' ? data : this.stringDecoder.write(data);
		this.handleDecodedData(dataStr);
	}

	private handleDecodedData(decodedData: string): void {
		// If the previous data chunk didn't end in a newline, prepend it to this chunk
		const dataStr = this.remainder ?
			this.remainder + decodedData :
			decodedData;

		const dataLines: string[] = dataStr.split(/\r\n|\n/);
		this.remainder = dataLines[dataLines.length - 1] ? dataLines.pop() : null;

		for (let l = 0; l < dataLines.length; l++) {
			const outputLine = dataLines[l].trim();
			if (this.isDone) {
				break;
			}

			let r: RegExpMatchArray;
			if (r = outputLine.match(RipgrepParser.RESULT_REGEX)) {
				const lineNum = parseInt(r[1]) - 1;
				let matchText = r[2];

				// workaround https://github.com/BurntSushi/ripgrep/issues/416
				// If the match line ended with \r, append a match end marker so the match isn't lost
				if (r[3]) {
					matchText += RipgrepParser.MATCH_END_MARKER;
				}

				// Line is a result - add to collected results for the current file path
				this.handleMatchLine(outputLine, lineNum, matchText);
			} else if (r = outputLine.match(RipgrepParser.FILE_REGEX)) {
				// Line is a file path - send all collected results for the previous file path
				if (this.fileMatch) {
					this.onResult();
				}

				this.fileMatch = new FileMatch(path.isAbsolute(r[1]) ? r[1] : path.join(this.rootFolder, r[1]));
			} else {
				// Line is empty (or malformed)
			}
		}
	}

	private handleMatchLine(outputLine: string, lineNum: number, text: string): void {
		const lineMatch = new LineMatch(text, lineNum);
		this.fileMatch.addMatch(lineMatch);

		let lastMatchEndPos = 0;
		let matchTextStartPos = -1;

		// Track positions with color codes subtracted - offsets in the final text preview result
		let matchTextStartRealIdx = -1;
		let textRealIdx = 0;
		let hitLimit = false;

		const realTextParts: string[] = [];

		for (let i = 0; i < text.length - (RipgrepParser.MATCH_END_MARKER.length - 1);) {
			if (text.substr(i, RipgrepParser.MATCH_START_MARKER.length) === RipgrepParser.MATCH_START_MARKER) {
				// Match start
				const chunk = text.slice(lastMatchEndPos, i);
				realTextParts.push(chunk);
				i += RipgrepParser.MATCH_START_MARKER.length;
				matchTextStartPos = i;
				matchTextStartRealIdx = textRealIdx;
			} else if (text.substr(i, RipgrepParser.MATCH_END_MARKER.length) === RipgrepParser.MATCH_END_MARKER) {
				// Match end
				const chunk = text.slice(matchTextStartPos, i);
				realTextParts.push(chunk);
				if (!hitLimit) {
					lineMatch.addMatch(matchTextStartRealIdx, textRealIdx - matchTextStartRealIdx);
				}

				matchTextStartPos = -1;
				matchTextStartRealIdx = -1;
				i += RipgrepParser.MATCH_END_MARKER.length;
				lastMatchEndPos = i;
				this.numResults++;

				// Check hit maxResults limit
				if (this.numResults >= this.maxResults) {
					// Finish the line, then report the result below
					hitLimit = true;
				}
			} else {
				i++;
				textRealIdx++;
			}
		}

		const chunk = text.slice(lastMatchEndPos);
		realTextParts.push(chunk);

		// Replace preview with version without color codes
		const preview = realTextParts.join('');
		lineMatch.preview = preview;

		if (hitLimit) {
			this.cancel();
			this.onResult();
			this.emit('hitLimit');
		}
	}

	private onResult(): void {
		this.emit('result', this.fileMatch.serialize());
		this.fileMatch = null;
	}
}

export class FileMatch implements ISerializedFileMatch {
	path: string;
	lineMatches: LineMatch[];

	constructor(path: string) {
		this.path = path;
		this.lineMatches = [];
	}

	addMatch(lineMatch: LineMatch): void {
		this.lineMatches.push(lineMatch);
	}

	isEmpty(): boolean {
		return this.lineMatches.length === 0;
	}

	serialize(): ISerializedFileMatch {
		let lineMatches: ILineMatch[] = [];
		let numMatches = 0;

		for (let i = 0; i < this.lineMatches.length; i++) {
			numMatches += this.lineMatches[i].offsetAndLengths.length;
			lineMatches.push(this.lineMatches[i].serialize());
		}

		return {
			path: this.path,
			lineMatches,
			numMatches
		};
	}
}

export class LineMatch implements ILineMatch {
	preview: string;
	lineNumber: number;
	offsetAndLengths: number[][];

	constructor(preview: string, lineNumber: number) {
		this.preview = preview.replace(/(\r|\n)*$/, '');
		this.lineNumber = lineNumber;
		this.offsetAndLengths = [];
	}

	getText(): string {
		return this.preview;
	}

	getLineNumber(): number {
		return this.lineNumber;
	}

	addMatch(offset: number, length: number): void {
		this.offsetAndLengths.push([offset, length]);
	}

	serialize(): ILineMatch {
		const result = {
			preview: this.preview,
			lineNumber: this.lineNumber,
			offsetAndLengths: this.offsetAndLengths
		};

		return result;
	}
}

interface IRgGlobResult {
	globArgs: string[];
	siblingClauses: glob.IExpression;
}

function foldersToRgExcludeGlobs(folderQueries: IFolderSearch[], globalExclude: glob.IExpression, excludesToSkip: Set<string>): IRgGlobResult {
	const globArgs: string[] = [];
	let siblingClauses: glob.IExpression = {};
	folderQueries.forEach(folderQuery => {
		const totalExcludePattern = objects.assign({}, folderQuery.excludePattern || {}, globalExclude || {});
		const result = globExprsToRgGlobs(totalExcludePattern, folderQuery.folder, excludesToSkip);
		globArgs.push(...result.globArgs);
		if (result.siblingClauses) {
			siblingClauses = objects.assign(siblingClauses, result.siblingClauses);
		}
	});

	return { globArgs, siblingClauses };
}

function foldersToIncludeGlobs(folderQueries: IFolderSearch[], globalInclude: glob.IExpression): string[] {
	const globArgs = [];
	folderQueries.forEach(folderQuery => {
		const totalIncludePattern = objects.assign({}, globalInclude || {}, folderQuery.includePattern || {});
		const result = globExprsToRgGlobs(totalIncludePattern, folderQuery.folder);
		globArgs.push(...result.globArgs);
	});

	return globArgs;
}

function globExprsToRgGlobs(patterns: glob.IExpression, folder: string, excludesToSkip?: Set<string>): IRgGlobResult {
	const globArgs: string[] = [];
	let siblingClauses: glob.IExpression = null;
	Object.keys(patterns)
		.forEach(key => {
			if (excludesToSkip && excludesToSkip.has(key)) {
				return;
			}

			const value = patterns[key];
			key = getAbsoluteGlob(folder, key);

			if (typeof value === 'boolean' && value) {
				globArgs.push(fixDriveC(key));
			} else if (value && value.when) {
				if (!siblingClauses) {
					siblingClauses = {};
				}

				siblingClauses[key] = value;
			}
		});

	return { globArgs, siblingClauses };
}

/**
 * Resolves a glob like "node_modules/**" in "/foo/bar" to "/foo/bar/node_modules/**".
 * Special cases C:/foo paths to write the glob like /foo instead - see https://github.com/BurntSushi/ripgrep/issues/530.
 *
 * Exported for testing
 */
export function getAbsoluteGlob(folder: string, key: string): string {
	const absolute = paths.isAbsolute(key) ?
		key :
		path.join(folder, key);

	return trimTrailingSlash(absolute);
}

function trimTrailingSlash(str: string): string {
	str = strings.rtrim(str, '\\');
	return strings.rtrim(str, '/');
}

export function fixDriveC(path: string): string {
	const root = paths.getRoot(path);
	return root.toLowerCase() === 'c:/' ?
		path.replace(/^c:[/\\]/i, '/') :
		path;
}

function getRgArgs(config: IRawSearch): IRgGlobResult {
	const args = ['--hidden', '--heading', '--line-number', '--color', 'ansi', '--colors', 'path:none', '--colors', 'line:none', '--colors', 'match:fg:red', '--colors', 'match:style:nobold'];
	args.push(config.contentPattern.isCaseSensitive ? '--case-sensitive' : '--ignore-case');

	// includePattern can't have siblingClauses
	foldersToIncludeGlobs(config.folderQueries, config.includePattern).forEach(globArg => {
		args.push('-g', globArg);
	});

	let siblingClauses: glob.IExpression;

	// Find excludes that are exactly the same in all folderQueries - e.g. from user settings, and that start with `**`.
	// To make the command shorter, don't resolve these against every folderQuery path - see #33189.
	const universalExcludes = findUniversalExcludes(config.folderQueries);
	const rgGlobs = foldersToRgExcludeGlobs(config.folderQueries, config.excludePattern, universalExcludes);
	rgGlobs.globArgs
		.forEach(rgGlob => args.push('-g', `!${rgGlob}`));
	if (universalExcludes) {
		universalExcludes
			.forEach(exclude => args.push('-g', `!${trimTrailingSlash(exclude)}`));
	}
	siblingClauses = rgGlobs.siblingClauses;

	if (config.maxFilesize) {
		args.push('--max-filesize', config.maxFilesize + '');
	}

	if (config.disregardIgnoreFiles) {
		// Don't use .gitignore or .ignore
		args.push('--no-ignore');
	}

	// Follow symlinks
	args.push('--follow');

	// Set default encoding if only one folder is opened
	if (config.folderQueries.length === 1 && config.folderQueries[0].fileEncoding && config.folderQueries[0].fileEncoding !== 'utf8') {
		args.push('--encoding', encoding.toCanonicalName(config.folderQueries[0].fileEncoding));
	}

	// Ripgrep handles -- as a -- arg separator. Only --.
	// - is ok, --- is ok, --some-flag is handled as query text. Need to special case.
	if (config.contentPattern.pattern === '--') {
		config.contentPattern.isRegExp = true;
		config.contentPattern.pattern = '\\-\\-';
	}

	let searchPatternAfterDoubleDashes: string;
	if (config.contentPattern.isWordMatch) {
		const regexp = strings.createRegExp(config.contentPattern.pattern, config.contentPattern.isRegExp, { wholeWord: config.contentPattern.isWordMatch });
		const regexpStr = regexp.source.replace(/\\\//g, '/'); // RegExp.source arbitrarily returns escaped slashes. Search and destroy.
		args.push('--regexp', regexpStr);
	} else if (config.contentPattern.isRegExp) {
		args.push('--regexp', config.contentPattern.pattern);
	} else {
		searchPatternAfterDoubleDashes = config.contentPattern.pattern;
		args.push('--fixed-strings');
	}

	// Folder to search
	args.push('--');

	if (searchPatternAfterDoubleDashes) {
		// Put the query after --, in case the query starts with a dash
		args.push(searchPatternAfterDoubleDashes);
	}

	args.push(...config.folderQueries.map(q => q.folder));
	args.push(...config.extraFiles);

	return { globArgs: args, siblingClauses };
}

function getSiblings(file: string): TPromise<string[]> {
	return new TPromise<string[]>((resolve, reject) => {
		extfs.readdir(path.dirname(file), (error: Error, files: string[]) => {
			if (error) {
				reject(error);
			}

			resolve(files);
		});
	});
}

function findUniversalExcludes(folderQueries: IFolderSearch[]): Set<string> {
	if (folderQueries.length < 2) {
		// Nothing to simplify
		return null;
	}

	const firstFolder = folderQueries[0];
	if (!firstFolder.excludePattern) {
		return null;
	}

	const universalExcludes = new Set<string>();
	Object.keys(firstFolder.excludePattern).forEach(key => {
		if (strings.startsWith(key, '**') && folderQueries.every(q => q.excludePattern && q.excludePattern[key] === true)) {
			universalExcludes.add(key);
		}
	});

	return universalExcludes;
}
