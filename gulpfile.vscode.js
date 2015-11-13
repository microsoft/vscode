/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*global process,__dirname, Buffer*/

var gulp = require('gulp');
var fs = require('fs');
var path = require('path');
var es = require('event-stream');
var azure = require('gulp-azure-storage');
var electron = require('gulp-atom-electron');
var mkdirp = require('mkdirp');
var vfs = require('vinyl-fs');
var rename = require('gulp-rename');
var filter = require('gulp-filter');
var json = require('gulp-json-editor');
var insert = require('gulp-insert');
var remote = require('gulp-remote-src');
var File = require('vinyl');
var rimraf = require('rimraf');
var _ = require('underscore');
var packagejson = require('./package.json');
var util = require('./build/lib/util');
var buildfile = require('./src/buildfile');
var common = require('./gulpfile.common');
var commit = process.env['BUILD_SOURCEVERSION'] || require('./build/lib/git').getVersion(__dirname);

var baseModules = [
	'app', 'applicationinsights', 'assert', 'auto-updater', 'browser-window',
	'child_process', 'chokidar', 'crash-reporter', 'crypto', 'dialog', 'emmet',
	'events', 'fs', 'getmac', 'glob', 'graceful-fs', 'http', 'http-proxy-agent',
	'https', 'https-proxy-agent', 'iconv-lite', 'ipc', 'menu', 'menu-item', 'net',
	'original-fs', 'os', 'path', 'readline', 'remote', 'sax', 'screen', 'semver',
	'shell', 'stream', 'string_decoder', 'url', 'vscode-textmate', 'web-frame', 'winreg',
	'yauzl'
];

// Build

var builtInExtensions = {
	// nothing yet
};

var vscodeEntryPoints = _.flatten([
	buildfile.entrypoint('vs/workbench/workbench.main'),
	buildfile.base,
	buildfile.editor,
	buildfile.languages,
	buildfile.vscode
]);

var vscodeResources = [
	'out-build/bootstrap.js',
	'out-build/vs/**/*.{svg,png,cur}',
	'out-build/vs/base/node/{stdForkStart.js,terminateProcess.sh}',
	'out-build/vs/base/worker/workerMainCompatibility.html',
	'out-build/vs/base/worker/workerMain.{js,js.map}',
	'out-build/vs/editor/css/*.css',
	'out-build/vs/languages/typescript/common/lib/lib.{d.ts,es6.d.ts}',
	'out-build/vs/languages/markdown/common/*.css',
	'out-build/vs/workbench/browser/media/*-theme.css',
	'out-build/vs/workbench/browser/media/octicons/**',
	'out-build/vs/workbench/electron-browser/index.html',
	'out-build/vs/workbench/electron-main/bootstrap.js',
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

gulp.task('clean-optimized-vscode', util.rimraf('out-vscode'));
gulp.task('optimize-vscode', ['clean-optimized-vscode', 'compile-build', 'compile-plugins'], common.optimizeTask(
	vscodeEntryPoints,
	vscodeResources,
	common.loaderConfig(baseModules),
	'out-vscode'
));

gulp.task('clean-minified-vscode', util.rimraf('out-vscode-min'));
gulp.task('minify-vscode', ['clean-minified-vscode', 'optimize-vscode'], common.minifyTask('out-vscode'));

// Package
var product = JSON.parse(fs.readFileSync(path.join(__dirname, 'product.json'), 'utf8'));

var darwinCreditsTemplate;
if (product.darwinCredits) {
	darwinCreditsTemplate = _.template(fs.readFileSync(path.join(__dirname, product.darwinCredits), 'utf8'));
}

var config = {
	version: packagejson.electronVersion,
	productAppName: product.nameLong,
	companyName: product.companyName,
	copyright: product.copyright,
	darwinIcon: product.icons.application.icns,
	darwinBundleIdentifier: product.darwinBundleIdentifier,
	darwinApplicationCategoryType: product.darwinApplicationCategoryType, // Finder: View-->Arrange by Application Category
	darwinBundleDocumentTypes: product.darwinBundleDocumentTypes,
	darwinCredits: darwinCreditsTemplate ? new Buffer(darwinCreditsTemplate({ commit: commit, date: new Date().toISOString() })) : void 0,
	winIcon: product.icons.application.ico,
	win32ExeBasename: product.nameShort
};

gulp.task('electron', function () {
	// Force windows to use ia32
	var arch = (process.platform === 'win32' ? 'ia32' : process.arch);
	return electron.dest('../Electron-Build', _.extend({}, config, { arch: arch }));
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

// Writes to destination with support for symlinks as they can appear in Electron on Mac
function symdest(out) {
	var pass = es.through();

	return es.duplex(pass,
		pass.pipe(es.mapSync(function (f) {
			if (!f.symlink) {
				return f;
			}

			var dest = path.join(out, f.relative);
			try {
				mkdirp.sync(path.dirname(dest));
			} catch (error) {
				// Folder exists
			}

			try {
				fs.symlinkSync(f.symlink, dest);
			} catch (error) {
				console.error('Problem writing symlink: ' + error);
			}
		}))
		.pipe(vfs.dest(out))
	);
};

function packageTask(platform, arch, opts) {
	opts = opts || {};

	var destination = '../VSCode' + (platform ? '-' + platform : '') + (arch ? '-' + arch : '');
	platform = platform || process.platform;
	arch = platform === 'win32' ? 'ia32' : arch;

	return function () {
		var out = opts.minified ? 'out-vscode-min' : 'out-vscode';
		var pluginHostFilter = filter(out + '/vs/workbench/node/pluginHostProcess.js', { restore: true });

		var src = gulp.src(out + '/**', { base: '.' })
			.pipe(pluginHostFilter)
			.pipe(insert.append('\n//# sourceMappingURL=pluginHostProcess.js.map'))
			.pipe(pluginHostFilter.restore)
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + out), 'out'); }))
			.pipe(util.setExecutableBit(['**/*.sh']));

		var extensions = gulp.src([
			'extensions/**',
			'!extensions/*/src/**',
			'!extensions/*/out/**/test/**',
			'!extensions/typescript/bin/**',
			'!extensions/csharp-o/node_modules/del/**',
			'!extensions/csharp-o/node_modules/gulp/**',
			'!extensions/csharp-o/node_modules/gulp-decompress/**',
			'!extensions/csharp-o/node_modules/gulp-download/**',
			'!extensions/csharp-o/node_modules/typescript/**'
		], { base: '.' });

		var pluginHostSourceMap = gulp.src(out + '/vs/workbench/node/pluginHostProcess.js.map', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + out), 'out'); }));

		var sources = es.merge(
			es.merge(src, extensions).pipe(filter(['**', '!**/*.js.map'])),
			pluginHostSourceMap
		).pipe(util.handleAzureJson({ platform: platform }));

		var packageJson = gulp.src(['package.json'], { base: '.' }).pipe(json({ name: product.nameShort }));

		var license = gulp.src(['Credits_*', 'LICENSE.txt', 'ThirdPartyNotices.txt'], { base: '.' });
		var api = gulp.src('src/vs/vscode.d.ts').pipe(rename('out/vs/vscode.d.ts'));

		var depsSrc = _.flatten(Object.keys(packagejson.dependencies)
			.map(function (d) { return ['node_modules/' + d + '/**', '!node_modules/' + d + '/**/{test,tests}/**']; }));

		var deps = gulp.src(depsSrc, { base: '.', dot: true })
			.pipe(util.cleanNodeModule('fsevents', ['binding.gyp', 'fsevents.cc', 'build/**', 'src/**', 'test/**'], true))
			.pipe(util.cleanNodeModule('oniguruma', ['binding.gyp', 'build/**', 'src/**', 'deps/**'], true));

		var extraExtensions = util.downloadExtensions(builtInExtensions)
			.pipe(rename(function (p) {
				p.dirname = path.posix.join('extensions', p.dirname);
			}));

		var all = es.merge(
			api,
			packageJson,
			mixinProduct(),
			license,
			sources,
			deps,
			extraExtensions
		).pipe(util.skipDirectories());

		var result = all
			.pipe(util.fixWin32DirectoryPermissions())
			.pipe(electron(_.extend({}, config, { platform: platform, arch: arch })))
			.pipe(filter(['**', '!LICENSE', '!version']));

		if (platform === 'win32') {
			result = es.merge(result, gulp.src('resources/win/bin/**', { base: 'resources/win' }));
		}

		if (product.welcomePage) {
			result = es.merge(result, gulp.src('resources/app/' + product.welcomePage, { base: '.' }));
		}

		if (platform === 'win32') {
			result = es.merge(result, gulp.src(product.icons.file.ico, { base: '.' }));
		} else if (platform === 'linux') {
			result = es.merge(result, gulp.src(product.icons.application.png, { base: '.' }));
		}

		return result.pipe(opts.zip ? electron.zfsdest(destination + '.zip') : symdest(destination));
	};
}

gulp.task('clean-vscode-win32', util.rimraf('../VSCode-win32'));
gulp.task('clean-vscode-darwin', util.rimraf('../VSCode-darwin'));
gulp.task('clean-vscode-linux-ia32', util.rimraf('../VSCode-linux-ia32'));
gulp.task('clean-vscode-linux-x64', util.rimraf('../VSCode-linux-x64'));

gulp.task('vscode-win32', ['optimize-vscode', 'clean-vscode-win32'], packageTask('win32'));
gulp.task('vscode-darwin', ['optimize-vscode', 'clean-vscode-darwin'], packageTask('darwin'));
gulp.task('vscode-linux-ia32', ['optimize-vscode', 'clean-vscode-linux-ia32'], packageTask('linux', 'ia32'));
gulp.task('vscode-linux-x64', ['optimize-vscode', 'clean-vscode-linux-x64'], packageTask('linux', 'x64'));

gulp.task('vscode-win32-min', ['minify-vscode', 'clean-vscode-win32'], packageTask('win32', null, { minified: true }));
gulp.task('vscode-darwin-min', ['minify-vscode', 'clean-vscode-darwin'], packageTask('darwin', null, { minified: true }));
gulp.task('vscode-linux-ia32-min', ['minify-vscode', 'clean-vscode-linux-ia32'], packageTask('linux', 'ia32', { minified: true }));
gulp.task('vscode-linux-x64-min', ['minify-vscode', 'clean-vscode-linux-x64'], packageTask('linux', 'x64', { minified: true }));

gulp.task('vscode-win32-zip', ['optimize-vscode'], packageTask('win32', null, { zip: true }));
gulp.task('vscode-darwin-zip', ['optimize-vscode'], packageTask('darwin', null, { zip: true }));
gulp.task('vscode-linux-ia32-zip', ['optimize-vscode'], packageTask('linux', 'ia32', { zip: true }));
gulp.task('vscode-linux-x64-zip', ['optimize-vscode'], packageTask('linux', 'x64', { zip: true }));

gulp.task('vscode-win32-zip-min', ['minify-vscode'], packageTask('win32', null, { zip: true, minified: true }));
gulp.task('vscode-darwin-zip-min', ['minify-vscode'], packageTask('darwin', null, { zip: true, minified: true }));
gulp.task('vscode-linux-zip-ia32-min', ['minify-vscode'], packageTask('linux', 'ia32', { zip: true, minified: true }));
gulp.task('vscode-linux-zip-x64-min', ['minify-vscode'], packageTask('linux', 'x64', { zip: true, minified: true }));

// Sourcemaps

gulp.task('vscode-sourcemaps', ['minify-vscode'], function () {
	return gulp.src('out-vscode-min/**/*.map')
		.pipe(azure.upload({
			account: process.env.AZURE_STORAGE_ACCOUNT,
			key: process.env.AZURE_STORAGE_ACCESS_KEY,
			container: 'sourcemaps',
			prefix: commit + '/'
		}));
});