/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
<<<<<<< HEAD
const gulp = require('gulp'),
	  filter = require('gulp-filter'),
	  es = require('event-stream'),
	  gulptslint = require('gulp-tslint'),
	  tslint = require('tslint'),
	  all = [
=======

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
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
	'*',
	'build/**/*',
	'extensions/**/*',
	'scripts/**/*',
	'src/**/*',
<<<<<<< HEAD
	'test/**/*'
],eolFilter = [
=======
	'test/**/*',
	'!**/node_modules/**'
];

const indentationFilter = [
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
	'**',

	// except specific files
	'!ThirdPartyNotices.txt',
	'!LICENSE.txt',
	'!src/vs/nls.js',
	'!src/vs/nls.build.js',
	'!src/vs/css.js',
	'!src/vs/css.build.js',
	'!src/vs/loader.js',
	'!src/vs/base/common/marked/marked.js',
	'!src/vs/base/common/winjs.base.js',
	'!src/vs/base/node/terminateProcess.sh',
	'!src/vs/base/node/cpuUsage.sh',
	'!test/assert.js',

	// except specific folders
	'!test/smoke/out/**',
	'!extensions/vscode-api-tests/testWorkspace/**',
	'!extensions/vscode-api-tests/testWorkspace2/**',
	'!build/monaco/**',
<<<<<<< HEAD
	'!build/win32/**'
],indentationFilter = [
	'**',
	'!ThirdPartyNotices.txt',
	'!**/*.md',
	'!**/*.template',
	'!**/*.yml',
	'!**/lib/**',
	'!**/*.d.ts',
	'!**/*.d.ts.recipe',
	'!extensions/typescript/server/**',
	'!test/assert.js',
=======
	'!build/win32/**',

	// except multiple specific files
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
	'!**/package.json',
	'!**/yarn.lock',
	'!**/yarn-error.log',

	// except multiple specific folders
	'!**/octicons/**',
	'!**/fixtures/**',
	'!**/lib/**',
	'!extensions/**/out/**',
	'!extensions/**/snippets/**',
	'!extensions/**/syntaxes/**',
	'!extensions/**/themes/**',
	'!extensions/**/colorize-fixtures/**',
<<<<<<< HEAD
	'!extensions/vscode-api-tests/testWorkspace/**'
],copyrightFilter = [
=======

	// except specific file types
	'!src/vs/*/**/*.d.ts',
	'!src/typings/**/*.d.ts',
	'!extensions/**/*.d.ts',
	'!**/*.{svg,exe,png,bmp,scpt,bat,cmd,cur,ttf,woff,eot,md,ps1,template,yaml,yml,d.ts.recipe,ico,icns}',
	'!build/{lib,tslintRules}/**/*.js',
	'!build/**/*.sh',
	'!build/tfs/**/*.js',
	'!build/tfs/**/*.config',
	'!**/Dockerfile',
	'!extensions/markdown-language-features/media/*.js'
];

const copyrightFilter = [
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
	'**',
	'!**/*.desktop',
	'!**/*.json',
	'!**/*.html',
	'!**/*.template',
	'!**/*.md',
	'!**/*.bat',
	'!**/*.cmd',
	'!**/*.ico',
	'!**/*.icns',
	'!**/*.xml',
	'!**/*.sh',
	'!**/*.txt',
	'!**/*.xpm',
<<<<<<< HEAD
	'!extensions/markdown/media/tomorrow.css'
],tslintFilter = [
=======
	'!**/*.opts',
	'!**/*.disabled',
	'!**/*.code-workspace',
	'!build/**/*.init',
	'!resources/linux/snap/snapcraft.yaml',
	'!resources/linux/snap/electron-launch',
	'!resources/win32/bin/code.js',
	'!extensions/markdown-language-features/media/highlight.css',
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
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
	'src/**/*.ts',
	'test/**/*.ts',
	'extensions/**/*.ts',
	'!**/fixtures/**',
	'!**/typings/**',
<<<<<<< HEAD
	'!src/vs/base/**/*.test.ts',
	'!src/vs/languages/**/*.test.ts',
	'!src/vs/workbench/**/*.test.ts',
	'!extensions/**/*.test.ts'
],copyrightHeader = [
=======
	'!**/node_modules/**',
	'!extensions/typescript/test/colorize-fixtures/**',
	'!extensions/vscode-api-tests/testWorkspace/**',
	'!extensions/vscode-api-tests/testWorkspace2/**',
	'!extensions/**/*.test.ts',
	'!extensions/html-language-features/server/lib/jquery.d.ts'
];

const copyrightHeaderLines = [
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/'
<<<<<<< HEAD
].join('\n');
function reportFailures(failures) {
	failures.forEach(failure => {
		const name = failure.name || failure.fileName;
		const position = failure.startPosition;
		const line = position.lineAndCharacter ? position.lineAndCharacter.line : position.line;
		const character = position.lineAndCharacter ? position.lineAndCharacter.character : position.character;
		console.error(`${ name }:${ line + 1}:${ character + 1 }:${ failure.failure }`);
	});
}
gulp.task('tslint', () => {
	const options = { summarizeFailureOutput: true };
	return gulp.src(all, { base: '.' })
=======
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
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
		.pipe(filter(tslintFilter))
		.pipe(gulptslint.default({ rulesDirectory: 'build/lib/tslint' }))
		.pipe(gulptslint.default.report(options));
});

function hygiene(some) {
	let errorCount = 0;
<<<<<<< HEAD
	const eol = es.through(function (file) {
		if (/\r\n?/g.test(file.contents.toString('utf8'))) {
			console.error(file.relative + ': Bad EOL found');
			errorCount++;
		}
		this.emit('data', file);
	});
=======

>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
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
<<<<<<< HEAD
	const tsl = es.through(function(file) {
		const configuration = tslint.findConfiguration(null, '.');
		const options = { configuration, formatter: 'json', rulesDirectory: 'build/lib/tslint' };
		const contents = file.contents.toString('utf8');
		const linter = new tslint(file.relative, contents, options);
		const result = linter.lint();
		if (result.failureCount > 0) {
			reportFailures(result.failures);
			errorCount += result.failureCount;
		};		this.emit('data', file);
	});
	return gulp.src(some || all, { base: '.' })
=======

	const formatting = es.map(function (file, cb) {
		tsfmt.processString(file.path, file.contents.toString('utf8'), {
			verify: false,
			tsfmt: true,
			// verbose: true,
			// keep checkJS happy
			editorconfig: undefined,
			replace: undefined,
			tsconfig: undefined,
			tsconfigFile: undefined,
			tslint: undefined,
			tslintFile: undefined,
			tsfmtFile: undefined,
			vscode: undefined,
			vscodeFile: undefined
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
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
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
<<<<<<< HEAD
};
=======
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

>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
gulp.task('hygiene', () => hygiene());
// this allows us to run hygiene as a git pre-commit hook
if (require.main === module) {
	const cp = require('child_process');
<<<<<<< HEAD
	cp.exec('git config core.autocrlf', (err, out) => {
		const skipEOL = out.trim() === 'true';
=======

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
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
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
<<<<<<< HEAD
			hygiene(some, { skipEOL: skipEOL }).on('error', err => {
				console.error();
				console.error(err);
				process.exit(1);
			});
=======

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
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
		});
	}
}
