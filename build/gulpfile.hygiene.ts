/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { gulp, filter } from './lib/gulp/facade.ts';
import es from 'event-stream';
import minimist from 'minimist';
import path from 'path';
import fs from 'fs';
import vfs from 'vinyl-fs';
import * as task from './lib/gulp/task.ts';
import { all } from './filters.ts';
import { checkCopilotEnginesVersion, checkNoNewJavaScriptFiles, hygiene } from './hygiene.ts';
import { getChangedFilesScope, getHygieneScope } from './lib/changedFiles.ts';

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

			const repoRoot = path.join(dirName, '..');
			const copilotError = checkCopilotEnginesVersion(repoRoot);
			if (copilotError) {
				this.emit('error', copilotError);
			}
			const jsAllowlistError = checkNoNewJavaScriptFiles(repoRoot);
			if (jsAllowlistError) {
				this.emit('error', jsAllowlistError);
			}
		})
	);
});
task.task(checkPackageJSONTask);

/**
 * Checks every file, or with `--changed-since <ref>` the files that changed between `ref` and `HEAD`.
 */
function runHygiene(): NodeJS.ReadWriteStream {
	const changedSince: string | undefined = minimist(process.argv.slice(2), { string: ['changed-since'] })['changed-since'];
	if (changedSince === undefined) {
		return hygiene(undefined, false);
	}
	if (!changedSince) {
		throw new Error('--changed-since requires a git revision.');
	}

	const scope = getChangedFilesScope(changedSince, getHygieneScope);
	if (scope.kind === 'full') {
		console.log(`Hygiene: checking the full repository because ${scope.reason}.`);
		return hygiene(undefined, false);
	}
	console.log(`Hygiene: checking ${scope.files.length} file${scope.files.length === 1 ? '' : 's'} (${scope.reason}).`);
	// Pass a stream rather than paths, so that changing only files that no check covers, such as images, passes.
	const files = scope.files.length > 0
		? vfs.src(Array.from(scope.files), { base: '.', follow: true, allowEmpty: true }).pipe(filter(Array.from(all)))
		: es.readArray([]);
	return hygiene(files, false);
}

const hygieneTask = task.define('hygiene', task.series(checkPackageJSONTask, runHygiene));
task.task(hygieneTask);
