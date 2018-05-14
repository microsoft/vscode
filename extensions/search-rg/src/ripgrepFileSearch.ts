/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';
import { Readable } from 'stream';
import { NodeStringDecoder, StringDecoder } from 'string_decoder';
import * as vscode from 'vscode';
import { rgPath } from 'vscode-ripgrep';
import { normalizeNFC, normalizeNFD } from './normalization';
import { rgErrorMsgForDisplay } from './ripgrepTextSearch';

const isMac = process.platform === 'darwin';

// If vscode-ripgrep is in an .asar file, then the binary is unpacked.
const rgDiskPath = rgPath.replace(/\bnode_modules\.asar\b/, 'node_modules.asar.unpacked');

export class RipgrepFileSearchEngine {
	private isDone = false;
	private rgProc: cp.ChildProcess;
	private killRgProcFn: (code?: number) => void;

	constructor() {
		this.killRgProcFn = () => this.rgProc && this.rgProc.kill();
	}

	provideFileSearchResults(options: vscode.SearchOptions, progress: vscode.Progress<vscode.Uri>, token: vscode.CancellationToken): Thenable<void> {
		return new Promise((resolve, reject) => {
			let isDone = false;
			const cancel = () => {
				this.isDone = true;
				this.rgProc.kill();
			};
			token.onCancellationRequested(cancel);

			const rgArgs = getRgArgs(options);

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

			let leftover = '';
			this.collectStdout(this.rgProc, (err, stdout, last) => {
				if (err) {
					reject(err);
					return;
				}

				// Mac: uses NFD unicode form on disk, but we want NFC
				const normalized = leftover + (isMac ? normalizeNFC(stdout) : stdout);
				const relativeFiles = normalized.split('\n');

				if (last) {
					const n = relativeFiles.length;
					relativeFiles[n - 1] = relativeFiles[n - 1].trim();
					if (!relativeFiles[n - 1]) {
						relativeFiles.pop();
					}
				} else {
					leftover = relativeFiles.pop();
				}

				if (relativeFiles.length && relativeFiles[0].indexOf('\n') !== -1) {
					reject(new Error('Splitting up files failed'));
					return;
				}

				relativeFiles.forEach(relativeFile => {
					progress.report(vscode.Uri.file(path.join(cwd, relativeFile)));
				});

				if (last) {
					process.removeListener('exit', this.killRgProcFn);
					if (isDone) {
						resolve();
					} else {
						// Trigger last result
						this.rgProc = null;
						if (err) {
							reject(err);
						} else {
							resolve();
						}
					}
				}
			});
		});
	}

	private collectStdout(cmd: cp.ChildProcess, cb: (err: Error, stdout?: string, last?: boolean) => void): void {
		let done = (err: Error, stdout?: string, last?: boolean) => {
			if (err || last) {
				done = () => { };
			}

			cb(err, stdout, last);
		};

		this.forwardData(cmd.stdout, done);
		const stderr = this.collectData(cmd.stderr);

		let gotData = false;
		cmd.stdout.once('data', () => gotData = true);

		cmd.on('error', (err: Error) => {
			done(err);
		});

		cmd.on('close', (code: number) => {
			// ripgrep returns code=1 when no results are found
			let stderrText, displayMsg: string;
			if (!gotData && (stderrText = this.decodeData(stderr)) && (displayMsg = rgErrorMsgForDisplay(stderrText))) {
				done(new Error(`command failed with error code ${code}: ${displayMsg}`));
			} else {
				done(null, '', true);
			}
		});
	}

	private forwardData(stream: Readable, cb: (err: Error, stdout?: string) => void): NodeStringDecoder {
		const decoder = new StringDecoder();
		stream.on('data', (data: Buffer) => {
			cb(null, decoder.write(data));
		});
		return decoder;
	}

	private collectData(stream: Readable): Buffer[] {
		const buffers: Buffer[] = [];
		stream.on('data', (data: Buffer) => {
			buffers.push(data);
		});
		return buffers;
	}

	private decodeData(buffers: Buffer[]): string {
		const decoder = new StringDecoder();
		return buffers.map(buffer => decoder.write(buffer)).join('');
	}
}

function getRgArgs(options: vscode.FileSearchOptions): string[] {
	const args = ['--files', '--hidden', '--case-sensitive'];

	options.includes.forEach(globArg => {
		const inclusion = anchor(globArg);
		args.push('-g', inclusion);
		if (isMac) {
			const normalized = normalizeNFD(inclusion);
			if (normalized !== inclusion) {
				args.push('-g', normalized);
			}
		}
	});

	options.excludes.forEach(globArg => {
		const exclusion = `!${anchor(globArg)}`;
		args.push('-g', exclusion);
		if (isMac) {
			const normalized = normalizeNFD(exclusion);
			if (normalized !== exclusion) {
				args.push('-g', normalized);
			}
		}
	});

	if (options.useIgnoreFiles) {
		args.push('--no-ignore-parent');
	} else {
		// Don't use .gitignore or .ignore
		args.push('--no-ignore');
	}

	// Follow symlinks
	if (options.followSymlinks) {
		args.push('--follow');
	}

	// Folder to search
	args.push('--');

	args.push('.');

	return args;
}

function anchor(glob: string) {
	return glob.startsWith('**') || glob.startsWith('/') ? glob : `/${glob}`;
}
