/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as es from 'event-stream';
import _debounce = require('debounce');
import * as _filter from 'gulp-filter';
import * as rename from 'gulp-rename';
import * as _ from 'underscore';
import * as path from 'path';
import * as fs from 'fs';
import * as _rimraf from 'rimraf';
import * as VinylFile from 'vinyl';
import { ThroughStream } from 'through';
import * as sm from 'source-map';
import * as git from './git';

const root = path.dirname(path.dirname(__dirname));

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

export function debounce(task: () => NodeJS.ReadWriteStream): NodeJS.ReadWriteStream {
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

	const eventuallyRun = _debounce(() => run(), 500);

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
			f.stat = { isFile() { return true; } } as any;
		}
		f.stat.mode = /* 100755 */ 33261;
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

declare class FileSourceMap extends VinylFile {
	public sourceMap: sm.RawSourceMap;
}

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

			const contents = (<Buffer>f.contents).toString('utf8');

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
					sources: [f.relative],
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
			const contents = (<Buffer>f.contents).toString('utf8');
			f.contents = Buffer.from(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, ''), 'utf8');
			return f;
		}));

	return es.duplex(input, output);
}

export function rewriteSourceMappingURL(sourceMappingURLBase: string): NodeJS.ReadWriteStream {
	const input = es.through();

	const output = input
		.pipe(es.mapSync<VinylFile, VinylFile>(f => {
			const contents = (<Buffer>f.contents).toString('utf8');
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

export function getVersion(root: string): string | undefined {
	let version = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];

	if (!version || !/^[0-9a-f]{40}$/i.test(version.trim())) {
		version = git.getVersion(root);
	}

	return version;
}

export function rebase(count: number): NodeJS.ReadWriteStream {
	return rename(f => {
		const parts = f.dirname ? f.dirname.split(/[\/\\]/) : [];
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

export function versionStringToNumber(versionStr: string) {
	const semverRegex = /(\d+)\.(\d+)\.(\d+)/;
	const match = versionStr.match(semverRegex);
	if (!match) {
		throw new Error('Version string is not properly formatted: ' + versionStr);
	}

	return parseInt(match[1], 10) * 1e4 + parseInt(match[2], 10) * 1e2 + parseInt(match[3], 10);
}

export function streamToPromise(stream: NodeJS.ReadWriteStream): Promise<void> {
	return new Promise((c, e) => {
		stream.on('error', err => e(err));
		stream.on('end', () => c());
	});
}

export function getElectronVersion(): string {
	const yarnrc = fs.readFileSync(path.join(root, '.yarnrc'), 'utf8');
	const target = /^target "(.*)"$/m.exec(yarnrc)![1];
	return target;
}

export function acquireWebNodePaths() {
	const root = path.join(__dirname, '..', '..');
	const webPackageJSON = path.join(root, '/remote/web', 'package.json');
	const webPackages = JSON.parse(fs.readFileSync(webPackageJSON, 'utf8')).dependencies;
	const nodePaths: { [key: string]: string } = {};
	for (const key of Object.keys(webPackages)) {
		const packageJSON = path.join(root, 'node_modules', key, 'package.json');
		const packageData = JSON.parse(fs.readFileSync(packageJSON, 'utf8'));
		let entryPoint: string = packageData.browser ?? packageData.main;

		// On rare cases a package doesn't have an entrypoint so we assume it has a dist folder with a min.js
		if (!entryPoint) {
			// TODO @lramos15 remove this when jschardet adds an entrypoint so we can warn on all packages w/out entrypoint
			if (key !== 'jschardet') {
				console.warn(`No entry point for ${key} assuming dist/${key}.min.js`);
			}

			entryPoint = `dist/${key}.min.js`;
		}

		// Remove any starting path information so it's all relative info
		if (entryPoint.startsWith('./')) {
			entryPoint = entryPoint.substring(2);
		} else if (entryPoint.startsWith('/')) {
			entryPoint = entryPoint.substring(1);
		}

		// Search for a minified entrypoint as well
		if (/(?<!\.min)\.js$/i.test(entryPoint)) {
			const minEntryPoint = entryPoint.replace(/\.js$/i, '.min.js');

			if (fs.existsSync(path.join(root, 'node_modules', key, minEntryPoint))) {
				entryPoint = minEntryPoint;
			}
		}

		nodePaths[key] = entryPoint;
	}

	// @TODO lramos15 can we make this dynamic like the rest of the node paths
	// Add these paths as well for 1DS SDK dependencies.
	// Not sure why given the 1DS entrypoint then requires these modules
	// they are not fetched from the right location and instead are fetched from out/
	nodePaths['@microsoft/dynamicproto-js'] = 'lib/dist/umd/dynamicproto-js.min.js';
	nodePaths['@microsoft/applicationinsights-shims'] = 'dist/umd/applicationinsights-shims.min.js';
	nodePaths['@microsoft/applicationinsights-core-js'] = 'browser/applicationinsights-core-js.min.js';
	return nodePaths;
}

export function createExternalLoaderConfig(webEndpoint?: string, commit?: string, quality?: string) {
	if (!webEndpoint || !commit || !quality) {
		return undefined;
	}
	webEndpoint = webEndpoint + `/${quality}/${commit}`;
	const nodePaths = acquireWebNodePaths();
	Object.keys(nodePaths).map(function (key, _) {
		nodePaths[key] = `${webEndpoint}/node_modules/${key}/${nodePaths[key]}`;
	});
	const externalLoaderConfig = {
		baseUrl: `${webEndpoint}/out`,
		recordStats: true,
		paths: nodePaths
	};
	return externalLoaderConfig;
}

export function buildWebNodePaths(outDir: string) {
	const result = () => new Promise<void>((resolve, _) => {
		const root = path.join(__dirname, '..', '..');
		const nodePaths = acquireWebNodePaths();
		// Now we write the node paths to out/vs
		const outDirectory = path.join(root, outDir, 'vs');
		fs.mkdirSync(outDirectory, { recursive: true });
		const headerWithGeneratedFileWarning = `/*---------------------------------------------------------------------------------------------
	 *  Copyright (c) Microsoft Corporation. All rights reserved.
	 *  Licensed under the MIT License. See License.txt in the project root for license information.
	 *--------------------------------------------------------------------------------------------*/

	// This file is generated by build/npm/postinstall.js. Do not edit.`;
		const fileContents = `${headerWithGeneratedFileWarning}\nself.webPackagePaths = ${JSON.stringify(nodePaths, null, 2)};`;
		fs.writeFileSync(path.join(outDirectory, 'webPackagePaths.js'), fileContents, 'utf8');
		resolve();
	});
	result.taskName = 'build-web-node-paths';
	return result;
}

