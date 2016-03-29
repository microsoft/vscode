/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var fs = require('fs');
var path = require('path');
var os = require('os');
var es = require('event-stream');
var azure = require('gulp-azure-storage');
var electron = require('gulp-atom-electron');
var symdest = require('gulp-symdest');
var rename = require('gulp-rename');
var replace = require('gulp-replace');
var filter = require('gulp-filter');
var json = require('gulp-json-editor');
var remote = require('gulp-remote-src');
var shell = require("gulp-shell");
var _ = require('underscore');
var packageJson = require('../package.json');
var util = require('./lib/util');
var buildfile = require('../src/buildfile');
var common = require('./gulpfile.common');
var nlsDev = require('vscode-nls-dev');
var root = path.dirname(__dirname);
var build = path.join(root, '.build');
var commit = util.getVersion(root);

var baseModules = [
	'applicationinsights', 'assert', 'child_process', 'chokidar', 'crypto', 'emmet',
	'events', 'fs', 'getmac', 'glob', 'graceful-fs', 'http', 'http-proxy-agent',
	'https', 'https-proxy-agent', 'iconv-lite', 'electron', 'net',
	'os', 'path', 'readline', 'sax', 'semver', 'stream', 'string_decoder', 'url',
	'vscode-textmate', 'winreg', 'yauzl', 'native-keymap', 'weak', 'zlib'
];

// Build

var vscodeEntryPoints = _.flatten([
	buildfile.entrypoint('vs/workbench/workbench.main'),
	buildfile.base,
	buildfile.editor,
	buildfile.languages,
	buildfile.vscode
]);

var vscodeResources = [
	'out-build/main.js',
	'out-build/cli.js',
	'out-build/bootstrap.js',
	'out-build/bootstrap-amd.js',
	'out-build/vs/**/*.{svg,png,cur}',
	'out-build/vs/base/node/{stdForkStart.js,terminateProcess.sh}',
	'out-build/vs/base/worker/workerMainCompatibility.html',
	'out-build/vs/base/worker/workerMain.{js,js.map}',
	'out-build/vs/base/browser/ui/octiconLabel/octicons/**',
	'out-build/vs/languages/markdown/common/*.css',
	'out-build/vs/workbench/browser/media/*-theme.css',
	'out-build/vs/workbench/electron-browser/index.html',
	'out-build/vs/workbench/parts/debug/**/*.json',
	'out-build/vs/workbench/parts/execution/**/*.scpt',
	'out-build/vs/workbench/parts/git/**/*.html',
	'out-build/vs/workbench/parts/git/**/*.sh',
	'out-build/vs/workbench/parts/markdown/**/*.md',
	'out-build/vs/workbench/parts/tasks/**/*.json',
	'out-build/vs/workbench/services/files/**/*.exe',
	'out-build/vs/workbench/services/files/**/*.md',
	'!**/test/**'
];

var BUNDLED_FILE_HEADER = [
	'/*!--------------------------------------------------------',
	' * Copyright (C) Microsoft Corporation. All rights reserved.',
	' *--------------------------------------------------------*/'
].join('\n');

gulp.task('clean-optimized-vscode', util.rimraf('out-vscode'));
gulp.task('optimize-vscode', ['clean-optimized-vscode', 'compile-build', 'compile-extensions-build'], common.optimizeTask({
	entryPoints: vscodeEntryPoints,
	otherSources: [],
	resources: vscodeResources,
	loaderConfig: common.loaderConfig(baseModules),
	header: BUNDLED_FILE_HEADER,
	out: 'out-vscode'
}));

gulp.task('clean-minified-vscode', util.rimraf('out-vscode-min'));
gulp.task('minify-vscode', ['clean-minified-vscode', 'optimize-vscode'], common.minifyTask('out-vscode', true));

// Package
var product = require('../product.json');
var darwinCreditsTemplate = product.darwinCredits && _.template(fs.readFileSync(path.join(root, product.darwinCredits), 'utf8'));

var config = {
	version: packageJson.electronVersion,
	productAppName: product.nameLong,
	companyName: 'Microsoft Corporation',
	copyright: 'Copyright (C) 2015 Microsoft. All rights reserved',
	darwinIcon: 'resources/darwin/code.icns',
	darwinBundleIdentifier: product.darwinBundleIdentifier,
	darwinApplicationCategoryType: 'public.app-category.developer-tools',
	darwinBundleDocumentTypes: [{
		name: product.nameLong + ' document',
		role: 'Editor',
		ostypes: ["TEXT", "utxt", "TUTX", "****"],
		extensions: ["ascx", "asp", "aspx", "bash", "bash_login", "bash_logout", "bash_profile", "bashrc", "bat", "bowerrc", "c", "cc", "clj", "cljs", "cljx", "clojure", "cmd", "coffee", "config", "cpp", "cs", "cshtml", "csproj", "css", "csx", "ctp", "cxx", "dockerfile", "dot", "dtd", "editorconfig", "edn", "eyaml", "eyml", "fs", "fsi", "fsscript", "fsx", "gemspec", "gitattributes", "gitconfig", "gitignore", "go", "h", "handlebars", "hbs", "hh", "hpp", "htm", "html", "hxx", "ini", "jade", "jav", "java", "js", "jscsrc", "jshintrc", "jshtm", "json", "jsp", "less", "lua", "m", "makefile", "markdown", "md", "mdoc", "mdown", "mdtext", "mdtxt", "mdwn", "mkd", "mkdn", "ml", "mli", "nqp", "p6", "php", "phtml", "pl", "pl6", "pm", "pm6", "pod", "pp", "profile", "properties", "ps1", "psd1", "psgi", "psm1", "py", "r", "rb", "rhistory", "rprofile", "rs", "rt", "scss", "sh", "shtml", "sql", "svg", "svgz", "t", "ts", "txt", "vb", "wxi", "wxl", "wxs", "xaml", "xml", "yaml", "yml", "zlogin", "zlogout", "zprofile", "zsh", "zshenv", "zshrc"],
		iconFile: 'resources/darwin/code_file.icns'
	}],
	darwinCredits: darwinCreditsTemplate ? new Buffer(darwinCreditsTemplate({ commit: commit, date: new Date().toISOString() })) : void 0,
	linuxExecutableName: product.applicationName,
	winIcon: 'resources/win32/code.ico',
	token: process.env['GITHUB_TOKEN'] || void 0
};

gulp.task('electron', function () {
	// Force windows to use ia32
	var arch = process.env.VSCODE_ELECTRON_PLATFORM || (process.platform === 'win32' ? 'ia32' : process.arch);
	return electron.dest(path.join(build, 'electron'), _.extend({}, config, { arch: arch }));
});

function mixinProduct() {
	var product;
	var url = process.env['PRODUCT_JSON_URL'];

	if (url) {
		var opts = { base: '' };
		var username = process.env['PRODUCT_JSON_USERNAME'];
		var password = process.env['PRODUCT_JSON_PASSWORD'];

		if (username || password) {
			opts.auth = { username: username || '', password: password || '' };
		}

		product = remote(url, opts);
	} else {
		product = gulp.src(['product.json'], { base: '.' });
	}

	return product.pipe(json({
		commit: commit,
		date: new Date().toISOString()
	}));
}
var languages = ['chs', 'cht', 'jpn', 'kor', 'deu', 'fra', 'esn', 'rus', 'ita'];

function packageTask(platform, arch, opts) {
	opts = opts || {};

	var destination = path.join(path.dirname(root), 'VSCode') + (platform ? '-' + platform : '') + (arch ? '-' + arch : '');
	platform = platform || process.platform;
	arch = platform === 'win32' ? 'ia32' : arch;

	return function () {
		var out = opts.minified ? 'out-vscode-min' : 'out-vscode';

		var src = gulp.src(out + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + out), 'out'); }))
			.pipe(util.setExecutableBit(['**/*.sh']));

		var extensions = gulp.src([
			'extensions/**',
			'!extensions/*/src/**',
			'!extensions/*/out/**/test/**',
			'!extensions/typescript/bin/**',
			'!extensions/vscode-api-tests/**',
			'!extensions/json/server/.vscode/**',
			'!extensions/json/server/src/**',
			'!extensions/json/server/out/**/test/**',
			'!extensions/json/server/test/**',
			'!extensions/json/server/typings/**'
		], { base: '.' });

		var sources = es.merge(src, extensions)
			.pipe(nlsDev.createAdditionalLanguageFiles(languages, path.join(__dirname, '..', 'i18n')))
			.pipe(filter(['**', '!**/*.js.map']))
			.pipe(util.handleAzureJson({ platform: platform }));

		var version = packageJson.version;
		var quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		var packageJsonStream = gulp.src(['package.json'], { base: '.' }).pipe(json({
			name: product.nameShort,
			version: version
		}));

		var license = gulp.src(['Credits_*', 'LICENSE.txt', 'ThirdPartyNotices.txt'], { base: '.' });
		var api = gulp.src('src/vs/vscode.d.ts').pipe(rename('out/vs/vscode.d.ts'));

		var depsSrc = _.flatten(Object.keys(packageJson.dependencies).concat(Object.keys(packageJson.optionalDependencies))
			.map(function (d) { return ['node_modules/' + d + '/**', '!node_modules/' + d + '/**/{test,tests}/**']; })
		);

		var deps = gulp.src(depsSrc, { base: '.', dot: true })
			.pipe(util.cleanNodeModule('fsevents', ['binding.gyp', 'fsevents.cc', 'build/**', 'src/**', 'test/**'], true))
			.pipe(util.cleanNodeModule('oniguruma', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], true))
			.pipe(util.cleanNodeModule('windows-mutex', ['binding.gyp', 'build/**', 'src/**'], true))
			.pipe(util.cleanNodeModule('native-keymap', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], true))
			.pipe(util.cleanNodeModule('weak', ['binding.gyp', 'build/**', 'src/**'], true));

		var all = es.merge(
			api,
			packageJsonStream,
			mixinProduct(),
			license,
			sources,
			deps
		);

		if (platform === 'win32') {
			all = es.merge(all, gulp.src('resources/win32/code_file.ico', { base: '.' }));
		} else if (platform === 'linux') {
			all = es.merge(all, gulp.src('resources/linux/code.png', { base: '.' }));
		} else if (platform === 'darwin') {
			var shortcut = gulp.src('resources/darwin/bin/code.sh')
				.pipe(rename('bin/code'));

			all = es.merge(all, shortcut);
		}

		var result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions())
			.pipe(electron(_.extend({}, config, { platform: platform, arch: arch })))
			.pipe(filter(['**', '!LICENSE', '!LICENSES.chromium.html', '!version']));

		if (platform === 'win32') {
			result = es.merge(result, gulp.src('resources/win32/bin/code.js', { base: 'resources/win32' }));

			result = es.merge(result, gulp.src('resources/win32/bin/code.cmd', { base: 'resources/win32' })
				.pipe(replace('@@NAME@@', product.nameShort))
				.pipe(rename(function (f) { f.basename = product.applicationName; })));

			result = es.merge(result, gulp.src('resources/win32/bin/code.sh', { base: 'resources/win32' })
				.pipe(replace('@@NAME@@', product.nameShort))
				.pipe(rename(function (f) { f.basename = product.applicationName; f.extname = ''; })));
		}

		return result.pipe(symdest(destination));
	};
}

function getDebPackageArch(arch) {
	return { x64: 'amd64', ia32: 'i386' }[arch];
}

function getEpochTime() {
	return Math.floor(new Date().getTime() / 1000);
}

function prepareDebPackage(arch) {
	var binaryDir = '../VSCode-linux-' + arch;
	var debArch = getDebPackageArch(arch);
	var destination = '.build/linux/deb/' + debArch + '/vscode-' + debArch;
	var packageRevision = getEpochTime();

	return function () {
		var shortcut = gulp.src('resources/linux/bin/code.sh', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('usr/bin/' + product.applicationName));

		var desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('usr/share/applications/' + product.applicationName + '.desktop'));

		var icon = gulp.src('resources/linux/code.png', { base: '.' })
			.pipe(rename('usr/share/pixmaps/' + product.applicationName + '.png'));

		var code = gulp.src(binaryDir + '/**/*', { base: binaryDir })
			.pipe(rename(function (p) { p.dirname = 'usr/share/' + product.applicationName + '/' + p.dirname; }));

		var size = 0;
		var control = code.pipe(es.through(
			function (f) { size += f.isDirectory() ? 4096 : f.contents.length; },
			function () {
				var that = this;
				gulp.src('resources/linux/debian/control.template', { base: '.' })
					.pipe(replace('@@NAME@@', product.applicationName))
					.pipe(replace('@@VERSION@@', packageJson.version + '-' + packageRevision))
					.pipe(replace('@@ARCHITECTURE@@', debArch))
					.pipe(replace('@@INSTALLEDSIZE@@', Math.ceil(size / 1024)))
					.pipe(rename('DEBIAN/control'))
					.pipe(es.through(function (f) { that.emit('data', f); }, function () { that.emit('end'); }));
			}));

		var prerm = gulp.src('resources/linux/debian/prerm.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('DEBIAN/prerm'))

		var all = es.merge(control, prerm, desktop, icon, shortcut, code);

		// Register an apt repository if this is an official build
		if (product.updateUrl && product.quality) {
			var postinst = gulp.src('resources/linux/debian/postinst.template', { base: '.' })
				.pipe(replace('@@NAME@@', product.applicationName))
				.pipe(replace('@@UPDATEURL@@', product.updateUrl))
				.pipe(replace('@@QUALITY@@', product.quality))
				.pipe(replace('@@ARCHITECTURE@@', debArch))
				.pipe(rename('DEBIAN/postinst'))
			all = es.merge(all, postinst);
		} else {
			var postinst = gulp.src('resources/linux/debian/postinst.oss.template', { base: '.' })
				.pipe(replace('@@NAME@@', product.applicationName))
				.pipe(rename('DEBIAN/postinst'))
			all = es.merge(all, postinst);
		}

		return all.pipe(symdest(destination));
	};
}

function buildDebPackage(arch) {
	var debArch = getDebPackageArch(arch);
	return shell.task([
		'mkdir -p deb',
		'fakeroot dpkg-deb -b vscode-' + debArch + ' deb/vscode-' + debArch + '.deb',
		'dpkg-scanpackages deb /dev/null > Packages'
	], { cwd: '.build/linux/deb/' + debArch});
}

function getHomeDir() {
	if (typeof os.homedir === 'function') {
		return os.homedir();
	}
	return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

var rpmBuildPath = path.join(getHomeDir(), 'rpmbuild');

function getRpmPackageArch(arch) {
	return { x64: 'x86_64', ia32: 'i386' }[arch];
}

function prepareRpmPackage(arch) {
	var binaryDir = '../VSCode-linux-' + arch;
	var destination = rpmBuildPath;
	var packageRevision = getEpochTime();

	return function () {
		var shortcut = gulp.src('resources/linux/bin/code.sh', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('BUILD/usr/bin/' + product.applicationName));

		var desktop = gulp.src('resources/linux/code.desktop', { base: '.' })
			.pipe(replace('@@NAME_LONG@@', product.nameLong))
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(rename('BUILD/usr/share/applications/' + product.applicationName + '.desktop'));

		var icon = gulp.src('resources/linux/code.png', { base: '.' })
			.pipe(rename('BUILD/usr/share/pixmaps/' + product.applicationName + '.png'));

		var code = gulp.src(binaryDir + '/**/*', { base: binaryDir })
			.pipe(rename(function (p) { p.dirname = 'BUILD/usr/share/' + product.applicationName + '/' + p.dirname; }));

		var spec = gulp.src('resources/linux/rpm/code.spec.template', { base: '.' })
			.pipe(replace('@@NAME@@', product.applicationName))
			.pipe(replace('@@VERSION@@', packageJson.version))
			.pipe(replace('@@RELEASE@@', packageRevision))
			.pipe(rename('SPECS/' + product.applicationName + '.spec'));

		var specIcon = gulp.src('resources/linux/rpm/code.xpm', { base: '.' })
			.pipe(rename('SOURCES/' + product.applicationName + '.xpm'));

		var all = es.merge(code, desktop, icon, shortcut, spec, specIcon);

		return all.pipe(symdest(destination));
	}
}

function buildRpmPackage(arch) {
	var rpmArch = getRpmPackageArch(arch);
	return shell.task([
		'fakeroot rpmbuild -bb ' + rpmBuildPath + '/SPECS/' + product.applicationName + '.spec --target=' + rpmArch,
	]);
}

gulp.task('clean-vscode-win32', util.rimraf(path.join(path.dirname(root), 'VSCode-win32')));
gulp.task('clean-vscode-darwin', util.rimraf(path.join(path.dirname(root), 'VSCode-darwin')));
gulp.task('clean-vscode-linux-ia32', util.rimraf(path.join(path.dirname(root), 'VSCode-linux-ia32')));
gulp.task('clean-vscode-linux-x64', util.rimraf(path.join(path.dirname(root), 'VSCode-linux-x64')));
gulp.task('clean-vscode-linux-arm', util.rimraf(path.join(path.dirname(root), 'VSCode-linux-arm')));
gulp.task('clean-vscode-linux-ia32-deb', util.rimraf('.build/linux/deb/i386'));
gulp.task('clean-vscode-linux-x64-deb', util.rimraf('.build/linux/deb/amd64'));
gulp.task('clean-vscode-linux-ia32-rpm', util.rimraf('.build/linux/rpm/i386'));
gulp.task('clean-vscode-linux-x64-rpm', util.rimraf('.build/linux/rpm/x86_64'));
gulp.task('clean-rpmbuild', util.rimraf(rpmBuildPath));

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

gulp.task('vscode-linux-ia32-prepare-deb', ['clean-vscode-linux-ia32-deb', 'vscode-linux-ia32-min'], prepareDebPackage('ia32'));
gulp.task('vscode-linux-x64-prepare-deb', ['clean-vscode-linux-x64-deb', 'vscode-linux-x64-min'], prepareDebPackage('x64'));
gulp.task('vscode-linux-ia32-build-deb', ['vscode-linux-ia32-prepare-deb'], buildDebPackage('ia32'));
gulp.task('vscode-linux-x64-build-deb', ['vscode-linux-x64-prepare-deb'], buildDebPackage('x64'));

gulp.task('vscode-linux-ia32-prepare-rpm', ['clean-rpmbuild', 'clean-vscode-linux-ia32-rpm', 'vscode-linux-ia32-min'], prepareRpmPackage('ia32'));
gulp.task('vscode-linux-x64-prepare-rpm', ['clean-rpmbuild', 'clean-vscode-linux-x64-rpm', 'vscode-linux-x64-min'], prepareRpmPackage('x64'));
gulp.task('vscode-linux-ia32-build-rpm', ['vscode-linux-ia32-prepare-rpm'], buildRpmPackage('ia32'));
gulp.task('vscode-linux-x64-build-rpm', ['vscode-linux-x64-prepare-rpm'], buildRpmPackage('x64'));

// Sourcemaps

gulp.task('upload-vscode-sourcemaps', ['minify-vscode'], function () {
	return gulp.src('out-vscode-min/**/*.map')
		.pipe(azure.upload({
			account: process.env.AZURE_STORAGE_ACCOUNT,
			key: process.env.AZURE_STORAGE_ACCESS_KEY,
			container: 'sourcemaps',
			prefix: commit + '/'
		}));
});
