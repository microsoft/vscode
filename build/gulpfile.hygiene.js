/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var filter = require('gulp-filter');
var es = require('event-stream');
var gulptslint = require('gulp-tslint');
var tslint = require('tslint');

var all = [
	'*',
	'build/**/*',
	'extensions/**/*',
	'scripts/**/*',
	'src/**/*',
	'test/**/*'
];

var eolFilter = [
	'**',
	'!ThirdPartyNotices.txt',
	'!LICENSE.txt',
	'!extensions/**/out/**',
	'!**/node_modules/**',
	'!**/fixtures/**',
	'!**/*.{svg,exe,png,scpt,bat,cmd,cur,ttf,woff,eot}',
	'!build/{lib,tslintRules}/**/*.js'
];

var indentationFilter = [
	'**',
	'!ThirdPartyNotices.txt',
	'!**/*.md',
	'!**/*.template',
	'!**/*.yml',
	'!**/lib/**',
	'!**/*.d.ts',
	'!extensions/typescript/server/**',
	'!test/assert.js',
	'!**/package.json',
	'!**/npm-shrinkwrap.json',
	'!**/octicons/**',
	'!**/vs/languages/sass/test/common/example.scss',
	'!**/vs/languages/less/common/parser/less.grammar.txt',
	'!**/vs/languages/css/common/buildscripts/css-schema.xml',
	'!**/vs/base/common/marked/raw.marked.js',
	'!**/vs/base/common/winjs.base.raw.js',
	'!**/vs/base/node/terminateProcess.sh',
	'!**/vs/base/node/terminateProcess.sh',
	'!**/vs/text.js',
	'!**/vs/nls.js',
	'!**/vs/css.js',
	'!**/vs/loader.js',
	'!extensions/**/snippets/**',
	'!extensions/**/syntaxes/**',
	'!extensions/**/themes/**'
];

var copyrightFilter = [
	'**',
	'!**/*.desktop',
	'!**/*.json',
	'!**/*.html',
	'!**/*.template',
	'!**/test/**',
	'!**/*.md',
	'!**/*.bat',
	'!**/*.cmd',
	'!resources/win32/bin/code.js',
	'!**/*.sh',
	'!**/*.txt',
	'!**/*.xpm',
	'!src/vs/editor/standalone-languages/swift.ts',
];

var tslintFilter = [
	'src/**/*.ts',
	'extensions/**/*.ts',
	'!**/*.d.ts',
	'!**/typings/**',
	'!src/vs/base/**/*.test.ts',
	'!src/vs/languages/**/*.test.ts',
	'!src/vs/workbench/**/*.test.ts',
	'!extensions/**/*.test.ts',
];

var copyrightHeader = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/'
].join('\n');

function failureReporter(failure) {
	var name = failure.name || failure.fileName;
	var position = failure.startPosition;
	var line = position.lineAndCharacter ? position.lineAndCharacter.line : position.line;
	var character = position.lineAndCharacter ? position.lineAndCharacter.character : position.character;

	console.error(
		name
		+ ':' + (line + 1)
		+ ':' + (character + 1)
		+ ': ' + failure.failure
	);
}

gulp.task('tslint', function () {
	var options = { summarizeFailureOutput: true };

	function reporter(failures) {
		failures.forEach(failureReporter);
	}

	return gulp.src(all, { base: '.' })
		.pipe(filter(tslintFilter))
		.pipe(gulptslint({ rulesDirectory: 'build/lib/tslint' }))
		.pipe(gulptslint.report(reporter, options));
});

var hygiene = exports.hygiene = function (some, options) {
	options = options || {};
	var errorCount = 0;

	var eol = es.through(function (file) {
		if (/\r\n?/g.test(file.contents.toString('utf8'))) {
			console.error(file.relative + ': Bad EOL found');
			errorCount++;
		}

		this.emit('data', file);
	});

	var indentation = es.through(function (file) {
		file.contents
			.toString('utf8')
			.split(/\r\n|\r|\n/)
			.forEach(function (line, i) {
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

	var copyrights = es.through(function (file) {
		if (file.contents.toString('utf8').indexOf(copyrightHeader) !== 0) {
			console.error(file.relative + ': Missing or bad copyright statement');
			errorCount++;
		}

		this.emit('data', file);
	});

	var tsl = es.through(function(file) {
		var configuration = tslint.findConfiguration(null, '.');
		var options = {
			formatter: 'json',
			configuration: configuration,
			rulesDirectory: 'build/lib/tslint',
		}
		var contents = file.contents.toString('utf8');
		var linter = new tslint(file.relative, contents, options);
		var result = linter.lint();
		if (result.failureCount > 0) {
			result.failures.forEach(failureReporter);
			errorCount += result.failureCount;
		}
		this.emit('data', file);
	});

	return gulp.src(some || all, { base: '.' })
		.pipe(filter(function (f) { return !f.stat.isDirectory(); }))
		.pipe(filter(eolFilter))
		.pipe(options.skipEOL ? es.through() : eol)
		.pipe(filter(indentationFilter))
		.pipe(indentation)
		.pipe(filter(copyrightFilter))
		.pipe(copyrights)
		.pipe(filter(tslintFilter))
		.pipe(tsl)
		.pipe(es.through(null, function () {
			if (errorCount > 0) {
				this.emit('error', 'Hygiene failed with ' + errorCount + ' errors. Check \'build/gulpfile.hygiene.js\'.');
			} else {
				this.emit('end');
			}
		}));
};

gulp.task('hygiene', function () {
	return hygiene();
});

// this allows us to run this as a git pre-commit hook
if (require.main === module) {
	var cp = require('child_process');
	cp.exec('git config core.autocrlf', function (err, out) {
		var skipEOL = out.trim() === 'true';

		cp.exec('git diff --cached --name-only', { maxBuffer: 2000 * 1024 }, function (err, out) {
			if (err) {
				console.error();
				console.error(err);
				process.exit(1);
			}

			var some = out
				.split(/\r?\n/)
				.filter(function (l) { return !!l; });

			hygiene(some, { skipEOL: skipEOL }).on('error', function (err) {
				console.error();
				console.error(err);
				process.exit(1);
			});
		});
	});
}
