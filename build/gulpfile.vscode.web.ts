/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gulp, rename, filter, jsonEditor } from './lib/gulp/facade.ts';
import * as path from 'path';
import * as cp from 'child_process';
import es from 'event-stream';
import * as util from './lib/util.ts';
import { getVersion } from './lib/getVersion.ts';
import * as task from './lib/gulp/task.ts';
import * as optimize from './lib/optimize.ts';
import { readISODate } from './lib/date.ts';
import product from '../product.json' with { type: 'json' };
import { getProductionDependencies } from './lib/dependencies.ts';
import vfs from 'vinyl-fs';
import packageJson from '../package.json' with { type: 'json' };
import { compileBuildWithManglingTask } from './gulpfile.compile.ts';
import { copyCodiconsTask } from './lib/compilation.ts';
import * as extensions from './lib/extensions.ts';
import buildfile from './buildfile.ts';
import { paths, type DirString } from './folders.ts';

const REPO_ROOT = path.dirname(import.meta.dirname);
const BUILD_ROOT = path.dirname(REPO_ROOT);
const WEB_FOLDER = paths.remote.web.absPath;

const commit = getVersion(REPO_ROOT);
const quality = (product as { quality?: string }).quality;
const version = (quality && quality !== 'stable') ? `${packageJson.version}-${quality}` : packageJson.version;

// esbuild-based bundle for standalone web
function runEsbuildBundle(outDir: DirString, minify: boolean, nls: boolean, sourceMapBaseUrl?: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const scriptPath = path.join(REPO_ROOT, 'build/next/index.ts');
		const args = [scriptPath, 'bundle', '--out', outDir.path, '--target', 'web'];
		if (minify) {
			args.push('--minify');
			args.push('--mangle-privates');
		}
		if (nls) {
			args.push('--nls');
		}
		if (sourceMapBaseUrl) {
			args.push('--source-map-base-url', sourceMapBaseUrl);
		}

		const proc = cp.spawn(process.execPath, args, {
			cwd: REPO_ROOT,
			stdio: 'inherit'
		});

		proc.on('error', reject);
		proc.on('close', code => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`esbuild web bundle failed with exit code ${code} (outDir: ${outDir.path}, minify: ${minify}, nls: ${nls})`));
			}
		});
	});
}

export const vscodeWebResourceIncludes = [

	// NLS
	`${paths.outBuild.rootRelPath}/nls.messages.js`,

	// Accessibility Signals
	`${paths.outBuild.rootRelPath}/vs/platform/accessibilitySignal/browser/media/*.mp3`,

	// Welcome
	`${paths.outBuild.rootRelPath}/vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.{svg,png}`,
	`${paths.outBuild.rootRelPath}/vs/workbench/contrib/welcomeOnboarding/browser/media/*.svg`,

	// Extensions
	`${paths.outBuild.rootRelPath}/vs/workbench/contrib/extensions/browser/media/{theme-icon.png,language-icon.svg}`,
	`${paths.outBuild.rootRelPath}/vs/workbench/services/extensionManagement/common/media/*.{svg,png}`,

	// Webview
	`${paths.outBuild.rootRelPath}/vs/workbench/contrib/webview/browser/pre/*.{js,html}`,

	// Tree Sitter highlights
	`${paths.outBuild.rootRelPath}/vs/editor/common/languages/highlights/*.scm`,

	// Tree Sitter injections
	`${paths.outBuild.rootRelPath}/vs/editor/common/languages/injections/*.scm`,

	// Extension Host Worker
	`${paths.outBuild.rootRelPath}/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html`
];

const vscodeWebResources = [

	// Includes
	...vscodeWebResourceIncludes,

	// Excludes
	`!${paths.outBuild.rootRelPath}/vs/**/{node,electron-browser,electron-main,electron-utility}/**`,
	`!${paths.outBuild.rootRelPath}/vs/editor/standalone/**`,
	`!${paths.outBuild.rootRelPath}/vs/workbench/**/*-tb.png`,
	`!${paths.outBuild.rootRelPath}/vs/code/**/*-dev.html`,
	'!**/test/**'
];

const vscodeWebEntryPoints = [
	buildfile.workerEditor,
	buildfile.workerExtensionHost,
	buildfile.workerNotebook,
	buildfile.workerLanguageDetection,
	buildfile.workerLocalFileSearch,
	buildfile.workerOutputLinks,
	buildfile.workerBackgroundTokenization,
	buildfile.keyboardMaps,
	buildfile.workbenchWeb,
	buildfile.sessionsWeb,
].flat();

/**
 * @param extensionsRoot The location where extension will be read from
 * @param product The parsed product.json file contents
 */
export const createVSCodeWebFileContentMapper = (extensionsRoot: string, product: typeof import('../product.json')) => {
	return (path: string): ((content: string) => string) | undefined => {
		if (path.endsWith('vs/platform/product/common/product.js')) {
			return content => {
				const productConfiguration = JSON.stringify({
					...product,
					version,
					commit,
					date: readISODate('out-build')
				});
				return content.replace('/*BUILD->INSERT_PRODUCT_CONFIGURATION*/', () => productConfiguration.substr(1, productConfiguration.length - 2) /* without { and }*/);
			};
		} else if (path.endsWith('vs/workbench/services/extensionManagement/browser/builtinExtensionsScannerService.js')) {
			return content => {
				const builtinExtensions = JSON.stringify(extensions.scanBuiltinExtensions(extensionsRoot));
				return content.replace('/*BUILD->INSERT_BUILTIN_EXTENSIONS*/', () => builtinExtensions.substr(1, builtinExtensions.length - 2) /* without [ and ]*/);
			};
		}

		return undefined;
	};
};

const bundleVSCodeWebTask = task.define('bundle-vscode-web-OLD', task.series(
	util.rimraf(paths.outVscodeWeb.rootRelPath),
	optimize.bundleTask(
		{
			out: paths.outVscodeWeb.rootRelPath,
			esm: {
				src: paths.outBuild.rootRelPath,
				entryPoints: vscodeWebEntryPoints,
				resources: vscodeWebResources,
				fileContentMapper: createVSCodeWebFileContentMapper(paths.dotBuild.web.extensions.rootRelPath, product)
			}
		}
	)
));

const minifyVSCodeWebTask = task.define('minify-vscode-web-OLD', task.series(
	bundleVSCodeWebTask,
	util.rimraf(paths.outVscodeWebMin.rootRelPath),
	optimize.minifyTask(paths.outVscodeWeb.rootRelPath, `https://main.vscode-cdn.net/sourcemaps/${commit}/core`)
));
task.task(minifyVSCodeWebTask);

// esbuild-based tasks (new)
const sourceMappingURLBase = `https://main.vscode-cdn.net/sourcemaps/${commit}`;
const esbuildBundleVSCodeWebTask = task.define('esbuild-vscode-web', () => runEsbuildBundle(paths.outVscodeWeb.rootRelPathDir, false, true));
const esbuildBundleVSCodeWebMinTask = task.define('esbuild-vscode-web-min', () => runEsbuildBundle(paths.outVscodeWebMin.rootRelPathDir, true, true, `${sourceMappingURLBase}/core`));

function packageTask(sourceFolderName: string, destinationFolderName: string) {
	const destination = path.join(BUILD_ROOT, destinationFolderName);

	return () => {
		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname!.replace(new RegExp('^' + sourceFolderName), 'out'); }));

		const extensions = gulp.src(`${paths.dotBuild.web.extensions.rootRelPath}/**`, { base: paths.dotBuild.web.rootRelPath, dot: true });

		const sources = es.merge(src, extensions)
			.pipe(filter(['**', '!**/*.{js,css}.map'], { dot: true }));

		const name = product.nameShort;
		const packageJsonStream = gulp.src([paths.remote.web.packageJson.rootRelPath], { base: paths.remote.web.rootRelPath })
			.pipe(jsonEditor({ name, version, type: 'module' }));

		const license = gulp.src([paths.remote.license.rootRelPath], { base: paths.remote.rootRelPath, allowEmpty: true });

		const productionDependencies = getProductionDependencies(WEB_FOLDER);
		const dependenciesSrc = productionDependencies.map(d => path.relative(REPO_ROOT, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]).flat();

		const deps = gulp.src(dependenciesSrc, { base: paths.remote.web.rootRelPath, dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(paths.build.webignore.absPath));

		const favicon = gulp.src(paths.resources.server.favicon.rootRelPath, { base: paths.resources.server.rootRelPath });
		const manifest = gulp.src(paths.resources.server.manifest.rootRelPath, { base: paths.resources.server.rootRelPath });
		const pwaicons = es.merge(
			gulp.src(paths.resources.server.code192Png.rootRelPath, { base: paths.resources.server.rootRelPath }),
			gulp.src(paths.resources.server.code512Png.rootRelPath, { base: paths.resources.server.rootRelPath })
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
	task.define('clean-web-extensions-build', util.rimraf(paths.dotBuild.web.extensions.rootRelPath)),
	task.define('bundle-web-extensions-build', () => extensions.packageAllLocalExtensionsStream(true, false).pipe(gulp.dest(paths.dotBuild.web.rootRelPath))),
	task.define('bundle-marketplace-web-extensions-build', () => extensions.packageMarketplaceExtensionsStream(true).pipe(gulp.dest(paths.dotBuild.web.rootRelPath))),
	task.define('bundle-web-extension-media-build', () => extensions.buildExtensionMedia(false, paths.dotBuild.web.extensions.rootRelPath)),
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
		compileBuildWithManglingTask,
		vscodeWebTaskCI
	));
	task.task(vscodeWebTask);
});
