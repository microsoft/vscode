/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const fs = require('fs');
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
const packageJson = require('../package.json');
const product = require('../product.json');
const shrinkwrap = require('../npm-shrinkwrap.json');
const crypto = require('crypto');

const dependencies = Object.keys(shrinkwrap.dependencies)
	.concat(Array.isArray(product.extraNodeModules) ? product.extraNodeModules : []); // additional dependencies from our product configuration
const baseModules = Object.keys(process.binding('natives')).filter(n => !/^_|\//.test(n));
const nodeModules = ['electron', 'original-fs']
	.concat(dependencies)
	.concat(baseModules);

// Build

const builtInExtensions = [
	{ name: 'ms-vscode.node-debug', version: '1.10.1' },
	{ name: 'ms-vscode.node-debug2', version: '1.9.12' }
];

const vscodeEntryPoints = _.flatten([
	buildfile.entrypoint('vs/workbench/electron-browser/workbench.main'),
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
	'out-build/vs/**/*.{svg,png,cur}',
	'out-build/vs/base/node/{stdForkStart.js,terminateProcess.sh}',
	'out-build/vs/base/browser/ui/octiconLabel/octicons/**',
	'out-build/vs/workbench/browser/media/*-theme.css',
	'out-build/vs/workbench/electron-browser/bootstrap/**',
	'out-build/vs/workbench/parts/debug/**/*.json',
	'out-build/vs/workbench/parts/execution/**/*.scpt',
	'out-build/vs/workbench/parts/git/**/*.html',
	'out-build/vs/workbench/parts/git/**/*.sh',
	'out-build/vs/workbench/parts/html/browser/webview.html',
	'out-build/vs/workbench/parts/html/browser/webview-pre.js',
	'out-build/vs/**/markdown.css',
	'out-build/vs/workbench/parts/tasks/**/*.json',
	'out-build/vs/workbench/parts/terminal/electron-browser/terminalProcess.js',
	'out-build/vs/workbench/parts/welcome/walkThrough/**/*.md',
	'out-build/vs/workbench/parts/welcome/page/**/*.html',
	'out-build/vs/workbench/services/files/**/*.exe',
	'out-build/vs/workbench/services/files/**/*.md',
	'!**/test/**'
];

const BUNDLED_FILE_HEADER = [
	'/*!--------------------------------------------------------',
	' * Copyright (C) Microsoft Corporation. All rights reserved.',
	' *--------------------------------------------------------*/'
].join('\n');

gulp.task('clean-optimized-vscode', util.rimraf('out-vscode'));
gulp.task('optimize-vscode', ['clean-optimized-vscode', 'compile-build', 'compile-extensions-build'], common.optimizeTask({
	entryPoints: vscodeEntryPoints,
	otherSources: [],
	resources: vscodeResources,
	loaderConfig: common.loaderConfig(nodeModules),
	header: BUNDLED_FILE_HEADER,
	out: 'out-vscode'
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
	version: packageJson.electronVersion,
	productAppName: product.nameLong,
	companyName: 'Microsoft Corporation',
	copyright: 'Copyright (C) 2017 Microsoft. All rights reserved',
	darwinIcon: 'resources/darwin/code.icns',
	darwinBundleIdentifier: product.darwinBundleIdentifier,
	darwinApplicationCategoryType: 'public.app-category.developer-tools',
	darwinBundleDocumentTypes: [{
		name: product.nameLong + ' document',
		role: 'Editor',
		ostypes: ["TEXT", "utxt", "TUTX", "****"],
		extensions: ["ascx", "asp", "aspx", "bash", "bash_login", "bash_logout", "bash_profile", "bashrc", "bat", "bowerrc", "c", "cc", "clj", "cljs", "cljx", "clojure", "cmd", "coffee", "config", "cpp", "cs", "cshtml", "csproj", "css", "csx", "ctp", "cxx", "dockerfile", "dot", "dtd", "editorconfig", "edn", "eyaml", "eyml", "fs", "fsi", "fsscript", "fsx", "gemspec", "gitattributes", "gitconfig", "gitignore", "go", "h", "handlebars", "hbs", "hh", "hpp", "htm", "html", "hxx", "ini", "jade", "jav", "java", "js", "jscsrc", "jshintrc", "jshtm", "json", "jsp", "less", "lua", "m", "makefile", "markdown", "md", "mdoc", "mdown", "mdtext", "mdtxt", "mdwn", "mkd", "mkdn", "ml", "mli", "php", "phtml", "pl", "pl6", "pm", "pm6", "pod", "pp", "profile", "properties", "ps1", "psd1", "psgi", "psm1", "py", "r", "rb", "rhistory", "rprofile", "rs", "rt", "scss", "sh", "shtml", "sql", "svg", "svgz", "t", "ts", "txt", "vb", "wxi", "wxl", "wxs", "xaml", "xml", "yaml", "yml", "zlogin", "zlogout", "zprofile", "zsh", "zshenv", "zshrc"],
		iconFile: 'resources/darwin/code_file.icns'
	}],
	darwinBundleURLTypes: [{
		role: 'Viewer',
		name: product.nameLong,
		urlSchemes: [product.urlProtocol]
	}],
	darwinCredits: darwinCreditsTemplate ? new Buffer(darwinCreditsTemplate({ commit: commit, date: new Date().toISOString() })) : void 0,
	linuxExecutableName: product.applicationName,
	winIcon: 'resources/win32/code.ico',
	token: process.env['GITHUB_TOKEN'] || void 0
};

gulp.task('clean-electron', util.rimraf('.build/electron'));

gulp.task('electron', ['clean-electron'], () => {
	const platform = process.platform;
	const arch = process.env.VSCODE_ELECTRON_PLATFORM || (platform === 'win32' ? 'ia32' : process.arch);
	const opts = _.extend({}, config, { platform, arch, ffmpegChromium: true, keepDefaultApp: true });
	const name = product.nameShort;

	return gulp.src('package.json')
		.pipe(json({ name }))
		.pipe(electron(opts))
		.pipe(filter(['**', '!**/app/package.json']))
		.pipe(vfs.dest('.build/electron'));
});

const languages = ['chs', 'cht', 'jpn', 'kor', 'deu', 'fra', 'esn', 'rus', 'ita'];

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
	arch = platform === 'win32' ? 'ia32' : arch;

	return () => {
		const out = opts.minified ? 'out-vscode-min' : 'out-vscode';

		const checksums = computeChecksums(out, [
			'vs/workbench/electron-browser/workbench.main.js',
			'vs/workbench/electron-browser/workbench.main.css',
			'vs/workbench/electron-browser/bootstrap/index.html',
			'vs/workbench/electron-browser/bootstrap/index.js'
		]);

		const src = gulp.src(out + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + out), 'out'); }))
			.pipe(util.setExecutableBit(['**/*.sh']));

		const extensionsList = [
			'extensions/*/**',
			'!extensions/*/src/**',
			'!extensions/*/out/**/test/**',
			'!extensions/*/test/**',
			'!extensions/*/build/**',
			'!extensions/**/node_modules/@types/**',
			'!extensions/*/{client,server}/src/**',
			'!extensions/*/{client,server}/test/**',
			'!extensions/*/{client,server}/out/**/test/**',
			'!extensions/*/{client,server}/out/**/typings/**',
			'!extensions/**/.vscode/**',
			'!extensions/**/tsconfig.json',
			'!extensions/typescript/bin/**',
			'!extensions/vscode-api-tests/**',
			'!extensions/vscode-colorize-tests/**',
			...builtInExtensions.map(e => `!extensions/${e.name}/**`)
		];

		const nlsFilter = filter('**/*.nls.json', { restore: true });
		const extensions = gulp.src(extensionsList, { base: '.' })
			// TODO@Dirk: this filter / buffer is here to make sure the nls.json files are buffered
			.pipe(nlsFilter)
			.pipe(buffer())
			.pipe(nlsDev.createAdditionalLanguageFiles(languages, path.join(__dirname, '..', 'i18n')))
			.pipe(nlsFilter.restore);

		const marketplaceExtensions = es.merge(...builtInExtensions.map(extension => {
			return ext.src(extension.name, extension.version)
				.pipe(rename(p => p.dirname = `extensions/${extension.name}/${p.dirname}`));
		}));

		const sources = es.merge(src, extensions, marketplaceExtensions)
			.pipe(filter(['**', '!**/*.js.map']));

		let version = packageJson.version;
		const quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['package.json'], { base: '.' })
			.pipe(json({ name, version }));

		const date = new Date().toISOString();
		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(json({ commit, date, checksums }));

		const license = gulp.src(['LICENSES.chromium.html', 'LICENSE.txt', 'ThirdPartyNotices.txt', 'licenses/**'], { base: '.' });

		// TODO the API should be copied to `out` during compile, not here
		const api = gulp.src('src/vs/vscode.d.ts').pipe(rename('out/vs/vscode.d.ts'));

		const depsSrc = _.flatten(dependencies
			.map(function (d) { return ['node_modules/' + d + '/**', '!node_modules/' + d + '/**/{test,tests}/**']; }));

		const deps = gulp.src(depsSrc, { base: '.', dot: true })
			.pipe(util.cleanNodeModule('fsevents', ['binding.gyp', 'fsevents.cc', 'build/**', 'src/**', 'test/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('oniguruma', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('windows-mutex', ['binding.gyp', 'build/**', 'src/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('native-keymap', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('windows-foreground-love', ['binding.gyp', 'build/**', 'src/**'], ['**/*.node']))
			.pipe(util.cleanNodeModule('gc-signals', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], ['**/*.node', 'src/index.js']))
			.pipe(util.cleanNodeModule('node-pty', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], ['build/Release/**']));

		let all = es.merge(
			packageJsonStream,
			productJsonStream,
			license,
			api,
			sources,
			deps
		);

		if (platform === 'win32') {
			all = es.merge(all, gulp.src('resources/win32/code_file.ico', { base: '.' }));
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
		} else if (platform === 'linux') {
			result = es.merge(result, gulp.src('resources/linux/bin/code.sh', { base: '.' })
				.pipe(replace('@@NAME@@', product.applicationName))
				.pipe(rename('bin/' + product.applicationName)));
		}

		return result.pipe(vfs.dest(destination));
	};
}

const buildRoot = path.dirname(root);

gulp.task('clean-vscode-win32', util.rimraf(path.join(buildRoot, 'VSCode-win32')));
gulp.task('clean-vscode-darwin', util.rimraf(path.join(buildRoot, 'VSCode-darwin')));
gulp.task('clean-vscode-linux-ia32', util.rimraf(path.join(buildRoot, 'VSCode-linux-ia32')));
gulp.task('clean-vscode-linux-x64', util.rimraf(path.join(buildRoot, 'VSCode-linux-x64')));
gulp.task('clean-vscode-linux-arm', util.rimraf(path.join(buildRoot, 'VSCode-linux-arm')));

gulp.task('vscode-win32', ['optimize-vscode', 'clean-vscode-win32'], packageTask('win32'));
gulp.task('vscode-darwin', ['optimize-vscode', 'clean-vscode-darwin'], packageTask('darwin'));
gulp.task('vscode-linux-ia32', ['optimize-vscode', 'clean-vscode-linux-ia32'], packageTask('linux', 'ia32'));
gulp.task('vscode-linux-x64', ['optimize-vscode', 'clean-vscode-linux-x64'], packageTask('linux', 'x64'));
gulp.task('vscode-linux-arm', ['optimize-vscode', 'clean-vscode-linux-arm'], packageTask('linux', 'arm'));

gulp.task('vscode-win32-min', ['minify-vscode', 'clean-vscode-win32'], packageTask('win32', null, { minified: true }));
gulp.task('vscode-darwin-min', ['minify-vscode', 'clean-vscode-darwin'], packageTask('darwin', null, { minified: true }));
gulp.task('vscode-linux-ia32-min', ['minify-vscode', 'clean-vscode-linux-ia32'], packageTask('linux', 'ia32', { minified: true }));
gulp.task('vscode-linux-x64-min', ['minify-vscode', 'clean-vscode-linux-x64'], packageTask('linux', 'x64', { minified: true }));
gulp.task('vscode-linux-arm-min', ['minify-vscode', 'clean-vscode-linux-arm'], packageTask('linux', 'arm', { minified: true }));

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
