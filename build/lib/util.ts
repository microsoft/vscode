/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as es from 'event-stream';
import * as debounce from 'debounce';
import * as _filter from 'gulp-filter';
import * as rename from 'gulp-rename';
import * as _ from 'underscore';
import * as path from 'path';
import * as fs from 'fs';
import * as _rimraf from 'rimraf';
import * as git from './git';
import * as VinylFile from 'vinyl';
import { ThroughStream } from 'through';
import * as sm from 'source-map';
import * as cp from 'child_process';

export interface ICancellationToken {
	isCancellationRequested(): boolean;
}

const NoCancellationToken: ICancellationToken = { isCancellationRequested: () => false };

export interface IStreamProvider {
	(cancellationToken?: ICancellationToken): NodeJS.ReadWriteStream;
}

export function incremental(streamProvider: IStreamProvider, initial: NodeJS.ReadWriteStream, supportsCancellation?: boolean): NodeJS.ReadWriteStream {
	const input = es.through();
	const output = es.through();
	let state = 'idle';
	let buffer = Object.create(null);

	const token: ICancellationToken = !supportsCancellation ? null : { isCancellationRequested: () => Object.keys(buffer).length > 0 };

	const run = (input, isCancellable) => {
		state = 'running';

		const stream = !supportsCancellation ? streamProvider() : streamProvider(isCancellable ? token : NoCancellationToken);

		input
			.pipe(stream)
			.pipe(es.through(null, () => {
				state = 'idle';
				eventuallyRun();
			}))
			.pipe(output);
	};

	if (initial) {
		run(initial, false);
	}

	const eventuallyRun = debounce(() => {
		const paths = Object.keys(buffer);

		if (paths.length === 0) {
			return;
		}

		const data = paths.map(path => buffer[path]);
		buffer = Object.create(null);
		run(es.readArray(data), true);
	}, 500);

	input.on('data', (f: any) => {
		buffer[f.path] = f;

		if (state === 'idle') {
			eventuallyRun();
		}
	});

	return es.duplex(input, output);
}

export function fixWin32DirectoryPermissions(): NodeJS.ReadWriteStream {
	if (!/win32/.test(process.platform)) {
		return es.through();
	}

	return es.mapSync<VinylFile, VinylFile>(f => {
		if (f.stat && f.stat.isDirectory && f.stat.isDirectory()) {
			f.stat.mode = 16877;
		}

		return f;
	});
}

export function setExecutableBit(pattern: string | string[]): NodeJS.ReadWriteStream {
	var setBit = es.mapSync<VinylFile, VinylFile>(f => {
		f.stat.mode = /* 100755 */ 33261;
		return f;
	});

	if (!pattern) {
		return setBit;
	}

	var input = es.through();
	var filter = _filter(pattern, { restore: true });
	var output = input
		.pipe(filter)
		.pipe(setBit)
		.pipe(filter.restore);

	return es.duplex(input, output);
}

export function toFileUri(filePath: string): string {
	const match = filePath.match(/^([a-z])\:(.*)$/i);

	if (match) {
		filePath = '/' + match[1].toUpperCase() + ':' + match[2];
	}

	return 'file://' + filePath.replace(/\\/g, '/');
}

export function skipDirectories(): NodeJS.ReadWriteStream {
	return es.mapSync<VinylFile, VinylFile>(f => {
		if (!f.isDirectory()) {
			return f;
		}
	});
}

export function cleanNodeModule(name: string, excludes: string[], includes?: string[]): NodeJS.ReadWriteStream {
	const toGlob = (path: string) => '**/node_modules/' + name + (path ? '/' + path : '');
	const negate = (str: string) => '!' + str;

	const allFilter = _filter(toGlob('**'), { restore: true });
	const globs = [toGlob('**')].concat(excludes.map(_.compose(negate, toGlob)));

	const input = es.through();
	const nodeModuleInput = input.pipe(allFilter);
	let output: NodeJS.ReadWriteStream = nodeModuleInput.pipe(_filter(globs));

	if (includes) {
		const includeGlobs = includes.map(toGlob);
		output = es.merge(output, nodeModuleInput.pipe(_filter(includeGlobs)));
	}

	output = output.pipe(allFilter.restore);
	return es.duplex(input, output);
}

declare class FileSourceMap extends VinylFile {
	public sourceMap: sm.RawSourceMap;
}

export function loadSourcemaps(): NodeJS.ReadWriteStream {
	const input = es.through();

	const output = input
		.pipe(es.map<FileSourceMap, FileSourceMap>((f, cb): FileSourceMap => {
			if (f.sourceMap) {
				cb(null, f);
				return;
			}

			if (!f.contents) {
				cb(new Error('empty file'));
				return;
			}

			const contents = (<Buffer>f.contents).toString('utf8');

			const reg = /\/\/# sourceMappingURL=(.*)$/g;
			let lastMatch = null, match = null;

			while (match = reg.exec(contents)) {
				lastMatch = match;
			}

			if (!lastMatch) {
				f.sourceMap = {
					version: 3,
					names: [],
					mappings: '',
					sources: [f.relative.replace(/\//g, '/')],
					sourcesContent: [contents]
				};

				cb(null, f);
				return;
			}

			f.contents = Buffer.from(contents.replace(/\/\/# sourceMappingURL=(.*)$/g, ''), 'utf8');

			fs.readFile(path.join(path.dirname(f.path), lastMatch[1]), 'utf8', (err, contents) => {
				if (err) { return cb(err); }

				f.sourceMap = JSON.parse(contents);
				cb(null, f);
			});
		}));

	return es.duplex(input, output);
}

export function stripSourceMappingURL(): NodeJS.ReadWriteStream {
	const input = es.through();

	const output = input
		.pipe(es.mapSync<VinylFile, VinylFile>(f => {
			const contents = (<Buffer>f.contents).toString('utf8');
			f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, ''), 'utf8');
			return f;
		}));

	return es.duplex(input, output);
}

export function rimraf(dir: string): (cb: any) => void {
	let retries = 0;

	const retry = cb => {
		_rimraf(dir, { maxBusyTries: 1 }, (err: any) => {
			if (!err) {
				return cb();
			}

			if (err.code === 'ENOTEMPTY' && ++retries < 5) {
				return setTimeout(() => retry(cb), 10);
			}

			return cb(err);
		});
	};

	return cb => retry(cb);
}

export function getVersion(root: string): string {
	let version = process.env['BUILD_SOURCEVERSION'];

	if (!version || !/^[0-9a-f]{40}$/i.test(version)) {
		version = git.getVersion(root);
	}

	return version;
}

export function rebase(count: number): NodeJS.ReadWriteStream {
	return rename(f => {
		const parts = f.dirname.split(/[\/\\]/);
		f.dirname = parts.slice(count).join(path.sep);
	});
}

export interface FilterStream extends NodeJS.ReadWriteStream {
	restore: ThroughStream;
}

export function filter(fn: (data: any) => boolean): FilterStream {
	const result = <FilterStream><any>es.through(function (data) {
		if (fn(data)) {
			this.emit('data', data);
		} else {
			result.restore.push(data);
		}
	});

	result.restore = es.through();
	return result;
}

function tagExists(tagName: string): boolean {
	try {
		cp.execSync(`git rev-parse ${tagName}`, { stdio: 'ignore' });
		return true;
	} catch (e) {
		return false;
	}
}

/**
 * Returns the version previous to the given version. Throws if a git tag for that version doesn't exist.
 * Given 1.17.2, return 1.17.1
 * 1.18.0 => 1.17.2. (or the highest 1.17.x)
 * 2.0.0 => 1.18.0 (or the highest 1.x)
 */
export function getPreviousVersion(versionStr: string, _tagExists = tagExists) {
	function getLatestTagFromBase(semverArr: number[], componentToTest: number): string {
		const baseVersion = semverArr.join('.');
		if (!_tagExists(baseVersion)) {
			throw new Error('Failed to find git tag for base version, ' + baseVersion);
		}

		let goodTag;
		do {
			goodTag = semverArr.join('.');
			semverArr[componentToTest]++;
		} while (_tagExists(semverArr.join('.')));

		return goodTag;
	}

	const semverArr = versionStringToNumberArray(versionStr);
	if (semverArr[2] > 0) {
		semverArr[2]--;
		const previous = semverArr.join('.');
		if (!_tagExists(previous)) {
			throw new Error('Failed to find git tag for previous version, ' + previous);
		}

		return previous;
	} else if (semverArr[1] > 0) {
		semverArr[1]--;
		return getLatestTagFromBase(semverArr, 2);
	} else {
		semverArr[0]--;

		// Find 1.x.0 for latest x
		const latestMinorVersion = getLatestTagFromBase(semverArr, 1);

		// Find 1.x.y for latest y
		return getLatestTagFromBase(versionStringToNumberArray(latestMinorVersion), 2);
	}
}

function versionStringToNumberArray(versionStr: string): number[] {
	return versionStr
		.split('.')
		.map(s => parseInt(s));
}

export function versionStringToNumber(versionStr: string) {
	const semverRegex = /(\d+)\.(\d+)\.(\d+)/;
	const match = versionStr.match(semverRegex);
	if (!match) {
		throw new Error('Version string is not properly formatted: ' + versionStr);
	}

	return parseInt(match[1], 10) * 1e4 + parseInt(match[2], 10) * 1e2 + parseInt(match[3], 10);
}
