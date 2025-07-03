/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Disposable, EventEmitter, SourceControlHistoryItemRef, l10n, workspace, Uri, DiagnosticSeverity, env } from 'vscode';
import { dirname, sep, relative } from 'path';
import { Readable } from 'stream';
import { promises as fs, createReadStream } from 'fs';
import byline from 'byline';

export const isMacintosh = process.platform === 'darwin';
export const isWindows = process.platform === 'win32';
export const isRemote = env.remoteName !== undefined;
export const isLinux = process.platform === 'linux';
export const isLinuxSnap = isLinux && !!process.env['SNAP'] && !!process.env['SNAP_REVISION'];

export function log(...args: any[]): void {
	console.log.apply(console, ['git:', ...args]);
}

export interface IDisposable {
	dispose(): void;
}

export function dispose<T extends IDisposable>(disposables: T[]): T[] {
	disposables.forEach(d => d.dispose());
	return [];
}

export function toDisposable(dispose: () => void): IDisposable {
	return { dispose };
}

export function combinedDisposable(disposables: IDisposable[]): IDisposable {
	return toDisposable(() => dispose(disposables));
}

export const EmptyDisposable = toDisposable(() => null);

export function fireEvent<T>(event: Event<T>): Event<T> {
	return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => event(_ => (listener as any).call(thisArgs), null, disposables);
}

export function mapEvent<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
	return (listener: (e: O) => any, thisArgs?: any, disposables?: Disposable[]) => event(i => listener.call(thisArgs, map(i)), null, disposables);
}

export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
	return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}

export function runAndSubscribeEvent<T>(event: Event<T>, handler: (e: T) => any, initial: T): IDisposable;
export function runAndSubscribeEvent<T>(event: Event<T>, handler: (e: T | undefined) => any): IDisposable;
export function runAndSubscribeEvent<T>(event: Event<T>, handler: (e: T | undefined) => any, initial?: T): IDisposable {
	handler(initial);
	return event(e => handler(e));
}

export function anyEvent<T>(...events: Event<T>[]): Event<T> {
	return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => {
		const result = combinedDisposable(events.map(event => event(i => listener.call(thisArgs, i))));

		disposables?.push(result);

		return result;
	};
}

export function done<T>(promise: Promise<T>): Promise<void> {
	return promise.then<void>(() => undefined);
}

export function onceEvent<T>(event: Event<T>): Event<T> {
	return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => {
		const result = event(e => {
			result.dispose();
			return listener.call(thisArgs, e);
		}, null, disposables);

		return result;
	};
}

export function debounceEvent<T>(event: Event<T>, delay: number): Event<T> {
	return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => {
		let timer: NodeJS.Timeout;
		return event(e => {
			clearTimeout(timer);
			timer = setTimeout(() => listener.call(thisArgs, e), delay);
		}, null, disposables);
	};
}

export function eventToPromise<T>(event: Event<T>): Promise<T> {
	return new Promise<T>(c => onceEvent(event)(c));
}

export function once(fn: (...args: any[]) => any): (...args: any[]) => any {
	const didRun = false;

	return (...args) => {
		if (didRun) {
			return;
		}

		return fn(...args);
	};
}

export function assign<T>(destination: T, ...sources: any[]): T {
	for (const source of sources) {
		Object.keys(source).forEach(key => (destination as any)[key] = source[key]);
	}

	return destination;
}

export function uniqBy<T>(arr: T[], fn: (el: T) => string): T[] {
	const seen = Object.create(null);

	return arr.filter(el => {
		const key = fn(el);

		if (seen[key]) {
			return false;
		}

		seen[key] = true;
		return true;
	});
}

export function groupBy<T>(arr: T[], fn: (el: T) => string): { [key: string]: T[] } {
	return arr.reduce((result, el) => {
		const key = fn(el);
		result[key] = [...(result[key] || []), el];
		return result;
	}, Object.create(null));
}


export async function mkdirp(path: string, mode?: number): Promise<boolean> {
	const mkdir = async () => {
		try {
			await fs.mkdir(path, mode);
		} catch (err) {
			if (err.code === 'EEXIST') {
				const stat = await fs.stat(path);

				if (stat.isDirectory()) {
					return;
				}

				throw new Error(`'${path}' exists and is not a directory.`);
			}

			throw err;
		}
	};

	// is root?
	if (path === dirname(path)) {
		return true;
	}

	try {
		await mkdir();
	} catch (err) {
		if (err.code !== 'ENOENT') {
			throw err;
		}

		await mkdirp(dirname(path), mode);
		await mkdir();
	}

	return true;
}

export function uniqueFilter<T>(keyFn: (t: T) => string): (t: T) => boolean {
	const seen: { [key: string]: boolean } = Object.create(null);

	return element => {
		const key = keyFn(element);

		if (seen[key]) {
			return false;
		}

		seen[key] = true;
		return true;
	};
}

export function find<T>(array: T[], fn: (t: T) => boolean): T | undefined {
	let result: T | undefined = undefined;

	array.some(e => {
		if (fn(e)) {
			result = e;
			return true;
		}

		return false;
	});

	return result;
}

export async function grep(filename: string, pattern: RegExp): Promise<boolean> {
	return new Promise<boolean>((c, e) => {
		const fileStream = createReadStream(filename, { encoding: 'utf8' });
		const stream = byline(fileStream);
		stream.on('data', (line: string) => {
			if (pattern.test(line)) {
				fileStream.close();
				c(true);
			}
		});

		stream.on('error', e);
		stream.on('end', () => c(false));
	});
}

export function readBytes(stream: Readable, bytes: number): Promise<Buffer> {
	return new Promise<Buffer>((complete, error) => {
		let done = false;
		const buffer = Buffer.allocUnsafe(bytes);
		let bytesRead = 0;

		stream.on('data', (data: Buffer) => {
			const bytesToRead = Math.min(bytes - bytesRead, data.length);
			data.copy(buffer, bytesRead, 0, bytesToRead);
			bytesRead += bytesToRead;

			if (bytesRead === bytes) {
				(stream as any).destroy(); // Will trigger the close event eventually
			}
		});

		stream.on('error', (e: Error) => {
			if (!done) {
				done = true;
				error(e);
			}
		});

		stream.on('close', () => {
			if (!done) {
				done = true;
				complete(buffer.slice(0, bytesRead));
			}
		});
	});
}

export const enum Encoding {
	UTF8 = 'utf8',
	UTF16be = 'utf16be',
	UTF16le = 'utf16le'
}

export function detectUnicodeEncoding(buffer: Buffer): Encoding | null {
	if (buffer.length < 2) {
		return null;
	}

	const b0 = buffer.readUInt8(0);
	const b1 = buffer.readUInt8(1);

	if (b0 === 0xFE && b1 === 0xFF) {
		return Encoding.UTF16be;
	}

	if (b0 === 0xFF && b1 === 0xFE) {
		return Encoding.UTF16le;
	}

	if (buffer.length < 3) {
		return null;
	}

	const b2 = buffer.readUInt8(2);

	if (b0 === 0xEF && b1 === 0xBB && b2 === 0xBF) {
		return Encoding.UTF8;
	}

	return null;
}

export function truncate(value: string, maxLength = 20, ellipsis = true): string {
	return value.length <= maxLength ? value : `${value.substring(0, maxLength)}${ellipsis ? '\u2026' : ''}`;
}

function normalizePath(path: string): string {
	// Windows & Mac are currently being handled
	// as case insensitive file systems in VS Code.
	if (isWindows || isMacintosh) {
		return path.toLowerCase();
	}

	return path;
}

export function isDescendant(parent: string, descendant: string): boolean {
	if (parent === descendant) {
		return true;
	}

	if (parent.charAt(parent.length - 1) !== sep) {
		parent += sep;
	}

	return normalizePath(descendant).startsWith(normalizePath(parent));
}

export function pathEquals(a: string, b: string): boolean {
	return normalizePath(a) === normalizePath(b);
}

/**
 * Given the `repository.root` compute the relative path while trying to preserve
 * the casing of the resource URI. The `repository.root` segment of the path can
 * have a casing mismatch if the folder/workspace is being opened with incorrect
 * casing which is why we attempt to use substring() before relative().
 */
export function relativePath(from: string, to: string): string {
	return relativePathWithNoFallback(from, to) ?? relative(from, to);
}

export function relativePathWithNoFallback(from: string, to: string): string | undefined {
	// There are cases in which the `from` path may contain a trailing separator at
	// the end (ex: "C:\", "\\server\folder\" (Windows) or "/" (Linux/macOS)) which
	// is by design as documented in https://github.com/nodejs/node/issues/1765. If
	// the trailing separator is missing, we add it.
	if (from.charAt(from.length - 1) !== sep) {
		from += sep;
	}

	if (isDescendant(from, to) && from.length < to.length) {
		return to.substring(from.length);
	}

	return undefined;
}

export function* splitInChunks(array: string[], maxChunkLength: number): IterableIterator<string[]> {
	let current: string[] = [];
	let length = 0;

	for (const value of array) {
		let newLength = length + value.length;

		if (newLength > maxChunkLength && current.length > 0) {
			yield current;
			current = [];
			newLength = value.length;
		}

		current.push(value);
		length = newLength;
	}

	if (current.length > 0) {
		yield current;
	}
}

/**
 * @returns whether the provided parameter is defined.
 */
export function isDefined<T>(arg: T | null | undefined): arg is T {
	return !isUndefinedOrNull(arg);
}

/**
 * @returns whether the provided parameter is undefined or null.
 */
export function isUndefinedOrNull(obj: unknown): obj is undefined | null {
	return (isUndefined(obj) || obj === null);
}

/**
 * @returns whether the provided parameter is undefined.
 */
export function isUndefined(obj: unknown): obj is undefined {
	return (typeof obj === 'undefined');
}

interface ILimitedTaskFactory<T> {
	factory: () => Promise<T>;
	c: (value: T | Promise<T>) => void;
	e: (error?: any) => void;
}

export class Limiter<T> {

	private runningPromises: number;
	private maxDegreeOfParalellism: number;
	private outstandingPromises: ILimitedTaskFactory<T>[];

	constructor(maxDegreeOfParalellism: number) {
		this.maxDegreeOfParalellism = maxDegreeOfParalellism;
		this.outstandingPromises = [];
		this.runningPromises = 0;
	}

	queue(factory: () => Promise<T>): Promise<T> {
		return new Promise<T>((c, e) => {
			this.outstandingPromises.push({ factory, c, e });
			this.consume();
		});
	}

	private consume(): void {
		while (this.outstandingPromises.length && this.runningPromises < this.maxDegreeOfParalellism) {
			const iLimitedTask = this.outstandingPromises.shift()!;
			this.runningPromises++;

			const promise = iLimitedTask.factory();
			promise.then(iLimitedTask.c, iLimitedTask.e);
			promise.then(() => this.consumed(), () => this.consumed());
		}
	}

	private consumed(): void {
		this.runningPromises--;

		if (this.outstandingPromises.length > 0) {
			this.consume();
		}
	}
}

type Completion<T> = { success: true; value: T } | { success: false; err: any };

export class PromiseSource<T> {

	private _onDidComplete = new EventEmitter<Completion<T>>();

	private _promise: Promise<T> | undefined;
	get promise(): Promise<T> {
		if (this._promise) {
			return this._promise;
		}

		return eventToPromise(this._onDidComplete.event).then(completion => {
			if (completion.success) {
				return completion.value;
			} else {
				throw completion.err;
			}
		});
	}

	resolve(value: T): void {
		if (!this._promise) {
			this._promise = Promise.resolve(value);
			this._onDidComplete.fire({ success: true, value });
		}
	}

	reject(err: any): void {
		if (!this._promise) {
			this._promise = Promise.reject(err);
			this._onDidComplete.fire({ success: false, err });
		}
	}
}

export namespace Versions {
	declare type VersionComparisonResult = -1 | 0 | 1;

	export interface Version {
		major: number;
		minor: number;
		patch: number;
		pre?: string;
	}

	export function compare(v1: string | Version, v2: string | Version): VersionComparisonResult {
		if (typeof v1 === 'string') {
			v1 = fromString(v1);
		}
		if (typeof v2 === 'string') {
			v2 = fromString(v2);
		}

		if (v1.major > v2.major) { return 1; }
		if (v1.major < v2.major) { return -1; }

		if (v1.minor > v2.minor) { return 1; }
		if (v1.minor < v2.minor) { return -1; }

		if (v1.patch > v2.patch) { return 1; }
		if (v1.patch < v2.patch) { return -1; }

		if (v1.pre === undefined && v2.pre !== undefined) { return 1; }
		if (v1.pre !== undefined && v2.pre === undefined) { return -1; }

		if (v1.pre !== undefined && v2.pre !== undefined) {
			return v1.pre.localeCompare(v2.pre) as VersionComparisonResult;
		}

		return 0;
	}

	export function from(major: string | number, minor: string | number, patch?: string | number, pre?: string): Version {
		return {
			major: typeof major === 'string' ? parseInt(major, 10) : major,
			minor: typeof minor === 'string' ? parseInt(minor, 10) : minor,
			patch: patch === undefined || patch === null ? 0 : typeof patch === 'string' ? parseInt(patch, 10) : patch,
			pre: pre,
		};
	}

	export function fromString(version: string): Version {
		const [ver, pre] = version.split('-');
		const [major, minor, patch] = ver.split('.');
		return from(major, minor, patch, pre);
	}
}

export function deltaHistoryItemRefs(before: SourceControlHistoryItemRef[], after: SourceControlHistoryItemRef[]): {
	added: SourceControlHistoryItemRef[];
	modified: SourceControlHistoryItemRef[];
	removed: SourceControlHistoryItemRef[];
} {
	if (before.length === 0) {
		return { added: after, modified: [], removed: [] };
	}

	const added: SourceControlHistoryItemRef[] = [];
	const modified: SourceControlHistoryItemRef[] = [];
	const removed: SourceControlHistoryItemRef[] = [];

	let beforeIdx = 0;
	let afterIdx = 0;

	while (true) {
		if (beforeIdx === before.length) {
			added.push(...after.slice(afterIdx));
			break;
		}
		if (afterIdx === after.length) {
			removed.push(...before.slice(beforeIdx));
			break;
		}

		const beforeElement = before[beforeIdx];
		const afterElement = after[afterIdx];

		const result = beforeElement.id.localeCompare(afterElement.id);

		if (result === 0) {
			if (beforeElement.revision !== afterElement.revision) {
				// modified
				modified.push(afterElement);
			}

			beforeIdx += 1;
			afterIdx += 1;
		} else if (result < 0) {
			// beforeElement is smaller -> before element removed
			removed.push(beforeElement);

			beforeIdx += 1;
		} else if (result > 0) {
			// beforeElement is greater -> after element added
			added.push(afterElement);

			afterIdx += 1;
		}
	}

	return { added, modified, removed };
}

const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const month = day * 30;
const year = day * 365;

/**
 * Create a l10n.td difference of the time between now and the specified date.
 * @param date The date to generate the difference from.
 * @param appendAgoLabel Whether to append the " ago" to the end.
 * @param useFullTimeWords Whether to use full words (eg. seconds) instead of
 * shortened (eg. secs).
 * @param disallowNow Whether to disallow the string "now" when the difference
 * is less than 30 seconds.
 */
export function fromNow(date: number | Date, appendAgoLabel?: boolean, useFullTimeWords?: boolean, disallowNow?: boolean): string {
	if (typeof date !== 'number') {
		date = date.getTime();
	}

	const seconds = Math.round((new Date().getTime() - date) / 1000);
	if (seconds < -30) {
		return l10n.t('in {0}', fromNow(new Date().getTime() + seconds * 1000, false));
	}

	if (!disallowNow && seconds < 30) {
		return l10n.t('now');
	}

	let value: number;
	if (seconds < minute) {
		value = seconds;

		if (appendAgoLabel) {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} second ago', value)
					: l10n.t('{0} sec ago', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} seconds ago', value)
					: l10n.t('{0} secs ago', value);
			}
		} else {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} second', value)
					: l10n.t('{0} sec', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} seconds', value)
					: l10n.t('{0} secs', value);
			}
		}
	}

	if (seconds < hour) {
		value = Math.floor(seconds / minute);
		if (appendAgoLabel) {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} minute ago', value)
					: l10n.t('{0} min ago', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} minutes ago', value)
					: l10n.t('{0} mins ago', value);
			}
		} else {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} minute', value)
					: l10n.t('{0} min', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} minutes', value)
					: l10n.t('{0} mins', value);
			}
		}
	}

	if (seconds < day) {
		value = Math.floor(seconds / hour);
		if (appendAgoLabel) {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} hour ago', value)
					: l10n.t('{0} hr ago', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} hours ago', value)
					: l10n.t('{0} hrs ago', value);
			}
		} else {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} hour', value)
					: l10n.t('{0} hr', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} hours', value)
					: l10n.t('{0} hrs', value);
			}
		}
	}

	if (seconds < week) {
		value = Math.floor(seconds / day);
		if (appendAgoLabel) {
			return value === 1
				? l10n.t('{0} day ago', value)
				: l10n.t('{0} days ago', value);
		} else {
			return value === 1
				? l10n.t('{0} day', value)
				: l10n.t('{0} days', value);
		}
	}

	if (seconds < month) {
		value = Math.floor(seconds / week);
		if (appendAgoLabel) {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} week ago', value)
					: l10n.t('{0} wk ago', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} weeks ago', value)
					: l10n.t('{0} wks ago', value);
			}
		} else {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} week', value)
					: l10n.t('{0} wk', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} weeks', value)
					: l10n.t('{0} wks', value);
			}
		}
	}

	if (seconds < year) {
		value = Math.floor(seconds / month);
		if (appendAgoLabel) {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} month ago', value)
					: l10n.t('{0} mo ago', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} months ago', value)
					: l10n.t('{0} mos ago', value);
			}
		} else {
			if (value === 1) {
				return useFullTimeWords
					? l10n.t('{0} month', value)
					: l10n.t('{0} mo', value);
			} else {
				return useFullTimeWords
					? l10n.t('{0} months', value)
					: l10n.t('{0} mos', value);
			}
		}
	}

	value = Math.floor(seconds / year);
	if (appendAgoLabel) {
		if (value === 1) {
			return useFullTimeWords
				? l10n.t('{0} year ago', value)
				: l10n.t('{0} yr ago', value);
		} else {
			return useFullTimeWords
				? l10n.t('{0} years ago', value)
				: l10n.t('{0} yrs ago', value);
		}
	} else {
		if (value === 1) {
			return useFullTimeWords
				? l10n.t('{0} year', value)
				: l10n.t('{0} yr', value);
		} else {
			return useFullTimeWords
				? l10n.t('{0} years', value)
				: l10n.t('{0} yrs', value);
		}
	}
}

export function getCommitShortHash(scope: Uri, hash: string): string {
	const config = workspace.getConfiguration('git', scope);
	const shortHashLength = config.get<number>('commitShortHashLength', 7);
	return hash.substring(0, shortHashLength);
}

export type DiagnosticSeverityConfig = 'error' | 'warning' | 'information' | 'hint' | 'none';

export function toDiagnosticSeverity(value: DiagnosticSeverityConfig): DiagnosticSeverity {
	return value === 'error'
		? DiagnosticSeverity.Error
		: value === 'warning'
			? DiagnosticSeverity.Warning
			: value === 'information'
				? DiagnosticSeverity.Information
				: DiagnosticSeverity.Hint;
}
