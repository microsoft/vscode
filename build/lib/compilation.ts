/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as gulp from 'gulp';
import * as tsb from 'gulp-tsb';
import * as es from 'event-stream';
const watch = require('./watch');
import * as nls from './nls';
import * as util from './util';
import { createReporter } from './reporter';
import * as path from 'path';
import * as bom from 'gulp-bom';
import * as sourcemaps from 'gulp-sourcemaps';
import * as _ from 'underscore';
import * as monacodts from '../monaco/api';
import * as fs from 'fs';

const reporter = createReporter();

const rootDir = path.join(__dirname, '../../src');
const options = require('../../src/tsconfig.json').compilerOptions;
options.verbose = false;
options.sourceMap = true;
options.rootDir = rootDir;
options.sourceRoot = util.toFileUri(rootDir);

function createCompile(build: boolean, emitError?: boolean): (token?: util.ICancellationToken) => NodeJS.ReadWriteStream {
	const opts = _.clone(options);
	opts.inlineSources = !!build;
	opts.noFilesystemLookup = true;

	const ts = tsb.create(opts, null, null, err => reporter(err.toString()));

	return function (token?: util.ICancellationToken) {

		const utf8Filter = util.filter(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
		const tsFilter = util.filter(data => /\.ts$/.test(data.path));
		const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));

		const input = es.through();
		const output = input
			.pipe(utf8Filter)
			.pipe(bom())
			.pipe(utf8Filter.restore)
			.pipe(tsFilter)
			.pipe(util.loadSourcemaps())
			.pipe(ts(token))
			.pipe(build ? reloadTypeScriptNodeModule() : es.through())
			.pipe(noDeclarationsFilter)
			.pipe(build ? nls() : es.through())
			.pipe(noDeclarationsFilter.restore)
			.pipe(sourcemaps.write('.', {
				addComment: false,
				includeContent: !!build,
				sourceRoot: options.sourceRoot
			}))
			.pipe(tsFilter.restore)
			.pipe(reporter.end(emitError));

		return es.duplex(input, output);
	};
}

export function compileTask(out: string, build: boolean): () => NodeJS.ReadWriteStream {

	return function () {
		const compile = createCompile(build, true);

		const src = es.merge(
			gulp.src('src/**', { base: 'src' }),
			gulp.src('node_modules/typescript/lib/lib.d.ts'),
			gulp.src('node_modules/@types/**/index.d.ts')
		);

		return src
			.pipe(compile())
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, false));
	};
}

export function watchTask(out: string, build: boolean): () => NodeJS.ReadWriteStream {

	return function () {
		const compile = createCompile(build);

		const src = es.merge(
			gulp.src('src/**', { base: 'src' }),
			gulp.src('node_modules/typescript/lib/lib.d.ts'),
			gulp.src('node_modules/@types/**/index.d.ts')
		);
		const watchSrc = watch('src/**', { base: 'src' });

		return watchSrc
			.pipe(util.incremental(compile, src, true))
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, true));
	};
}

function reloadTypeScriptNodeModule(): NodeJS.ReadWriteStream {
	var util = require('gulp-util');
	function log(message: any, ...rest: any[]): void {
		util.log(util.colors.cyan('[memory watch dog]'), message, ...rest);
	}

	function heapUsed(): string {
		return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB';
	}

	return es.through(function (data) {
		this.emit('data', data);
	}, function () {

		log('memory usage after compilation finished: ' + heapUsed());

		// It appears we are running into some variant of
		// https://bugs.chromium.org/p/v8/issues/detail?id=2073
		//
		// Even though all references are dropped, some
		// optimized methods in the TS compiler end up holding references
		// to the entire TypeScript language host (>600MB)
		//
		// The idea is to force v8 to drop references to these
		// optimized methods, by "reloading" the typescript node module

		log('Reloading typescript node module...');

		var resolvedName = require.resolve('typescript');

		var originalModule = require.cache[resolvedName];
		delete require.cache[resolvedName];
		var newExports = require('typescript');
		require.cache[resolvedName] = originalModule;

		for (var prop in newExports) {
			if (newExports.hasOwnProperty(prop)) {
				originalModule.exports[prop] = newExports[prop];
			}
		}

		log('typescript node module reloaded.');

		this.emit('end');
	});
}

function monacodtsTask(out: string, isWatch: boolean): NodeJS.ReadWriteStream {

	const neededFiles: { [file: string]: boolean; } = {};
	monacodts.getFilesToWatch(out).forEach(function (filePath) {
		filePath = path.normalize(filePath);
		neededFiles[filePath] = true;
	});

	const inputFiles: { [file: string]: string; } = {};
	for (let filePath in neededFiles) {
		if (/\bsrc(\/|\\)vs\b/.test(filePath)) {
			// This file is needed from source => simply read it now
			inputFiles[filePath] = fs.readFileSync(filePath).toString();
		}
	}

	const setInputFile = (filePath: string, contents: string) => {
		if (inputFiles[filePath] === contents) {
			// no change
			return;
		}
		inputFiles[filePath] = contents;
		const neededInputFilesCount = Object.keys(neededFiles).length;
		const availableInputFilesCount = Object.keys(inputFiles).length;
		if (neededInputFilesCount === availableInputFilesCount) {
			run();
		}
	};

	const run = () => {
		const result = monacodts.run(out, inputFiles);
		if (!result.isTheSame) {
			if (isWatch) {
				fs.writeFileSync(result.filePath, result.content);
			} else {
				resultStream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
			}
		}
	};

	let resultStream: NodeJS.ReadWriteStream;

	if (isWatch) {
		watch('build/monaco/*').pipe(es.through(function () {
			run();
		}));
	}

	resultStream = es.through(function (data) {
		const filePath = path.normalize(data.path);
		if (neededFiles[filePath]) {
			setInputFile(filePath, data.contents.toString());
		}
		this.emit('data', data);
	});

	return resultStream;
}
