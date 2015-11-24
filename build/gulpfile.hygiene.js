/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var filter = require('gulp-filter');
var es = require('event-stream');
var path = require('path');

var eolFilter = [
	'build/**/*',
	'extensions/**/*',
	'scripts/**/*',
	'src/**/*',
	'test/**/*',
	'!extensions/csharp-o/bin/**',
	'!extensions/**/out/**',
	'!**/node_modules/**',
	'!**/fixtures/**',
	'!**/*.{svg,exe,png,scpt,bat,cur,ttf,woff,eot}',
];

var indentationFilter = [
	'**',
	'!**/lib/**',
	'!**/*.d.ts',
	'!extensions/typescript/server/**',
	'!test/assert.js',
	'!**/package.json',
	'!**/octicons/**',
	'!**/vs/languages/sass/test/common/example.scss',
	'!**/vs/languages/less/common/parser/less.grammar.txt',
	'!**/vs/languages/css/common/buildscripts/css-schema.xml',
	'!**/vs/languages/markdown/common/raw.marked.js',
	'!**/vs/base/common/winjs.base.raw.js',
	'!**/vs/base/node/terminateProcess.sh',
	'!extensions/csharp-o/gulpfile.js',
	'!**/vs/base/node/terminateProcess.sh',
	'!**/vs/text.js',
	'!**/vs/nls.js',
	'!**/vs/css.js',
	'!**/vs/loader.js',
	'!extensions/**/snippets/**',
	'!extensions/**/syntaxes/**',
	'!extensions/**/themes/**',
];

var copyrightFilterList = [
	'**',
	'!**/*.json',
	'!**/*.html',
	'!**/test/**',
	'!**/*.md',
	'!**/*.sh',
	'!**/*.txt',
	'!src/vs/editor/standalone-languages/swift.ts',
];

var copyrightHeader = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copyright (c) Microsoft Corporation. All rights reserved.',
	' *  Licensed under the MIT License. See License.txt in the project root for license information.',
	' *--------------------------------------------------------------------------------------------*/'
].join('\n');

gulp.task('hygiene', function() {
	var errorCount = 0;

	var eol = es.through(function (file) {
		if (/\r\n?/g.test(file.contents.toString('utf8'))) {
			console.error(file.path + ': Bad EOL found');
			errorCount++;
		}

		this.emit('data', file);
	});

	var indentation = es.through(function (file) {
		file.contents
			.toString('utf8')
			.split(/\r\n|\r|\n/)
			.forEach(function(line, i) {
				if (line.length === 0) {
					// empty lines are OK
				} else if (/^[\t]*[^\s]/.test(line)) {
					// good indent
				} else if (/^[\t]* \*/.test(line)) {
					// block comment using an extra space
				} else {
					console.error(file.path + '(' + (i + 1) + ',1): Bad whitespace indentation');
					errorCount++;
				}
			});

		this.emit('data', file);
	});

	var copyrights = es.through(function (file) {
		if (file.contents.toString('utf8').indexOf(copyrightHeader) !== 0) {
			console.error(file.path + ': Missing or bad copyright statement');
			errorCount++;
		}
	});

	return gulp.src(eolFilter, { base: '.' })
		.pipe(filter(function (f) { return !f.stat.isDirectory(); }))
		.pipe(eol)
		.pipe(filter(indentationFilter))
		.pipe(indentation)
		.pipe(filter(copyrightFilterList))
		.pipe(copyrights)
		.pipe(es.through(null, function () {
			if (errorCount > 0) {
				this.emit('error', 'Hygiene failed with ' + errorCount + ' errors.\nCheck build/gulpfile.hygiene.js for the hygiene rules.');
			} else {
				this.emit('end');
			}
		}));
});
