/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import { NodeStringDecoder, StringDecoder } from 'string_decoder';
import { startsWith } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import * as vscode from 'vscode';
import { rgPath } from 'vscode-ripgrep';
import { anchorGlob, createTextSearchResult, IOutputChannel, Maybe, Range } from './ripgrepSearchUtils';
import { IExtendedExtensionSearchOptions } from 'vs/platform/search/common/search';

// If vscode-ripgrep is in an .asar file, then the binary is unpacked.
const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');

export class RipgrepTextSearchEngine {

	constructor(private outputChannel: IOutputChannel) { }

	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, token: vscode.CancellationToken): Thenable<vscode.TextSearchComplete> {
		this.outputChannel.appendLine(`provideTextSearchResults ${query.pattern}, ${JSON.stringify({
			...options,
			...{
				folder: options.folder.toString()
			}
		})}`);

		return new Promise((resolve, reject) => {
			token.onCancellationRequested(() => cancel());

			const rgArgs = getRgArgs(query, options);

			const cwd = options.folder.fsPath;

			const escapedArgs = rgArgs
				.map(arg => arg.match(/^-/) ? arg : `'${arg}'`)
				.join(' ');
			this.outputChannel.appendLine(`rg ${escapedArgs}\n - cwd: ${cwd}`);

			let rgProc: Maybe<cp.ChildProcess> = cp.spawn(rgDiskPath, rgArgs, { cwd });
			rgProc.on('error', e => {
				console.error(e);
				this.outputChannel.appendLine('Error: ' + (e && e.message));
				reject(e);
			});

			let gotResult = false;
			const ripgrepParser = new RipgrepParser(options.maxResults, cwd, options.previewOptions);
			ripgrepParser.on('result', (match: vscode.TextSearchResult) => {
				gotResult = true;
				progress.report(match);
			});

			let isDone = false;
			const cancel = () => {
				isDone = true;

				if (rgProc) {
					rgProc.kill();
				}

				if (ripgrepParser) {
					ripgrepParser.cancel();
				}
			};

			let limitHit = false;
			ripgrepParser.on('hitLimit', () => {
				limitHit = true;
				cancel();
			});

			rgProc.stdout.on('data', data => {
				ripgrepParser.handleData(data);
			});

			let gotData = false;
			rgProc.stdout.once('data', () => gotData = true);

			let stderr = '';
			rgProc.stderr.on('data', data => {
				const message = data.toString();
				this.outputChannel.appendLine(message);
				stderr += message;
			});

			rgProc.on('close', () => {
				this.outputChannel.appendLine(gotData ? 'Got data from stdout' : 'No data from stdout');
				this.outputChannel.appendLine(gotResult ? 'Got result from parser' : 'No result from parser');
				this.outputChannel.appendLine('');
				if (isDone) {
					resolve({ limitHit });
				} else {
					// Trigger last result
					ripgrepParser.flush();
					rgProc = null;
					let displayMsg: Maybe<string>;
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
export function rgErrorMsgForDisplay(msg: string): Maybe<string> {
	const firstLine = msg.split('\n')[0].trim();

	if (startsWith(firstLine, 'regex parse error')) {
		return 'Regex parse error';
	}

	let match = firstLine.match(/grep config error: unknown encoding: (.*)/);
	if (match) {
		return `Unknown encoding: ${match[1]}`;
	}

	if (startsWith(firstLine, 'error parsing glob') || startsWith(firstLine, 'the literal')) {
		// Uppercase first letter
		return firstLine.charAt(0).toUpperCase() + firstLine.substr(1);
	}

	return undefined;
}

export class RipgrepParser extends EventEmitter {
	private remainder = '';
	private isDone = false;
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
		this.remainder = dataLines[dataLines.length - 1] ? <string>dataLines.pop() : '';

		for (let l = 0; l < dataLines.length; l++) {
			const line = dataLines[l];
			if (line) { // Empty line at the end of each chunk
				this.handleLine(line);
			}
		}
	}

	private handleLine(outputLine: string): void {
		if (this.isDone) {
			return;
		}

		let parsedLine: any;
		try {
			parsedLine = JSON.parse(outputLine);
		} catch (e) {
			throw new Error(`malformed line from rg: ${outputLine}`);
		}

		if (parsedLine.type === 'match') {
			let hitLimit = false;
			const uri = URI.file(path.join(this.rootFolder, parsedLine.data.path.text));
			parsedLine.data.submatches.map((match: any) => {
				if (hitLimit) {
					return null;
				}

				if (this.numResults >= this.maxResults) {
					// Finish the line, then report the result below
					hitLimit = true;
				}

				return this.submatchToResult(parsedLine, match, uri);
			}).forEach((result: any) => {
				if (result) {
					this.onResult(result);
				}
			});

			if (hitLimit) {
				this.cancel();
				this.emit('hitLimit');
			}
		}
	}

	private submatchToResult(parsedLine: any, match: any, uri: vscode.Uri): vscode.TextSearchResult {
		const lineNumber = parsedLine.data.line_number - 1;
		let lineText = bytesOrTextToString(parsedLine.data.lines);
		let matchText = bytesOrTextToString(match.match);
		const newlineMatches = matchText.match(/\n/g);
		const newlines = newlineMatches ? newlineMatches.length : 0;
		let startCol = match.start;
		const endLineNumber = lineNumber + newlines;
		let endCol = match.end - (lineText.lastIndexOf('\n', lineText.length - 2) + 1);

		if (lineNumber === 0) {
			if (startsWithUTF8BOM(matchText)) {
				matchText = stripUTF8BOM(matchText);
				startCol -= 3;
				endCol -= 3;
			}
		}

		const range = new Range(lineNumber, startCol, endLineNumber, endCol);
		return createTextSearchResult(uri, lineText, range, this.previewOptions);
	}

	private onResult(match: vscode.TextSearchResult): void {
		this.emit('result', match);
	}
}

function bytesOrTextToString(obj: any): string {
	return obj.bytes ?
		new Buffer(obj.bytes, 'base64').toString() :
		obj.text;
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

	let searchPatternAfterDoubleDashes: Maybe<string>;
	if (query.isWordMatch) {
		const regexp = createRegExp(query.pattern, !!query.isRegExp, { wholeWord: query.isWordMatch });
		const regexpStr = regexp.source.replace(/\\\//g, '/'); // RegExp.source arbitrarily returns escaped slashes. Search and destroy.
		args.push('--regexp', regexpStr);
	} else if (query.isRegExp) {
		args.push('--regexp', query.pattern);
	} else {
		searchPatternAfterDoubleDashes = query.pattern;
		args.push('--fixed-strings');
	}

	args.push('--no-config');
	if (!options.useGlobalIgnoreFiles) {
		args.push('--no-ignore-global');
	}

	// Match \r\n with $
	args.push('--crlf');

	args.push('--json');

	if (query.isMultiline) {
		args.push('--multiline');
	}

	if ((<IExtendedExtensionSearchOptions>options).usePCRE2) {
		args.push('--pcre2');
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

function startsWithUTF8BOM(str: string): boolean {
	return !!(str && str.length > 0 && str.charCodeAt(0) === UTF8_BOM);
}

function stripUTF8BOM(str: string): string {
	return startsWithUTF8BOM(str) ? str.substr(1) : str;
}
