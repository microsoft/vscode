/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import { EventEmitter } from 'events';
import * as path from 'path';
import { StringDecoder, NodeStringDecoder } from 'string_decoder';

import * as cp from 'child_process';
import { rgPath } from 'vscode-ripgrep';
import { start } from 'repl';

// If vscode-ripgrep is in an .asar file, then the binary is unpacked.
const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');

// TODO@roblou move to SearchService
const MAX_TEXT_RESULTS = 10000;

export class RipgrepTextSearchEngine {
	private isDone = false;
	private rgProc: cp.ChildProcess;
	private killRgProcFn: (code?: number) => void;

	private ripgrepParser: RipgrepParser;

	constructor() {
		this.killRgProcFn = () => this.rgProc && this.rgProc.kill();
	}

	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<void> {
		return new Promise((resolve, reject) => {
			const cancel = () => {
				this.isDone = true;
				this.ripgrepParser.cancel();
				this.rgProc.kill();
			};
			token.onCancellationRequested(cancel);

			const rgArgs = getRgArgs(query, options);

			const cwd = options.folder.fsPath;

			// TODO logging
			// const escapedArgs = rgArgs
			// 	.map(arg => arg.match(/^-/) ? arg : `'${arg}'`)
			// 	.join(' ');
			// let rgCmd = `rg ${escapedArgs}\n - cwd: ${cwd}`;

			this.rgProc = cp.spawn(rgDiskPath, rgArgs, { cwd });
			process.once('exit', this.killRgProcFn);
			this.rgProc.on('error', e => {
				console.log(e);
				reject(e);
			});

			this.ripgrepParser = new RipgrepParser(MAX_TEXT_RESULTS, cwd);
			this.ripgrepParser.on('result', (match: vscode.TextSearchResult) => {
				progress.report(match);
			});

			this.ripgrepParser.on('hitLimit', () => {
				cancel();
			});

			this.rgProc.stdout.on('data', data => {
				this.ripgrepParser.handleData(data);
			});

			let gotData = false;
			this.rgProc.stdout.once('data', () => gotData = true);

			let stderr = '';
			this.rgProc.stderr.on('data', data => {
				const message = data.toString();
				// onMessage({ message });
				stderr += message;
			});

			this.rgProc.on('close', code => {
				process.removeListener('exit', this.killRgProcFn);
				if (this.isDone) {
					resolve();
				} else {
					// Trigger last result
					this.ripgrepParser.flush();
					this.rgProc = null;
					let displayMsg: string;
					if (stderr && !gotData && (displayMsg = rgErrorMsgForDisplay(stderr))) {
						reject(new Error(displayMsg));
					} else {
						resolve();
					}
				}
			});
		});
	}
}

/**
 * Read the first line of stderr and return an error for display or undefined, based on a whitelist.
 * Ripgrep produces stderr output which is not from a fatal error, and we only want the search to be
 * "failed" when a fatal error was produced.
 */
export function rgErrorMsgForDisplay(msg: string): string | undefined {
	const firstLine = msg.split('\n')[0];

	if (firstLine.startsWith('Error parsing regex')) {
		return firstLine;
	}

	if (firstLine.startsWith('error parsing glob') ||
		firstLine.startsWith('unsupported encoding')) {
		// Uppercase first letter
		return firstLine.charAt(0).toUpperCase() + firstLine.substr(1);
	}

	if (firstLine.startsWith('Literal ')) {
		// e.g. "Literal \n not allowed"
		return firstLine;
	}

	return undefined;
}

export class RipgrepParser extends EventEmitter {
	private static readonly RESULT_REGEX = /^\u001b\[0m(\d+)\u001b\[0m:(.*)(\r?)/;
	private static readonly FILE_REGEX = /^\u001b\[0m(.+)\u001b\[0m$/;

	private static readonly MATCH_START_CHAR = '\u001b';
	public static readonly MATCH_START_MARKER = '\u001b[0m\u001b[31m';
	public static readonly MATCH_END_MARKER = '\u001b[0m';

	private currentFile: vscode.Uri;
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
				this.currentFile = this.getFileUri(r[1]);
			} else {
				// Line is empty (or malformed)
			}
		}
	}

	private getFileUri(relativeOrAbsolutePath: string): vscode.Uri {
		const absPath = path.isAbsolute(relativeOrAbsolutePath) ?
			relativeOrAbsolutePath :
			path.join(this.rootFolder, relativeOrAbsolutePath);

		return vscode.Uri.file(absPath);
	}

	private handleMatchLine(outputLine: string, lineNum: number, lineText: string): void {
		if (lineNum === 0) {
			lineText = stripUTF8BOM(lineText);
		}

		// if (!this.currentFile) {
		// 	// When searching a single file and no folderQueries, rg does not print the file line, so create it here
		// 	const singleFile = this.extraSearchFiles[0];
		// 	if (!singleFile) {
		// 		throw new Error('Got match line for unknown file');
		// 	}

		// 	this.currentFile = this.getFileUri(singleFile);
		// }

		let lastMatchEndPos = 0;
		let matchTextStartPos = -1;

		// Track positions with color codes subtracted - offsets in the final text preview result
		let matchTextStartRealIdx = -1;
		let textRealIdx = 0;
		let hitLimit = false;

		const realTextParts: string[] = [];

		const lineMatches: vscode.Range[] = [];

		for (let i = 0; i < lineText.length - (RipgrepParser.MATCH_END_MARKER.length - 1);) {
			if (lineText.substr(i, RipgrepParser.MATCH_START_MARKER.length) === RipgrepParser.MATCH_START_MARKER) {
				// Match start
				const chunk = lineText.slice(lastMatchEndPos, i);
				realTextParts.push(chunk);
				i += RipgrepParser.MATCH_START_MARKER.length;
				matchTextStartPos = i;
				matchTextStartRealIdx = textRealIdx;
			} else if (lineText.substr(i, RipgrepParser.MATCH_END_MARKER.length) === RipgrepParser.MATCH_END_MARKER) {
				// Match end
				const chunk = lineText.slice(matchTextStartPos, i);
				realTextParts.push(chunk);
				if (!hitLimit) {
					const startCol = matchTextStartRealIdx;
					const endCol = textRealIdx;

					// actually have to finish parsing the line, and use the real ones
					lineMatches.push(new vscode.Range(lineNum, startCol, lineNum, endCol));
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

		const chunk = lineText.slice(lastMatchEndPos);
		realTextParts.push(chunk);

		// Get full real text line without color codes
		const preview = realTextParts.join('');

		lineMatches
			.map(range => {
				return <vscode.TextSearchResult>{
					uri: this.currentFile,
					range,
					preview: {
						text: preview,
						match: new vscode.Range(0, range.start.character, 0, range.end.character)
					}
				};
			})
			.forEach(match => this.onResult(match));

		if (hitLimit) {
			this.cancel();
			this.emit('hitLimit');
		}
	}

	private onResult(match: vscode.TextSearchResult): void {
		this.emit('result', match);
	}
}

function getRgArgs(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions): string[] {
	const args = ['--hidden', '--heading', '--line-number', '--color', 'ansi', '--colors', 'path:none', '--colors', 'line:none', '--colors', 'match:fg:red', '--colors', 'match:style:nobold'];
	args.push(query.isCaseSensitive ? '--case-sensitive' : '--ignore-case');

	// TODO@roblou
	options.includes
		.forEach(globArg => args.push('-g', globArg));

	options.excludes
		.forEach(rgGlob => args.push('-g', `!${rgGlob}`));

	if (options.maxFileSize) {
		args.push('--max-filesize', options.maxFileSize + '');
	}

	if (options.useIgnoreFiles) {
		args.push('--no-ignore-parent');
	} else {
		// Don't use .gitignore or .ignore
		args.push('--no-ignore');
	}

	if (options.followSymlinks) {
		args.push('--follow');
	}

	if (options.encoding) {
		args.push('--encoding', options.encoding);
	}

	// Ripgrep handles -- as a -- arg separator. Only --.
	// - is ok, --- is ok, --some-flag is handled as query text. Need to special case.
	if (query.pattern === '--') {
		query.isRegExp = true;
		query.pattern = '\\-\\-';
	}

	let searchPatternAfterDoubleDashes: string;
	if (query.isWordMatch) {
		const regexp = createRegExp(query.pattern, query.isRegExp, { wholeWord: query.isWordMatch });
		const regexpStr = regexp.source.replace(/\\\//g, '/'); // RegExp.source arbitrarily returns escaped slashes. Search and destroy.
		args.push('--regexp', regexpStr);
	} else if (query.isRegExp) {
		args.push('--regexp', query.pattern);
	} else {
		searchPatternAfterDoubleDashes = query.pattern;
		args.push('--fixed-strings');
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

// TODO@roblou organize away

interface RegExpOptions {
	matchCase?: boolean;
	wholeWord?: boolean;
	multiline?: boolean;
	global?: boolean;
}

function createRegExp(searchString: string, isRegex: boolean, options: RegExpOptions = {}): RegExp {
	if (!searchString) {
		throw new Error('Cannot create regex from empty string');
	}
	if (!isRegex) {
		searchString = escapeRegExpCharacters(searchString);
	}
	if (options.wholeWord) {
		if (!/\B/.test(searchString.charAt(0))) {
			searchString = '\\b' + searchString;
		}
		if (!/\B/.test(searchString.charAt(searchString.length - 1))) {
			searchString = searchString + '\\b';
		}
	}
	let modifiers = '';
	if (options.global) {
		modifiers += 'g';
	}
	if (!options.matchCase) {
		modifiers += 'i';
	}
	if (options.multiline) {
		modifiers += 'm';
	}

	return new RegExp(searchString, modifiers);
}

/**
 * Escapes regular expression characters in a given string
 */
function escapeRegExpCharacters(value: string): string {
	return value.replace(/[\-\\\{\}\*\+\?\|\^\$\.\[\]\(\)\#]/g, '\\$&');
}

// -- UTF-8 BOM

const UTF8_BOM = 65279;

const UTF8_BOM_CHARACTER = String.fromCharCode(UTF8_BOM);

function startsWithUTF8BOM(str: string): boolean {
	return (str && str.length > 0 && str.charCodeAt(0) === UTF8_BOM);
}

function stripUTF8BOM(str: string): string {
	return startsWithUTF8BOM(str) ? str.substr(1) : str;
}