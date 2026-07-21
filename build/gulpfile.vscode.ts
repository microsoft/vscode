/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { gulp, rename, replace, filter, jsonEditor } from './lib/gulp/facade.ts';
import * as fs from 'fs';
import * as path from 'path';
import es from 'event-stream';
import vfs from 'vinyl-fs';
import electron from '@vscode/gulp-electron';
import * as util from './lib/util.ts';
import { getVersion } from './lib/getVersion.ts';
import { readISODate, writeISODate } from './lib/date.ts';
import * as task from './lib/gulp/task.ts';
import buildfile from './buildfile.ts';
import * as optimize from './lib/optimize.ts';
import { inlineMeta } from './lib/inlineMeta.ts';
import packageJson from '../package.json' with { type: 'json' };
import product from '../product.json' with { type: 'json' };
import * as crypto from 'crypto';
import * as cp from 'child_process';
import * as i18n from './lib/i18n.ts';
import { getProductionDependencies } from './lib/dependencies.ts';
import { config } from './lib/electron.ts';
import { createAsar } from './lib/asar.ts';
import minimist from 'minimist';
import { compileBuildWithoutManglingTask, compileBuildWithManglingTask } from './gulpfile.compile.ts';
import { compileNonNativeExtensionsBuildTask, compileNativeExtensionsBuildTask, compileAllExtensionsBuildTask, compileExtensionMediaBuildTask, cleanExtensionsBuildTask, compileCopilotExtensionBuildTask } from './gulpfile.extensions.ts';
import { copyCodiconsTask } from './lib/compilation.ts';
import { ensureCopilotPlatformPackage, getCopilotExcludeFilter, getCopilotRuntimePrebuildFiles, getCopilotTgrepExcludeFilter, getMxcExcludeFilter, getRipgrepExcludeFilter, prepareBuiltInCopilotRipgrepShim } from './lib/copilot.ts';
import { ensureOSProxyResolverPlatformPackage, getOSProxyResolverExcludeFilter, getOSProxyResolverPlatformFiles } from './lib/osProxyResolver.ts';
import { readAgentSdkResults } from './agent-sdk/common.ts';
import { useEsbuildTranspile } from './buildConfig.ts';
import { promisify } from 'util';
import globCallback from 'glob';
import rceditCallback from 'rcedit';
import { spawnTsgo } from './lib/tsgo.ts';
import { runEsbuildTranspile, runEsbuildBundle } from './lib/esbuild.ts';


const glob = promisify(globCallback);
const rcedit = promisify(rceditCallback);
const root = path.dirname(import.meta.dirname);
const commit = getVersion(root);

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
	'out-build/vs/sessions/electron-browser/sessions.html',

	// Electron Preload
	'out-build/vs/base/parts/sandbox/electron-browser/preload.js',
	'out-build/vs/base/parts/sandbox/electron-browser/preload-aux.js',
	'out-build/vs/platform/browserView/electron-browser/preload-browserView.js',

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
	'out-build/vs/workbench/contrib/terminal/common/scripts/psreadline/**',

	// Accessibility Signals
	'out-build/vs/platform/accessibilitySignal/browser/media/*.mp3',

	// Welcome
	'out-build/vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.{svg,png}',
	'out-build/vs/workbench/contrib/welcomeOnboarding/browser/media/*.svg',

	// Sessions
	'out-build/vs/sessions/contrib/chat/browser/media/*.svg',
	'out-build/vs/sessions/contrib/welcome/browser/media/*.svg',
	'out-build/vs/sessions/contrib/welcome/browser/media/themePreviews/*.svg',
	'out-build/vs/sessions/prompts/*.prompt.md',
	'out-build/vs/sessions/skills/**/SKILL.md',

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
				skipTSBoilerplateRemoval: entryPoint => entryPoint === 'vs/code/electron-browser/workbench/workbench' || entryPoint === 'vs/sessions/electron-browser/sessions'
			}
		}
	)
));
task.task(bundleVSCodeTask);

const sourceMappingURLBase = `https://main.vscode-cdn.net/sourcemaps/${commit}`;
const isCI = !!process.env['CI'] || !!process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'] || !!process.env['GITHUB_WORKSPACE'];
const useCdnSourceMapsForPackagingTasks = isCI;
const stripSourceMapsInPackagingTasks = isCI;
const minifyVSCodeTask = task.define('minify-vscode', task.series(
	bundleVSCodeTask,
	util.rimraf('out-vscode-min'),
	optimize.minifyTask('out-vscode', `${sourceMappingURLBase}/core`)
));
task.task(minifyVSCodeTask);

task.task(task.define('core-ci-old', task.series(
	task.task('compile-build-with-mangling') as task.Task,
	task.parallel(
		task.task('minify-vscode') as task.Task,
		task.task('minify-vscode-reh') as task.Task,
		task.task('minify-vscode-reh-web') as task.Task,
	)
)));

task.task(task.define('core-ci', task.series(
	copyCodiconsTask,
	compileNonNativeExtensionsBuildTask,
	compileExtensionMediaBuildTask,
	writeISODate('out-build'),
	// Type-check with tsgo (no emit)
	task.define('tsgo-typecheck', () => spawnTsgo(path.join(root, 'src', 'tsconfig.json'), { taskName: 'tsgo-typecheck', noEmit: true })),
	// Transpile individual files to out-build first (for unit tests)
	task.define('esbuild-out-build', () => runEsbuildTranspile('out-build', false)),
	// Then bundle for shipping (bundles also write NLS files to out-build)
	task.parallel(
		task.define('esbuild-vscode-min', () => runEsbuildBundle('out-vscode-min', true, true, 'desktop', `${sourceMappingURLBase}/core`)),
		task.define('esbuild-vscode-reh-min', () => runEsbuildBundle('out-vscode-reh-min', true, true, 'server', `${sourceMappingURLBase}/core`)),
		task.define('esbuild-vscode-reh-web-min', () => runEsbuildBundle('out-vscode-reh-web-min', true, true, 'server-web', `${sourceMappingURLBase}/core`)),
	)
)));

/**
 * Compute checksums for some files.
 *
 * @param out The out folder to read the file from.
 * @param filenames The paths to compute a checksum for.
 * @return A map of paths to checksums.
 */
function computeChecksums(out: string, filenames: string[]): Record<string, string> {
	const result: Record<string, string> = {};
	filenames.forEach(function (filename) {
		const fullPath = path.join(process.cwd(), out, filename);
		result[filename] = computeChecksum(fullPath);
	});
	return result;
}

/**
 * Compute checksums for a file.
 *
 * @param filename The absolute path to a filename.
 * @return The checksum for `filename`.
 */
function computeChecksum(filename: string): string {
	const contents = fs.readFileSync(filename);

	const hash = crypto
		.createHash('sha256')
		.update(contents)
		.digest('base64')
		.replace(/=+$/, '');

	return hash;
}

// onnxruntime-node (direct dependency and transitive via @huggingface/transformers,
// on-device chat dictation) ships prebuilt binaries for every platform/arch inside its
// tarball. Keep only the target build's binary so we don't bloat each package
// with ~170MB of unused native code.
const onnxRuntimeShippedTargets: readonly [string, string][] = [
	['darwin', 'arm64'],
	['linux', 'x64'],
	['linux', 'arm64'],
	['win32', 'x64'],
	['win32', 'arm64'],
];
function getOnnxRuntimeExcludeFilter(platform: string, arch: string): string[] {
	return [
		'**',
		...onnxRuntimeShippedTargets
			.filter(([p, a]) => !(p === platform && a === arch))
			.map(([p, a]) => `!**/onnxruntime-node/bin/napi-v6/${p}/${a}/**`),
	];
}

function packageTask(platform: string, arch: string, sourceFolderName: string, destinationFolderName: string, _opts?: { stats?: boolean }) {
	const destination = path.join(path.dirname(root), destinationFolderName);
	platform = platform || process.platform;

	const task = () => {
		const out = sourceFolderName;
		const versionedResourcesFolder = util.getVersionedResourcesFolder(platform, commit!);

		const checksums = computeChecksums(out, [
			'vs/base/parts/sandbox/electron-browser/preload.js',
			'vs/workbench/workbench.desktop.main.js',
			'vs/workbench/workbench.desktop.main.css',
			'vs/workbench/api/node/extensionHostProcess.js',
			'vs/code/electron-browser/workbench/workbench.html',
			'vs/code/electron-browser/workbench/workbench.js',
			'vs/sessions/sessions.desktop.main.js',
			'vs/sessions/sessions.desktop.main.css',
			'vs/sessions/electron-browser/sessions.html',
			'vs/sessions/electron-browser/sessions.js'
		]);

		const src = gulp.src(out + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname!.replace(new RegExp('^' + out), 'out'); }))
			.pipe(util.setExecutableBit(['**/*.sh']));

		const platformSpecificBuiltInExtensionsExclusions = product.builtInExtensions.filter(ext => {
			if (!(ext as { platforms?: string[] }).platforms) {
				return false;
			}

			const set = new Set((ext as { platforms?: string[] }).platforms);
			return !set.has(platform);
		}).map(ext => `!.build/extensions/${ext.name}/**`);

		const extensions = gulp.src(['.build/extensions/**', ...platformSpecificBuiltInExtensionsExclusions], { base: '.build', dot: true });

		const sourceFilterPattern = stripSourceMapsInPackagingTasks
			? ['**', '!**/*.{js,css}.map']
			: ['**'];
		const sources = es.merge(src, extensions)
			.pipe(filter(sourceFilterPattern, { dot: true }));

		let version = packageJson.version;
		const quality = (product as { quality?: string }).quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const name = product.nameShort;
		const packageJsonUpdates: Record<string, unknown> = { name, version };

		if (platform === 'linux') {
			packageJsonUpdates.desktopName = `${product.applicationName}.desktop`;
		}

		let packageJsonContents: string;
		const packageJsonStream = gulp.src(['package.json'], { base: '.' })
			.pipe(jsonEditor(packageJsonUpdates))
			.pipe(es.through(function (file) {
				packageJsonContents = file.contents.toString();
				this.emit('data', file);
			}));

		let productJsonContents: string;
		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(jsonEditor((json: Record<string, unknown>) => {
				json.commit = commit;
				json.date = readISODate(out);
				json.checksums = checksums;
				json.version = version;
				// Stamp agentSdks from the per-platform results file produced
				// by `build/agent-sdk/produce.ts` (an earlier pipeline step).
				// Local dev: file absent → empty → not stamped.
				const agentSdks = readAgentSdkResults();
				if (Object.keys(agentSdks).length > 0) {
					json.agentSdks = agentSdks;
				}
				return json;
			}))
			.pipe(es.through(function (file) {
				productJsonContents = file.contents.toString();
				this.emit('data', file);
			}));

		const license = gulp.src([product.licenseFileName, 'ThirdPartyNotices.txt', 'licenses/**'], { base: '.', allowEmpty: true });

		// TODO the API should be copied to `out` during compile, not here
		const api = gulp.src('src/vscode-dts/vscode.d.ts').pipe(rename('out/vscode-dts/vscode.d.ts'));

		const telemetry = gulp.src('.build/telemetry/**', { base: '.build/telemetry', dot: true });

		const jsFilter = util.filter(data => !data.isDirectory() && /\.js$/.test(data.path));
		const root = path.resolve(path.join(import.meta.dirname, '..'));
		const productionDependencies = getProductionDependencies(root);
		const dependenciesSrc = productionDependencies.map(d => path.relative(root, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`]).flat().concat('!**/*.mk');

		const depFilterPattern = ['**', `!**/${config.version}/**`, '!**/bin/darwin-arm64-87/**', '!**/package-lock.json', '!**/yarn.lock'];
		if (stripSourceMapsInPackagingTasks) {
			depFilterPattern.push('!**/*.{js,css}.map');
		}

		const cleanedDeps = gulp.src(dependenciesSrc, { base: '.', dot: true })
			.pipe(filter(depFilterPattern))
			.pipe(util.cleanNodeModules(path.join(import.meta.dirname, '.moduleignore')))
			.pipe(util.cleanNodeModules(path.join(import.meta.dirname, `.moduleignore.${process.platform}`)));
		ensureCopilotPlatformPackage(platform, arch);
		const copilotRuntimePrebuilds = gulp.src(getCopilotRuntimePrebuildFiles(platform, arch), { base: '.', dot: true, allowEmpty: true });
		ensureOSProxyResolverPlatformPackage(platform, arch);
		const osProxyResolverPlatformPackage = gulp.src(getOSProxyResolverPlatformFiles(platform, arch), { base: '.', dot: true, allowEmpty: true });
		const deps = es.merge(cleanedDeps, copilotRuntimePrebuilds, osProxyResolverPlatformPackage)
			.pipe(filter(getCopilotExcludeFilter(platform, arch)))
			.pipe(filter(getCopilotTgrepExcludeFilter(platform, arch)))
			.pipe(filter(getRipgrepExcludeFilter(platform, arch)))
			.pipe(filter(getMxcExcludeFilter(arch)))
			.pipe(filter(getOnnxRuntimeExcludeFilter(platform, arch)))
			.pipe(filter(getOSProxyResolverExcludeFilter(platform, arch)))
			.pipe(jsFilter)
			.pipe(util.rewriteSourceMappingURL(sourceMappingURLBase))
			.pipe(jsFilter.restore)
			.pipe(createAsar(path.join(process.cwd(), 'node_modules'), [
				'**/*.node',
				'**/@vscode/ripgrep-universal/bin/**',
				// Only the platform-specific Copilot CLI packages (`@github/copilot-<os>-<arch>`)
				// need to be unpacked: the CLI is spawned as a subprocess and is a
				// self-locating bundle that memory-maps files and resolves its native
				// addons / sub-binaries relative to its own on-disk location, so it cannot
				// run from inside the archive. `@github/copilot-sdk` is intentionally NOT
				// matched here — it is pure JavaScript that the agent host loads via
				// `import` (ASAR-aware), so it stays in the archive.
				'**/@github/copilot-{darwin,linux,linuxmusl,win32}-*/**',
				'**/@microsoft/mxc-sdk/bin/**',
				'**/node-pty/build/Release/*',
				'**/node-pty/build/Release/conpty/*',
				'**/node-pty/lib/worker/conoutSocketWorker.js',
				'**/node-pty/lib/shared/conout.js',
				// node-pty spawns `conoutSocketWorker.js` as a Worker from the unpacked
				// tree (Windows only). Unpack node-pty's `package.json` alongside it so
				// Node finds a `package.json` without `"type": "module"` when walking up
				// from the worker file. Otherwise the lookup reaches the app's own
				// `package.json` (`"type": "module"`), the CommonJS worker is loaded as
				// ESM and throws `exports is not defined`, the worker never signals ready,
				// and node-pty blocks the pty host on `ConnectNamedPipe`.
				'**/node-pty/package.json',
				'**/*.wasm',
				'**/@vscode/vsce-sign/bin/*',
				// onnxruntime-node (direct dependency and transitive via
				// @huggingface/transformers, used
				// for on-device chat dictation) ships a prebuilt N-API addon that
				// dlopen's sibling shared libraries (libonnxruntime.*.dylib / .so /
				// onnxruntime.dll + DirectML). The OS loader resolves those by
				// on-disk path relative to the addon, so the whole bin/ tree must
				// live outside the archive, not just the `.node` file.
				'**/onnxruntime-node/bin/**',
			], [
				'**/*.mk',
			], [
				'node_modules/vsda/**', // retain copy of `vsda` in node_modules for internal use
				// The sandbox runtime is spawned as a standalone Node subprocess (no ASAR
				// resolution hook), so it and its transitive JS dependencies must remain as
				// real files under `node_modules`. Keep them duplicated out of the archive.
				'node_modules/@vscode/sandbox-runtime/**', // includes its nested `commander`
				'node_modules/@pondwader/socks5-server/**',
				'node_modules/shell-quote/**',
				'node_modules/zod/**'
			], 'node_modules.asar'));

		const mergeStreams = [
			packageJsonStream,
			productJsonStream,
			license,
			api,
			telemetry,
			sources,
			deps
		];
		let all = es.merge(...mergeStreams);

		if (platform === 'win32') {
			all = es.merge(all, gulp.src([
				'resources/win32/bower.ico',
				'resources/win32/c.ico',
				'resources/win32/code.ico',
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
			const policyDest = gulp.src('.build/policies/linux/**', { base: '.build/policies/linux' })
				.pipe(rename(f => f.dirname = `policies/${f.dirname}`));
			all = es.merge(all, gulp.src('resources/linux/code.png', { base: '.' }), policyDest);
		} else if (platform === 'darwin') {
			const shortcut = gulp.src('resources/darwin/bin/code.sh')
				.pipe(replace('@@APPNAME@@', product.applicationName))
				.pipe(replace('@@NAME@@', product.nameShort))
				.pipe(rename('bin/code'));
			const policyDest = gulp.src('.build/policies/darwin/**', { base: '.build/policies/darwin' })
				.pipe(rename(f => f.dirname = `policies/${f.dirname}`));
			all = es.merge(all, shortcut, policyDest);
		}

		const electronConfig = {
			...config,
			platform,
			arch: arch === 'armhf' ? 'arm' : arch,
			ffmpegChromium: false
		};

		let result: NodeJS.ReadWriteStream = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions())
			.pipe(filter(['**', '!**/.github/**'], { dot: true })) // https://github.com/microsoft/vscode/issues/116523
			.pipe(electron(electronConfig))
			.pipe(filter([
				'**',
				'!LICENSE',
				'!version',
				...(platform === 'darwin' ? ['!**/Contents/Applications', '!**/Contents/Applications/**'] : []),
				...(platform === 'win32' ? ['!**/electron_proxy.exe'] : []),
			], { dot: true }));

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

			if (versionedResourcesFolder) {
				result = es.merge(result, gulp.src('resources/win32/versioned/bin/code.cmd', { base: 'resources/win32/versioned' })
					.pipe(replace('@@NAME@@', product.nameShort))
					.pipe(replace('@@VERSIONFOLDER@@', versionedResourcesFolder))
					.pipe(rename(function (f) { f.basename = product.applicationName; })));

				result = es.merge(result, gulp.src('resources/win32/versioned/bin/code.sh', { base: 'resources/win32/versioned' })
					.pipe(replace('@@NAME@@', product.nameShort))
					.pipe(replace('@@PRODNAME@@', product.nameLong))
					.pipe(replace('@@VERSION@@', version))
					.pipe(replace('@@COMMIT@@', String(commit)))
					.pipe(replace('@@APPNAME@@', product.applicationName))
					.pipe(replace('@@VERSIONFOLDER@@', versionedResourcesFolder))
					.pipe(replace('@@SERVERDATAFOLDER@@', product.serverDataFolderName || '.vscode-remote'))
					.pipe(replace('@@QUALITY@@', quality!))
					.pipe(rename(function (f) { f.basename = product.applicationName; f.extname = ''; })));
			} else {
				result = es.merge(result, gulp.src('resources/win32/bin/code.cmd', { base: 'resources/win32' })
					.pipe(replace('@@NAME@@', product.nameShort))
					.pipe(rename(function (f) { f.basename = product.applicationName; })));

				result = es.merge(result, gulp.src('resources/win32/bin/code.sh', { base: 'resources/win32' })
					.pipe(replace('@@NAME@@', product.nameShort))
					.pipe(replace('@@PRODNAME@@', product.nameLong))
					.pipe(replace('@@VERSION@@', version))
					.pipe(replace('@@COMMIT@@', String(commit)))
					.pipe(replace('@@APPNAME@@', product.applicationName))
					.pipe(replace('@@SERVERDATAFOLDER@@', product.serverDataFolderName || '.vscode-remote'))
					.pipe(replace('@@QUALITY@@', String(quality)))
					.pipe(rename(function (f) { f.basename = product.applicationName; f.extname = ''; })));
			}

			result = es.merge(result, gulp.src('resources/win32/VisualElementsManifest.xml', { base: 'resources/win32' })
				.pipe(replace('@@VERSIONFOLDER@@', versionedResourcesFolder ? `${versionedResourcesFolder}\\` : ''))
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
					.pipe(replace('@@FileExplorerContextMenuCLSID@@', (product as { win32ContextMenu?: Record<string, { clsid: string }> }).win32ContextMenu![arch].clsid))
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

function hasAuthenticodeSignature(filePath: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const proc = cp.spawn('signtool.exe', ['verify', '/pa', filePath]);
		proc.on('error', reject);
		proc.on('exit', code => resolve(code === 0));
	});
}

async function stripAuthenticodeSignature(filePath: string): Promise<void> {
	// ESRP's `signtool /as` (append) fails with 0x800700C1 on PEs whose existing
	// Authenticode signature was invalidated by rcedit. Strip cleanly first so
	// rcedit operates on an unsigned PE.
	if (!await hasAuthenticodeSignature(filePath)) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const proc = cp.spawn('signtool.exe', ['remove', '/s', filePath]);
		let out = '';
		proc.stdout?.on('data', chunk => out += chunk.toString());
		proc.stderr?.on('data', chunk => out += chunk.toString());
		proc.on('error', reject);
		proc.on('exit', code => {
			if (code === 0) {
				resolve();
			} else {
				process.stderr.write(out);
				reject(new Error(`signtool remove /s failed for ${filePath} (exit ${code})`));
			}
		});
	});
}

function patchWin32DependenciesTask(destinationFolderName: string) {
	const cwd = path.join(path.dirname(root), destinationFolderName);

	return async () => {
		const versionedResourcesFolder = util.getVersionedResourcesFolder('win32', commit!);
		const deps = (await Promise.all([
			glob('**/*.node', { cwd, ignore: 'extensions/node_modules/@parcel/watcher/**' }),
			glob('**/rg.exe', { cwd }),
			glob('**/tgrep.exe', { cwd }),
			glob('**/node_modules.asar.unpacked/@github/copilot-win32-*/builtin-plugins/computer-use/*/win32-*/computer-use-mcp.exe', { cwd }),
			glob('**/node_modules.asar.unpacked/@github/copilot-win32-*/builtin-plugins/computer-use/*/win32-*/CopilotComputerUse.exe', { cwd }),
			glob('**/*explorer_command*.dll', { cwd }),
		])).flatMap(o => o);
		const packageJson = JSON.parse(await fs.promises.readFile(path.join(cwd, versionedResourcesFolder, 'resources', 'app', 'package.json'), 'utf8'));
		const product = JSON.parse(await fs.promises.readFile(path.join(cwd, versionedResourcesFolder, 'resources', 'app', 'product.json'), 'utf8'));
		const baseVersion = packageJson.version.replace(/-.*$/, '');

		const patchPromises = deps.map<Promise<unknown>>(async dep => {
			const basename = path.basename(dep);
			const fullPath = path.join(cwd, dep);

			await stripAuthenticodeSignature(fullPath);
			await rcedit(fullPath, {
				'file-version': baseVersion,
				'version-string': {
					'CompanyName': 'Microsoft Corporation',
					'FileDescription': product.nameLong,
					'FileVersion': packageJson.version,
					'InternalName': basename,
					'LegalCopyright': 'Copyright (C) 2026 Microsoft. All rights reserved',
					'OriginalFilename': basename,
					'ProductName': product.nameLong,
					'ProductVersion': packageJson.version,
				}
			});
		});

		await Promise.all(patchPromises);
	};
}

function prepareCopilotRipgrepShimTask(platform: string, arch: string, destinationFolderName: string) {
	const outputDir = path.join(path.dirname(root), destinationFolderName);

	return async () => {
		// On Windows with win32VersionedUpdate, app resources live under a
		// commit-hash prefix: {output}/{commitHash}/resources/app/
		const versionedResourcesFolder = util.getVersionedResourcesFolder(platform, commit!);
		const appBase = platform === 'darwin'
			? path.join(outputDir, `${product.nameLong}.app`, 'Contents', 'Resources', 'app')
			: path.join(outputDir, versionedResourcesFolder, 'resources', 'app');
		const appNodeModulesDir = path.join(appBase, 'node_modules.asar.unpacked');

		const builtInCopilotExtensionDir = path.join(appBase, 'extensions', 'copilot');
		prepareBuiltInCopilotRipgrepShim(platform, arch, builtInCopilotExtensionDir, appNodeModulesDir);
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
	const dashed = (str: string) => (str ? `-${str}` : ``);
	const platform = buildTarget.platform;
	const arch = buildTarget.arch;
	const opts = buildTarget.opts;

	const [vscode, vscodeMin] = ['', 'min'].map(minified => {
		const sourceFolderName = `out-vscode${dashed(minified)}`;
		const destinationFolderName = `VSCode${dashed(platform)}${dashed(arch)}`;

		const packageTasks: task.Task[] = [
			compileNativeExtensionsBuildTask,
			util.rimraf(path.join(buildRoot, destinationFolderName)),
			packageTask(platform, arch, sourceFolderName, destinationFolderName, opts),
			prepareCopilotRipgrepShimTask(platform, arch, destinationFolderName)
		];

		if (platform === 'win32') {
			packageTasks.push(patchWin32DependenciesTask(destinationFolderName));
		}

		const vscodeTaskCI = task.define(`vscode${dashed(platform)}${dashed(arch)}${dashed(minified)}-ci`, task.series(...packageTasks));
		task.task(vscodeTaskCI);

		let vscodeTask: task.Task;
		if (useEsbuildTranspile) {
			const esbuildBundleTask = task.define(
				`esbuild-bundle${dashed(platform)}${dashed(arch)}${dashed(minified)}`,
				() => runEsbuildBundle(
					sourceFolderName,
					!!minified,
					true,
					'desktop',
					minified && useCdnSourceMapsForPackagingTasks ? `${sourceMappingURLBase}/core` : undefined
				)
			);
			vscodeTask = task.define(`vscode${dashed(platform)}${dashed(arch)}${dashed(minified)}`, task.series(
				copyCodiconsTask,
				cleanExtensionsBuildTask,
				compileNonNativeExtensionsBuildTask,
				compileCopilotExtensionBuildTask,
				compileExtensionMediaBuildTask,
				writeISODate('out-build'),
				esbuildBundleTask,
				vscodeTaskCI
			));
		} else {
			vscodeTask = task.define(`vscode${dashed(platform)}${dashed(arch)}${dashed(minified)}`, task.series(
				minified ? compileBuildWithManglingTask : compileBuildWithoutManglingTask,
				cleanExtensionsBuildTask,
				compileNonNativeExtensionsBuildTask,
				compileCopilotExtensionBuildTask,
				compileExtensionMediaBuildTask,
				minified ? minifyVSCodeTask : bundleVSCodeTask,
				vscodeTaskCI
			));
		}
		task.task(vscodeTask);

		return vscodeTask;
	});

	if (process.platform === platform && process.arch === arch) {
		task.task(task.define('vscode', task.series(vscode)));
		task.task(task.define('vscode-min', task.series(vscodeMin)));
	}
});

// #region nls

task.task(task.define(
	'vscode-translations-export',
	task.series(
		task.task('core-ci') as task.Task,
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

task.task('vscode-translations-import', function () {
	const options = minimist(process.argv.slice(2), {
		string: 'location',
		default: {
			location: '../vscode-translations-import'
		}
	});
	return es.merge([...i18n.defaultLanguages, ...i18n.extraLanguages].map(language => {
		const id = language.id;
		return gulp.src(`${options.location}/${id}/vscode-setup/messages.xlf`)
			.pipe(i18n.prepareIslFiles(language))
			.pipe(vfs.dest(`./build/win32/i18n`));
	}));
});

// #endregion
