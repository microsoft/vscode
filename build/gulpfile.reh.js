/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const es = require('event-stream');
const util = require('./lib/util');
const { getVersion } = require('./lib/getVersion');
const task = require('./lib/task');
const optimize = require('./lib/optimize');
const product = require('../product.json');
const rename = require('gulp-rename');
const replace = require('gulp-replace');
const filter = require('gulp-filter');
const { getProductionDependencies } = require('./lib/dependencies');
const vfs = require('vinyl-fs');
const packageJson = require('../package.json');
const flatmap = require('gulp-flatmap');
const gunzip = require('gulp-gunzip');
const File = require('vinyl');
const fs = require('fs');
const glob = require('glob');
const { compileBuildTask } = require('./gulpfile.compile');
const { compileExtensionsBuildTask, compileExtensionMediaBuildTask } = require('./gulpfile.extensions');
const { vscodeWebEntryPoints, vscodeWebResourceIncludes, createVSCodeWebFileContentMapper } = require('./gulpfile.vscode.web');
const cp = require('child_process');
const log = require('fancy-log');

const REPO_ROOT = path.dirname(__dirname);
const commit = getVersion(REPO_ROOT);
const BUILD_ROOT = path.dirname(REPO_ROOT);
const REMOTE_FOLDER = path.join(REPO_ROOT, 'remote');

// Targets

const BUILD_TARGETS = [
	{ platform: 'win32', arch: 'x64' },
	{ platform: 'darwin', arch: 'x64' },
	{ platform: 'darwin', arch: 'arm64' },
	{ platform: 'linux', arch: 'x64' },
	{ platform: 'linux', arch: 'armhf' },
	{ platform: 'linux', arch: 'arm64' },
	{ platform: 'alpine', arch: 'arm64' },
	// legacy: we use to ship only one alpine so it was put in the arch, but now we ship
	// multiple alpine images and moved to a better model (alpine as the platform)
	{ platform: 'linux', arch: 'alpine' },
];

const serverResources = [

	// Bootstrap
	'out-build/bootstrap.js',
	'out-build/bootstrap-fork.js',
	'out-build/bootstrap-amd.js',
	'out-build/bootstrap-node.js',

	// Performance
	'out-build/vs/base/common/performance.js',

	// Process monitor
	'out-build/vs/base/node/cpuUsage.sh',
	'out-build/vs/base/node/ps.sh',

	// Terminal shell integration
	'out-build/vs/workbench/contrib/terminal/browser/media/shellIntegration.ps1',
	'out-build/vs/workbench/contrib/terminal/browser/media/shellIntegration-bash.sh',
	'out-build/vs/workbench/contrib/terminal/browser/media/shellIntegration-env.zsh',
	'out-build/vs/workbench/contrib/terminal/browser/media/shellIntegration-profile.zsh',
	'out-build/vs/workbench/contrib/terminal/browser/media/shellIntegration-rc.zsh',
	'out-build/vs/workbench/contrib/terminal/browser/media/shellIntegration-login.zsh',
	'out-build/vs/workbench/contrib/terminal/browser/media/fish_xdg_data/fish/vendor_conf.d/shellIntegration.fish',

	'!**/test/**'
];

const serverWithWebResources = [

	// Include all of server...
	...serverResources,

	// ...and all of web
	...vscodeWebResourceIncludes
];

const serverEntryPoints = [
	{
		name: 'vs/server/node/server.main',
		exclude: ['vs/css', 'vs/nls']
	},
	{
		name: 'vs/server/node/server.cli',
		exclude: ['vs/css', 'vs/nls']
	},
	{
		name: 'vs/workbench/api/node/extensionHostProcess',
		exclude: ['vs/css', 'vs/nls']
	},
	{
		name: 'vs/platform/files/node/watcher/watcherMain',
		exclude: ['vs/css', 'vs/nls']
	},
	{
		name: 'vs/platform/terminal/node/ptyHostMain',
		exclude: ['vs/css', 'vs/nls']
	}
];

const serverWithWebEntryPoints = [

	// Include all of server
	...serverEntryPoints,

	// Include workbench web
	...vscodeWebEntryPoints
];

function getNodeVersion() {
	const yarnrc = fs.readFileSync(path.join(REPO_ROOT, 'remote', '.yarnrc'), 'utf8');
	const nodeVersion = /^target "(.*)"$/m.exec(yarnrc)[1];
	const internalNodeVersion = /^ms_build_id "(.*)"$/m.exec(yarnrc)[1];
	return { nodeVersion, internalNodeVersion };
}

function getNodeChecksum(nodeVersion, platform, arch, glibcPrefix) {
	let expectedName;
	switch (platform) {
		case 'win32':
			expectedName = `win-${arch}/node.exe`;
			break;

		case 'darwin':
		case 'alpine':
		case 'linux':
			expectedName = `node-v${nodeVersion}${glibcPrefix}-${platform}-${arch}.tar.gz`;
			break;
	}

	const nodeJsChecksums = fs.readFileSync(path.join(REPO_ROOT, 'build', 'checksums', 'nodejs.txt'), 'utf8');
	for (const line of nodeJsChecksums.split('\n')) {
		const [checksum, name] = line.split(/\s+/);
		if (name === expectedName) {
			return checksum;
		}
	}
	return undefined;
}

function extractAlpinefromDocker(nodeVersion, platform, arch) {
	const imageName = arch === 'arm64' ? 'arm64v8/node' : 'node';
	log(`Downloading node.js ${nodeVersion} ${platform} ${arch} from docker image ${imageName}`);
	const contents = cp.execSync(`docker run --rm ${imageName}:${nodeVersion}-alpine /bin/sh -c 'cat \`which node\`'`, { maxBuffer: 100 * 1024 * 1024, encoding: 'buffer' });
	return es.readArray([new File({ path: 'node', contents, stat: { mode: parseInt('755', 8) } })]);
}

const { nodeVersion, internalNodeVersion } = getNodeVersion();

BUILD_TARGETS.forEach(({ platform, arch }) => {
	gulp.task(task.define(`node-${platform}-${arch}`, () => {
		const nodePath = path.join('.build', 'node', `v${nodeVersion}`, `${platform}-${arch}`);

		if (!fs.existsSync(nodePath)) {
			util.rimraf(nodePath);

			return nodejs(platform, arch)
				.pipe(vfs.dest(nodePath));
		}

		return Promise.resolve(null);
	}));
});

const defaultNodeTask = gulp.task(`node-${process.platform}-${process.arch}`);

if (defaultNodeTask) {
	gulp.task(task.define('node', defaultNodeTask));
}

function nodejs(platform, arch) {
	const { fetchUrls, fetchGithub } = require('./lib/fetch');
	const untar = require('gulp-untar');
	const crypto = require('crypto');

	if (arch === 'armhf') {
		arch = 'armv7l';
	} else if (arch === 'alpine') {
		platform = 'alpine';
		arch = 'x64';
	}

	log(`Downloading node.js ${nodeVersion} ${platform} ${arch} from ${product.nodejsRepository}...`);

	const glibcPrefix = process.env['VSCODE_NODE_GLIBC'] ?? '';
	const checksumSha256 = getNodeChecksum(nodeVersion, platform, arch, glibcPrefix);

	if (checksumSha256) {
		log(`Using SHA256 checksum for checking integrity: ${checksumSha256}`);
	} else {
		log.warn(`Unable to verify integrity of downloaded node.js binary because no SHA256 checksum was found!`);
	}

	switch (platform) {
		case 'win32':
			return (product.nodejsRepository !== 'https://nodejs.org' ?
				fetchGithub(product.nodejsRepository, { version: `${nodeVersion}-${internalNodeVersion}`, name: `win-${arch}-node.exe`, checksumSha256 }) :
				fetchUrls(`/dist/v${nodeVersion}/win-${arch}/node.exe`, { base: 'https://nodejs.org', checksumSha256 }))
				.pipe(rename('node.exe'));
		case 'darwin':
		case 'linux':
			return (product.nodejsRepository !== 'https://nodejs.org' ?
				fetchGithub(product.nodejsRepository, { version: `${nodeVersion}-${internalNodeVersion}`, name: `node-v${nodeVersion}${glibcPrefix}-${platform}-${arch}.tar.gz`, checksumSha256 }) :
				fetchUrls(`/dist/v${nodeVersion}/node-v${nodeVersion}-${platform}-${arch}.tar.gz`, { base: 'https://nodejs.org', checksumSha256 })
			).pipe(flatmap(stream => stream.pipe(gunzip()).pipe(untar())))
				.pipe(filter('**/node'))
				.pipe(util.setExecutableBit('**'))
				.pipe(rename('node'));
		case 'alpine':
			return product.nodejsRepository !== 'https://nodejs.org' ?
				fetchGithub(product.nodejsRepository, { version: `${nodeVersion}-${internalNodeVersion}`, name: `node-v${nodeVersion}-${platform}-${arch}.tar.gz`, checksumSha256 })
					.pipe(flatmap(stream => stream.pipe(gunzip()).pipe(untar())))
					.pipe(filter('**/node'))
					.pipe(util.setExecutableBit('**'))
					.pipe(rename('node'))
				: extractAlpinefromDocker(nodeVersion, platform, arch);
	}
}

function packageTask(type, platform, arch, sourceFolderName, destinationFolderName) {
	const destination = path.join(BUILD_ROOT, destinationFolderName);

	return () => {
		const json = require('gulp-json-editor');

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
				if (type === 'reh-web') {
					return true; // web: ship all extensions for now
				}

				// Skip shipping UI extensions because the client side will have them anyways
				// and they'd just increase the download without being used
				const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, extensionPath)).toString());
				return !isUIExtension(manifest);
			}).map((extensionPath) => path.basename(path.dirname(extensionPath)))
			.filter(name => name !== 'vscode-api-tests' && name !== 'vscode-test-resolver'); // Do not ship the test extensions
		const marketplaceExtensions = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'product.json'), 'utf8')).builtInExtensions
			.filter(entry => !entry.platforms || new Set(entry.platforms).has(platform))
			.filter(entry => !entry.clientOnly)
			.map(entry => entry.name);
		const extensionPaths = [...localWorkspaceExtensions, ...marketplaceExtensions]
			.map(name => `.build/extensions/${name}/**`);

		const extensions = gulp.src(extensionPaths, { base: '.build', dot: true });
		const extensionsCommonDependencies = gulp.src('.build/extensions/node_modules/**', { base: '.build', dot: true });
		const sources = es.merge(src, extensions, extensionsCommonDependencies)
			.pipe(filter(['**', '!**/*.js.map'], { dot: true }));

		let version = packageJson.version;
		const quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['remote/package.json'], { base: 'remote' })
			.pipe(json({ name, version, dependencies: undefined, optionalDependencies: undefined }));

		const date = new Date().toISOString();

		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(json({ commit, date, version }));

		const license = gulp.src(['remote/LICENSE'], { base: 'remote', allowEmpty: true });

		const jsFilter = util.filter(data => !data.isDirectory() && /\.js$/.test(data.path));

		const productionDependencies = getProductionDependencies(REMOTE_FOLDER);
		const dependenciesSrc = productionDependencies.map(d => path.relative(REPO_ROOT, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]).flat();
		const deps = gulp.src(dependenciesSrc, { base: 'remote', dot: true })
			// filter out unnecessary files, no source maps in server build
			.pipe(filter(['**', '!**/package-lock.json', '!**/yarn.lock', '!**/*.js.map']))
			.pipe(util.cleanNodeModules(path.join(__dirname, '.moduleignore')))
			.pipe(util.cleanNodeModules(path.join(__dirname, `.moduleignore.${process.platform}`)))
			.pipe(jsFilter)
			.pipe(util.stripSourceMappingURL())
			.pipe(jsFilter.restore);

		const nodePath = `.build/node/v${nodeVersion}/${platform}-${arch}`;
		const node = gulp.src(`${nodePath}/**`, { base: nodePath, dot: true });

		let web = [];
		if (type === 'reh-web') {
			web = [
				'resources/server/favicon.ico',
				'resources/server/code-192.png',
				'resources/server/code-512.png',
				'resources/server/manifest.json'
			].map(resource => gulp.src(resource, { base: '.' }).pipe(rename(resource)));
		}

		const all = es.merge(
			packageJsonStream,
			productJsonStream,
			license,
			sources,
			deps,
			node,
			...web
		);

		let result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		if (platform === 'win32') {
			result = es.merge(result,
				gulp.src('resources/server/bin/remote-cli/code.cmd', { base: '.' })
					.pipe(replace('@@VERSION@@', version))
					.pipe(replace('@@COMMIT@@', commit))
					.pipe(replace('@@APPNAME@@', product.applicationName))
					.pipe(rename(`bin/remote-cli/${product.applicationName}.cmd`)),
				gulp.src('resources/server/bin/helpers/browser.cmd', { base: '.' })
					.pipe(replace('@@VERSION@@', version))
					.pipe(replace('@@COMMIT@@', commit))
					.pipe(replace('@@APPNAME@@', product.applicationName))
					.pipe(rename(`bin/helpers/browser.cmd`)),
				gulp.src('resources/server/bin/code-server.cmd', { base: '.' })
					.pipe(rename(`bin/${product.serverApplicationName}.cmd`)),
			);
		} else if (platform === 'linux' || platform === 'alpine' || platform === 'darwin') {
			result = es.merge(result,
				gulp.src(`resources/server/bin/remote-cli/${platform === 'darwin' ? 'code-darwin.sh' : 'code-linux.sh'}`, { base: '.' })
					.pipe(replace('@@VERSION@@', version))
					.pipe(replace('@@COMMIT@@', commit))
					.pipe(replace('@@APPNAME@@', product.applicationName))
					.pipe(rename(`bin/remote-cli/${product.applicationName}`))
					.pipe(util.setExecutableBit()),
				gulp.src(`resources/server/bin/helpers/${platform === 'darwin' ? 'browser-darwin.sh' : 'browser-linux.sh'}`, { base: '.' })
					.pipe(replace('@@VERSION@@', version))
					.pipe(replace('@@COMMIT@@', commit))
					.pipe(replace('@@APPNAME@@', product.applicationName))
					.pipe(rename(`bin/helpers/browser.sh`))
					.pipe(util.setExecutableBit()),
				gulp.src(`resources/server/bin/${platform === 'darwin' ? 'code-server-darwin.sh' : 'code-server-linux.sh'}`, { base: '.' })
					.pipe(rename(`bin/${product.serverApplicationName}`))
					.pipe(util.setExecutableBit())
			);
		}

		if (platform === 'linux' && process.env['VSCODE_NODE_GLIBC'] === '-glibc-2.17') {
			result = es.merge(result,
				gulp.src(`resources/server/bin/helpers/check-requirements-linux-legacy.sh`, { base: '.' })
					.pipe(rename(`bin/helpers/check-requirements.sh`))
					.pipe(util.setExecutableBit())
			);
		} else if (platform === 'linux' || platform === 'alpine') {
			result = es.merge(result,
				gulp.src(`resources/server/bin/helpers/check-requirements-linux.sh`, { base: '.' })
					.pipe(rename(`bin/helpers/check-requirements.sh`))
					.pipe(util.setExecutableBit())
			);
		}

		return result.pipe(vfs.dest(destination));
	};
}

/**
 * @param {object} product The parsed product.json file contents
 */
function tweakProductForServerWeb(product) {
	const result = { ...product };
	delete result.webEndpointUrlTemplate;
	return result;
}

['reh', 'reh-web'].forEach(type => {
	const optimizeTask = task.define(`optimize-vscode-${type}`, task.series(
		util.rimraf(`out-vscode-${type}`),
		optimize.optimizeTask(
			{
				out: `out-vscode-${type}`,
				amd: {
					src: 'out-build',
					entryPoints: (type === 'reh' ? serverEntryPoints : serverWithWebEntryPoints).flat(),
					otherSources: [],
					resources: type === 'reh' ? serverResources : serverWithWebResources,
					loaderConfig: optimize.loaderConfig(),
					inlineAmdImages: true,
					bundleInfo: undefined,
					fileContentMapper: createVSCodeWebFileContentMapper('.build/extensions', type === 'reh-web' ? tweakProductForServerWeb(product) : product)
				},
				commonJS: {
					src: 'out-build',
					entryPoints: [
						'out-build/server-main.js',
						'out-build/server-cli.js'
					],
					platform: 'node',
					external: [
						'minimist',
						// TODO: we cannot inline `product.json` because
						// it is being changed during build time at a later
						// point in time (such as `checksums`)
						'../product.json',
						'../package.json'
					]
				}
			}
		)
	));

	const minifyTask = task.define(`minify-vscode-${type}`, task.series(
		optimizeTask,
		util.rimraf(`out-vscode-${type}-min`),
		optimize.minifyTask(`out-vscode-${type}`, `https://ticino.blob.core.windows.net/sourcemaps/${commit}/core`)
	));
	gulp.task(minifyTask);

	BUILD_TARGETS.forEach(buildTarget => {
		const dashed = (str) => (str ? `-${str}` : ``);
		const platform = buildTarget.platform;
		const arch = buildTarget.arch;

		['', 'min'].forEach(minified => {
			const sourceFolderName = `out-vscode-${type}${dashed(minified)}`;
			const destinationFolderName = `vscode-${type}${dashed(platform)}${dashed(arch)}`;

			const serverTaskCI = task.define(`vscode-${type}${dashed(platform)}${dashed(arch)}${dashed(minified)}-ci`, task.series(
				gulp.task(`node-${platform}-${arch}`),
				util.rimraf(path.join(BUILD_ROOT, destinationFolderName)),
				packageTask(type, platform, arch, sourceFolderName, destinationFolderName)
			));
			gulp.task(serverTaskCI);

			const serverTask = task.define(`vscode-${type}${dashed(platform)}${dashed(arch)}${dashed(minified)}`, task.series(
				compileBuildTask,
				compileExtensionsBuildTask,
				compileExtensionMediaBuildTask,
				minified ? minifyTask : optimizeTask,
				serverTaskCI
			));
			gulp.task(serverTask);
		});
	});
});
