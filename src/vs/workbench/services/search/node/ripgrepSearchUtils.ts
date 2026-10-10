/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import * as path from '../../../../base/common/path.js';
import { rgDiskPath } from '../../../../base/node/ripgrep.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SearchRange } from '../common/search.js';
import * as searchExtTypes from '../common/searchExtTypes.js';

export type Maybe<T> = T | null | undefined;

export function anchorGlob(glob: string): string {
	return glob.startsWith('**') || glob.startsWith('/') ? glob : `/${glob}`;
}

const nativeRipgrepIgnoreFileNames = new Set(['.gitignore', '.ignore', '.rgignore']);

export async function getAdditionalIgnoreFiles(folder: string, ignoreFileNames: readonly string[] | undefined, useParentIgnoreFiles: boolean, followSymlinks: boolean, token: CancellationToken = CancellationToken.None): Promise<{ cwd: string; ignoreFilePaths: string[]; dispose(): Promise<void> }> {
	const fileNames = (ignoreFileNames ?? [])
		.filter(fileName => !nativeRipgrepIgnoreFileNames.has(fileName) && fileName.length > 0 && !fileName.includes('/') && !fileName.includes('\\') && fileName !== '.' && fileName !== '..');
	const empty = { cwd: folder, ignoreFilePaths: [], dispose: async () => { } };
	if (!fileNames.length) {
		return empty;
	}

	const args = ['--files', '--hidden', '--no-ignore', '--null', '--no-config'];
	if (followSymlinks) {
		args.push('--follow');
	}
	for (const fileName of fileNames) {
		args.push('-g', `**/${escapeIgnoreGlobPath(fileName)}`);
	}
	const executable = await rgDiskPath();
	const ignoreFilePaths = await new Promise<string[]>((resolve, reject) => {
		const proc = cp.spawn(executable, args, { cwd: folder });
		const cancellation = token.onCancellationRequested(() => proc.kill());
		const output: Buffer[] = [];
		proc.stdout.on('data', (data: Buffer) => output.push(data));
		proc.stderr.resume();
		proc.on('error', reject);
		proc.on('close', () => {
			cancellation.dispose();
			if (token.isCancellationRequested) {
				reject(new CancellationError());
			} else {
				resolve(Buffer.concat(output).toString('utf8').split('\0').filter(Boolean).map(file => path.resolve(folder, file)));
			}
		});
		if (token.isCancellationRequested) {
			proc.kill();
		}
	});

	let cwd = folder;
	if (useParentIgnoreFiles) {
		for (let parent = path.dirname(folder); parent !== folder; parent = path.dirname(parent)) {
			for (const fileName of fileNames) {
				const ignoreFilePath = path.join(parent, fileName);
				try {
					if ((await fs.promises.stat(ignoreFilePath)).isFile()) {
						ignoreFilePaths.push(ignoreFilePath);
						cwd = parent;
					}
				} catch { /* The ignore file may not exist or may not be readable. */ }
			}
			if (parent === path.dirname(parent)) {
				break;
			}
		}
	}
	if (!ignoreFilePaths.length) {
		return empty;
	}

	ignoreFilePaths.sort((a, b) => {
		const depth = (file: string) => path.relative(cwd, file).split(path.sep).length;
		return depth(a) - depth(b) || path.dirname(a).localeCompare(path.dirname(b)) || fileNames.indexOf(path.basename(a)) - fileNames.indexOf(path.basename(b));
	});
	const contents: string[] = [];
	for (const ignoreFilePath of ignoreFilePaths) {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		try {
			const relativeDirectory = path.relative(cwd, path.dirname(ignoreFilePath)).split(path.sep).join('/');
			const prefix = relativeDirectory ? `/${escapeIgnoreGlobPath(relativeDirectory)}/` : '/';
			for (const rawLine of (await fs.promises.readFile(ignoreFilePath, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/)) {
				const line = trimIgnorePattern(rawLine);
				if (!line || line.startsWith('#')) {
					continue;
				}
				const negated = line.startsWith('!');
				let pattern = negated ? line.slice(1) : line;
				if (!pattern || pattern === '/') {
					continue;
				}
				const anchored = pattern.replace(/\/$/, '').includes('/');
				if (pattern.startsWith('/')) {
					pattern = pattern.slice(1);
				} else if (!anchored) {
					pattern = `**/${pattern}`;
				}
				contents.push(`${negated ? '!' : ''}${prefix}${pattern}`);
			}
		} catch { /* Ignore files can disappear during a search. */ }
	}

	const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-search-ignore-'));
	const dispose = () => fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
	const ignoreFilePath = path.join(temporaryDirectory, 'ignore');
	try {
		await fs.promises.writeFile(ignoreFilePath, contents.join('\n'));
		return { cwd, ignoreFilePaths: [ignoreFilePath], dispose };
	} catch (error) {
		await dispose();
		throw error;
	}
}

function escapeIgnoreGlobPath(value: string): string {
	return value.replace(/[\\*?\[\]{}]/g, '\\$&');
}

function trimIgnorePattern(line: string): string {
	let end = line.length;
	while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) {
		let escapeStart = end - 1;
		while (escapeStart > 0 && line[escapeStart - 1] === '\\') {
			escapeStart--;
		}
		if ((end - 1 - escapeStart) % 2 !== 0) {
			break;
		}
		end--;
	}
	return line.slice(0, end);
}

/** Adjusts root-anchored search globs when contributed parent ignore files require an ancestor cwd. */
export function rebaseRipgrepGlobs(args: string[], folder: string, cwd: string): void {
	if (folder === cwd) {
		return;
	}
	const prefix = escapeIgnoreGlobPath(path.relative(cwd, folder).split(path.sep).join('/'));
	for (let i = 0; i < args.length - 1; i++) {
		if (args[i] === '-g') {
			args[i + 1] = args[i + 1].replace(/^(?<negation>!?)(?=\/)/, `$<negation>/${prefix}`);
		}
	}
}

export function rangeToSearchRange(range: searchExtTypes.Range): SearchRange {
	return new SearchRange(range.start.line, range.start.character, range.end.line, range.end.character);
}

export function searchRangeToRange(range: SearchRange): searchExtTypes.Range {
	return new searchExtTypes.Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
}

export interface IOutputChannel {
	appendLine(msg: string): void;
}

export class OutputChannel implements IOutputChannel {
	constructor(private prefix: string, @ILogService private readonly logService: ILogService) { }

	appendLine(msg: string): void {
		this.logService.debug(`${this.prefix}#search`, msg);
	}
}
