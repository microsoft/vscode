/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const es = require('event-stream');
const debounce = require('debounce');
const filter = require('gulp-filter');
const rename = require('gulp-rename');
const _ = require('underscore');
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const git = require('./git');

const NoCancellationToken = { isCancellationRequested: () => false };

exports.incremental = (streamProvider, initial, supportsCancellation) => {
	const input = es.through();
	const output = es.through();
	let state = 'idle';
	let buffer = Object.create(null);

	const token = !supportsCancellation ? null : { isCancellationRequested: () => Object.keys(buffer).length > 0 };

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

	input.on('data', f => {
		buffer[f.path] = f;

		if (state === 'idle') {
			eventuallyRun();
		}
	});

	return es.duplex(input, output);
};

exports.fixWin32DirectoryPermissions = () => {
	if (!/win32/.test(process.platform)) {
		return es.through();
	}

	return es.mapSync(f => {
		if (f.stat && f.stat.isDirectory && f.stat.isDirectory()) {
			f.stat.mode = 16877;
		}

		return f;
	});
};

exports.setExecutableBit = pattern => {
	var setBit = es.mapSync(f => {
		f.stat.mode = /* 100755 */ 33261;
		return f;
	});

	if (!pattern) {
		return setBit;
	}

	var input = es.through();
	var _filter = filter(pattern, { restore: true });
	var output = input
		.pipe(_filter)
		.pipe(setBit)
		.pipe(_filter.restore);

	return es.duplex(input, output);
};

exports.toFileUri = filePath => {
	const match = filePath.match(/^([a-z])\:(.*)$/i);

	if (match) {
		filePath = '/' + match[1].toUpperCase() + ':' + match[2];
	}

	return 'file://' + filePath.replace(/\\/g, '/');
};

exports.skipDirectories = () => {
	return es.mapSync(f => {
		if (!f.isDirectory()) {
			return f;
		}
	});
};

exports.cleanNodeModule = (name, excludes, includes) => {
	const glob = path => '**/node_modules/' + name + (path ? '/' + path : '');
	const negate = str => '!' + str;

	const allFilter = filter(glob('**'), { restore: true });
	const globs = [glob('**')].concat(excludes.map(_.compose(negate, glob)));

	const input = es.through();
	const nodeModuleInput = input.pipe(allFilter);
	let output = nodeModuleInput.pipe(filter(globs));

	if (includes) {
		const includeGlobs = includes.map(glob);
		output = es.merge(output, nodeModuleInput.pipe(filter(includeGlobs)));
	}

	output = output.pipe(allFilter.restore);
	return es.duplex(input, output);
};

exports.loadSourcemaps = () => {
	const input = es.through();

	const output = input
		.pipe(es.map((f, cb) => {
			if (f.sourceMap) {
				return cb(null, f);
			}

			if (!f.contents) {
				return cb(new Error('empty file'));
			}

			const contents = f.contents.toString('utf8');

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

				return cb(null, f);
			}

			f.contents = new Buffer(contents.replace(/\/\/# sourceMappingURL=(.*)$/g, ''), 'utf8');

			fs.readFile(path.join(path.dirname(f.path), lastMatch[1]), 'utf8', (err, contents) => {
				if (err) { return cb(err); }

				f.sourceMap = JSON.parse(contents);
				cb(null, f);
			});
		}));

	return es.duplex(input, output);
};

exports.stripSourceMappingURL = () => {
	const input = es.through();

	const output = input
		.pipe(es.mapSync(f => {
			const contents = f.contents.toString('utf8');
			f.contents = new Buffer(contents.replace(/\n\/\/# sourceMappingURL=(.*)$/gm, ''), 'utf8');
			return f;
		}));

	return es.duplex(input, output);
};

exports.rimraf = dir => {
	let retries = 0;

	const retry = cb => {
		rimraf(dir, { maxBusyTries: 1 }, err => {
			if (!err) return cb();
			if (err.code === 'ENOTEMPTY' && ++retries < 5) return setTimeout(() => retry(cb), 10);
			else return cb(err);
		});
	};

	return cb => retry(cb);
};

exports.getVersion = root => {
	let version = process.env['BUILD_SOURCEVERSION'];

	if (!version || !/^[0-9a-f]{40}$/i.test(version)) {
		version = git.getVersion(root);
	}

	return version;
};

exports.rebase = count => {
	return rename(f => {
		const parts = f.dirname.split(/[\/\\]/);
		f.dirname = parts.slice(count).join(path.sep);
	});
};

exports.filter = fn => {
	const result = es.through(function (data) {
		if (fn(data)) {
			this.emit('data', data);
		} else {
			result.restore.push(data);
		}
	});

	result.restore = es.through();
	return result;
};