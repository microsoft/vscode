/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import gulp from 'gulp';
import es from 'event-stream';
import path from 'path';
import fs from 'fs';
import * as task from './lib/task.ts';
import { hygiene } from './hygiene.ts';

const dirName = path.dirname(new URL(import.meta.url).pathname);

function checkPackageJSON(this: NodeJS.ReadWriteStream, actualPath: string) {
	const actual = JSON.parse(fs.readFileSync(path.join(dirName, '..', actualPath), 'utf8'));
	const rootPackageJSON = JSON.parse(fs.readFileSync(path.join(dirName, '..', 'package.json'), 'utf8'));
	const checkIncluded = (set1: Record<string, string>, set2: Record<string, string>) => {
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

const hygieneTask = task.define('hygiene', task.series(checkPackageJSONTask, () => hygiene(undefined, false)));
gulp.task(hygieneTask);
