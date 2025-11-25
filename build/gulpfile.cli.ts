/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import gulp from 'gulp';
import * as path from 'path';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';
import * as cp from 'child_process';
import { tmpdir } from 'os';
import { existsSync, mkdirSync, rmSync } from 'fs';
import * as task from './lib/task.ts';
import watcher from './lib/watch/index.ts';
import { debounce } from './lib/util.ts';
import { createReporter } from './lib/reporter.ts';
import untar from 'gulp-untar';
import gunzip from 'gulp-gunzip';

const root = 'cli';
const rootAbs = path.resolve(import.meta.dirname, '..', root);
const src = `${root}/src`;

const platformOpensslDirName =
	process.platform === 'win32' ? (
		process.arch === 'arm64'
			? 'arm64-windows-static-md'
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
	let result: boolean | undefined = undefined;
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

const compileFromSources = (callback: (err?: string) => void) => {
	const proc = cp.spawn('cargo', ['--color', 'always', 'build'], {
		cwd: root,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: existsSync(platformOpensslDir) ? { OPENSSL_DIR: platformOpensslDir, ...process.env } : process.env
	});

	const stdoutErr: Buffer[] = [];
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

const acquireBuiltOpenSSL = (callback: (err?: unknown) => void) => {
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

const compileWithOpenSSLCheck = (reporter: import('./lib/reporter.ts').IReporter) => es.map((_, callback) => {
	compileFromSources(err => {
		if (!err) {
			// no-op
		} else if (err.toString().includes('Could not find directory of OpenSSL installation') && !existsSync(platformOpensslDir)) {
			fancyLog(ansiColors.yellow(`[cli]`), 'OpenSSL libraries not found, acquiring prebuilt bits...');
			acquireBuiltOpenSSL(err => {
				if (err) {
					callback(err as Error);
				} else {
					compileFromSources(err => {
						if (err) {
							reporter(err.toString());
						}
						callback(undefined, '');
					});
				}
			});
		} else {
			reporter(err.toString());
		}
		callback(undefined, '');
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
		.pipe(debounce(compileCliTask as task.StreamTask));
});

gulp.task(compileCliTask);
gulp.task(watchCliTask);
