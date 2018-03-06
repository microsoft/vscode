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
const vfs = require('vinyl-fs');
const path = require('path');
const fs = require('fs');

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
	'test/**/*'
];

const eolFilter = [
	'**',
	'!ThirdPartyNotices.txt',
	'!LICENSE.txt',
	'!extensions/**/out/**',
	'!test/smoke/out/**',
	'!**/node_modules/**',
	'!**/fixtures/**',
	'!**/*.{svg,exe,png,bmp,scpt,bat,cmd,cur,ttf,woff,eot}',
	'!build/{lib,tslintRules}/**/*.js',
	'!build/monaco/**',
	'!build/win32/**',
	'!build/**/*.sh',
	'!build/tfs/**/*.js',
	'!**/Dockerfile'
];

const indentationFilter = [
	'**',
	'!ThirdPartyNotices.txt',
	'!**/*.md',
	'!**/*.ps1',
	'!**/*.template',
	'!**/*.yaml',
	'!**/*.yml',
	'!**/yarn.lock',
	'!**/lib/**',
	'!extensions/**/*.d.ts',
	'!src/typings/**/*.d.ts',
	'!src/vs/*/**/*.d.ts',
	'!**/*.d.ts.recipe',
	'!test/assert.js',
	'!**/package.json',
	'!**/octicons/**',
	'!**/vs/base/common/marked/raw.marked.js',
	'!**/vs/base/common/winjs.base.raw.js',
	'!**/vs/base/node/terminateProcess.sh',
	'!**/vs/base/node/ps-win.ps1',
	'!**/vs/nls.js',
	'!**/vs/css.js',
	'!**/vs/loader.js',
	'!extensions/**/snippets/**',
	'!extensions/**/syntaxes/**',
	'!extensions/**/themes/**',
	'!extensions/**/colorize-fixtures/**',
	'!extensions/vscode-api-tests/testWorkspace/**',
	'!extensions/vscode-api-tests/testWorkspace2/**'
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
	'!resources/linux/snap/snapcraft.yaml',
	'!resources/win32/bin/code.js',
	'!extensions/markdown/media/tomorrow.css',
	'!extensions/html/server/src/modes/typescript/*'
];

const eslintFilter = [
	'src/**/*.js',
	'build/gulpfile.*.js',
	'!src/vs/loader.js',
	'!src/vs/css.js',
	'!src/vs/nls.js',
	'!src/vs/css.build.js',
	'!src/vs/nls.build.js',
	'!src/**/winjs.base.raw.js',
	'!src/**/raw.marked.js',
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
	'!extensions/html/server/lib/jquery.d.ts'
];

const copyrightHeader = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/'
].join('\n');

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

const hygiene = exports.hygiene = (some, options) => {
	options = options || {};
	let errorCount = 0;

	const eol = es.through(function (file) {
		if (/\r\n?/g.test(file.contents.toString('utf8'))) {
			console.error(file.relative + ': Bad EOL found');
			errorCount++;
		}

		this.emit('data', file);
	});

	const indentation = es.through(function (file) {
		file.contents
			.toString('utf8')
			.split(/\r\n|\r|\n/)
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
		if (file.contents.toString('utf8').indexOf(copyrightHeader) !== 0) {
			console.error(file.relative + ': Missing or bad copyright statement');
			errorCount++;
		}

		this.emit('data', file);
	});

	const formatting = es.map(function (file, cb) {
		tsfmt.processString(file.path, file.contents.toString('utf8'), {
			verify: true,
			tsfmt: true,
			// verbose: true
			// keep checkJS happy
			editorconfig: undefined,
			replace: undefined,
			tsconfig: undefined,
			tslint: undefined
		}).then(result => {
			if (result.error) {
				console.error(result.message);
				errorCount++;
			}
			cb(null, file);

		}, err => {
			cb(err);
		});
	});

	let linterForProgram = {}; // maps tslint programs to its corresponding Linter
	const configuration = tslint.Configuration.findConfiguration('tslint-hygiene.json', '.');

	function createLinter(tsconfig) {
		const program = tslint.Linter.createProgram(tsconfig);
		const tslintOptions = { fix: false, formatter: 'json' };
		return new tslint.Linter(tslintOptions, program);
	}

	function findTsConfig(segments) {
		let fsPath = segments.reduce((p, each) => path.join(p, each));
		let tsconfig = path.join(fsPath, 'tsconfig.json');
		if (fs.existsSync(tsconfig)) {
			return tsconfig;
		} else if (segments.length > 1) {
			segments.splice(-1, 1);
			return findTsConfig(segments);
		} else {
			return undefined;
		}
	}

	function getLinter(file) {
		let segments = file.relative.split(path.sep);

		// hard code the location of the tsconfig.json for the source folder to eliminate the lookup for the tsconfig.json
		if (segments[0] === 'src') {
			if (!linterForProgram['src']) {
				linterForProgram['src'] = createLinter('src/tsconfig.json');
			}
			return linterForProgram['src'];
		}
		else {
			segments.splice(-1, 1);
			let tsconfig = findTsConfig(segments);
			if (!tsconfig) {
				return undefined;
			}
			if (!linterForProgram[tsconfig]) {
				linterForProgram[tsconfig] = createLinter(tsconfig);
			}
			return linterForProgram[tsconfig];
		}
	}

	const tsl = es.through(function (file) {
		const contents = file.contents.toString('utf8');
		let linter = getLinter(file);
		if (linter) {
			linter.lint(file.relative, contents, configuration.results);
		}
		this.emit('data', file);
	});

	const result = vfs.src(some || all, { base: '.', follow: true, allowEmpty: true })
		.pipe(filter(f => !f.stat.isDirectory()))
		.pipe(filter(eolFilter))
		.pipe(options.skipEOL ? es.through() : eol)
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

			for (let linter in linterForProgram) {
				const tslintResult = linterForProgram[linter].getResult();
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
			}

			if (errorCount > 0) {
				this.emit('error', 'Hygiene failed with ' + errorCount + ' errors. Check \'build/gulpfile.hygiene.js\'.');
			} else {
				this.emit('end');
			}
		}));
};

gulp.task('hygiene', () => hygiene(''));

// this allows us to run hygiene as a git pre-commit hook
if (require.main === module) {
	const cp = require('child_process');

	process.on('unhandledRejection', (reason, p) => {
		console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
		process.exit(1);
	});

	cp.exec('git config core.autocrlf', (err, out) => {
		const skipEOL = out.trim() === 'true';

		if (process.argv.length > 2) {
			return hygiene(process.argv.slice(2), { skipEOL: skipEOL }).on('error', err => {
				console.error();
				console.error(err);
				process.exit(1);
			});
		}

		cp.exec('git diff --cached --name-only', { maxBuffer: 2000 * 1024 }, (err, out) => {
			if (err) {
				console.error();
				console.error(err);
				process.exit(1);
			}

			const some = out
				.split(/\r?\n/)
				.filter(l => !!l);

			if (some.length > 0) {
				hygiene(some, { skipEOL: skipEOL }).on('error', err => {
					console.error();
					console.error(err);
					process.exit(1);
				});
			}
		});
	});
}
