/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const gulp = require('gulp');
const es = require('event-stream');
const path = require('path');
const task = require('./lib/task');
const { hygiene } = require('./hygiene');

/**
 * @param {string} actualPath
 */
function checkPackageJSON(actualPath) {
	const actual = require(path.join(__dirname, '..', actualPath));
	const rootPackageJSON = require('../package.json');
	const checkIncluded = (set1, set2) => {
		for (const depName in set1) {
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

const productJsonFilter = [
	// Remove or comment out this line that blocks extensionsGallery
	'extensionsGallery',
	'extensionsGallery.cacheUrl',
	'extensionsGallery.controlUrl',
	'extensionsGallery.recommendationsUrl',
	'extensionsGallery.nlsBaseUrl',
	'nameShort',
	'nameLong',
	'win32AppUserModelId',
	'win32MutexName',
	'win32DirName',
	'win32NameVersion',
	'win32RegValueName',
	'win32AppId',
	'win32x64AppId',
	'win32arm64AppId',
	'win32UserAppId',
	'win32x64UserAppId',
	'win32arm64UserAppId',
	'applicationName',
	'embedderIdentifier',
	'linuxIconName',
	'licenseUrl',
	'urlProtocol',
	'darwinBundleIdentifier',
	'darwinCredits',
	'serverLicense',
	'serverLicensePrompt',
	'serverGreeting',
	'serverApplicationName',
	'serverDataFolderName',
	'tunnelApplicationName',
	'documentationUrl',
	'requestFeatureUrl',
	'reportIssueUrl',
	'webviewContentExternalBaseUrlTemplate',
];

const hygieneTask = task.define('hygiene', task.series(checkPackageJSONTask, () => hygiene(undefined, false)));
gulp.task(hygieneTask);
