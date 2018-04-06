/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const path = require('path');
const es = require('event-stream');
const azure = require('gulp-azure-storage');
const electron = require('gulp-atom-electron');
const vfs = require('vinyl-fs');
const rename = require('gulp-rename');
const replace = require('gulp-replace');
const filter = require('gulp-filter');
const buffer = require('gulp-buffer');
const json = require('gulp-json-editor');
const _ = require('underscore');
const util = require('./lib/util');
const ext = require('./lib/extensions');
const buildfile = require('../src/buildfile');
const common = require('./lib/optimize');
const nlsDev = require('vscode-nls-dev');
const root = path.dirname(__dirname);
const commit = util.getVersion(root);
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const packageJson = require('../package.json');
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const product = require('../product.json');
const crypto = require('crypto');
const i18n = require('./lib/i18n');
const glob = require('glob');
const deps = require('./dependencies');
const getElectronVersion = require('./lib/electron').getElectronVersion;
const createAsar = require('./lib/asar').createAsar;

const productionDependencies = deps.getProductionDependencies(path.dirname(__dirname));
// @ts-ignore
const baseModules = Object.keys(process.binding('natives')).filter(n => !/^_|\//.test(n));
const nodeModules = ['electron', 'original-fs']
	.concat(Object.keys(product.dependencies || {}))
	.concat(_.uniq(productionDependencies.map(d => d.name)))
	.concat(baseModules);

// Build
// @ts-ignore Microsoft/TypeScript#21262 complains about a require of a JSON file
const builtInExtensions = require('./builtInExtensions.json');

const excludedExtensions = [
	'vscode-api-tests',
	'vscode-colorize-tests',
	'ms-vscode.node-debug',
	'ms-vscode.node-debug2',
];

const vscodeEntryPoints = _.flatten([
	buildfile.entrypoint('vs/workbench/workbench.main'),
	buildfile.base,
	buildfile.workbench,
	buildfile.code
]);

const vscodeResources = [
	'out-build/main.js',
	'out-build/cli.js',
	'out-build/bootstrap.js',
	'out-build/bootstrap-amd.js',
	'out-build/paths.js',
	'out-build/vs/**/*.{svg,png,cur,html}',
	'out-build/vs/base/common/performance.js',
	'out-build/vs/base/node/{stdForkStart.js,terminateProcess.sh,ps-win.ps1}',
	'out-build/vs/base/browser/ui/octiconLabel/octicons/**',
	'out-build/vs/workbench/browser/media/*-theme.css',
	'out-build/vs/workbench/electron-browser/bootstrap/**',
	'out-build/vs/workbench/parts/debug/**/*.json',
	'out-build/vs/workbench/parts/execution/**/*.scpt',
	'out-build/vs/workbench/parts/webview/electron-browser/webview-pre.js',
	'out-build/vs/**/markdown.css',
	'out-build/vs/workbench/parts/tasks/**/*.json',
	'out-build/vs/workbench/parts/terminal/electron-browser/terminalProcess.js',
	'out-build/vs/workbench/parts/welcome/walkThrough/**/*.md',
	'out-build/vs/workbench/services/files/**/*.exe',
	'out-build/vs/workbench/services/files/**/*.md',
	'out-build/vs/code/electron-browser/sharedProcess/sharedProcess.js',
	'out-build/vs/code/electron-browser/issue/issueReporter.js',
	'!**/test/**'
];

const BUNDLED_FILE_HEADER = [
	'/*!--------------------------------------------------------',
	' * Copyright (C) Microsoft Corporation. All rights reserved.',
	' *--------------------------------------------------------*/'
].join('\n');

const languages = i18n.defaultLanguages.concat([]);  // i18n.defaultLanguages.concat(process.env.VSCODE_QUALITY !== 'stable' ? i18n.extraLanguages : []);

gulp.task('clean-optimized-vscode', util.rimraf('out-vscode'));
gulp.task('optimize-vscode', ['clean-optimized-vscode', 'compile-build', 'compile-extensions-build'], common.optimizeTask({
	entryPoints: vscodeEntryPoints,
	otherSources: [],
	resources: vscodeResources,
	loaderConfig: common.loaderConfig(nodeModules),
	header: BUNDLED_FILE_HEADER,
	out: 'out-vscode',
	languages: languages,
	bundleInfo: undefined
}));


gulp.task('optimize-index-js', ['optimize-vscode'], () => {
	const fullpath = path.join(process.cwd(), 'out-vscode/vs/workbench/electron-browser/bootstrap/index.js');
	const contents = fs.readFileSync(fullpath).toString();
	const newContents = contents.replace('[/*BUILD->INSERT_NODE_MODULES*/]', JSON.stringify(nodeModules));
	fs.writeFileSync(fullpath, newContents);
});

const baseUrl = `https://ticino.blob.core.windows.net/sourcemaps/${commit}/core`;
gulp.task('clean-minified-vscode', util.rimraf('out-vscode-min'));
gulp.task('minify-vscode', ['clean-minified-vscode', 'optimize-index-js'], common.minifyTask('out-vscode', baseUrl));

// Package
const darwinCreditsTemplate = product.darwinCredits && _.template(fs.readFileSync(path.join(root, product.darwinCredits), 'utf8'));

const config = {
	version: getElectronVersion(),
	productAppName: product.nameLong,
	companyName: 'Microsoft Corporation',
	copyright: 'Copyright (C) 2018 Microsoft. All rights reserved',
	darwinIcon: 'resources/darwin/code.icns',
	darwinBundleIdentifier: product.darwinBundleIdentifier,
	darwinApplicationCategoryType: 'public.app-category.developer-tools',
	darwinHelpBookFolder: 'VS Code HelpBook',
	darwinHelpBookName: 'VS Code HelpBook',
	darwinBundleDocumentTypes: [{
		name: product.nameLong + ' document',
		role: 'Editor',
		ostypes: ["TEXT", "utxt", "TUTX", "****"],
		extensions: ["ascx", "asp", "aspx", "bash", "bash_login", "bash_logout", "bash_profile", "bashrc", "bat", "bowerrc", "c", "cc", "clj", "cljs", "cljx", "clojure", "cmd", "code-workspace", "coffee", "config", "cpp", "cs", "cshtml", "csproj", "css", "csx", "ctp", "cxx", "dockerfile", "dot", "dtd", "editorconfig", "edn", "eyaml", "eyml", "fs", "fsi", "fsscript", "fsx", "gemspec", "gitattributes", "gitconfig", "gitignore", "go", "h", "handlebars", "hbs", "hh", "hpp", "htm", "html", "hxx", "ini", "jade", "jav", "java", "js", "jscsrc", "jshintrc", "jshtm", "json", "jsp", "less", "lua", "m", "makefile", "markdown", "md", "mdoc", "mdown", "mdtext", "mdtxt", "mdwn", "mkd", "mkdn", "ml", "mli", "php", "phtml", "pl", "pl6", "pm", "pm6", "pod", "pp", "profile", "properties", "ps1", "psd1", "psgi", "psm1", "py", "r", "rb", "rhistory", "rprofile", "rs", "rt", "scss", "sh", "shtml", "sql", "svg", "svgz", "t", "ts", "txt", "vb", "wxi", "wxl", "wxs", "xaml", "xcodeproj", "xcworkspace", "xml", "yaml", "yml", "zlogin", "zlogout", "zprofile", "zsh", "zshenv", "zshrc"],
		iconFile: 'resources/darwin/code_file.icns'
	}],
	darwinBundleURLTypes: [{
		role: 'Viewer',
		name: product.nameLong,
		urlSchemes: [product.urlProtocol]
	}],
	darwinCredits: darwinCreditsTemplate ? Buffer.from(darwinCreditsTemplate({ commit: commit, date: new Date().toISOString() })) : void 0,
	linuxExecutableName: product.applicationName,
	winIcon: 'resources/win32/code.ico',
	token: process.env['VSCODE_MIXIN_PASSWORD'] || process.env['GITHUB_TOKEN'] || void 0,
	repo: product.electronRepository || void 0
};

function getElectron(arch) {
	return () => {
		const electronOpts = _.extend({}, config, {
			platform: process.platform,
			arch,
			ffmpegChromium: true,
			keepDefaultApp: true
		});

		return gulp.src('package.json')
			.pipe(json({ name: product.nameShort }))
			.pipe(electron(electronOpts))
			.pipe(filter(['**', '!**/app/package.json']))
			.pipe(vfs.dest('.build/electron'));
	};
}

gulp.task('clean-electron', util.rimraf('.build/electron'));
gulp.task('electron', ['clean-electron'], getElectron(process.arch));
gulp.task('electron-ia32', ['clean-electron'], getElectron('ia32'));
gulp.task('electron-x64', ['clean-electron'], getElectron('x64'));


/**
 * Compute checksums for some files.
 *
 * @param {string} out The out folder to read the file from.
 * @param {string[]} filenames The paths to compute a checksum for.
 * @return {Object} A map of paths to checksums.
 */
function computeChecksums(out, filenames) {
	var result = {};
	filenames.forEach(function (filename) {
		var fullPath = path.join(process.cwd(), out, filename);
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
	var contents = fs.readFileSync(filename);

	var hash = crypto
		.createHash('md5')
		.update(contents)
		.digest('base64')
		.replace(/=+$/, '');

	return hash;
}

function packageTask(platform, arch, opts) {
	opts = opts || {};

	const destination = path.join(path.dirname(root), 'VSCode') + (platform ? '-' + platform : '') + (arch ? '-' + arch : '');
	platform = platform || process.platform;

	return () => {
		const out = opts.minified ? 'out-vscode-min' : 'out-vscode';

		const checksums = computeChecksums(out, [
			'vs/workbench/workbench.main.js',
			'vs/workbench/workbench.main.css',
			'vs/workbench/electron-browser/bootstrap/index.html',
			'vs/workbench/electron-browser/bootstrap/index.js',
			'vs/workbench/electron-browser/bootstrap/preload.js'
		]);

		const src = gulp.src(out + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + out), 'out'); }));

		const root = path.resolve(path.join(__dirname, '..'));
		const localExtensionDescriptions = glob.sync('extensions/*/package.json')
			.map(manifestPath => {
				const extensionPath = path.dirname(path.join(root, manifestPath));
				const extensionName = path.basename(extensionPath);
				return { name: extensionName, path: extensionPath };
			})
			.filter(({ name }) => excludedExtensions.indexOf(name) === -1)
			.filter(({ name }) => builtInExtensions.every(b => b.name !== name));

		const localExtensions = es.merge(...localExtensionDescriptions.map(extension => {
			const nlsFilter = filter('**/*.nls.json', { restore: true });

			return ext.fromLocal(extension.path)
				.pipe(rename(p => p.dirname = `extensions/${extension.name}/${p.dirname}`))
				// 	// TODO@Dirk: this filter / buffer is here to make sure the nls.json files are buffered
				.pipe(nlsFilter)
				.pipe(buffer())
				.pipe(nlsDev.createAdditionalLanguageFiles(languages, path.join(__dirname, '..', 'i18n')))
				.pipe(nlsFilter.restore);
		}));

		const localExtensionDependencies = gulp.src('extensions/node_modules/**', { base: '.' });

		const marketplaceExtensions = es.merge(...builtInExtensions.map(extension => {
			return ext.fromMarketplace(extension.name, extension.version)
				.pipe(rename(p => p.dirname = `extensions/${extension.name}/${p.dirname}`));
		}));

		const sources = es.merge(src, localExtensions, localExtensionDependencies, marketplaceExtensions)
			.pipe(util.setExecutableBit(['**/*.sh']))
			.pipe(filter(['**', '!**/*.js.map']));

		let version = packageJson.version;
		const quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['package.json'], { base: '.' })
			.pipe(json({ name, version }));

		const settingsSearchBuildId = getSettingsSearchBuildId(packageJson);
		const date = new Date().toISOString();
		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(json({ commit, date, checksums, settingsSearchBuildId }));

		const license = gulp.src(['LICENSES.chromium.html', 'LICENSE.txt', 'ThirdPartyNotices.txt', 'licenses/**'], { base: '.' });

		const watermark = gulp.src(['resources/letterpress.svg', 'resources/letterpress-dark.svg', 'resources/letterpress-hc.svg'], { base: '.' });

		// TODO the API should be copied to `out` during compile, not here
		const api = gulp.src('src/vs/vscode.d.ts').pipe(rename('out/vs/vscode.d.ts'));

		const depsSrc = [
			..._.flatten(productionDependencies.map(d => path.relative(root, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`])),
			..._.flatten(Object.keys(product.dependencies || {}).map(d => [`node_modules/${d}/**`, `!node_modules/${d}/**/{test,tests}/**`]))
		];

		const deps = gulp.src(depsSrc, { base: '.', dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModule('fsevents', ['binding.gyp', 'fsevents.cc', 'build/**', 'src/**', 'test/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('oniguruma', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], ['**/*.node', 'src/*.js']))
			.pipe(util.cleanNodeModule('windows-mutex', ['binding.gyp', 'build/**', 'src/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('native-keymap', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('native-is-elevated', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('native-watchdog', ['binding.gyp', 'build/**', 'src/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('spdlog', ['binding.gyp', 'build/**', 'deps/**', 'src/**', 'test/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('jschardet', ['dist/**']))
			.pipe(util.cleanNodeModule('windows-foreground-love', ['binding.gyp', 'build/**', 'src/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('windows-process-tree', ['binding.gyp', 'build/**', 'src/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('gc-signals', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], ['**/*.node', 'src/index.js']))
			.pipe(util.cleanNodeModule('keytar', ['binding.gyp', 'build/**', 'src/**', 'script/**', 'node_modules/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('node-pty', ['binding.gyp', 'build/**', 'src/**', 'tools/**'], ['build/Release/*.exe', 'build/Release/*.dll', 'build/Release/*.node']))
			.pipe(util.cleanNodeModule('vscode-nsfw', ['binding.gyp', 'build/**', 'src/**', 'openpa/**', 'includes/**'], ['**/*.node', '**/*.a']))
			.pipe(util.cleanNodeModule('vsda', ['binding.gyp', 'README.md', 'build/**', '*.bat', '*.sh', '*.cpp', '*.h'], ['build/Release/vsda.node']))
			.pipe(createAsar(path.join(process.cwd(), 'node_modules'), ['**/*.node', '**/vscode-ripgrep/bin/*', '**/node-pty/build/Release/*'], 'app/node_modules.asar'));

		let all = es.merge(
			packageJsonStream,
			productJsonStream,
			license,
			watermark,
			api,
			sources,
			deps
		);

		if (platform === 'win32') {
			all = es.merge(all, gulp.src(['resources/win32/code_file.ico', 'resources/win32/code_70x70.png', 'resources/win32/code_150x150.png'], { base: '.' }));
		} else if (platform === 'linux') {
			all = es.merge(all, gulp.src('resources/linux/code.png', { base: '.' }));
		} else if (platform === 'darwin') {
			const shortcut = gulp.src('resources/darwin/bin/code.sh')
				.pipe(rename('bin/code'));

			all = es.merge(all, shortcut);
		}

		let result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions())
			.pipe(electron(_.extend({}, config, { platform, arch, ffmpegChromium: true })))
			.pipe(filter(['**', '!LICENSE', '!LICENSES.chromium.html', '!version']));

		if (platform === 'win32') {
			result = es.merge(result, gulp.src('resources/win32/bin/code.js', { base: 'resources/win32' }));

			result = es.merge(result, gulp.src('resources/win32/bin/code.cmd', { base: 'resources/win32' })
				.pipe(replace('@@NAME@@', product.nameShort))
				.pipe(rename(function (f) { f.basename = product.applicationName; })));

			result = es.merge(result, gulp.src('resources/win32/bin/code.sh', { base: 'resources/win32' })
				.pipe(replace('@@NAME@@', product.nameShort))
				.pipe(rename(function (f) { f.basename = product.applicationName; f.extname = ''; })));

			result = es.merge(result, gulp.src('resources/win32/VisualElementsManifest.xml', { base: 'resources/win32' })
				.pipe(rename(product.nameShort + '.VisualElementsManifest.xml')));
		} else if (platform === 'linux') {
			result = es.merge(result, gulp.src('resources/linux/bin/code.sh', { base: '.' })
				.pipe(replace('@@NAME@@', product.applicationName))
				.pipe(rename('bin/' + product.applicationName)));
		}

		return result.pipe(vfs.dest(destination));
	};
}

const buildRoot = path.dirname(root);

gulp.task('clean-vscode-win32-ia32', util.rimraf(path.join(buildRoot, 'VSCode-win32-ia32')));
gulp.task('clean-vscode-win32-x64', util.rimraf(path.join(buildRoot, 'VSCode-win32-x64')));
gulp.task('clean-vscode-darwin', util.rimraf(path.join(buildRoot, 'VSCode-darwin')));
gulp.task('clean-vscode-linux-ia32', util.rimraf(path.join(buildRoot, 'VSCode-linux-ia32')));
gulp.task('clean-vscode-linux-x64', util.rimraf(path.join(buildRoot, 'VSCode-linux-x64')));
gulp.task('clean-vscode-linux-arm', util.rimraf(path.join(buildRoot, 'VSCode-linux-arm')));

gulp.task('vscode-win32-ia32', ['optimize-vscode', 'clean-vscode-win32-ia32'], packageTask('win32', 'ia32'));
gulp.task('vscode-win32-x64', ['optimize-vscode', 'clean-vscode-win32-x64'], packageTask('win32', 'x64'));
gulp.task('vscode-darwin', ['optimize-vscode', 'clean-vscode-darwin'], packageTask('darwin'));
gulp.task('vscode-linux-ia32', ['optimize-vscode', 'clean-vscode-linux-ia32'], packageTask('linux', 'ia32'));
gulp.task('vscode-linux-x64', ['optimize-vscode', 'clean-vscode-linux-x64'], packageTask('linux', 'x64'));
gulp.task('vscode-linux-arm', ['optimize-vscode', 'clean-vscode-linux-arm'], packageTask('linux', 'arm'));

gulp.task('vscode-win32-ia32-min', ['minify-vscode', 'clean-vscode-win32-ia32'], packageTask('win32', 'ia32', { minified: true }));
gulp.task('vscode-win32-x64-min', ['minify-vscode', 'clean-vscode-win32-x64'], packageTask('win32', 'x64', { minified: true }));
gulp.task('vscode-darwin-min', ['minify-vscode', 'clean-vscode-darwin'], packageTask('darwin', null, { minified: true }));
gulp.task('vscode-linux-ia32-min', ['minify-vscode', 'clean-vscode-linux-ia32'], packageTask('linux', 'ia32', { minified: true }));
gulp.task('vscode-linux-x64-min', ['minify-vscode', 'clean-vscode-linux-x64'], packageTask('linux', 'x64', { minified: true }));
gulp.task('vscode-linux-arm-min', ['minify-vscode', 'clean-vscode-linux-arm'], packageTask('linux', 'arm', { minified: true }));

// Transifex Localizations

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

const apiHostname = process.env.TRANSIFEX_API_URL;
const apiName = process.env.TRANSIFEX_API_NAME;
const apiToken = process.env.TRANSIFEX_API_TOKEN;

gulp.task('vscode-translations-push', ['optimize-vscode'], function () {
	const pathToMetadata = './out-vscode/nls.metadata.json';
	const pathToExtensions = './extensions/*';
	const pathToSetup = 'build/win32/**/{Default.isl,messages.en.isl}';

	return es.merge(
		gulp.src(pathToMetadata).pipe(i18n.createXlfFilesForCoreBundle()),
		gulp.src(pathToSetup).pipe(i18n.createXlfFilesForIsl()),
		gulp.src(pathToExtensions).pipe(i18n.createXlfFilesForExtensions())
	).pipe(i18n.findObsoleteResources(apiHostname, apiName, apiToken)
	).pipe(i18n.pushXlfFiles(apiHostname, apiName, apiToken));
});

gulp.task('vscode-translations-push-test', ['optimize-vscode'], function () {
	const pathToMetadata = './out-vscode/nls.metadata.json';
	const pathToExtensions = './extensions/*';
	const pathToSetup = 'build/win32/**/{Default.isl,messages.en.isl}';

	return es.merge(
		gulp.src(pathToMetadata).pipe(i18n.createXlfFilesForCoreBundle()),
		gulp.src(pathToSetup).pipe(i18n.createXlfFilesForIsl()),
		gulp.src(pathToExtensions).pipe(i18n.createXlfFilesForExtensions())
	).pipe(i18n.findObsoleteResources(apiHostname, apiName, apiToken)
	).pipe(vfs.dest('../vscode-transifex-input'));
});

gulp.task('vscode-translations-pull', function () {
	[...i18n.defaultLanguages, ...i18n.extraLanguages].forEach(language => {
		i18n.pullCoreAndExtensionsXlfFiles(apiHostname, apiName, apiToken, language).pipe(vfs.dest(`../vscode-localization/${language.id}/build`));

		let includeDefault = !!innoSetupConfig[language.id].defaultInfo;
		i18n.pullSetupXlfFiles(apiHostname, apiName, apiToken, language, includeDefault).pipe(vfs.dest(`../vscode-localization/${language.id}/setup`));
	});
});

gulp.task('vscode-translations-import', function () {
	[...i18n.defaultLanguages, ...i18n.extraLanguages].forEach(language => {
		gulp.src(`../vscode-localization/${language.id}/build/*/*.xlf`)
			.pipe(i18n.prepareI18nFiles())
			.pipe(vfs.dest(`./i18n/${language.folderName}`));
		gulp.src(`../vscode-localization/${language.id}/setup/*/*.xlf`)
			.pipe(i18n.prepareIslFiles(language, innoSetupConfig[language.id]))
			.pipe(vfs.dest(`./build/win32/i18n`));
	});
});

// Sourcemaps

gulp.task('upload-vscode-sourcemaps', ['minify-vscode'], () => {
	const vs = gulp.src('out-vscode-min/**/*.map', { base: 'out-vscode-min' })
		.pipe(es.mapSync(f => {
			f.path = `${f.base}/core/${f.relative}`;
			return f;
		}));

	const extensions = gulp.src('extensions/**/out/**/*.map', { base: '.' });

	return es.merge(vs, extensions)
		.pipe(azure.upload({
			account: process.env.AZURE_STORAGE_ACCOUNT,
			key: process.env.AZURE_STORAGE_ACCESS_KEY,
			container: 'sourcemaps',
			prefix: commit + '/'
		}));
});

const allConfigDetailsPath = path.join(os.tmpdir(), 'configuration.json');
gulp.task('upload-vscode-configuration', ['generate-vscode-configuration'], () => {
	const branch = process.env.BUILD_SOURCEBRANCH;

	if (!/\/master$/.test(branch) && branch.indexOf('/release/') < 0) {
		console.log(`Only runs on master and release branches, not ${branch}`);
		return;
	}

	if (!fs.existsSync(allConfigDetailsPath)) {
		throw new Error(`configuration file at ${allConfigDetailsPath} does not exist`);
	}

	const settingsSearchBuildId = getSettingsSearchBuildId(packageJson);
	if (!settingsSearchBuildId) {
		throw new Error('Failed to compute build number');
	}

	return gulp.src(allConfigDetailsPath)
		.pipe(azure.upload({
			account: process.env.AZURE_STORAGE_ACCOUNT,
			key: process.env.AZURE_STORAGE_ACCESS_KEY,
			container: 'configuration',
			prefix: `${settingsSearchBuildId}/${commit}/`
		}));
});

function getSettingsSearchBuildId(packageJson) {
	const previous = util.getPreviousVersion(packageJson.version);

	try {
		const out = cp.execSync(`git rev-list ${previous}..HEAD --count`);
		const count = parseInt(out.toString());
		return util.versionStringToNumber(packageJson.version) * 1e4 + count;
	} catch (e) {
		throw new Error('Could not determine build number: ' + e.toString());
	}
}

// This task is only run for the MacOS build
gulp.task('generate-vscode-configuration', () => {
	return new Promise((resolve, reject) => {
		const buildDir = process.env['AGENT_BUILDDIRECTORY'];
		if (!buildDir) {
			return reject(new Error('$AGENT_BUILDDIRECTORY not set'));
		}

		const userDataDir = path.join(os.tmpdir(), 'tmpuserdata');
		const extensionsDir = path.join(os.tmpdir(), 'tmpextdir');
		const appName = process.env.VSCODE_QUALITY === 'insider' ? 'Visual\\ Studio\\ Code\\ -\\ Insiders.app' : 'Visual\\ Studio\\ Code.app';
		const appPath = path.join(buildDir, `VSCode-darwin/${appName}/Contents/Resources/app/bin/code`);
		const codeProc = cp.exec(`${appPath} --export-default-configuration='${allConfigDetailsPath}' --wait --user-data-dir='${userDataDir}' --extensions-dir='${extensionsDir}'`);

		const timer = setTimeout(() => {
			codeProc.kill();
			reject(new Error('export-default-configuration process timed out'));
		}, 10 * 1000);

		codeProc.stdout.on('data', d => console.log(d.toString()));
		codeProc.stderr.on('data', d => console.log(d.toString()));

		codeProc.on('exit', () => {
			clearTimeout(timer);
			resolve();
		});

		codeProc.on('error', err => {
			clearTimeout(timer);
			reject(err);
		});
	});
});
