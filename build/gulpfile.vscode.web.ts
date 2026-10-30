/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gulp, rename, filter, jsonEditor } from './lib/gulp/facade.ts';
import * as path from 'path';
import es from 'event-stream';
import * as util from './lib/util.ts';
import { getVersion } from './lib/getVersion.ts';
import * as task from './lib/gulp/task.ts';
import { writeISODate } from './lib/date.ts';
import product from '../product.json' with { type: 'json' };
import { getProductionDependencies } from './lib/dependencies.ts';
import vfs from 'vinyl-fs';
import packageJson from '../package.json' with { type: 'json' };
import { compileApiProposalNamesTask, copyCodiconsTask } from './lib/compilation.ts';
import * as extensions from './lib/extensions.ts';
import { runEsbuildBundle } from './lib/esbuild.ts';

const REPO_ROOT = path.dirname(import.meta.dirname);
const BUILD_ROOT = path.dirname(REPO_ROOT);
const WEB_FOLDER = path.join(REPO_ROOT, 'remote', 'web');

const commit = getVersion(REPO_ROOT);
const quality = (product as { quality?: string }).quality;
const version = (quality && quality !== 'stable') ? `${packageJson.version}-${quality}` : packageJson.version;

const sourceMappingURLBase = `https://main.vscode-cdn.net/sourcemaps/${commit}`;
const esbuildBundleVSCodeWebTask = task.define('esbuild-vscode-web', () => runEsbuildBundle('out-vscode-web', false, true, 'web'));
const esbuildBundleVSCodeWebMinTask = task.define('esbuild-vscode-web-min', () => runEsbuildBundle('out-vscode-web-min', true, true, 'web', `${sourceMappingURLBase}/core`));

function packageTask(sourceFolderName: string, destinationFolderName: string) {
	const destination = path.join(BUILD_ROOT, destinationFolderName);

	return () => {
		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname!.replace(new RegExp('^' + sourceFolderName), 'out'); }));

		const extensions = gulp.src('.build/web/extensions/**', { base: '.build/web', dot: true });

		const sources = es.merge(src, extensions)
			.pipe(filter(['**', '!**/*.{js,css}.map'], { dot: true }));

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['remote/web/package.json'], { base: 'remote/web' })
			.pipe(jsonEditor({ name, version, type: 'module' }));

		const license = gulp.src(['remote/LICENSE'], { base: 'remote', allowEmpty: true });

		const productionDependencies = getProductionDependencies(WEB_FOLDER);
		const dependenciesSrc = productionDependencies.map(d => path.relative(REPO_ROOT, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]).flat();

		const deps = gulp.src(dependenciesSrc, { base: 'remote/web', dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(path.join(import.meta.dirname, '.webignore')));

		const favicon = gulp.src('resources/server/favicon.ico', { base: 'resources/server' });
		const manifest = gulp.src('resources/server/manifest.json', { base: 'resources/server' });
		const pwaicons = es.merge(
			gulp.src('resources/server/code-192.png', { base: 'resources/server' }),
			gulp.src('resources/server/code-512.png', { base: 'resources/server' })
		);

		const all = es.merge(
			packageJsonStream,
			license,
			sources,
			deps,
			favicon,
			manifest,
			pwaicons
		);

		const result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		return result.pipe(vfs.dest(destination));
	};
}

const compileWebExtensionsBuildTask = task.define('compile-web-extensions-build', task.series(
	task.define('clean-web-extensions-build', util.rimraf('.build/web/extensions')),
	task.define('bundle-web-extensions-build', () => extensions.packageAllLocalExtensionsStream(true).pipe(gulp.dest('.build/web'))),
	task.define('bundle-marketplace-web-extensions-build', () => extensions.packageMarketplaceExtensionsStream(true).pipe(gulp.dest('.build/web'))),
	task.define('bundle-web-extension-media-build', () => extensions.buildExtensionMedia(false, '.build/web/extensions')),
));
task.task(compileWebExtensionsBuildTask);

const dashed = (str: string) => (str ? `-${str}` : ``);

['', 'min'].forEach(minified => {
	const sourceFolderName = `out-vscode-web${dashed(minified)}`;
	const destinationFolderName = `vscode-web`;

	const vscodeWebTaskCI = task.define(`vscode-web${dashed(minified)}-ci`, task.series(
		copyCodiconsTask,
		compileWebExtensionsBuildTask,
		minified ? esbuildBundleVSCodeWebMinTask : esbuildBundleVSCodeWebTask,
		util.rimraf(path.join(BUILD_ROOT, destinationFolderName)),
		packageTask(sourceFolderName, destinationFolderName)
	));
	task.task(vscodeWebTaskCI);

	const vscodeWebTask = task.define(`vscode-web${dashed(minified)}`, task.series(
		compileApiProposalNamesTask,
		writeISODate('out-build'),
		vscodeWebTaskCI
	));
	task.task(vscodeWebTask);
});
