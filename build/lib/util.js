/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var es = require('event-stream');
var debounce = require('debounce');
var filter = require('gulp-filter');
var azure = require('gulp-azure-storage');
var rename = require('gulp-rename');
var vzip = require('gulp-vinyl-zip');
var util = require('gulp-util');
var _ = require('underscore');
var path = require('path');
var fs = require('fs');
var rimraf = require('rimraf');
var git = require('./git');

var NoCancellationToken = {
	isCancellationRequested: function () {
		return false;
	}
};

exports.incremental = function (streamProvider, initial, supportsCancellation) {
	var state = 'idle';
	var input = es.through();
	var output = es.through();
	var buffer = Object.create(null);

	var token = !supportsCancellation ? null : {
		isCancellationRequested: function () {
			// console.log('isCancellationRequested', Object.keys(buffer).length, new Date());
			return Object.keys(buffer).length > 0;
		}
	};

	var run = function (input, isCancellable) {
		state = 'running';

		var stream = !supportsCancellation ? streamProvider() : streamProvider(isCancellable ? token : NoCancellationToken);

		input
			.pipe(stream)
			.pipe(es.through(null, function () {
				state = 'idle';
				eventuallyRun();
			}))
			.pipe(output);
	};

	if (initial) {
		run(initial, false);
	}

	var eventuallyRun = debounce(function () {
		var paths = Object.keys(buffer);

		if (paths.length === 0) {
			return;
		}

		var data = paths.map(function (path) {
			return buffer[path];
		});

		buffer = Object.create(null);
		run(es.readArray(data), true);
	}, 500);

	input.on('data', function (f) {
		buffer[f.path] = f;

		if (state === 'idle') {
			eventuallyRun();
		}
	});

	return es.duplex(input, output);
};

exports.fixWin32DirectoryPermissions = function () {
	if (!/win32/.test(process.platform)) {
		return es.through();
	}

	return es.mapSync(function (f) {
		if (f.stat && f.stat.isDirectory && f.stat.isDirectory()) {
			f.stat.mode = 16877;
		}

		return f;
	});
};

exports.setExecutableBit = function (pattern) {
	var setBit = es.mapSync(function (f) {
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

exports.handleAzureJson = function (env) {
	var input = es.through();
	var azureJsonFilter = filter('**/*.azure.json', { restore: true });

	var allOpts = [];
	var result = es.through();

	var output = input
		.pipe(azureJsonFilter)
		.pipe(es.through(function (f) {
			util.log('Downloading binaries from Azure:', util.colors.yellow(f.relative), '...');
			var opts = JSON.parse(f.contents.toString());
			opts.prefix = _.template(opts.zip || opts.prefix)(env);
			opts.output = path.join(path.dirname(f.relative), opts.output);
			allOpts.push(opts);
		}, function () {
			var streams = allOpts.map(function (opts) {
				var result = azure.download(_.extend(opts, { buffer: true, quiet: true }));

				if (opts.zip) {
					result = result.pipe(vzip.src());
				}

				return result.pipe(rename(function (p) {
					p.dirname = path.join(opts.output, p.dirname);
				}));
			});

			es.merge(streams)
				.pipe(result)
				.pipe(es.through(null, function() {
					util.log('Finished downloading from Azure');
					this.emit('end');
				}));
			this.emit('end');
		}))
		.pipe(azureJsonFilter.restore);

	return es.duplex(input, es.merge(output, result));
};

exports.toFileUri = function (filePath) {
	var match = filePath.match(/^([a-z])\:(.*)$/i);

	if (match) {
		filePath = '/' + match[1].toUpperCase() + ':' + match[2];
	}

	return 'file://' + filePath.replace(/\\/g, '/');
};

exports.rebase = function (base, append) {
	return es.mapSync(function (f) {
		if (append) {
			f.base = path.join(f.base, base);
		} else {
			f.base = base;
		}
		return f;
	});
};

exports.skipDirectories = function () {
	return es.mapSync(function (f) {
		if (!f.isDirectory()) {
			return f;
		}
	});
};

exports.cleanNodeModule = function (name, excludes, isNative) {
	var glob = function (path) { return '**/node_modules/' + name + (path ? '/' + path : ''); };
	var negate = function (str) { return '!' + str; };

	var allFilter = filter(glob('**'), { restore: true });
	var globs = [glob('**')].concat(excludes.map(_.compose(negate, glob)));

	var input = es.through();
	var nodeModuleInput = input.pipe(allFilter);
	var output = nodeModuleInput.pipe(filter(globs));

	if (isNative) {
		output = es.merge(output, nodeModuleInput.pipe(filter(glob('**/*.node'))));
	}

	output = output.pipe(allFilter.restore);
	return es.duplex(input, output);
};

exports.loadSourcemaps = function () {
	var input = es.through();

	var output = input
		.pipe(es.map(function (f, cb) {
			if (f.sourceMap) {
				return cb(null, f);
			}

			if (!f.contents) {
				return cb(new Error('empty file'));
			}

			var contents = f.contents.toString('utf8');

			var reg = /\/\/# sourceMappingURL=(.*)$/g;
			var lastMatch = null;
			var match = null;

			while (match = reg.exec(contents)) {
				lastMatch = match;
			}

			if (!lastMatch) {
				f.sourceMap = {
					version : 3,
					names: [],
					mappings: '',
					sources: [f.relative.replace(/\//g, '/')],
					sourcesContent: [contents]
				};

				return cb(null, f);
			}

			f.contents = new Buffer(contents.replace(/\/\/# sourceMappingURL=(.*)$/g, ''), 'utf8');

			fs.readFile(path.join(path.dirname(f.path), lastMatch[1]), 'utf8', function (err, contents) {
				if (err) { return cb(err); }

				f.sourceMap = JSON.parse(contents);
				cb(null, f);
			});
		}));

	return es.duplex(input, output);
};

exports.rimraf = function(dir) {
	return function (cb) {
		rimraf(dir, {
			maxBusyTries: 1
		}, cb);
	};
};

exports.getVersion = function (root) {
	var version = process.env['BUILD_SOURCEVERSION'];

	if (!version || !/^[0-9a-f]{40}$/i.test(version)) {
		version = git.getVersion(root);
	}

	return version;
};

exports.rebase = function (count) {
	return rename(function (f) {
		var parts = f.dirname.split(/[\/\\]/);
		f.dirname = parts.slice(count).join(path.sep);
	});
};