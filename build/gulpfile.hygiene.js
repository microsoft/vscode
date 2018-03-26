/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const filter = require('gulp-filter');
const es = require('event-stream');
const gulptslint = require('gulp-tslint');
const gulpeslint = require('gulp-eslint');
const tsfmt = require('typescript-formatter');
const tslint = require('tslint');
const VinylFile = require('vinyl');
const vfs = require('vinyl-fs');
const path = require('path');
const fs = require('fs');
const pall = require('p-all');

/**
 * Hygiene works by creating cascading subsets of all our files and
 * passing them through a sequence of checks. Here are the current subsets,
 * named according to the checks performed on them. Each subset contains
 * the following one, as described in mathematical notation:
 *
 * all ⊃ eol ⊇ indentation ⊃ copyright ⊃ typescript
 */

const all = [
	'*',
	'build/**/*',
	'extensions/**/*',
	'scripts/**/*',
	'src/**/*',
	'test/**/*',
	'!**/node_modules/**'
];

const indentationFilter = [
	'**',

	// except specific files
	'!ThirdPartyNotices.txt',
	'!LICENSE.txt',
	'!src/vs/nls.js',
	'!src/vs/css.js',
	'!src/vs/loader.js',
	'!src/vs/base/common/marked/marked.js',
	'!src/vs/base/common/winjs.base.js',
	'!src/vs/base/node/terminateProcess.sh',
	'!src/vs/base/node/ps-win.ps1',
	'!test/assert.js',

	// except specific folders
	'!test/smoke/out/**',
	'!extensions/vscode-api-tests/testWorkspace/**',
	'!extensions/vscode-api-tests/testWorkspace2/**',
	'!build/monaco/**',
	'!build/win32/**',

	// except multiple specific files
	'!**/package.json',
	'!**/yarn.lock',

	// except multiple specific folders
	'!**/octicons/**',
	'!**/fixtures/**',
	'!**/lib/**',
	'!extensions/**/out/**',
	'!extensions/**/snippets/**',
	'!extensions/**/syntaxes/**',
	'!extensions/**/themes/**',
	'!extensions/**/colorize-fixtures/**',

	// except specific file types
	'!src/vs/*/**/*.d.ts',
	'!src/typings/**/*.d.ts',
	'!extensions/**/*.d.ts',
	'!**/*.{svg,exe,png,bmp,scpt,bat,cmd,cur,ttf,woff,eot,md,ps1,template,yaml,yml,d.ts.recipe}',
	'!build/{lib,tslintRules}/**/*.js',
	'!build/**/*.sh',
	'!build/tfs/**/*.js',
	'!**/Dockerfile',
	'!extensions/markdown-language-features/media/*.js'
];

const copyrightFilter = [
	'**',
	'!**/*.desktop',
	'!**/*.json',
	'!**/*.html',
	'!**/*.template',
	'!**/*.md',
	'!**/*.bat',
	'!**/*.cmd',
	'!**/*.xml',
	'!**/*.sh',
	'!**/*.txt',
	'!**/*.xpm',
	'!**/*.opts',
	'!**/*.disabled',
	'!**/*.code-workspace',
	'!build/**/*.init',
	'!resources/linux/snap/electron-launch',
	'!resources/linux/snap/snapcraft.yaml',
	'!resources/win32/bin/code.js',
	'!extensions/markdown-language-features/media/tomorrow.css',
	'!extensions/html-language-features/server/src/modes/typescript/*',
	'!extensions/*/server/bin/*'
];

const eslintFilter = [
	'src/**/*.js',
	'build/gulpfile.*.js',
	'!src/vs/loader.js',
	'!src/vs/css.js',
	'!src/vs/nls.js',
	'!src/vs/css.build.js',
	'!src/vs/nls.build.js',
	'!src/**/winjs.base.js',
	'!src/**/marked.js',
	'!**/test/**'
];

const tslintFilter = [
	'src/**/*.ts',
	'test/**/*.ts',
	'extensions/**/*.ts',
	'!**/fixtures/**',
	'!**/typings/**',
	'!**/node_modules/**',
	'!extensions/typescript/test/colorize-fixtures/**',
	'!extensions/vscode-api-tests/testWorkspace/**',
	'!extensions/vscode-api-tests/testWorkspace2/**',
	'!extensions/**/*.test.ts',
	'!extensions/html-language-features/server/lib/jquery.d.ts'
];

const copyrightHeaderLines = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/'
];

gulp.task('eslint', () => {
	return vfs.src(all, { base: '.', follow: true, allowEmpty: true })
		.pipe(filter(eslintFilter))
		.pipe(gulpeslint('src/.eslintrc'))
		.pipe(gulpeslint.formatEach('compact'))
		.pipe(gulpeslint.failAfterError());
});

gulp.task('tslint', () => {
	const options = { emitError: true };

	return vfs.src(all, { base: '.', follow: true, allowEmpty: true })
		.pipe(filter(tslintFilter))
		.pipe(gulptslint.default({ rulesDirectory: 'build/lib/tslint' }))
		.pipe(gulptslint.default.report(options));
});

function hygiene(some) {
	let errorCount = 0;

	const indentation = es.through(function (file) {
		const lines = file.contents.toString('utf8').split(/\r\n|\r|\n/);
		file.__lines = lines;

		lines
			.forEach((line, i) => {
				if (/^\s*$/.test(line)) {
					// empty or whitespace lines are OK
				} else if (/^[\t]*[^\s]/.test(line)) {
					// good indent
				} else if (/^[\t]* \*/.test(line)) {
					// block comment using an extra space
				} else {
					console.error(file.relative + '(' + (i + 1) + ',1): Bad whitespace indentation');
					errorCount++;
				}
			});

		this.emit('data', file);
	});

	const copyrights = es.through(function (file) {
		const lines = file.__lines;

		for (let i = 0; i < copyrightHeaderLines.length; i++) {
			if (lines[i] !== copyrightHeaderLines[i]) {
				console.error(file.relative + ': Missing or bad copyright statement');
				errorCount++;
				break;
			}
		}

		this.emit('data', file);
	});

	const formatting = es.map(function (file, cb) {
		tsfmt.processString(file.path, file.contents.toString('utf8'), {
			verify: false,
			tsfmt: true,
			// verbose: true
			// keep checkJS happy
			editorconfig: undefined,
			replace: undefined,
			tsconfig: undefined,
			tslint: undefined
		}).then(result => {
			let original = result.src.replace(/\r\n/gm, '\n');
			let formatted = result.dest.replace(/\r\n/gm, '\n');

			if (original !== formatted) {
				console.error('File not formatted:', file.relative);
				errorCount++;
			}
			cb(null, file);

		}, err => {
			cb(err);
		});
	});

	const tslintConfiguration = tslint.Configuration.findConfiguration('tslint.json', '.');
	const tslintOptions = { fix: false, formatter: 'json' };
	const tsLinter = new tslint.Linter(tslintOptions);

	const tsl = es.through(function (file) {
		const contents = file.contents.toString('utf8');
		tsLinter.lint(file.relative, contents, tslintConfiguration.results);
		this.emit('data', file);
	});

	let input;

	if (Array.isArray(some) || typeof some === 'string' || !some) {
		input = vfs.src(some || all, { base: '.', follow: true, allowEmpty: true });
	} else {
		input = some;
	}

	const result = input
		.pipe(filter(f => !f.stat.isDirectory()))
		.pipe(filter(indentationFilter))
		.pipe(indentation)
		.pipe(filter(copyrightFilter))
		.pipe(copyrights);

	const typescript = result
		.pipe(filter(tslintFilter))
		.pipe(formatting)
		.pipe(tsl);

	const javascript = result
		.pipe(filter(eslintFilter))
		.pipe(gulpeslint('src/.eslintrc'))
		.pipe(gulpeslint.formatEach('compact'))
		.pipe(gulpeslint.failAfterError());

	let count = 0;
	return es.merge(typescript, javascript)
		.pipe(es.through(function (data) {
			count++;
			if (process.env['TRAVIS'] && count % 10 === 0) {
				process.stdout.write('.');
			}
			this.emit('data', data);
		}, function () {
			process.stdout.write('\n');

			const tslintResult = tsLinter.getResult();
			if (tslintResult.failures.length > 0) {
				for (const failure of tslintResult.failures) {
					const name = failure.getFileName();
					const position = failure.getStartPosition();
					const line = position.getLineAndCharacter().line;
					const character = position.getLineAndCharacter().character;

					console.error(`${name}:${line + 1}:${character + 1}:${failure.getFailure()}`);
				}
				errorCount += tslintResult.failures.length;
			}

			if (errorCount > 0) {
				this.emit('error', 'Hygiene failed with ' + errorCount + ' errors. Check \'build/gulpfile.hygiene.js\'.');
			} else {
				this.emit('end');
			}
		}));
}

function createGitIndexVinyls(paths) {
	const cp = require('child_process');
	const repositoryPath = process.cwd();

	const fns = paths.map(relativePath => () => new Promise((c, e) => {
		const fullPath = path.join(repositoryPath, relativePath);

		fs.stat(fullPath, (err, stat) => {
			if (err && err.code === 'ENOENT') { // ignore deletions
				return c(null);
			} else if (err) {
				return e(err);
			}

			cp.exec(`git show :${relativePath}`, { maxBuffer: 2000 * 1024, encoding: 'buffer' }, (err, out) => {
				if (err) {
					return e(err);
				}

				c(new VinylFile({
					path: fullPath,
					base: repositoryPath,
					contents: out,
					stat
				}));
			});
		});
	}));

	return pall(fns, { concurrency: 4 })
		.then(r => r.filter(p => !!p));
}

gulp.task('hygiene', () => hygiene());

// this allows us to run hygiene as a git pre-commit hook
if (require.main === module) {
	const cp = require('child_process');

	process.on('unhandledRejection', (reason, p) => {
		console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
		process.exit(1);
	});

	if (process.argv.length > 2) {
		hygiene(process.argv.slice(2)).on('error', err => {
			console.error();
			console.error(err);
			process.exit(1);
		});
	} else {
		cp.exec('git diff --cached --name-only', { maxBuffer: 2000 * 1024 }, (err, out) => {
			if (err) {
				console.error();
				console.error(err);
				process.exit(1);
				return;
			}

			const some = out
				.split(/\r?\n/)
				.filter(l => !!l);

			if (some.length > 0) {
				console.log('Reading git index versions...');

				createGitIndexVinyls(some)
					.then(vinyls => new Promise((c, e) => hygiene(es.readArray(vinyls))
						.on('end', () => c())
						.on('error', e)))
					.catch(err => {
						console.error();
						console.error(err);
						process.exit(1);
					});
			}
		});
	}
}
