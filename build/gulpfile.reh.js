/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const es = require('event-stream');
const util = require('./lib/util');
const task = require('./lib/task');
const common = require('./lib/optimize');
const product = require('../product.json');
const rename = require('gulp-rename');
const replace = require('gulp-replace');
const filter = require('gulp-filter');
const json = require('gulp-json-editor');
const _ = require('underscore');
const deps = require('./dependencies');
const ext = require('./lib/extensions');
const vfs = require('vinyl-fs');
const packageJson = require('../package.json');
const flatmap = require('gulp-flatmap');
const gunzip = require('gulp-gunzip');
const untar = require('gulp-untar');
const File = require('vinyl');
const fs = require('fs');
const glob = require('glob');
const { compileBuildTask } = require('./gulpfile.compile');

const cp = require('child_process');

const REPO_ROOT = path.dirname(__dirname);
const commit = util.getVersion(REPO_ROOT);
const BUILD_ROOT = path.dirname(REPO_ROOT);
const REMOTE_FOLDER = path.join(REPO_ROOT, 'remote');

const productionDependencies = deps.getProductionDependencies(REMOTE_FOLDER);


// @ts-ignore
const baseModules = Object.keys(process.binding('natives')).filter(n => !/^_|\//.test(n));
const nodeModules = ['electron', 'original-fs']
	// @ts-ignore JSON checking: dependencies property is optional
	.concat(Object.keys(product.dependencies || {}))
	.concat(_.uniq(productionDependencies.map(d => d.name)))
	.concat(baseModules);

const BUNDLED_FILE_HEADER = [
	'/*!--------------------------------------------------------',
	' * Copyright (C) Microsoft Corporation. All rights reserved.',
	' *--------------------------------------------------------*/'
].join('\n');

const vscodeResources = [
	'out-build/bootstrap.js',
	'out-build/bootstrap-fork.js',
	'out-build/bootstrap-amd.js',
	'out-build/paths.js',

	// main entry points
	'out-build/vs/server/cli.js',
	'out-build/vs/server/main.js',

	// Watcher
	'out-build/vs/workbench/services/files/**/*.exe',
	'out-build/vs/workbench/services/files/**/*.md',

	// Uri transformer
	'out-build/vs/server/uriTransformer.js',

	'out-build/vs/base/node/cpuUsage.sh',
	'out-build/vs/base/node/ps.sh',

	'!**/test/**'
];

const entryPoints = [
	{
		name: 'vs/server/remoteExtensionHostAgent',
		exclude: ['vs/css', 'vs/nls']
	},
	{
		name: 'vs/server/remoteCli',
		exclude: ['vs/css', 'vs/nls']
	},
	{
		name: 'vs/server/remoteExtensionHostProcess',
		exclude: ['vs/css', 'vs/nls']
	},
	{
		name: 'vs/workbench/services/files/node/watcher/unix/watcherApp',
		exclude: ['vs/css', 'vs/nls']
	},
	{
		name: 'vs/workbench/services/files/node/watcher/nsfw/watcherApp',
		exclude: ['vs/css', 'vs/nls']
	}
];

// VSCode Web Support (behind a build flag)
if (process.env['VSCODE_WEB_BUILD']) {
	vscodeResources.push(
		'out-build/vs/{base,platform,editor,workbench}/**/*.{svg,png,cur,html}',
		'out-build/vs/base/browser/ui/octiconLabel/octicons/**',
		'out-build/vs/workbench/contrib/welcome/walkThrough/**/*.md',
		'out-build/vs/code/browser/workbench/**',
		'out-build/vs/**/markdown.css'
	);

	const buildfile = require('../src/buildfile');

	entryPoints.push(
		buildfile.workbenchWeb,
		buildfile.keyboardMaps,
		buildfile.base
	);
}

const optimizeVSCodeREHTask = task.define('optimize-vscode-reh', task.series(
	task.parallel(
		util.rimraf('out-vscode-reh'),
		compileBuildTask
	),
	common.optimizeTask({
		src: 'out-build',
		entryPoints: _.flatten(entryPoints),
		otherSources: [],
		resources: vscodeResources,
		loaderConfig: common.loaderConfig(nodeModules),
		header: BUNDLED_FILE_HEADER,
		out: 'out-vscode-reh',
		bundleInfo: undefined
	})
));

const baseUrl = `https://ticino.blob.core.windows.net/sourcemaps/${commit}/core`;
const minifyVSCodeREHTask = task.define('minify-vscode-reh', task.series(
	task.parallel(
		util.rimraf('out-vscode-reh-min'),
		optimizeVSCodeREHTask
	),
	common.minifyTask('out-vscode-reh', baseUrl)
));

function getNodeVersion() {
	const yarnrc = fs.readFileSync(path.join(REPO_ROOT, 'remote', '.yarnrc'), 'utf8');
	const target = /^target "(.*)"$/m.exec(yarnrc)[1];
	return target;
}

function ensureDirs(dirPath) {
	if (!fs.existsSync(dirPath)) {
		ensureDirs(path.dirname(dirPath));
		fs.mkdirSync(dirPath);
	}
}

/* Downloads the node executable used for the remote server to ./build/node-remote */
gulp.task(task.define('node-remote', () => {
	const VERSION = getNodeVersion();
	const nodePath = path.join('.build', 'node-remote');
	const nodeVersionPath = path.join(nodePath, 'version');
	if (!fs.existsSync(nodeVersionPath) || fs.readFileSync(nodeVersionPath).toString() !== VERSION) {
		ensureDirs(nodePath);
		util.rimraf(nodePath);
		fs.writeFileSync(nodeVersionPath, VERSION);
		return nodejs(process.platform, process.arch).pipe(vfs.dest(nodePath));
	}
	return vfs.src(nodePath);
}));

function nodejs(platform, arch) {
	const VERSION = getNodeVersion();

	if (arch === 'ia32') {
		arch = 'x86';
	}

	if (platform === 'win32') {
		const downloadPath = `/dist/v${VERSION}/win-${arch}/node.exe`;

		return (
			util.download({ host: 'nodejs.org', path: downloadPath })
				.pipe(es.through(function (data) {
					// base comes in looking like `https:\nodejs.org\dist\v10.2.1\win-x64\node.exe`
					this.emit('data', new File({
						path: data.path,
						base: data.base.replace(/\\node\.exe$/, ''),
						contents: data.contents,
						stat: {
							isFile: true,
							mode: /* 100755 */ 33261
						}
					}));
				}))
		);
	}

	if (arch === 'alpine') {
		return es.readArray([
			new File({
				path: 'node',
				contents: cp.execSync(`docker run --rm node:${VERSION}-alpine /bin/sh -c 'cat \`which node\`'`, { maxBuffer: 100 * 1024 * 1024, encoding: 'buffer' }),
				stat: {
					mode: parseInt('755', 8)
				}
			})
		]);
	}

	if (platform === 'darwin') {
		arch = 'x64';
	}

	if (arch === 'armhf') {
		arch = 'armv7l';
	}

	const downloadPath = `/dist/v${VERSION}/node-v${VERSION}-${platform}-${arch}.tar.gz`;

	return (
		util.download({ host: 'nodejs.org', path: downloadPath })
			.pipe(flatmap(stream => stream.pipe(gunzip()).pipe(untar())))
			.pipe(es.through(function (data) {
				// base comes in looking like `https:/nodejs.org/dist/v8.9.3/node-v8.9.3-darwin-x64.tar.gz`
				// => we must remove the `.tar.gz`
				// Also, keep only bin/node
				if (/\/bin\/node$/.test(data.path)) {
					this.emit('data', new File({
						path: data.path.replace(/bin\/node$/, 'node'),
						base: data.base.replace(/\.tar\.gz$/, ''),
						contents: data.contents,
						stat: {
							isFile: true,
							mode: /* 100755 */ 33261
						}
					}));
				}
			}))
	);
}

function packageTask(platform, arch, sourceFolderName, destinationFolderName) {
	const destination = path.join(BUILD_ROOT, destinationFolderName);

	return () => {
		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + sourceFolderName), 'out'); }))
			.pipe(util.setExecutableBit(['**/*.sh']))
			.pipe(filter(['**', '!**/*.js.map']));

		const workspaceExtensionPoints = ['debuggers', 'jsonValidation'];
		const isUIExtension = (manifest) => {
			switch (manifest.extensionKind) {
				case 'ui': return true;
				case 'workspace': return false;
				default: {
					if (manifest.main) {
						return false;
					}
					if (manifest.contributes && Object.keys(manifest.contributes).some(key => workspaceExtensionPoints.indexOf(key) !== -1)) {
						return false;
					}
					// Default is UI Extension
					return true;
				}
			}
		};
		const localWorkspaceExtensions = glob.sync('extensions/*/package.json')
			.filter((extensionPath) => {
				if (process.env['VSCODE_WEB_BUILD']) {
					return true; // web: ship all extensions for now
				}

				const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, extensionPath)).toString());
				return !isUIExtension(manifest);
			}).map((extensionPath) => path.basename(path.dirname(extensionPath)))
			.filter(name => name !== 'vscode-api-tests' && name !== 'vscode-test-resolver'); // Do not ship the test extensions
		const marketplaceExtensions = require('./builtInExtensions.json').map(entry => entry.name);
		const extensionsToShip = [].concat(localWorkspaceExtensions).concat(marketplaceExtensions);

		const sources = es.merge(src, ext.packageExtensionsStream({
			desiredExtensions: extensionsToShip
		}));

		let version = packageJson.version;
		// @ts-ignore JSON checking: quality is optional
		const quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['remote/package.json'], { base: 'remote' })
			.pipe(json({ name, version }));

		const date = new Date().toISOString();

		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(json({ commit, date }));

		const license = gulp.src(['remote/LICENSE'], { base: 'remote' });

		const depsSrc = [
			..._.flatten(productionDependencies.map(d => path.relative(REPO_ROOT, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`])),
			// @ts-ignore JSON checking: dependencies is optional
			..._.flatten(Object.keys(product.dependencies || {}).map(d => [`node_modules/${d}/**`, `!node_modules/${d}/**/{test,tests}/**`, `!node_modules/${d}/.bin/**`]))
		];

		const deps = gulp.src(depsSrc, { base: 'remote', dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(path.join(__dirname, '.nativeignore')));

		let all = es.merge(
			packageJsonStream,
			productJsonStream,
			license,
			sources,
			deps,
			nodejs(process.platform, arch)
		);

		let result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		if (platform === 'win32') {
			result = es.merge(result,
				gulp.src('resources/server/bin/code.cmd', { base: '.' })
					.pipe(replace('@@VERSION@@', version))
					.pipe(replace('@@COMMIT@@', commit))
					.pipe(replace('@@APPNAME@@', product.applicationName))
					.pipe(rename(`bin/${product.applicationName}.cmd`)),
				gulp.src('resources/server/bin/server.cmd', { base: '.' })
					.pipe(rename(`server.cmd`))
			);
		} else if (platform === 'linux' || platform === 'darwin') {
			result = es.merge(result,
				gulp.src('resources/server/bin/code.sh', { base: '.' })
					.pipe(replace('@@VERSION@@', version))
					.pipe(replace('@@COMMIT@@', commit))
					.pipe(replace('@@APPNAME@@', product.applicationName))
					.pipe(rename(`bin/${product.applicationName}`))
					.pipe(util.setExecutableBit()),
				gulp.src('resources/server/bin/server.sh', { base: '.' })
					.pipe(rename(`server.sh`))
					.pipe(util.setExecutableBit())
			);
		}

		return result.pipe(vfs.dest(destination));
	};
}

function copyConfigTask(folder) {
	const destination = path.join(BUILD_ROOT, folder);
	return () => gulp.src(['remote/pkg-package.json'], { base: 'remote' })
		.pipe(rename(path => path.basename += '.' + folder))
		.pipe(json(obj => {
			const pkg = obj.pkg;
			pkg.scripts = pkg.scripts && pkg.scripts.map(p => path.join(destination, p));
			pkg.assets = pkg.assets && pkg.assets.map(p => path.join(destination, p));
			return obj;
		}))
		.pipe(vfs.dest('out-vscode-reh-pkg'));
}

function copyNativeTask(folder) {
	const destination = path.join(BUILD_ROOT, folder);
	return () => {
		const nativeLibraries = gulp.src(['remote/node_modules/**/*.node']);
		const license = gulp.src(['remote/LICENSE']);

		const result = es.merge(
			nativeLibraries,
			license
		);

		return result
			.pipe(rename({ dirname: '' }))
			.pipe(vfs.dest(destination));
	};
}

function packagePkgTask(platform, arch, pkgTarget) {
	const folder = path.join(BUILD_ROOT, 'vscode-reh') + (platform ? '-' + platform : '') + (arch ? '-' + arch : '');
	return () => {
		const cwd = process.cwd();
		const config = path.join(cwd, 'out-vscode-reh-pkg', 'pkg-package.vscode-reh-' + platform + '-' + arch + '.json');
		process.chdir(folder);
		console.log(`TODO`, pkgTarget, config);
		return null;
		// return pkg.exec(['-t', pkgTarget, '-d', '-c', config, '-o', path.join(folder + '-pkg', platform === 'win32' ? 'vscode-reh.exe' : 'vscode-reh'), './out/remoteExtensionHostAgent.js'])
		// 	.then(() => process.chdir(cwd));
	};
}

const BUILD_TARGETS = [
	{ platform: 'win32', arch: 'ia32', pkgTarget: 'node8-win-x86' },
	{ platform: 'win32', arch: 'x64', pkgTarget: 'node8-win-x64' },
	{ platform: 'darwin', arch: null, pkgTarget: 'node8-macos-x64' },
	{ platform: 'linux', arch: 'ia32', pkgTarget: 'node8-linux-x86' },
	{ platform: 'linux', arch: 'x64', pkgTarget: 'node8-linux-x64' },
	{ platform: 'linux', arch: 'armhf', pkgTarget: 'node8-linux-armv7' },
	{ platform: 'linux', arch: 'alpine', pkgTarget: 'node8-linux-alpine' },
];

BUILD_TARGETS.forEach(buildTarget => {
	const dashed = (str) => (str ? `-${str}` : ``);
	const platform = buildTarget.platform;
	const arch = buildTarget.arch;
	const pkgTarget = buildTarget.pkgTarget;

	const copyPkgConfigTask = task.define(`copy-pkg-config${dashed(platform)}${dashed(arch)}`, task.series(
		util.rimraf('out-vscode-reh-pkg'),
		copyConfigTask(`vscode-reh${dashed(platform)}${dashed(arch)}`)
	));

	const copyPkgNativeTask = task.define(`copy-pkg-native${dashed(platform)}${dashed(arch)}`, task.series(
		util.rimraf(path.join(BUILD_ROOT, `vscode-reh${dashed(platform)}${dashed(arch)}-pkg`)),
		copyNativeTask(`vscode-reh${dashed(platform)}${dashed(arch)}-pkg`)
	));

	['', 'min'].forEach(minified => {
		const sourceFolderName = `out-vscode-reh${dashed(minified)}`;
		const destinationFolderName = `vscode-reh${dashed(platform)}${dashed(arch)}${dashed(process.env['VSCODE_WEB_BUILD'] ? 'web' : '')}`;

		const vscodeREHTask = task.define(`vscode-reh${dashed(platform)}${dashed(arch)}${dashed(minified)}`, task.series(
			task.parallel(
				minified ? minifyVSCodeREHTask : optimizeVSCodeREHTask,
				util.rimraf(path.join(BUILD_ROOT, destinationFolderName))
			),
			packageTask(platform, arch, sourceFolderName, destinationFolderName)
		));
		gulp.task(vscodeREHTask);

		const vscodeREHPkgTask = task.define(`vscode-reh${dashed(platform)}${dashed(arch)}${dashed(minified)}-pkg`, task.series(
			task.parallel(
				vscodeREHTask,
				copyPkgConfigTask,
				copyPkgNativeTask
			),
			packagePkgTask(platform, arch, pkgTarget)
		));
		gulp.task(vscodeREHPkgTask);
	});
});

function mixinServer(watch) {
	const packageJSONPath = path.join(path.dirname(__dirname), 'package.json');
	function exec(cmdLine) {
		console.log(cmdLine);
		cp.execSync(cmdLine, { stdio: "inherit" });
	}
	function checkout() {
		const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath).toString());
		exec('git fetch distro');
		exec(`git checkout ${packageJSON['distro']} -- src/vs/server resources/server`);
		exec('git reset HEAD src/vs/server resources/server');
	}
	checkout();
	if (watch) {
		console.log('Enter watch mode (observing package.json)');
		const watcher = fs.watch(packageJSONPath);
		watcher.addListener('change', () => {
			try {
				checkout();
			} catch (e) {
				console.log(e);
			}
		});
	}
	return Promise.resolve();
}

gulp.task(task.define('mixin-server', () => mixinServer(false)));
gulp.task(task.define('mixin-server-watch', () => mixinServer(true)));
