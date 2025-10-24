/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const es = require('event-stream');
const vfs = require('vinyl-fs');
const rename = require('gulp-rename');
const replace = require('gulp-replace');
const filter = require('gulp-filter');
const util = require('./lib/util');
const { getVersion } = require('./lib/getVersion');
const { readISODate } = require('./lib/date');
const task = require('./lib/task');
const buildfile = require('./buildfile');
const optimize = require('./lib/optimize');
const { inlineMeta } = require('./lib/inlineMeta');
const root = path.dirname(__dirname);
const commit = getVersion(root);
const packageJson = require('../package.json');
const product = require('../product.json');
const crypto = require('crypto');
const i18n = require('./lib/i18n');
const { getProductionDependencies } = require('./lib/dependencies');
const { config } = require('./lib/electron');
const createAsar = require('./lib/asar').createAsar;
const minimist = require('minimist');
const { compileBuildWithoutManglingTask, compileBuildWithManglingTask } = require('./gulpfile.compile');
const { compileNonNativeExtensionsBuildTask, compileNativeExtensionsBuildTask, compileAllExtensionsBuildTask, compileExtensionMediaBuildTask, cleanExtensionsBuildTask } = require('./gulpfile.extensions');
const { promisify } = require('util');
const glob = promisify(require('glob'));
const rcedit = promisify(require('rcedit'));

// Build
const vscodeEntryPoints = [
	buildfile.workerEditor,
	buildfile.workerExtensionHost,
	buildfile.workerNotebook,
	buildfile.workerLanguageDetection,
	buildfile.workerLocalFileSearch,
	buildfile.workerProfileAnalysis,
	buildfile.workerOutputLinks,
	buildfile.workerBackgroundTokenization,
	buildfile.workbenchDesktop,
	buildfile.code
].flat();

const vscodeResourceIncludes = [

	// NLS
	'out-build/nls.messages.json',
	'out-build/nls.keys.json',

	// Workbench
	'out-build/vs/code/electron-browser/workbench/workbench.html',

	// Electron Preload
	'out-build/vs/base/parts/sandbox/electron-browser/preload.js',
	'out-build/vs/base/parts/sandbox/electron-browser/preload-aux.js',

	// Node Scripts
	'out-build/vs/base/node/{terminateProcess.sh,cpuUsage.sh,ps.sh}',

	// Touchbar
	'out-build/vs/workbench/browser/parts/editor/media/*.png',
	'out-build/vs/workbench/contrib/debug/browser/media/*.png',

	// External Terminal
	'out-build/vs/workbench/contrib/externalTerminal/**/*.scpt',

	// Terminal shell integration
	'out-build/vs/workbench/contrib/terminal/common/scripts/*.fish',
	'out-build/vs/workbench/contrib/terminal/common/scripts/*.ps1',
	'out-build/vs/workbench/contrib/terminal/common/scripts/*.psm1',
	'out-build/vs/workbench/contrib/terminal/common/scripts/*.sh',
	'out-build/vs/workbench/contrib/terminal/common/scripts/*.zsh',

	// Accessibility Signals
	'out-build/vs/platform/accessibilitySignal/browser/media/*.mp3',

	// Welcome
	'out-build/vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.{svg,png}',

	// Extensions
	'out-build/vs/workbench/contrib/extensions/browser/media/{theme-icon.png,language-icon.svg}',
	'out-build/vs/workbench/services/extensionManagement/common/media/*.{svg,png}',

	// Webview
	'out-build/vs/workbench/contrib/webview/browser/pre/*.{js,html}',

	// Extension Host Worker
	'out-build/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',

	// Tree Sitter highlights
	'out-build/vs/editor/common/languages/highlights/*.scm',

	// Tree Sitter injection queries
	'out-build/vs/editor/common/languages/injections/*.scm'
];

const vscodeResources = [

	// Includes
	...vscodeResourceIncludes,

	// Excludes
	'!out-build/vs/code/browser/**',
	'!out-build/vs/editor/standalone/**',
	'!out-build/vs/code/**/*-dev.html',
	'!out-build/vs/workbench/contrib/issue/**/*-dev.html',
	'!**/test/**'
];

const bootstrapEntryPoints = [
	'out-build/main.js',
	'out-build/cli.js',
	'out-build/bootstrap-fork.js'
];

const bundleVSCodeTask = task.define('bundle-vscode', task.series(
	util.rimraf('out-vscode'),
	// Optimize: bundles source files automatically based on
	// import statements based on the passed in entry points.
	// In addition, concat window related bootstrap files into
	// a single file.
	optimize.bundleTask(
		{
			out: 'out-vscode',
			esm: {
				src: 'out-build',
				entryPoints: [
					...vscodeEntryPoints,
					...bootstrapEntryPoints
				],
				resources: vscodeResources,
				skipTSBoilerplateRemoval: entryPoint => entryPoint === 'vs/code/electron-browser/workbench/workbench'
			}
		}
	)
));
gulp.task(bundleVSCodeTask);

const sourceMappingURLBase = `https://main.vscode-cdn.net/sourcemaps/${commit}`;
const minifyVSCodeTask = task.define('minify-vscode', task.series(
	bundleVSCodeTask,
	util.rimraf('out-vscode-min'),
	optimize.minifyTask('out-vscode', `${sourceMappingURLBase}/core`)
));
gulp.task(minifyVSCodeTask);

const coreCI = task.define('core-ci', task.series(
	gulp.task('compile-build-with-mangling'),
	task.parallel(
		gulp.task('minify-vscode'),
		gulp.task('minify-vscode-reh'),
		gulp.task('minify-vscode-reh-web'),
	)
));
gulp.task(coreCI);

const coreCIPR = task.define('core-ci-pr', task.series(
	gulp.task('compile-build-without-mangling'),
	task.parallel(
		gulp.task('minify-vscode'),
		gulp.task('minify-vscode-reh'),
		gulp.task('minify-vscode-reh-web'),
	)
));
gulp.task(coreCIPR);

/**
 * Compute checksums for some files.
 *
 * @param {string} out The out folder to read the file from.
 * @param {string[]} filenames The paths to compute a checksum for.
 * @return {Object} A map of paths to checksums.
 */
function computeChecksums(out, filenames) {
	const result = {};
	filenames.forEach(function (filename) {
		const fullPath = path.join(process.cwd(), out, filename);
		result[filename] = computeChecksum(fullPath);
	});
	return result;
}

/**
 * Compute checksum for a file.
 *
 * @param {string} filename The absolute path to a filename.
 * @return {string} The checksum for `filename`.
 */
function computeChecksum(filename) {
	const contents = fs.readFileSync(filename);

	const hash = crypto
		.createHash('sha256')
		.update(contents)
		.digest('base64')
		.replace(/=+$/, '');

	return hash;
}

function packageTask(platform, arch, sourceFolderName, destinationFolderName, opts) {
	opts = opts || {};

	const destination = path.join(path.dirname(root), destinationFolderName);
	platform = platform || process.platform;

	const task = () => {
		const electron = require('@vscode/gulp-electron');
		const json = require('gulp-json-editor');

		const out = sourceFolderName;

		const checksums = computeChecksums(out, [
			'vs/base/parts/sandbox/electron-browser/preload.js',
			'vs/workbench/workbench.desktop.main.js',
			'vs/workbench/workbench.desktop.main.css',
			'vs/workbench/api/node/extensionHostProcess.js',
			'vs/code/electron-browser/workbench/workbench.html',
			'vs/code/electron-browser/workbench/workbench.js'
		]);

		const src = gulp.src(out + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + out), 'out'); }))
			.pipe(util.setExecutableBit(['**/*.sh']));

		const platformSpecificBuiltInExtensionsExclusions = product.builtInExtensions.filter(ext => {
			if (!ext.platforms) {
				return false;
			}

			const set = new Set(ext.platforms);
			return !set.has(platform);
		}).map(ext => `!.build/extensions/${ext.name}/**`);

		const extensions = gulp.src(['.build/extensions/**', ...platformSpecificBuiltInExtensionsExclusions], { base: '.build', dot: true });

		const sources = es.merge(src, extensions)
			.pipe(filter(['**', '!**/*.{js,css}.map'], { dot: true }));

		let version = packageJson.version;
		const quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const name = product.nameShort;
		const packageJsonUpdates = { name, version };

		if (platform === 'linux') {
			packageJsonUpdates.desktopName = `${product.applicationName}.desktop`;
		}

		let packageJsonContents;
		const packageJsonStream = gulp.src(['package.json'], { base: '.' })
			.pipe(json(packageJsonUpdates))
			.pipe(es.through(function (file) {
				packageJsonContents = file.contents.toString();
				this.emit('data', file);
			}));

		let productJsonContents;
		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(json({ commit, date: readISODate('out-build'), checksums, version }))
			.pipe(es.through(function (file) {
				productJsonContents = file.contents.toString();
				this.emit('data', file);
			}));

		const license = gulp.src([product.licenseFileName, 'ThirdPartyNotices.txt', 'licenses/**'], { base: '.', allowEmpty: true });

		// TODO the API should be copied to `out` during compile, not here
		const api = gulp.src('src/vscode-dts/vscode.d.ts').pipe(rename('out/vscode-dts/vscode.d.ts'));

		const telemetry = gulp.src('.build/telemetry/**', { base: '.build/telemetry', dot: true });

		const jsFilter = util.filter(data => !data.isDirectory() && /\.js$/.test(data.path));
		const root = path.resolve(path.join(__dirname, '..'));
		const productionDependencies = getProductionDependencies(root);
		const dependenciesSrc = productionDependencies.map(d => path.relative(root, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]).flat().concat('!**/*.mk');

		const deps = gulp.src(dependenciesSrc, { base: '.', dot: true })
			.pipe(filter(['**', `!**/${config.version}/**`, '!**/bin/darwin-arm64-87/**', '!**/package-lock.json', '!**/yarn.lock', '!**/*.{js,css}.map']))
			.pipe(util.cleanNodeModules(path.join(__dirname, '.moduleignore')))
			.pipe(util.cleanNodeModules(path.join(__dirname, `.moduleignore.${process.platform}`)))
			.pipe(jsFilter)
			.pipe(util.rewriteSourceMappingURL(sourceMappingURLBase))
			.pipe(jsFilter.restore)
			.pipe(createAsar(path.join(process.cwd(), 'node_modules'), [
				'**/*.node',
				'**/@vscode/ripgrep/bin/*',
				'**/node-pty/build/Release/*',
				'**/node-pty/build/Release/conpty/*',
				'**/node-pty/lib/worker/conoutSocketWorker.js',
				'**/node-pty/lib/shared/conout.js',
				'**/*.wasm',
				'**/@vscode/vsce-sign/bin/*',
			], [
				'**/*.mk',
				'!node_modules/vsda/**' // stay compatible with extensions that depend on us shipping `vsda` into ASAR
			], [
				'node_modules/vsda/**' // retain copy of `vsda` in node_modules for internal use
			], 'node_modules.asar'));

		let all = es.merge(
			packageJsonStream,
			productJsonStream,
			license,
			api,
			telemetry,
			sources,
			deps
		);

		if (platform === 'win32') {
			all = es.merge(all, gulp.src([
				'resources/win32/bower.ico',
				'resources/win32/c.ico',
				'resources/win32/config.ico',
				'resources/win32/cpp.ico',
				'resources/win32/csharp.ico',
				'resources/win32/css.ico',
				'resources/win32/default.ico',
				'resources/win32/go.ico',
				'resources/win32/html.ico',
				'resources/win32/jade.ico',
				'resources/win32/java.ico',
				'resources/win32/javascript.ico',
				'resources/win32/json.ico',
				'resources/win32/less.ico',
				'resources/win32/markdown.ico',
				'resources/win32/php.ico',
				'resources/win32/powershell.ico',
				'resources/win32/python.ico',
				'resources/win32/react.ico',
				'resources/win32/ruby.ico',
				'resources/win32/sass.ico',
				'resources/win32/shell.ico',
				'resources/win32/sql.ico',
				'resources/win32/typescript.ico',
				'resources/win32/vue.ico',
				'resources/win32/xml.ico',
				'resources/win32/yaml.ico',
				'resources/win32/code_70x70.png',
				'resources/win32/code_150x150.png'
			], { base: '.' }));
		} else if (platform === 'linux') {
			all = es.merge(all, gulp.src('resources/linux/code.png', { base: '.' }));
		} else if (platform === 'darwin') {
			const shortcut = gulp.src('resources/darwin/bin/code.sh')
				.pipe(replace('@@APPNAME@@', product.applicationName))
				.pipe(rename('bin/code'));
			const policyDest = gulp.src('.build/policies/darwin/**', { base: '.build/policies/darwin' })
				.pipe(rename(f => f.dirname = `policies/${f.dirname}`));
			all = es.merge(all, shortcut, policyDest);
		}

		let result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions())
			.pipe(filter(['**', '!**/.github/**'], { dot: true })) // https://github.com/microsoft/vscode/issues/116523
			.pipe(electron({ ...config, platform, arch: arch === 'armhf' ? 'arm' : arch, ffmpegChromium: false }))
			.pipe(filter(['**', '!LICENSE', '!version'], { dot: true }));

		if (platform === 'linux') {
			result = es.merge(result, gulp.src('resources/completions/bash/code', { base: '.' })
				.pipe(replace('@@APPNAME@@', product.applicationName))
				.pipe(rename(function (f) { f.basename = product.applicationName; })));

			result = es.merge(result, gulp.src('resources/completions/zsh/_code', { base: '.' })
				.pipe(replace('@@APPNAME@@', product.applicationName))
				.pipe(rename(function (f) { f.basename = '_' + product.applicationName; })));
		}

		if (platform === 'win32') {
			result = es.merge(result, gulp.src('resources/win32/bin/code.js', { base: 'resources/win32', allowEmpty: true }));

			result = es.merge(result, gulp.src('resources/win32/bin/code.cmd', { base: 'resources/win32' })
				.pipe(replace('@@NAME@@', product.nameShort))
				.pipe(rename(function (f) { f.basename = product.applicationName; })));

			result = es.merge(result, gulp.src('resources/win32/bin/code.sh', { base: 'resources/win32' })
				.pipe(replace('@@NAME@@', product.nameShort))
				.pipe(replace('@@PRODNAME@@', product.nameLong))
				.pipe(replace('@@VERSION@@', version))
				.pipe(replace('@@COMMIT@@', commit))
				.pipe(replace('@@APPNAME@@', product.applicationName))
				.pipe(replace('@@SERVERDATAFOLDER@@', product.serverDataFolderName || '.vscode-remote'))
				.pipe(replace('@@QUALITY@@', quality))
				.pipe(rename(function (f) { f.basename = product.applicationName; f.extname = ''; })));

			result = es.merge(result, gulp.src('resources/win32/VisualElementsManifest.xml', { base: 'resources/win32' })
				.pipe(rename(product.nameShort + '.VisualElementsManifest.xml')));

			result = es.merge(result, gulp.src('.build/policies/win32/**', { base: '.build/policies/win32' })
				.pipe(rename(f => f.dirname = `policies/${f.dirname}`)));

			if (quality === 'stable' || quality === 'insider') {
				result = es.merge(result, gulp.src('.build/win32/appx/**', { base: '.build/win32' }));
				const rawVersion = version.replace(/-\w+$/, '').split('.');
				const appxVersion = `${rawVersion[0]}.0.${rawVersion[1]}.${rawVersion[2]}`;
				result = es.merge(result, gulp.src('resources/win32/appx/AppxManifest.xml', { base: '.' })
					.pipe(replace('@@AppxPackageName@@', product.win32AppUserModelId))
					.pipe(replace('@@AppxPackageVersion@@', appxVersion))
					.pipe(replace('@@AppxPackageDisplayName@@', product.nameLong))
					.pipe(replace('@@AppxPackageDescription@@', product.win32NameVersion))
					.pipe(replace('@@ApplicationIdShort@@', product.win32RegValueName))
					.pipe(replace('@@ApplicationExe@@', product.nameShort + '.exe'))
					.pipe(replace('@@FileExplorerContextMenuID@@', quality === 'stable' ? 'OpenWithCode' : 'OpenWithCodeInsiders'))
					.pipe(replace('@@FileExplorerContextMenuCLSID@@', product.win32ContextMenu[arch].clsid))
					.pipe(replace('@@FileExplorerContextMenuDLL@@', `${quality === 'stable' ? 'code' : 'code_insider'}_explorer_command_${arch}.dll`))
					.pipe(rename(f => f.dirname = `appx/manifest`)));
			}
		} else if (platform === 'linux') {
			result = es.merge(result, gulp.src('resources/linux/bin/code.sh', { base: '.' })
				.pipe(replace('@@PRODNAME@@', product.nameLong))
				.pipe(replace('@@APPNAME@@', product.applicationName))
				.pipe(rename('bin/' + product.applicationName)));
		}

		result = inlineMeta(result, {
			targetPaths: bootstrapEntryPoints,
			packageJsonFn: () => packageJsonContents,
			productJsonFn: () => productJsonContents
		});

		return result.pipe(vfs.dest(destination));
	};
	task.taskName = `package-${platform}-${arch}`;
	return task;
}

function patchWin32DependenciesTask(destinationFolderName) {
	const cwd = path.join(path.dirname(root), destinationFolderName);

	return async () => {
		const deps = await glob('**/*.node', { cwd, ignore: 'extensions/node_modules/@parcel/watcher/**' });
		const packageJson = JSON.parse(await fs.promises.readFile(path.join(cwd, 'resources', 'app', 'package.json'), 'utf8'));
		const product = JSON.parse(await fs.promises.readFile(path.join(cwd, 'resources', 'app', 'product.json'), 'utf8'));
		const baseVersion = packageJson.version.replace(/-.*$/, '');

		await Promise.all(deps.map(async dep => {
			const basename = path.basename(dep);

			await rcedit(path.join(cwd, dep), {
				'file-version': baseVersion,
				'version-string': {
					'CompanyName': 'Microsoft Corporation',
					'FileDescription': product.nameLong,
					'FileVersion': packageJson.version,
					'InternalName': basename,
					'LegalCopyright': 'Copyright (C) 2022 Microsoft. All rights reserved',
					'OriginalFilename': basename,
					'ProductName': product.nameLong,
					'ProductVersion': packageJson.version,
				}
			});
		}));
	};
}

const buildRoot = path.dirname(root);

const BUILD_TARGETS = [
	{ platform: 'win32', arch: 'x64' },
	{ platform: 'win32', arch: 'arm64' },
	{ platform: 'darwin', arch: 'x64', opts: { stats: true } },
	{ platform: 'darwin', arch: 'arm64', opts: { stats: true } },
	{ platform: 'linux', arch: 'x64' },
	{ platform: 'linux', arch: 'armhf' },
	{ platform: 'linux', arch: 'arm64' },
];
BUILD_TARGETS.forEach(buildTarget => {
	const dashed = (str) => (str ? `-${str}` : ``);
	const platform = buildTarget.platform;
	const arch = buildTarget.arch;
	const opts = buildTarget.opts;

	const [vscode, vscodeMin] = ['', 'min'].map(minified => {
		const sourceFolderName = `out-vscode${dashed(minified)}`;
		const destinationFolderName = `VSCode${dashed(platform)}${dashed(arch)}`;

		const tasks = [
			compileNativeExtensionsBuildTask,
			util.rimraf(path.join(buildRoot, destinationFolderName)),
			packageTask(platform, arch, sourceFolderName, destinationFolderName, opts)
		];

		if (platform === 'win32') {
			tasks.push(patchWin32DependenciesTask(destinationFolderName));
		}

		const vscodeTaskCI = task.define(`vscode${dashed(platform)}${dashed(arch)}${dashed(minified)}-ci`, task.series(...tasks));
		gulp.task(vscodeTaskCI);

		const vscodeTask = task.define(`vscode${dashed(platform)}${dashed(arch)}${dashed(minified)}`, task.series(
			minified ? compileBuildWithManglingTask : compileBuildWithoutManglingTask,
			cleanExtensionsBuildTask,
			compileNonNativeExtensionsBuildTask,
			compileExtensionMediaBuildTask,
			minified ? minifyVSCodeTask : bundleVSCodeTask,
			vscodeTaskCI
		));
		gulp.task(vscodeTask);

		return vscodeTask;
	});

	if (process.platform === platform && process.arch === arch) {
		gulp.task(task.define('vscode', task.series(vscode)));
		gulp.task(task.define('vscode-min', task.series(vscodeMin)));
	}
});

// #region nls

const innoSetupConfig = {
	'zh-cn': { codePage: 'CP936', defaultInfo: { name: 'Simplified Chinese', id: '$0804', } },
	'zh-tw': { codePage: 'CP950', defaultInfo: { name: 'Traditional Chinese', id: '$0404' } },
	'ko': { codePage: 'CP949', defaultInfo: { name: 'Korean', id: '$0412' } },
	'ja': { codePage: 'CP932' },
	'de': { codePage: 'CP1252' },
	'fr': { codePage: 'CP1252' },
	'es': { codePage: 'CP1252' },
	'ru': { codePage: 'CP1251' },
	'it': { codePage: 'CP1252' },
	'pt-br': { codePage: 'CP1252' },
	'hu': { codePage: 'CP1250' },
	'tr': { codePage: 'CP1254' }
};

gulp.task(task.define(
	'vscode-translations-export',
	task.series(
		coreCI,
		compileAllExtensionsBuildTask,
		function () {
			const pathToMetadata = './out-build/nls.metadata.json';
			const pathToExtensions = '.build/extensions/*';
			const pathToSetup = 'build/win32/i18n/messages.en.isl';

			return es.merge(
				gulp.src(pathToMetadata).pipe(i18n.createXlfFilesForCoreBundle()),
				gulp.src(pathToSetup).pipe(i18n.createXlfFilesForIsl()),
				gulp.src(pathToExtensions).pipe(i18n.createXlfFilesForExtensions())
			).pipe(vfs.dest('../vscode-translations-export'));
		}
	)
));

gulp.task('vscode-translations-import', function () {
	const options = minimist(process.argv.slice(2), {
		string: 'location',
		default: {
			location: '../vscode-translations-import'
		}
	});
	return es.merge([...i18n.defaultLanguages, ...i18n.extraLanguages].map(language => {
		const id = language.id;
		return gulp.src(`${options.location}/${id}/vscode-setup/messages.xlf`)
			.pipe(i18n.prepareIslFiles(language, innoSetupConfig[language.id]))
			.pipe(vfs.dest(`./build/win32/i18n`));
	}));
});

// #endregion
