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

const task = require('./lib/task');
const watcher = require('./lib/watch');
const { debounce } = require('./lib/util');
const createReporter = require('./lib/reporter').createReporter;
const { promises: fs, existsSync } = require('fs');

const root = 'cli';
const src = `${root}/src`;
const targetCliPath = path.join(root, 'target', 'debug', process.platform === 'win32' ? 'code.exe' : 'code');

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

const compileFromSources = (/** @type import('./lib/reporter').IReporter */ reporter) => es.map((_, callback) => {
	const proc = cp.spawn('cargo', ['--color', 'always', 'build'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
	/** @type Buffer[] */
	const stdoutErr = [];
	proc.stdout.on('data', d => stdoutErr.push(d));
	proc.stderr.on('data', d => stdoutErr.push(d));
	proc.on('error', callback);
	proc.on('exit', code => {
		if (code !== 0) {
			reporter(Buffer.concat(stdoutErr).toString());
		}
		callback(null, '');
	});
});

const compile = () => {
};

const downloadCli = task.define('download-insiders-cli', async () => {
	const vscodeTest = require('@vscode/test-electron');

	const platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
	let tmpPath = await vscodeTest.download({
		cachePath: path.resolve(__dirname, '..', '.build', '.vscode-test'),
		version: 'insiders',
		platform: `cli-${platform}-${process.arch}`,
	});

	if (process.platform === 'win32' && !tmpPath.endsWith('.exe')) {
		tmpPath += '.exe';
	}

	await fs.mkdir(path.dirname(targetCliPath), { recursive: true });
	await fs.copyFile(tmpPath, targetCliPath);
	await fs.chmod(targetCliPath, 0o755);
});

const compileCliTask = task.define('compile-cli', () => {
	if (!hasLocalRust()) {
		if (existsSync(targetCliPath)) {
			fancyLog(ansiColors.green(`[cli]`), 'No local Rust install detected, skipping CLI compilation');
			return Promise.resolve();
		} else {
			fancyLog(ansiColors.green(`[cli]`), 'No local Rust install detected, downloading from CDN');
			return downloadCli();
		}
	}

	const reporter = createReporter('cli');
	return gulp.src(`${root}/Cargo.toml`)
		.pipe(compileFromSources(reporter))
		.pipe(reporter.end(true));
});


const watchCliTask = task.define('watch-cli', () => {
	if (!hasLocalRust()) {
		fancyLog(ansiColors.yellow(`[cli]`), 'No local Rust install detected, skipping watch-cli');
		if (!existsSync(targetCliPath)) {
			fancyLog(ansiColors.green(`[cli]`), 'Downloading initial CLI build from CDN');
			return downloadCli();
		}

		return Promise.resolve();
	}

	return watcher(`${src}/**`, { read: false })
		.pipe(debounce(compileCliTask));
});

gulp.task(downloadCli);
gulp.task(compileCliTask);
gulp.task(watchCliTask);
