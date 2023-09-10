/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

//@ts-check

const es = require('event-stream');
const gulp = require('gulp');
const path = require('path');
const fancyLog = require('fancy-log');
const ansiColors = require('ansi-colors');
const cp = require('child_process');
const { tmpdir } = require('os');
const { promises: fs, existsSync, mkdirSync, rmSync } = require('fs');

const task = require('./lib/task');
const watcher = require('./lib/watch');
const { debounce } = require('./lib/util');
const createReporter = require('./lib/reporter').createReporter;

const root = 'cli';
const rootAbs = path.resolve(__dirname, '..', root);
const src = `${root}/src`;
const targetCliPath = path.join(root, 'target', 'debug', process.platform === 'win32' ? 'code.exe' : 'code');

const platformOpensslDirName =
	process.platform === 'win32' ? (
		process.arch === 'arm64'
			? 'arm64-windows-static-md'
			: process.arch === 'ia32'
				? 'x86-windows-static-md'
				: 'x64-windows-static-md')
		: process.platform === 'darwin' ? (
			process.arch === 'arm64'
				? 'arm64-osx'
				: 'x64-osx')
			: (process.arch === 'arm64'
				? 'arm64-linux'
				: process.arch === 'arm'
					? 'arm-linux'
					: 'x64-linux');
const platformOpensslDir = path.join(rootAbs, 'openssl', 'package', 'out', platformOpensslDirName);

const hasLocalRust = (() => {
	/** @type boolean | undefined */
	let result = undefined;
	return () => {
		if (result !== undefined) {
			return result;
		}

		try {
			const r = cp.spawnSync('cargo', ['--version']);
			result = r.status === 0;
		} catch (e) {
			result = false;
		}

		return result;
	};
})();

const debounceEsStream = (fn, duration = 100) => {
	let handle = undefined;
	let pending = [];
	const sendAll = (pending) => (event, ...args) => {
		for (const stream of pending) {
			pending.emit(event, ...args);
		}
	};

	return es.map(function (_, callback) {
		console.log('defer');
		if (handle !== undefined) {
			clearTimeout(handle);
		}

		handle = setTimeout(() => {
			handle = undefined;

			const previous = pending;
			pending = [];
			fn()
				.on('error', sendAll('error'))
				.on('data', sendAll('data'))
				.on('end', sendAll('end'));
		}, duration);

		pending.push(this);
	});
};

const compileFromSources = (callback) => {
	const proc = cp.spawn('cargo', ['--color', 'always', 'build'], {
		cwd: root,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: existsSync(platformOpensslDir) ? { OPENSSL_DIR: platformOpensslDir, ...process.env } : process.env
	});

	/** @type Buffer[] */
	const stdoutErr = [];
	proc.stdout.on('data', d => stdoutErr.push(d));
	proc.stderr.on('data', d => stdoutErr.push(d));
	proc.on('error', callback);
	proc.on('exit', code => {
		if (code !== 0) {
			callback(Buffer.concat(stdoutErr).toString());
		} else {
			callback();
		}
	});
};

const acquireBuiltOpenSSL = (callback) => {
	const untar = require('gulp-untar');
	const gunzip = require('gulp-gunzip');
	const dir = path.join(tmpdir(), 'vscode-openssl-download');
	mkdirSync(dir, { recursive: true });

	cp.spawnSync(
		process.platform === 'win32' ? 'npm.cmd' : 'npm',
		['pack', '@vscode/openssl-prebuilt'],
		{ stdio: ['ignore', 'ignore', 'inherit'], cwd: dir }
	);

	gulp.src('*.tgz', { cwd: dir })
		.pipe(gunzip())
		.pipe(untar())
		.pipe(gulp.dest(`${root}/openssl`))
		.on('error', callback)
		.on('end', () => {
			rmSync(dir, { recursive: true, force: true });
			callback();
		});
};

const compileWithOpenSSLCheck = (/** @type import('./lib/reporter').IReporter */ reporter) => es.map((_, callback) => {
	compileFromSources(err => {
		if (!err) {
			// no-op
		} else if (err.toString().includes('Could not find directory of OpenSSL installation') && !existsSync(platformOpensslDir)) {
			fancyLog(ansiColors.yellow(`[cli]`), 'OpenSSL libraries not found, acquiring prebuilt bits...');
			acquireBuiltOpenSSL(err => {
				if (err) {
					callback(err);
				} else {
					compileFromSources(err => {
						if (err) {
							reporter(err.toString());
						}
						callback(null, '');
					});
				}
			});
		} else {
			reporter(err.toString());
		}

		callback(null, '');
	});
});

const warnIfRustNotInstalled = () => {
	if (!hasLocalRust()) {
		fancyLog(ansiColors.yellow(`[cli]`), 'No local Rust install detected, compilation may fail.');
		fancyLog(ansiColors.yellow(`[cli]`), 'Get rust from: https://rustup.rs/');
	}
};

const compileCliTask = task.define('compile-cli', () => {
	warnIfRustNotInstalled();
	const reporter = createReporter('cli');
	return gulp.src(`${root}/Cargo.toml`)
		.pipe(compileWithOpenSSLCheck(reporter))
		.pipe(reporter.end(true));
});


const watchCliTask = task.define('watch-cli', () => {
	warnIfRustNotInstalled();
	return watcher(`${src}/**`, { read: false })
		.pipe(debounce(compileCliTask));
});

gulp.task(compileCliTask);
gulp.task(watchCliTask);
