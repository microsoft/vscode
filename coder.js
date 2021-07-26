/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This must be ran from VS Code's root.
const gulp = require('gulp');
const path = require('path');
const _ = require('underscore');
const buildfile = require('./src/buildfile');
const common = require('./build/lib/optimize');
const util = require('./build/lib/util');

const vscodeEntryPoints = _.flatten([
	buildfile.entrypoint('vs/workbench/workbench.web.api'),
	buildfile.entrypoint('vs/server/entry'),
	buildfile.base,
	buildfile.workbenchWeb,
	buildfile.workerExtensionHost,
	buildfile.workerNotebook,
	buildfile.keyboardMaps,
	// See ./src/vs/workbench/buildfile.desktop.js
	buildfile.entrypoint('vs/platform/files/node/watcher/unix/watcherApp'),
	buildfile.entrypoint('vs/platform/files/node/watcher/nsfw/watcherApp'),
	buildfile.entrypoint(`vs/platform/terminal/node/ptyHostMain`),
	buildfile.entrypoint('vs/workbench/services/extensions/node/extensionHostProcess'),
]);

// See ./build/gulpfile.vscode.js
const vscodeResources = [
	'out-build/vs/server/fork.js',
	'!out-build/vs/server/doc/**',
	'out-build/vs/workbench/services/extensions/worker/extensionHostWorkerMain.js',
	'out-build/bootstrap.js',
	'out-build/bootstrap-fork.js',
	'out-build/bootstrap-amd.js',
	'out-build/bootstrap-node.js',
	'out-build/vs/**/*.{svg,png,html,ttf,jpg}',
	'!out-build/vs/code/browser/workbench/*.html',
	'!out-build/vs/code/electron-browser/**',
	'out-build/vs/base/common/performance.js',
	'out-build/vs/base/node/languagePacks.js',
	'out-build/vs/base/browser/ui/codicons/codicon/**',
	'out-build/vs/base/node/userDataPath.js',
	'out-build/vs/workbench/browser/media/*-theme.css',
	'out-build/vs/workbench/contrib/debug/**/*.json',
	'out-build/vs/workbench/contrib/externalTerminal/**/*.scpt',
	'out-build/vs/workbench/contrib/webview/browser/pre/*.js',
	'out-build/vs/**/markdown.css',
	'out-build/vs/workbench/contrib/tasks/**/*.json',
	'out-build/vs/platform/files/**/*.md',
	'!**/test/**'
];

gulp.task('optimize', gulp.series(
	util.rimraf('out-vscode'),
	common.optimizeTask({
		src: 'out-build',
		entryPoints: vscodeEntryPoints,
		resources: vscodeResources,
		loaderConfig: common.loaderConfig(),
		out: 'out-vscode',
		inlineAmdImages: true,
		bundleInfo: undefined
	}),
));

gulp.task('minify', gulp.series(
	util.rimraf('out-vscode-min'),
	common.minifyTask('out-vscode')
));
