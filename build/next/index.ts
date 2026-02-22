/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import glob from 'glob';
import gulpWatch from '../lib/watch/index.ts';
import { nlsPlugin, createNLSCollector, finalizeNLS, postProcessNLS } from './nls-plugin.ts';
import { convertPrivateFields, type ConvertPrivateFieldsResult } from './private-to-property.ts';
import { getVersion } from '../lib/getVersion.ts';
import product from '../../product.json' with { type: 'json' };
import packageJson from '../../package.json' with { type: 'json' };
import { useEsbuildTranspile } from '../buildConfig.ts';
import { isWebExtension, type IScannedBuiltinExtension } from '../lib/extensions.ts';

const globAsync = promisify(glob);

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = path.dirname(path.dirname(import.meta.dirname));
const commit = getVersion(REPO_ROOT);
const quality = (product as { quality?: string }).quality;
const version = (quality && quality !== 'stable') ? `${packageJson.version}-${quality}` : packageJson.version;

// CLI: transpile [--watch] | bundle [--minify] [--nls] [--out <dir>]
const command = process.argv[2]; // 'transpile' or 'bundle'

function getArgValue(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	if (index !== -1 && index + 1 < process.argv.length) {
		return process.argv[index + 1];
	}
	return undefined;
}

const options = {
	watch: process.argv.includes('--watch'),
	minify: process.argv.includes('--minify'),
	nls: process.argv.includes('--nls'),
	manglePrivates: process.argv.includes('--mangle-privates'),
	excludeTests: process.argv.includes('--exclude-tests'),
	out: getArgValue('--out'),
	target: getArgValue('--target') ?? 'desktop', // 'desktop' | 'server' | 'server-web' | 'web'
	sourceMapBaseUrl: getArgValue('--source-map-base-url'),
};

// Build targets
type BuildTarget = 'desktop' | 'server' | 'server-web' | 'web';

const SRC_DIR = 'src';
const OUT_DIR = 'out';
const OUT_VSCODE_DIR = 'out-vscode';

// UTF-8 BOM - added to test files with 'utf8' in the path (matches gulp build behavior)
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// ============================================================================
// Entry Points (from build/buildfile.ts)
// ============================================================================

// Extension host bundles are excluded from private field mangling because they
// expose API surface to extensions where encapsulation matters.
const extensionHostEntryPoints = [
	'vs/workbench/api/node/extensionHostProcess',
	'vs/workbench/api/worker/extensionHostWorkerMain',
];

function isExtensionHostBundle(filePath: string): boolean {
	return extensionHostEntryPoints.some(ep => filePath.endsWith(`${ep}.js`));
}

// Workers - shared between targets
const workerEntryPoints = [
	'vs/editor/common/services/editorWebWorkerMain',
	'vs/workbench/api/worker/extensionHostWorkerMain',
	'vs/workbench/contrib/notebook/common/services/notebookWebWorkerMain',
	'vs/workbench/services/languageDetection/browser/languageDetectionWebWorkerMain',
	'vs/workbench/services/search/worker/localFileSearchMain',
	'vs/workbench/contrib/output/common/outputLinkComputerMain',
	'vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.workerMain',
];

// Desktop-only workers (use electron-browser)
const desktopWorkerEntryPoints = [
	'vs/platform/profiling/electron-browser/profileAnalysisWorkerMain',
];

// Desktop workbench and code entry points
const desktopEntryPoints = [
	'vs/workbench/workbench.desktop.main',
	'vs/sessions/sessions.desktop.main',
	'vs/workbench/contrib/debug/node/telemetryApp',
	'vs/platform/files/node/watcher/watcherMain',
	'vs/platform/terminal/node/ptyHostMain',
	'vs/workbench/api/node/extensionHostProcess',
];

const codeEntryPoints = [
	'vs/code/node/cliProcessMain',
	'vs/code/electron-utility/sharedProcess/sharedProcessMain',
	'vs/code/electron-browser/workbench/workbench',
	'vs/sessions/electron-browser/sessions',
];

// Web entry points (used in server-web and vscode-web)
const webEntryPoints = [
	'vs/workbench/workbench.web.main.internal',
	'vs/code/browser/workbench/workbench',
];

const keyboardMapEntryPoints = [
	'vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.linux',
	'vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.darwin',
	'vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.win',
];

// Server entry points (reh)
const serverEntryPoints = [
	'vs/workbench/api/node/extensionHostProcess',
	'vs/platform/files/node/watcher/watcherMain',
	'vs/platform/terminal/node/ptyHostMain',
];

// Bootstrap files per target
const bootstrapEntryPointsDesktop = [
	'main',
	'cli',
	'bootstrap-fork',
];

const bootstrapEntryPointsServer = [
	'server-main',
	'server-cli',
	'bootstrap-fork',
];

/**
 * Get entry points for a build target.
 */
function getEntryPointsForTarget(target: BuildTarget): string[] {
	switch (target) {
		case 'desktop':
			return [
				...workerEntryPoints,
				...desktopWorkerEntryPoints,
				...desktopEntryPoints,
				...codeEntryPoints,
			];
		case 'server':
			return [
				...serverEntryPoints,
			];
		case 'server-web':
			return [
				...serverEntryPoints,
				...workerEntryPoints,
				...webEntryPoints,
				...keyboardMapEntryPoints,
			];
		case 'web':
			return [
				...workerEntryPoints,
				'vs/workbench/workbench.web.main.internal', // web workbench only (no browser shell)
				...keyboardMapEntryPoints,
			];
		default:
			throw new Error(`Unknown target: ${target}`);
	}
}

/**
 * Get bootstrap entry points for a build target.
 */
function getBootstrapEntryPointsForTarget(target: BuildTarget): string[] {
	switch (target) {
		case 'desktop':
			return bootstrapEntryPointsDesktop;
		case 'server':
		case 'server-web':
			return bootstrapEntryPointsServer;
		case 'web':
			return []; // Web has no bootstrap files (served by external server)
		default:
			throw new Error(`Unknown target: ${target}`);
	}
}

/**
 * Get entry points that should bundle CSS (workbench mains).
 */
function getCssBundleEntryPointsForTarget(target: BuildTarget): Set<string> {
	switch (target) {
		case 'desktop':
			return new Set([
				'vs/workbench/workbench.desktop.main',
				'vs/code/electron-browser/workbench/workbench',
				'vs/sessions/sessions.desktop.main',
				'vs/sessions/electron-browser/sessions',
			]);
		case 'server':
			return new Set(); // Server has no UI
		case 'server-web':
			return new Set([
				'vs/workbench/workbench.web.main.internal',
				'vs/code/browser/workbench/workbench',
			]);
		case 'web':
			return new Set([
				'vs/workbench/workbench.web.main.internal',
			]);
		default:
			throw new Error(`Unknown target: ${target}`);
	}
}

// ============================================================================
// Resource Patterns (files to copy, not transpile/bundle)
// ============================================================================

// Common resources needed by all targets
const commonResourcePatterns = [
	// Tree-sitter queries
	'vs/editor/common/languages/highlights/*.scm',
	'vs/editor/common/languages/injections/*.scm',

	// SVGs referenced from CSS (needed for transpile/dev builds where CSS is copied as-is)
	'vs/workbench/browser/media/code-icon.svg',
	'vs/workbench/browser/parts/editor/media/letterpress*.svg',
	'vs/sessions/contrib/chat/browser/media/*.svg'
];

// Resources for desktop target
const desktopResourcePatterns = [
	...commonResourcePatterns,

	// HTML
	'vs/code/electron-browser/workbench/workbench.html',
	'vs/code/electron-browser/workbench/workbench-dev.html',
	'vs/sessions/electron-browser/sessions.html',
	'vs/sessions/electron-browser/sessions-dev.html',
	'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
	'vs/workbench/contrib/webview/browser/pre/*.html',

	// Webview pre scripts
	'vs/workbench/contrib/webview/browser/pre/*.js',

	// Shell scripts
	'vs/base/node/*.sh',
	'vs/workbench/contrib/terminal/common/scripts/*.sh',
	'vs/workbench/contrib/terminal/common/scripts/*.ps1',
	'vs/workbench/contrib/terminal/common/scripts/*.psm1',
	'vs/workbench/contrib/terminal/common/scripts/*.fish',
	'vs/workbench/contrib/terminal/common/scripts/*.zsh',
	'vs/workbench/contrib/externalTerminal/**/*.scpt',

	// Media - audio
	'vs/platform/accessibilitySignal/browser/media/*.mp3',

	// Media - images
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.svg',
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.png',
	'vs/workbench/contrib/extensions/browser/media/{theme-icon.png,language-icon.svg}',
	'vs/workbench/services/extensionManagement/common/media/*.svg',
	'vs/workbench/services/extensionManagement/common/media/*.png',
	'vs/workbench/browser/parts/editor/media/*.png',
	'vs/workbench/contrib/debug/browser/media/*.png',
];

// Resources for server target (minimal - no UI)
const serverResourcePatterns = [
	// Shell scripts for process monitoring
	'vs/base/node/cpuUsage.sh',
	'vs/base/node/ps.sh',

	// External Terminal
	'vs/workbench/contrib/externalTerminal/**/*.scpt',

	// Terminal shell integration
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration.ps1',
	'vs/workbench/contrib/terminal/common/scripts/CodeTabExpansion.psm1',
	'vs/workbench/contrib/terminal/common/scripts/GitTabExpansion.psm1',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-bash.sh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-env.zsh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-profile.zsh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-rc.zsh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration-login.zsh',
	'vs/workbench/contrib/terminal/common/scripts/shellIntegration.fish',
];

// Resources for server-web target (server + web UI)
const serverWebResourcePatterns = [
	...serverResourcePatterns,
	...commonResourcePatterns,

	// Web HTML
	'vs/code/browser/workbench/workbench.html',
	'vs/code/browser/workbench/workbench-dev.html',
	'vs/code/browser/workbench/callback.html',
	'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
	'vs/workbench/contrib/webview/browser/pre/*.html',

	// Webview pre scripts
	'vs/workbench/contrib/webview/browser/pre/*.js',

	// Media - audio
	'vs/platform/accessibilitySignal/browser/media/*.mp3',

	// Media - images
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.svg',
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.png',
	'vs/workbench/contrib/extensions/browser/media/*.svg',
	'vs/workbench/contrib/extensions/browser/media/*.png',
	'vs/workbench/services/extensionManagement/common/media/*.svg',
	'vs/workbench/services/extensionManagement/common/media/*.png',
];

// Resources for standalone web target (browser-only, no server)
const webResourcePatterns = [
	...commonResourcePatterns,

	// Web HTML
	'vs/code/browser/workbench/workbench.html',
	'vs/code/browser/workbench/workbench-dev.html',
	'vs/code/browser/workbench/callback.html',
	'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
	'vs/workbench/contrib/webview/browser/pre/*.html',

	// Webview pre scripts
	'vs/workbench/contrib/webview/browser/pre/*.js',

	// Media - audio
	'vs/platform/accessibilitySignal/browser/media/*.mp3',

	// Media - images
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.svg',
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.png',
	'vs/workbench/contrib/extensions/browser/media/*.svg',
	'vs/workbench/contrib/extensions/browser/media/*.png',
	'vs/workbench/services/extensionManagement/common/media/*.svg',
	'vs/workbench/services/extensionManagement/common/media/*.png',
];

/**
 * Get resource patterns for a build target.
 */
function getResourcePatternsForTarget(target: BuildTarget): string[] {
	switch (target) {
		case 'desktop':
			return desktopResourcePatterns;
		case 'server':
			return serverResourcePatterns;
		case 'server-web':
			return serverWebResourcePatterns;
		case 'web':
			return webResourcePatterns;
		default:
			throw new Error(`Unknown target: ${target}`);
	}
}

// ============================================================================
// Utilities
// ============================================================================

async function cleanDir(dir: string): Promise<void> {
	const fullPath = path.join(REPO_ROOT, dir);
	console.log(`[clean] ${dir}`);
	await fs.promises.rm(fullPath, { recursive: true, force: true });
	await fs.promises.mkdir(fullPath, { recursive: true });
}

/**
 * Scan for built-in extensions in the given directory.
 * Returns an array of extension entries for the builtinExtensionsScannerService.
 */
function scanBuiltinExtensions(extensionsRoot: string): Array<IScannedBuiltinExtension> {
	const scannedExtensions: Array<IScannedBuiltinExtension> = [];
	const extensionsPath = path.join(REPO_ROOT, extensionsRoot);

	if (!fs.existsSync(extensionsPath)) {
		return scannedExtensions;
	}

	for (const extensionFolder of fs.readdirSync(extensionsPath)) {
		const packageJSONPath = path.join(extensionsPath, extensionFolder, 'package.json');
		if (!fs.existsSync(packageJSONPath)) {
			continue;
		}
		try {
			const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf8'));
			if (!isWebExtension(packageJSON)) {
				continue;
			}
			const children = fs.readdirSync(path.join(extensionsPath, extensionFolder));
			const packageNLSPath = children.filter(child => child === 'package.nls.json')[0];
			const packageNLS = packageNLSPath ? JSON.parse(fs.readFileSync(path.join(extensionsPath, extensionFolder, packageNLSPath), 'utf8')) : undefined;
			const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
			const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];

			scannedExtensions.push({
				extensionPath: extensionFolder,
				packageJSON,
				packageNLS,
				readmePath: readme ? path.join(extensionFolder, readme) : undefined,
				changelogPath: changelog ? path.join(extensionFolder, changelog) : undefined,
			});
		} catch (e) {
			// Skip invalid extensions
		}
	}

	return scannedExtensions;
}

/**
 * Get the date from the out directory date file, or return current date.
 */
function readISODate(outDir: string): string {
	try {
		return fs.readFileSync(path.join(REPO_ROOT, outDir, 'date'), 'utf8');
	} catch {
		return new Date().toISOString();
	}
}

/**
 * Only used to make encoding tests happy. The source files don't have a BOM but the
 * tests expect one... so we add it here.
 */
function needsBomAdded(filePath: string): boolean {
	return /([\/\\])test\1.*utf8/.test(filePath);
}

async function copyFile(srcPath: string, destPath: string): Promise<void> {
	await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

	if (needsBomAdded(srcPath)) {
		const content = await fs.promises.readFile(srcPath);
		if (content[0] !== 0xef || content[1] !== 0xbb || content[2] !== 0xbf) {
			await fs.promises.writeFile(destPath, Buffer.concat([UTF8_BOM, content]));
			return;
		}
	}
	await fs.promises.copyFile(srcPath, destPath);
}

/**
 * Standalone TypeScript files that need to be compiled separately (not bundled).
 * These run in special contexts (e.g., Electron preload) where bundling isn't appropriate.
 * Only needed for desktop target.
 */
const desktopStandaloneFiles = [
	'vs/base/parts/sandbox/electron-browser/preload.ts',
	'vs/base/parts/sandbox/electron-browser/preload-aux.ts',
	'vs/platform/browserView/electron-browser/preload-browserView.ts',
];

async function compileStandaloneFiles(outDir: string, doMinify: boolean, target: BuildTarget): Promise<void> {
	// Only desktop needs preload scripts
	if (target !== 'desktop') {
		return;
	}

	console.log(`[standalone] Compiling ${desktopStandaloneFiles.length} standalone files...`);

	const banner = `/*!--------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/`;

	await Promise.all(desktopStandaloneFiles.map(async (file) => {
		const entryPath = path.join(REPO_ROOT, SRC_DIR, file);
		const outPath = path.join(REPO_ROOT, outDir, file.replace(/\.ts$/, '.js'));

		await esbuild.build({
			entryPoints: [entryPath],
			outfile: outPath,
			bundle: false, // Don't bundle - these are standalone scripts
			format: 'cjs', // CommonJS for Electron preload
			platform: 'node',
			target: ['es2024'],
			sourcemap: 'linked',
			sourcesContent: false,
			minify: doMinify,
			banner: { js: banner },
			logLevel: 'warning',
		});
	}));

	console.log(`[standalone] Done`);
}

/**
 * Copy ALL non-TypeScript files from src/ to the output directory.
 * This matches the old gulp build behavior where `gulp.src('src/**')` streams
 * every file and non-TS files bypass the compiler via tsFilter.restore.
 * Used for development/transpile builds only - production bundles use
 * copyResources() with curated per-target patterns instead.
 */
async function copyAllNonTsFiles(outDir: string, excludeTests: boolean): Promise<void> {
	console.log(`[resources] Copying all non-TS files to ${outDir}...`);

	const ignorePatterns = [
		// Exclude .ts files but keep .d.ts files (they're needed at runtime for type references)
		'**/*.ts',
	];
	if (excludeTests) {
		ignorePatterns.push('**/test/**');
	}

	const files = await globAsync('**/*', {
		cwd: path.join(REPO_ROOT, SRC_DIR),
		nodir: true,
		ignore: ignorePatterns,
	});

	// Re-include .d.ts files that were excluded by the *.ts ignore
	const dtsFiles = await globAsync('**/*.d.ts', {
		cwd: path.join(REPO_ROOT, SRC_DIR),
		ignore: excludeTests ? ['**/test/**'] : [],
	});

	const allFiles = [...new Set([...files, ...dtsFiles])];

	await Promise.all(allFiles.map(file => {
		const srcPath = path.join(REPO_ROOT, SRC_DIR, file);
		const destPath = path.join(REPO_ROOT, outDir, file);
		return copyFile(srcPath, destPath);
	}));

	console.log(`[resources] Copied ${allFiles.length} files`);
}

/**
 * Copy curated resource files for production bundles.
 * Uses specific per-target patterns matching the old build's vscodeResourceIncludes,
 * serverResourceIncludes, etc. Only called by bundle() - transpile uses copyAllNonTsFiles().
 */
async function copyResources(outDir: string, target: BuildTarget): Promise<void> {
	console.log(`[resources] Copying to ${outDir} for target '${target}'...`);
	let copied = 0;

	const ignorePatterns = ['**/test/**', '**/*-dev.html'];

	const resourcePatterns = getResourcePatternsForTarget(target);
	for (const pattern of resourcePatterns) {
		const files = await globAsync(pattern, {
			cwd: path.join(REPO_ROOT, SRC_DIR),
			ignore: ignorePatterns,
		});

		for (const file of files) {
			const srcPath = path.join(REPO_ROOT, SRC_DIR, file);
			const destPath = path.join(REPO_ROOT, outDir, file);

			await copyFile(srcPath, destPath);
			copied++;
		}
	}

	console.log(`[resources] Copied ${copied} files`);
}

// ============================================================================
// Plugins
// ============================================================================

function inlineMinimistPlugin(): esbuild.Plugin {
	return {
		name: 'inline-minimist',
		setup(build) {
			build.onResolve({ filter: /^minimist$/ }, () => ({
				path: path.join(REPO_ROOT, 'node_modules/minimist/index.js'),
				external: false,
			}));
		},
	};
}

function cssExternalPlugin(): esbuild.Plugin {
	// Mark CSS imports as external so they stay as import statements
	// The CSS files are copied separately and loaded by the browser at runtime
	return {
		name: 'css-external',
		setup(build) {
			build.onResolve({ filter: /\.css$/ }, (args) => ({
				path: args.path,
				external: true,
			}));
		},
	};
}

/**
 * esbuild plugin that transforms source files to inject build-time configuration.
 * This runs during onLoad so the transformation happens before esbuild processes the content,
 * ensuring placeholders like `/*BUILD->INSERT_PRODUCT_CONFIGURATION* /` are replaced
 * before esbuild strips them as non-legal comments.
 */
function fileContentMapperPlugin(outDir: string, target: BuildTarget): esbuild.Plugin {
	// Cache the replacement strings (computed once)
	let productConfigReplacement: string | undefined;
	let builtinExtensionsReplacement: string | undefined;

	return {
		name: 'file-content-mapper',
		setup(build) {
			build.onLoad({ filter: /\.ts$/ }, async (args) => {
				// Skip .d.ts files
				if (args.path.endsWith('.d.ts')) {
					return undefined;
				}

				let contents = await fs.promises.readFile(args.path, 'utf-8');
				let modified = false;

				// Inject product configuration
				if (contents.includes('/*BUILD->INSERT_PRODUCT_CONFIGURATION*/')) {
					if (productConfigReplacement === undefined) {
						// For server-web, remove webEndpointUrlTemplate
						const productForTarget = target === 'server-web'
							? { ...product, webEndpointUrlTemplate: undefined }
							: product;
						const productConfiguration = JSON.stringify({
							...productForTarget,
							version,
							commit,
							date: readISODate(outDir)
						});
						// Remove the outer braces since the placeholder is inside an object literal
						productConfigReplacement = productConfiguration.substring(1, productConfiguration.length - 1);
					}
					contents = contents.replace('/*BUILD->INSERT_PRODUCT_CONFIGURATION*/', () => productConfigReplacement!);
					modified = true;
				}

				// Inject built-in extensions list
				if (contents.includes('/*BUILD->INSERT_BUILTIN_EXTENSIONS*/')) {
					if (builtinExtensionsReplacement === undefined) {
						// Web target uses .build/web/extensions (from compileWebExtensionsBuildTask)
						// Other targets use .build/extensions
						const extensionsRoot = target === 'web' ? '.build/web/extensions' : '.build/extensions';
						const builtinExtensions = JSON.stringify(scanBuiltinExtensions(extensionsRoot));
						// Remove the outer brackets since the placeholder is inside an array literal
						builtinExtensionsReplacement = builtinExtensions.substring(1, builtinExtensions.length - 1);
					}
					contents = contents.replace('/*BUILD->INSERT_BUILTIN_EXTENSIONS*/', () => builtinExtensionsReplacement!);
					modified = true;
				}

				if (modified) {
					return { contents, loader: 'ts' };
				}

				// No modifications, let esbuild handle normally
				return undefined;
			});
		},
	};
}

// ============================================================================
// Transpile (Goal 1: TS → JS using esbuild.transform for maximum speed)
// ============================================================================

// Shared transform options for single-file transpilation
const transformOptions: esbuild.TransformOptions = {
	loader: 'ts',
	format: 'esm',
	target: 'es2024',
	sourcemap: 'inline',
	sourcesContent: false,
	tsconfigRaw: JSON.stringify({
		compilerOptions: {
			experimentalDecorators: true,
			useDefineForClassFields: false
		}
	}),
};

async function transpileFile(srcPath: string, destPath: string): Promise<void> {
	const source = await fs.promises.readFile(srcPath, 'utf-8');
	const result = await esbuild.transform(source, {
		...transformOptions,
		sourcefile: srcPath,
	});

	await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
	await fs.promises.writeFile(destPath, result.code);
}

async function transpile(outDir: string, excludeTests: boolean): Promise<void> {
	// Find all .ts files
	const ignorePatterns = ['**/*.d.ts'];
	if (excludeTests) {
		ignorePatterns.push('**/test/**');
	}

	const files = await globAsync('**/*.ts', {
		cwd: path.join(REPO_ROOT, SRC_DIR),
		ignore: ignorePatterns,
	});

	console.log(`[transpile] Found ${files.length} files`);

	// Transpile all files in parallel using esbuild.transform (fastest approach)
	await Promise.all(files.map(file => {
		const srcPath = path.join(REPO_ROOT, SRC_DIR, file);
		const destPath = path.join(REPO_ROOT, outDir, file.replace(/\.ts$/, '.js'));
		return transpileFile(srcPath, destPath);
	}));
}

// ============================================================================
// Bundle (Goal 2: JS → bundled JS)
// ============================================================================

async function bundle(outDir: string, doMinify: boolean, doNls: boolean, doManglePrivates: boolean, target: BuildTarget, sourceMapBaseUrl?: string): Promise<void> {
	await cleanDir(outDir);

	// Write build date file (used by packaging to embed in product.json)
	const outDirPath = path.join(REPO_ROOT, outDir);
	await fs.promises.mkdir(outDirPath, { recursive: true });
	await fs.promises.writeFile(path.join(outDirPath, 'date'), new Date().toISOString(), 'utf8');

	console.log(`[bundle] ${SRC_DIR} → ${outDir} (target: ${target})${doMinify ? ' (minify)' : ''}${doNls ? ' (nls)' : ''}${doManglePrivates ? ' (mangle-privates)' : ''}`);
	const t1 = Date.now();

	// Read TSLib for banner
	const tslibPath = path.join(REPO_ROOT, 'node_modules/tslib/tslib.es6.js');
	const tslib = await fs.promises.readFile(tslibPath, 'utf-8');
	const banner = {
		js: `/*!--------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
${tslib}`,
		css: `/*!--------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/`,
	};

	// Shared TypeScript options for bundling directly from source
	const tsconfigRaw = JSON.stringify({
		compilerOptions: {
			experimentalDecorators: true,
			useDefineForClassFields: false
		}
	});

	// Create shared NLS collector (only used if doNls is true)
	const nlsCollector = createNLSCollector();
	const preserveEnglish = false; // Production mode: replace messages with null

	// Get entry points based on target
	const allEntryPoints = getEntryPointsForTarget(target);
	const bootstrapEntryPoints = getBootstrapEntryPointsForTarget(target);
	const bundleCssEntryPoints = getCssBundleEntryPointsForTarget(target);

	// Collect all build results (with write: false)
	const buildResults: { outPath: string; result: esbuild.BuildResult }[] = [];

	// Create the file content mapper plugin (injects product config, builtin extensions)
	const contentMapperPlugin = fileContentMapperPlugin(outDir, target);

	// Bundle each entry point directly from TypeScript source
	await Promise.all(allEntryPoints.map(async (entryPoint) => {
		const entryPath = path.join(REPO_ROOT, SRC_DIR, `${entryPoint}.ts`);
		const outPath = path.join(REPO_ROOT, outDir, `${entryPoint}.js`);

		// Use CSS external plugin for entry points that don't need bundled CSS
		const plugins: esbuild.Plugin[] = bundleCssEntryPoints.has(entryPoint) ? [] : [cssExternalPlugin()];
		// Add content mapper plugin to inject product config and builtin extensions
		plugins.push(contentMapperPlugin);
		if (doNls) {
			plugins.unshift(nlsPlugin({
				baseDir: path.join(REPO_ROOT, SRC_DIR),
				collector: nlsCollector,
			}));
		}

		// For entry points that bundle CSS, we need to use outdir instead of outfile
		// because esbuild can't produce multiple output files (JS + CSS) with outfile
		const needsCssBundling = bundleCssEntryPoints.has(entryPoint);

		const buildOptions: esbuild.BuildOptions = {
			entryPoints: needsCssBundling
				? [{ in: entryPath, out: entryPoint }]
				: [entryPath],
			...(needsCssBundling
				? { outdir: path.join(REPO_ROOT, outDir) }
				: { outfile: outPath }),
			bundle: true,
			format: 'esm',
			platform: 'neutral',
			target: ['es2024'],
			packages: 'external',
			sourcemap: 'linked',
			sourcesContent: true,
			minify: doMinify,
			treeShaking: true,
			banner,
			loader: {
				'.ttf': 'file',
				'.svg': 'file',
				'.png': 'file',
				'.sh': 'file',
			},
			assetNames: 'media/[name]',
			plugins,
			write: false, // Don't write yet, we need to post-process
			logLevel: 'warning',
			logOverride: {
				'unsupported-require-call': 'silent',
			},
			tsconfigRaw,
		};

		const result = await esbuild.build(buildOptions);

		buildResults.push({ outPath, result });
	}));

	// Bundle bootstrap files (with minimist inlined) directly from TypeScript source
	for (const entry of bootstrapEntryPoints) {
		const entryPath = path.join(REPO_ROOT, SRC_DIR, `${entry}.ts`);
		if (!fs.existsSync(entryPath)) {
			console.log(`[bundle] Skipping ${entry} (not found)`);
			continue;
		}

		const outPath = path.join(REPO_ROOT, outDir, `${entry}.js`);

		const bootstrapPlugins: esbuild.Plugin[] = [inlineMinimistPlugin(), contentMapperPlugin];
		if (doNls) {
			bootstrapPlugins.unshift(nlsPlugin({
				baseDir: path.join(REPO_ROOT, SRC_DIR),
				collector: nlsCollector,
			}));
		}

		const result = await esbuild.build({
			entryPoints: [entryPath],
			outfile: outPath,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: ['es2024'],
			packages: 'external',
			sourcemap: 'linked',
			sourcesContent: true,
			minify: doMinify,
			treeShaking: true,
			banner,
			plugins: bootstrapPlugins,
			write: false, // Don't write yet, we need to post-process
			logLevel: 'warning',
			logOverride: {
				'unsupported-require-call': 'silent',
			},
			tsconfigRaw,
		});

		buildResults.push({ outPath, result });
	}

	// Finalize NLS: sort entries, assign indices, write metadata files
	let indexMap = new Map<string, number>();
	if (doNls) {
		// Also write NLS files to out-build for backwards compatibility with test runner
		const nlsResult = await finalizeNLS(
			nlsCollector,
			path.join(REPO_ROOT, outDir),
			[path.join(REPO_ROOT, 'out-build')]
		);
		indexMap = nlsResult.indexMap;
	}

	// Post-process and write all output files
	let bundled = 0;
	const mangleStats: { file: string; result: ConvertPrivateFieldsResult }[] = [];
	for (const { result } of buildResults) {
		if (!result.outputFiles) {
			continue;
		}

		for (const file of result.outputFiles) {
			await fs.promises.mkdir(path.dirname(file.path), { recursive: true });

			if (file.path.endsWith('.js') || file.path.endsWith('.css')) {
				let content = file.text;

				// Apply NLS post-processing if enabled (JS only)
				if (file.path.endsWith('.js') && doNls && indexMap.size > 0) {
					content = postProcessNLS(content, indexMap, preserveEnglish);
				}

				// Convert native #private fields to regular properties.
				// Skip extension host bundles - they expose API surface to extensions
				// where true encapsulation matters more than the perf gain.
				if (file.path.endsWith('.js') && doManglePrivates && !isExtensionHostBundle(file.path)) {
					const mangleResult = convertPrivateFields(content, file.path);
					content = mangleResult.code;
					if (mangleResult.editCount > 0) {
						mangleStats.push({ file: path.relative(path.join(REPO_ROOT, outDir), file.path), result: mangleResult });
					}
				}

				// Rewrite sourceMappingURL to CDN URL if configured
				if (sourceMapBaseUrl) {
					const relativePath = path.relative(path.join(REPO_ROOT, outDir), file.path);
					content = content.replace(
						/\/\/# sourceMappingURL=.+$/m,
						`//# sourceMappingURL=${sourceMapBaseUrl}/${relativePath}.map`
					);
					content = content.replace(
						/\/\*# sourceMappingURL=.+\*\/$/m,
						`/*# sourceMappingURL=${sourceMapBaseUrl}/${relativePath}.map*/`
					);
				}

				await fs.promises.writeFile(file.path, content);
			} else {
				// Write other files (source maps, assets) as-is
				await fs.promises.writeFile(file.path, file.contents);
			}
		}
		bundled++;
	}

	// Log mangle-privates stats
	if (doManglePrivates && mangleStats.length > 0) {
		let totalClasses = 0, totalFields = 0, totalEdits = 0, totalElapsed = 0;
		for (const { file, result } of mangleStats) {
			console.log(`[mangle-privates] ${file}: ${result.classCount} classes, ${result.fieldCount} fields, ${result.editCount} edits, ${result.elapsed}ms`);
			totalClasses += result.classCount;
			totalFields += result.fieldCount;
			totalEdits += result.editCount;
			totalElapsed += result.elapsed;
		}
		console.log(`[mangle-privates] Total: ${totalClasses} classes, ${totalFields} fields, ${totalEdits} edits, ${totalElapsed}ms`);
	}

	// Copy resources (curated per-target patterns for production)
	await copyResources(outDir, target);

	// Compile standalone TypeScript files (like Electron preload scripts) that cannot be bundled
	await compileStandaloneFiles(outDir, doMinify, target);

	console.log(`[bundle] Done in ${Date.now() - t1}ms (${bundled} bundles)`);
}

// ============================================================================
// Watch Mode
// ============================================================================

async function watch(): Promise<void> {
	if (!useEsbuildTranspile) {
		console.log('Starting transpilation...');
		console.log('Finished transpilation with 0 errors after 0 ms');
		console.log('[watch] esbuild transpile disabled (useEsbuildTranspile=false). Keeping process alive as no-op.');
		await new Promise(() => { }); // keep alive
		return;
	}

	console.log('Starting transpilation...');

	const outDir = OUT_DIR;

	// Initial setup
	await cleanDir(outDir);
	console.log(`[transpile] ${SRC_DIR} → ${outDir}`);

	// Initial full build
	const t1 = Date.now();
	try {
		await transpile(outDir, false);
		await copyAllNonTsFiles(outDir, false);
		console.log(`Finished transpilation with 0 errors after ${Date.now() - t1} ms`);
	} catch (err) {
		console.error('[watch] Initial build failed:', err);
		console.log(`Finished transpilation with 1 errors after ${Date.now() - t1} ms`);
		// Continue watching anyway
	}

	let pendingTsFiles: Set<string> = new Set();
	let pendingCopyFiles: Set<string> = new Set();

	const processChanges = async () => {
		console.log('Starting transpilation...');
		const t1 = Date.now();
		const tsFiles = [...pendingTsFiles];
		const filesToCopy = [...pendingCopyFiles];
		pendingTsFiles = new Set();
		pendingCopyFiles = new Set();

		try {
			// Transform changed TypeScript files in parallel
			if (tsFiles.length > 0) {
				console.log(`[watch] Transpiling ${tsFiles.length} file(s)...`);
				await Promise.all(tsFiles.map(srcPath => {
					const relativePath = path.relative(path.join(REPO_ROOT, SRC_DIR), srcPath);
					const destPath = path.join(REPO_ROOT, outDir, relativePath.replace(/\.ts$/, '.js'));
					return transpileFile(srcPath, destPath);
				}));
			}

			// Copy changed resource files in parallel
			if (filesToCopy.length > 0) {
				await Promise.all(filesToCopy.map(async (srcPath) => {
					const relativePath = path.relative(path.join(REPO_ROOT, SRC_DIR), srcPath);
					const destPath = path.join(REPO_ROOT, outDir, relativePath);
					await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
					await fs.promises.copyFile(srcPath, destPath);
					console.log(`[watch] Copied ${relativePath}`);
				}));
			}

			if (tsFiles.length > 0 || filesToCopy.length > 0) {
				console.log(`Finished transpilation with 0 errors after ${Date.now() - t1} ms`);
			}
		} catch (err) {
			console.error('[watch] Rebuild failed:', err);
			console.log(`Finished transpilation with 1 errors after ${Date.now() - t1} ms`);
			// Continue watching
		}
	};

	// Watch src directory using existing gulp-watch based watcher
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	const srcDir = path.join(REPO_ROOT, SRC_DIR);
	const watchStream = gulpWatch('src/**', { base: srcDir, readDelay: 200 });

	watchStream.on('data', (file: { path: string }) => {
		if (file.path.endsWith('.ts') && !file.path.endsWith('.d.ts')) {
			pendingTsFiles.add(file.path);
		} else {
			// Copy any non-TS file (matches old gulp build's `src/**` behavior)
			pendingCopyFiles.add(file.path);
		}

		if (pendingTsFiles.size > 0 || pendingCopyFiles.size > 0) {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(processChanges, 200);
		}
	});

	console.log('[watch] Watching src/**/*.{ts,css,...} (Ctrl+C to stop)');

	// Keep process alive
	process.on('SIGINT', () => {
		console.log('\n[watch] Stopping...');
		watchStream.end();
		process.exit(0);
	});
}

// ============================================================================
// Main
// ============================================================================

function printUsage(): void {
	console.log(`Usage: npx tsx build/next/index.ts <command> [options]

Commands:
	transpile          Transpile TypeScript to JavaScript (single-file, fast)
	bundle             Bundle entry points into optimized bundles

Options for 'transpile':
	--watch            Watch for changes and rebuild incrementally
	--out <dir>        Output directory (default: out)
	--exclude-tests    Exclude test files from transpilation

Options for 'bundle':
	--minify           Minify the output bundles
	--nls              Process NLS (localization) strings
	--mangle-privates  Convert native #private fields to regular properties
	--out <dir>        Output directory (default: out-vscode)
	--target <target>  Build target: desktop (default), server, server-web, web
	--source-map-base-url <url>  Rewrite sourceMappingURL to CDN URL

Examples:
	npx tsx build/next/index.ts transpile
	npx tsx build/next/index.ts transpile --watch
	npx tsx build/next/index.ts transpile --out out-build
	npx tsx build/next/index.ts transpile --out out-build --exclude-tests
	npx tsx build/next/index.ts bundle
	npx tsx build/next/index.ts bundle --minify --nls
	npx tsx build/next/index.ts bundle --nls --out out-vscode-min
	npx tsx build/next/index.ts bundle --minify --nls --target server --out out-vscode-reh-min
	npx tsx build/next/index.ts bundle --minify --nls --target server-web --out out-vscode-reh-web-min
`);
}

async function main(): Promise<void> {
	const t1 = Date.now();

	try {
		switch (command) {
			case 'transpile':
				if (options.watch) {
					await watch();
				} else {
					const outDir = options.out ?? OUT_DIR;
					await cleanDir(outDir);

					// Write build date file (used by packaging to embed in product.json)
					const outDirPath = path.join(REPO_ROOT, outDir);
					await fs.promises.mkdir(outDirPath, { recursive: true });
					await fs.promises.writeFile(path.join(outDirPath, 'date'), new Date().toISOString(), 'utf8');

					console.log(`[transpile] ${SRC_DIR} → ${outDir}${options.excludeTests ? ' (excluding tests)' : ''}`);
					const t1 = Date.now();
					await transpile(outDir, options.excludeTests);
					await copyAllNonTsFiles(outDir, options.excludeTests);
					console.log(`[transpile] Done in ${Date.now() - t1}ms`);
				}
				break;

			case 'bundle':
				await bundle(options.out ?? OUT_VSCODE_DIR, options.minify, options.nls, options.manglePrivates, options.target as BuildTarget, options.sourceMapBaseUrl);
				break;

			default:
				printUsage();
				process.exit(command ? 1 : 0);
		}

		if (!options.watch) {
			console.log(`\n✓ Total: ${Date.now() - t1}ms`);
		}
	} catch (err) {
		console.error('Build failed:', err);
		process.exit(1);
	}
}

main();
