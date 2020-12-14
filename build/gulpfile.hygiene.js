/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const gulp = require('gulp');
const filter = require('gulp-filter');
const es = require('event-stream');
const gulpeslint = require('gulp-eslint');
const vfs = require('vinyl-fs');
const path = require('path');
const task = require('./lib/task');
const { all, jsHygieneFilter, tsHygieneFilter, hygiene } = require('./hygiene');

gulp.task('eslint', () => {
	return vfs
		.src(all, { base: '.', follow: true, allowEmpty: true })
		.pipe(filter(jsHygieneFilter.concat(tsHygieneFilter)))
		.pipe(
			gulpeslint({
				configFile: '.eslintrc.json',
				rulePaths: ['./build/lib/eslint'],
			})
		)
		.pipe(gulpeslint.formatEach('compact'))
		.pipe(
			gulpeslint.results((results) => {
				if (results.warningCount > 0 || results.errorCount > 0) {
					throw new Error('eslint failed with warnings and/or errors');
				}
			})
		);
});

function checkPackageJSON(actualPath) {
	const actual = require(path.join(__dirname, '..', actualPath));
	const rootPackageJSON = require('../package.json');
	const checkIncluded = (set1, set2) => {
		for (let depName in set1) {
		const depVersion = set1[depName];
		const rootDepVersion = set2[depName];
		if (!rootDepVersion) {
			// missing in root is allowed
			continue;
		}
		if (depVersion !== rootDepVersion) {
			this.emit(
				'error',
				`The dependency ${depName} in '${actualPath}' (${depVersion}) is different than in the root package.json (${rootDepVersion})`
			);
		}
		}
	};

	checkIncluded(actual.dependencies, rootPackageJSON.dependencies);
	checkIncluded(actual.devDependencies, rootPackageJSON.devDependencies);
}

const checkPackageJSONTask = task.define('check-package-json', () => {
	return gulp.src('package.json').pipe(
		es.through(function () {
			checkPackageJSON.call(this, 'remote/package.json');
			checkPackageJSON.call(this, 'remote/web/package.json');
			checkPackageJSON.call(this, 'build/package.json');
		})
	);
});
gulp.task(checkPackageJSONTask);

gulp.task(
	'hygiene',
	task.series(checkPackageJSONTask, () => hygiene())
);
