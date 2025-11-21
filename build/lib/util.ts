/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import _debounce from 'debounce';
import _filter from 'gulp-filter';
import rename from 'gulp-rename';
import path from 'path';
import fs from 'fs';
import _rimraf from 'rimraf';
import VinylFile from 'vinyl';
import through from 'through';
import sm from 'source-map';
import { pathToFileURL } from 'url';
import ternaryStream from 'ternary-stream';

const root = path.dirname(path.dirname(import.meta.dirname));

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

	const token: ICancellationToken | undefined = !supportsCancellation ? undefined : { isCancellationRequested: () => Object.keys(buffer).length > 0 };

	const run = (input: NodeJS.ReadWriteStream, isCancellable: boolean) => {
		state = 'running';

		const stream = !supportsCancellation ? streamProvider() : streamProvider(isCancellable ? token : NoCancellationToken);

		input
			.pipe(stream)
			.pipe(es.through(undefined, () => {
				state = 'idle';
				eventuallyRun();
			}))
			.pipe(output);
	};

	if (initial) {
		run(initial, false);
	}

	const eventuallyRun = _debounce(() => {
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

export function debounce(task: () => NodeJS.ReadWriteStream, duration = 500): NodeJS.ReadWriteStream {
	const input = es.through();
	const output = es.through();
	let state = 'idle';

	const run = () => {
		state = 'running';

		task()
			.pipe(es.through(undefined, () => {
				const shouldRunAgain = state === 'stale';
				state = 'idle';

				if (shouldRunAgain) {
					eventuallyRun();
				}
			}))
			.pipe(output);
	};

	run();

	const eventuallyRun = _debounce(() => run(), duration);

	input.on('data', () => {
		if (state === 'idle') {
			eventuallyRun();
		} else {
			state = 'stale';
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

export function setExecutableBit(pattern?: string | string[]): NodeJS.ReadWriteStream {
	const setBit = es.mapSync<VinylFile, VinylFile>(f => {
		if (!f.stat) {
			const stat: Pick<fs.Stats, 'isFile' | 'mode'> = { isFile() { return true; }, mode: 0 };
			f.stat = stat as fs.Stats;
		}
		f.stat!.mode = /* 100755 */ 33261;
		return f;
	});

	if (!pattern) {
		return setBit;
	}

	const input = es.through();
	const filter = _filter(pattern, { restore: true });
	const output = input
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
	return es.mapSync<VinylFile, VinylFile | undefined>(f => {
		if (!f.isDirectory()) {
			return f;
		}
	});
}

export function cleanNodeModules(rulePath: string): NodeJS.ReadWriteStream {
	const rules = fs.readFileSync(rulePath, 'utf8')
		.split(/\r?\n/g)
		.map(line => line.trim())
		.filter(line => line && !/^#/.test(line));

	const excludes = rules.filter(line => !/^!/.test(line)).map(line => `!**/node_modules/${line}`);
	const includes = rules.filter(line => /^!/.test(line)).map(line => `**/node_modules/${line.substr(1)}`);

	const input = es.through();
	const output = es.merge(
		input.pipe(_filter(['**', ...excludes])),
		input.pipe(_filter(includes))
	);

	return es.duplex(input, output);
}

type FileSourceMap = VinylFile & { sourceMap: sm.RawSourceMap };

export function loadSourcemaps(): NodeJS.ReadWriteStream {
	const input = es.through();

	const output = input
		.pipe(es.map<FileSourceMap, FileSourceMap | undefined>((f, cb): FileSourceMap | undefined => {
			if (f.sourceMap) {
				cb(undefined, f);
				return;
			}

			if (!f.contents) {
				cb(undefined, f);
				return;
			}

			const contents = (f.contents as Buffer).toString('utf8');
			const reg = /\/\/# sourceMappingURL=(.*)$/g;
			let lastMatch: RegExpExecArray | null = null;
			let match: RegExpExecArray | null = null;

			while (match = reg.exec(contents)) {
				lastMatch = match;
			}

			if (!lastMatch) {
				f.sourceMap = {
					version: '3',
					names: [],
					mappings: '',
					sources: [f.relative.replace(/\\/g, '/')],
					sourcesContent: [contents]
				};

				cb(undefined, f);
				return;
			}

			f.contents = Buffer.from(contents.replace(/\/\/# sourceMappingURL=(.*)$/g, ''), 'utf8');

			fs.readFile(path.join(path.dirname(f.path), lastMatch[1]), 'utf8', (err, contents) => {
				if (err) { return cb(err); }

				f.sourceMap = JSON.parse(contents);
				cb(undefined, f);
			});
		}));

	return es.duplex(input, output);
}

export function stripSourceMappingURL(): NodeJS.ReadWriteStream {
	const input = es.through();

	const output = input
		.pipe(es.mapSync<VinylFile, VinylFile>(f => {
			const contents = (f.contents as Buffer).toString('utf8');
			f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, ''), 'utf8');
			return f;
		}));

	return es.duplex(input, output);
}

/** Splits items in the stream based on the predicate, sending them to onTrue if true, or onFalse otherwise */
export function $if(test: boolean | ((f: VinylFile) => boolean), onTrue: NodeJS.ReadWriteStream, onFalse: NodeJS.ReadWriteStream = es.through()) {
	if (typeof test === 'boolean') {
		return test ? onTrue : onFalse;
	}

	return ternaryStream(test, onTrue, onFalse);
}

/** Operator that appends the js files' original path a sourceURL, so debug locations map */
export function appendOwnPathSourceURL(): NodeJS.ReadWriteStream {
	const input = es.through();

	const output = input
		.pipe(es.mapSync<VinylFile, VinylFile>(f => {
			if (!(f.contents instanceof Buffer)) {
				throw new Error(`contents of ${f.path} are not a buffer`);
			}

			f.contents = Buffer.concat([f.contents, Buffer.from(`\n//# sourceURL=${pathToFileURL(f.path)}`)]);
			return f;
		}));

	return es.duplex(input, output);
}

export function rewriteSourceMappingURL(sourceMappingURLBase: string): NodeJS.ReadWriteStream {
	const input = es.through();

	const output = input
		.pipe(es.mapSync<VinylFile, VinylFile>(f => {
			const contents = (f.contents as Buffer).toString('utf8');
			const str = `//# sourceMappingURL=${sourceMappingURLBase}/${path.dirname(f.relative).replace(/\\/g, '/')}/$1`;
			f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, str));
			return f;
		}));

	return es.duplex(input, output);
}

export function rimraf(dir: string): () => Promise<void> {
	const result = () => new Promise<void>((c, e) => {
		let retries = 0;

		const retry = () => {
			_rimraf(dir, { maxBusyTries: 1 }, (err: any) => {
				if (!err) {
					return c();
				}

				if (err.code === 'ENOTEMPTY' && ++retries < 5) {
					return setTimeout(() => retry(), 10);
				}

				return e(err);
			});
		};

		retry();
	});

	result.taskName = `clean-${path.basename(dir).toLowerCase()}`;
	return result;
}

function _rreaddir(dirPath: string, prepend: string, result: string[]): void {
	const entries = fs.readdirSync(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isDirectory()) {
			_rreaddir(path.join(dirPath, entry.name), `${prepend}/${entry.name}`, result);
		} else {
			result.push(`${prepend}/${entry.name}`);
		}
	}
}

export function rreddir(dirPath: string): string[] {
	const result: string[] = [];
	_rreaddir(dirPath, '', result);
	return result;
}

export function ensureDir(dirPath: string): void {
	if (fs.existsSync(dirPath)) {
		return;
	}
	ensureDir(path.dirname(dirPath));
	fs.mkdirSync(dirPath);
}

export function rebase(count: number): NodeJS.ReadWriteStream {
	return rename(f => {
		const parts = f.dirname ? f.dirname.split(/[\/\\]/) : [];
		f.dirname = parts.slice(count).join(path.sep);
	});
}

export interface FilterStream extends NodeJS.ReadWriteStream {
	restore: through.ThroughStream;
}

export function filter(fn: (data: any) => boolean): FilterStream {
	const result = es.through(function (data) {
		if (fn(data)) {
			this.emit('data', data);
		} else {
			result.restore.push(data);
		}
	}) as unknown as FilterStream;

	result.restore = es.through();
	return result;
}

export function streamToPromise(stream: NodeJS.ReadWriteStream): Promise<void> {
	return new Promise((c, e) => {
		stream.on('error', err => e(err));
		stream.on('end', () => c());
	});
}

export function getElectronVersion(): Record<string, string> {
	const npmrc = fs.readFileSync(path.join(root, '.npmrc'), 'utf8');
	const electronVersion = /^target="(.*)"$/m.exec(npmrc)![1];
	const msBuildId = /^ms_build_id="(.*)"$/m.exec(npmrc)![1];
	return { electronVersion, msBuildId };
}

export class VinylStat implements fs.Stats {

	readonly dev: number;
	readonly ino: number;
	readonly mode: number;
	readonly nlink: number;
	readonly uid: number;
	readonly gid: number;
	readonly rdev: number;
	readonly size: number;
	readonly blksize: number;
	readonly blocks: number;
	readonly atimeMs: number;
	readonly mtimeMs: number;
	readonly ctimeMs: number;
	readonly birthtimeMs: number;
	readonly atime: Date;
	readonly mtime: Date;
	readonly ctime: Date;
	readonly birthtime: Date;

	constructor(stat: Partial<fs.Stats>) {
		this.dev = stat.dev ?? 0;
		this.ino = stat.ino ?? 0;
		this.mode = stat.mode ?? 0;
		this.nlink = stat.nlink ?? 0;
		this.uid = stat.uid ?? 0;
		this.gid = stat.gid ?? 0;
		this.rdev = stat.rdev ?? 0;
		this.size = stat.size ?? 0;
		this.blksize = stat.blksize ?? 0;
		this.blocks = stat.blocks ?? 0;
		this.atimeMs = stat.atimeMs ?? 0;
		this.mtimeMs = stat.mtimeMs ?? 0;
		this.ctimeMs = stat.ctimeMs ?? 0;
		this.birthtimeMs = stat.birthtimeMs ?? 0;
		this.atime = stat.atime ?? new Date(0);
		this.mtime = stat.mtime ?? new Date(0);
		this.ctime = stat.ctime ?? new Date(0);
		this.birthtime = stat.birthtime ?? new Date(0);
	}

	isFile(): boolean { return true; }
	isDirectory(): boolean { return false; }
	isBlockDevice(): boolean { return false; }
	isCharacterDevice(): boolean { return false; }
	isSymbolicLink(): boolean { return false; }
	isFIFO(): boolean { return false; }
	isSocket(): boolean { return false; }
}
