/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as cp from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import { NodeStringDecoder, StringDecoder } from 'string_decoder';
import * as vscode from 'vscode';
import { rgPath } from './ripgrep';
import { anchorGlob, createTextSearchResult } from './utils';

// If vscode-ripgrep is in an .asar file, then the binary is unpacked.
const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');

export class RipgrepTextSearchEngine {
	private isDone = false;
	private rgProc: cp.ChildProcess;

	private ripgrepParser: RipgrepParser;

	constructor(private outputChannel: vscode.OutputChannel) { }

	cancel() {
		this.isDone = true;

		if (this.rgProc) {
			this.rgProc.kill();
		}

		if (this.ripgrepParser) {
			this.ripgrepParser.cancel();
		}
	}

	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
		this.outputChannel.appendLine(`provideTextSearchResults ${query.pattern}, ${JSON.stringify({
			...options,
			...{
				folder: options.folder.toString()
			}
		})}`);

		return new Promise((resolve, reject) => {
			token.onCancellationRequested(() => this.cancel());

			const rgArgs = getRgArgs(query, options);

			const cwd = options.folder.fsPath;

			const escapedArgs = rgArgs
				.map(arg => arg.match(/^-/) ? arg : `'${arg}'`)
				.join(' ');
			this.outputChannel.appendLine(`rg ${escapedArgs}\n - cwd: ${cwd}`);

			this.rgProc = cp.spawn(rgDiskPath, rgArgs, { cwd });
			this.rgProc.on('error', e => {
				console.error(e);
				this.outputChannel.append('Error: ' + (e && e.message));
				reject(e);
			});

			let gotResult = false;
			this.ripgrepParser = new RipgrepParser(options.maxResults, cwd, options.previewOptions);
			this.ripgrepParser.on('result', (match: vscode.TextSearchResult) => {
				gotResult = true;
				progress.report(match);
			});

			let limitHit = false;
			this.ripgrepParser.on('hitLimit', () => {
				limitHit = true;
				this.cancel();
			});

			this.rgProc.stdout.on('data', data => {
				this.ripgrepParser.handleData(data);
			});

			let gotData = false;
			this.rgProc.stdout.once('data', () => gotData = true);

			let stderr = '';
			this.rgProc.stderr.on('data', data => {
				const message = data.toString();
				this.outputChannel.append(message);
				stderr += message;
			});

			this.rgProc.on('close', code => {
				this.outputChannel.appendLine(gotData ? 'Got data from stdout' : 'No data from stdout');
				this.outputChannel.appendLine(gotResult ? 'Got result from parser' : 'No result from parser');
				this.outputChannel.appendLine('');
				if (this.isDone) {
					resolve({ limitHit });
				} else {
					// Trigger last result
					this.ripgrepParser.flush();
					this.rgProc = null;
					let displayMsg: string;
					if (stderr && !gotData && (displayMsg = rgErrorMsgForDisplay(stderr))) {
						reject(new Error(displayMsg));
					} else {
						resolve({ limitHit });
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
	const firstLine = msg.split('\n')[0].trim();

	if (firstLine.startsWith('Error parsing regex')) {
		return firstLine;
	}

	if (firstLine.startsWith('error parsing glob') ||
		firstLine.startsWith('unsupported encoding')) {
		// Uppercase first letter
		return firstLine.charAt(0).toUpperCase() + firstLine.substr(1);
	}

	if (firstLine === `Literal '\\n' not allowed.`) {
		// I won't localize this because none of the Ripgrep error messages are localized
		return `Literal '\\n' currently not supported`;
	}

	if (firstLine.startsWith('Literal ')) {
		// Other unsupported chars
		return firstLine;
	}

	return undefined;
}

export class RipgrepParser extends EventEmitter {
	private static readonly RESULT_REGEX = /^\u001b\[0m(\d+)\u001b\[0m:(.*)(\r?)/;
	private static readonly FILE_REGEX = /^\u001b\[0m(.+)\u001b\[0m$/;
	private static readonly ESC_CODE = '\u001b'.charCodeAt(0);

	// public for test
	public static readonly MATCH_START_MARKER = '\u001b[0m\u001b[31m';
	public static readonly MATCH_END_MARKER = '\u001b[0m';

	private currentFile: string;
	private remainder: string;
	private isDone: boolean;
	private stringDecoder: NodeStringDecoder;

	private numResults = 0;

	constructor(private maxResults: number, private rootFolder: string, private previewOptions?: vscode.TextSearchPreviewOptions) {
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
				this.currentFile = r[1];
			} else {
				// Line is empty (or malformed)
			}
		}
	}

	private handleMatchLine(outputLine: string, lineNum: number, lineText: string): void {
		if (lineNum === 0) {
			lineText = stripUTF8BOM(lineText);
		}

		let lastMatchEndPos = 0;
		let matchTextStartPos = -1;

		// Track positions with color codes subtracted - offsets in the final text preview result
		let matchTextStartRealIdx = -1;
		let textRealIdx = 0;
		let hitLimit = false;

		const realTextParts: string[] = [];

		const lineMatches: vscode.Range[] = [];

		for (let i = 0; i < lineText.length - (RipgrepParser.MATCH_END_MARKER.length - 1);) {
			if (lineText.charCodeAt(i) === RipgrepParser.ESC_CODE) {
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
					// ESC char in file
					i++;
					textRealIdx++;
				}
			} else {
				// Some other char
				i++;
				textRealIdx++;
			}
		}

		const chunk = lineText.slice(lastMatchEndPos);
		realTextParts.push(chunk);

		// Get full real text line without color codes
		const previewText = realTextParts.join('');

		const uri = vscode.Uri.file(path.join(this.rootFolder, this.currentFile));
		lineMatches
			.map(range => createTextSearchResult(uri, previewText, range, this.previewOptions))
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

	options.includes
		.map(anchorGlob)
		.forEach(globArg => args.push('-g', globArg));

	options.excludes
		.map(anchorGlob)
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
		args.push('--regexp', fixRegexEndingPattern(query.pattern));
	} else {
		searchPatternAfterDoubleDashes = query.pattern;
		args.push('--fixed-strings');
	}

	args.push('--no-config');
	args.push('--no-ignore-global');

	// Folder to search
	args.push('--');

	if (searchPatternAfterDoubleDashes) {
		// Put the query after --, in case the query starts with a dash
		args.push(searchPatternAfterDoubleDashes);
	}

	args.push('.');

	return args;
}

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

function fixRegexEndingPattern(pattern: string): string {
	// Replace an unescaped $ at the end of the pattern with \r?$
	// Match $ preceeded by none or even number of literal \
	return pattern.match(/([^\\]|^)(\\\\)*\$$/) ?
		pattern.replace(/\$$/, '\\r?$') :
		pattern;
}