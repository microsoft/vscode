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
	const compile = createCompile(build, true);

	return function () {
		const src = es.merge(
			gulp.src('src/**', { base: 'src' }),
			gulp.src('node_modules/typescript/lib/lib.d.ts')
		);

		return src
			.pipe(compile())
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, false));
	};
}

export function watchTask(out: string, build: boolean): () => NodeJS.ReadWriteStream {
	const compile = createCompile(build);

	return function () {
		const src = es.merge(
			gulp.src('src/**', { base: 'src' }),
			gulp.src('node_modules/typescript/lib/lib.d.ts')
		);
		const watchSrc = watch('src/**', { base: 'src' });

		return watchSrc
			.pipe(util.incremental(compile, src, true))
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, true));
	};
}

function monacodtsTask(out: string, isWatch: boolean): NodeJS.ReadWriteStream {
	let timer: NodeJS.Timer = null;

	const runSoon = function (howSoon: number) {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		timer = setTimeout(function () {
			timer = null;
			runNow();
		}, howSoon);
	};

	const runNow = function () {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		// if (reporter.hasErrors()) {
		// 	monacodts.complainErrors();
		// 	return;
		// }
		const result = monacodts.run(out);
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

		const filesToWatchMap: { [file: string]: boolean; } = {};
		monacodts.getFilesToWatch(out).forEach(function (filePath) {
			filesToWatchMap[path.normalize(filePath)] = true;
		});

		watch('build/monaco/*').pipe(es.through(function () {
			runSoon(5000);
		}));

		resultStream = es.through(function (data) {
			const filePath = path.normalize(data.path);
			if (filesToWatchMap[filePath]) {
				runSoon(5000);
			}
			this.emit('data', data);
		});

	} else {

		resultStream = es.through(null, function () {
			runNow();
			this.emit('end');
		});

	}

	return resultStream;
}
