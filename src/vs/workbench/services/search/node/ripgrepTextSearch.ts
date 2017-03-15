/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as cp from 'child_process';
import * as path from 'path';
import { rgPath } from 'vscode-ripgrep';

import * as strings from 'vs/base/common/strings';
import * as glob from 'vs/base/common/glob';
import { ILineMatch, IProgress } from 'vs/platform/search/common/search';

import { ISerializedFileMatch, ISerializedSearchComplete, IRawSearch, ISearchEngine } from './search';

export class RipgrepEngine implements ISearchEngine<ISerializedFileMatch> {
	private static RESULT_REGEX = /^\u001b\[m(\d+)\u001b\[m:(.*)$/;
	private static FILE_REGEX = /^\u001b\[m(.+)\u001b\[m$/;

	private static MATCH_START_MARKER = '\u001b[m\u001b[31m';
	private static MATCH_END_MARKER = '\u001b[m';

	private isDone = false;
	private rgProc: cp.ChildProcess;
	private postProcessExclusions: glob.SiblingClause[] = [];

	private numResults = 0;

	constructor(private config: IRawSearch) {
	}

	cancel(): void {
		this.isDone = true;

		this.rgProc.kill();
	}

	search(onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		if (this.config.rootFolders.length) {
			// Only a single root folder supported by VS Code right now
			this.searchFolder(this.config.rootFolders[0], onResult, onProgress, done);
		}
	}

	private searchFolder(rootFolder: string, onResult: (match: ISerializedFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {
		const rgArgs = this.getRgArgs();
		console.log(`rg ${rgArgs.join(' ')}, cwd: ${rootFolder}`);
		this.rgProc = cp.spawn(rgPath, rgArgs, { cwd: rootFolder });

		let fileMatch: FileMatch;
		let remainder: string;
		this.rgProc.stdout.on('data', data => {
			// If the previous data chunk didn't end in a newline, append it to this chunk
			const dataStr = remainder ?
				remainder + data.toString() :
				data.toString();

			const dataLines: string[] = dataStr.split('\n');
			remainder = dataLines.pop();

			for (let l = 0; l < dataLines.length; l++) {
				const outputLine = dataLines[l];
				if (this.isDone) {
					break;
				}

				let r = outputLine.match(RipgrepEngine.RESULT_REGEX);
				if (r) {
					// Line is a result - add to collected results for the current file path
					const line = parseInt(r[1]) - 1;
					const text = r[2];

					const lineMatch = new LineMatch(text, line);
					fileMatch.addMatch(lineMatch);

					let lastMatchEndPos = 0;
					let matchTextStartPos = -1;

					// Track positions with color codes subtracted - offsets in the final text preview result
					let matchTextStartRealIdx = -1;
					let textRealIdx = 0;

					const realTextParts: string[] = [];

					for (let i = 0; i < text.length - (RipgrepEngine.MATCH_END_MARKER.length - 1);) {
						if (text.substr(i, RipgrepEngine.MATCH_START_MARKER.length) === RipgrepEngine.MATCH_START_MARKER) {
							// Match start
							const chunk = text.slice(lastMatchEndPos, i);
							realTextParts.push(chunk);
							i += RipgrepEngine.MATCH_START_MARKER.length;
							matchTextStartPos = i;
							matchTextStartRealIdx = textRealIdx;
						} else if (text.substr(i, RipgrepEngine.MATCH_END_MARKER.length) === RipgrepEngine.MATCH_END_MARKER) {
							// Match end
							const chunk = text.slice(matchTextStartPos, i);
							realTextParts.push(chunk);
							lineMatch.addMatch(matchTextStartRealIdx, textRealIdx - matchTextStartRealIdx);
							matchTextStartPos = -1;
							matchTextStartRealIdx = -1;
							i += RipgrepEngine.MATCH_END_MARKER.length;
							lastMatchEndPos = i;
							this.numResults++;

							if (this.numResults >= this.config.maxResults) {
								this.cancel();
								onResult(fileMatch.serialize());
								done(null, {
									limitHit: true,
									stats: null
								});
							}
						} else {
							i++;
							textRealIdx++;
						}
					}

					const chunk = text.slice(lastMatchEndPos);
					realTextParts.push(chunk);

					const preview = realTextParts.join('');
					lineMatch.preview = preview;
				} else {
					r = outputLine.match(RipgrepEngine.FILE_REGEX);
					if (r) {
						// Line is a file path - send all collected results for the previous file path
						if (fileMatch) {
							// Check fileMatch against other exclude globs, and fix numResults
							onResult(fileMatch.serialize());
						}

						fileMatch = new FileMatch(path.join(rootFolder, r[1]));
					} else {
						// Line is empty (or malformed)
					}
				}
			}
		});

		this.rgProc.stderr.on('data', data => {
			console.log('stderr');
			console.log(data.toString());
		});

		this.rgProc.on('close', code => {
			this.rgProc = null;
			console.log(`closed with ${code}`);
			if (fileMatch) {
				onResult(fileMatch.serialize());
			}

			if (!this.isDone) {
				this.isDone = true;
				done(null, {
					limitHit: false,
					stats: null
				});
			}
		});
	}

	private getRgArgs(): string[] {
		const args = ['--heading', '-uu', '--line-number', '--color', 'ansi', '--colors', 'path:none', '--colors', 'line:none', '--colors', 'match:fg:red', '--colors', 'match:style:nobold']; // -uu == Skip gitignore files, and hidden files/folders
		args.push(this.config.contentPattern.isCaseSensitive ? '--case-sensitive' : '--ignore-case');

		if (this.config.includePattern) {
			Object.keys(this.config.includePattern).forEach(inclKey => {
				const inclValue = this.config.includePattern[inclKey];
				if (typeof inclValue === 'boolean' && inclValue) {
					// globs added to ripgrep don't match from the root by default, so add a /
					if (inclKey.charAt(0) !== '*') {
						inclKey = '/' + inclKey;
					}

					args.push('-g', inclKey);
				} else if (inclValue && inclValue.when) {
					// Possible?
				}
			});
		}

		if (this.config.excludePattern) {
			Object.keys(this.config.excludePattern).forEach(exclKey => {
				const exclValue = this.config.excludePattern[exclKey];
				if (typeof exclValue === 'boolean' && exclValue) {
					// globs added to ripgrep don't match from the root by default, so add a /
					if (exclKey.charAt(0) !== '*') {
						exclKey = '/' + exclKey;
					}

					args.push('-g', `!${exclKey}`);
				} else if (exclValue && exclValue.when) {
					this.postProcessExclusions.push(exclValue);
				}
			});
		}

		if (this.config.maxFilesize) {
			args.push('--max-filesize', this.config.maxFilesize + '');
		}

		if (this.config.contentPattern.isRegExp) {
			if (this.config.contentPattern.isWordMatch) {
				args.push('--word-regexp');
			}

			args.push('--regexp', this.config.contentPattern.pattern);
		} else {
			if (this.config.contentPattern.isWordMatch) {
				args.push('--word-regexp', '--regexp', strings.escapeRegExpCharacters(this.config.contentPattern.pattern));
			} else {
				args.push('--fixed-strings', this.config.contentPattern.pattern);
			}
		}

		return args;
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