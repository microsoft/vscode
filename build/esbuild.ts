/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import glob from 'glob';
import * as watcher from '@parcel/watcher';

const globAsync = promisify(glob);

// ============================================================================
// Configuration
// ============================================================================

const REPO_ROOT = path.dirname(import.meta.dirname);
const isWatch = process.argv.includes('--watch');
const isBundle = process.argv.includes('--bundle');
const isMinify = process.argv.includes('--minify');

const SRC_DIR = 'src';
const OUT_DIR = 'out';
const OUT_BUILD_DIR = 'out-build';
const OUT_VSCODE_DIR = 'out-vscode';

// ============================================================================
// Entry Points (from build/buildfile.ts)
// ============================================================================

const workerEntryPoints = [
	'vs/editor/common/services/editorWebWorkerMain',
	'vs/workbench/api/worker/extensionHostWorkerMain',
	'vs/workbench/contrib/notebook/common/services/notebookWebWorkerMain',
	'vs/workbench/services/languageDetection/browser/languageDetectionWebWorkerMain',
	'vs/workbench/services/search/worker/localFileSearchMain',
	'vs/platform/profiling/electron-browser/profileAnalysisWorkerMain',
	'vs/workbench/contrib/output/common/outputLinkComputerMain',
	'vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.workerMain',
];

const desktopEntryPoints = [
	'vs/workbench/workbench.desktop.main',
	'vs/workbench/contrib/debug/node/telemetryApp',
	'vs/platform/files/node/watcher/watcherMain',
	'vs/platform/terminal/node/ptyHostMain',
	'vs/workbench/api/node/extensionHostProcess',
];

const codeEntryPoints = [
	'vs/code/node/cliProcessMain',
	'vs/code/electron-utility/sharedProcess/sharedProcessMain',
	'vs/code/electron-browser/workbench/workbench',
];

const webEntryPoints = [
	'vs/workbench/workbench.web.main.internal',
	'vs/code/browser/workbench/workbench',
];

const keyboardMapEntryPoints = [
	'vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.linux',
	'vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.darwin',
	'vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.win',
];

const bootstrapEntryPoints = [
	'main',
	'cli',
	'bootstrap-fork',
	'server-main',
	'server-cli',
];

// ============================================================================
// Resource Patterns (files to copy, not transpile/bundle)
// ============================================================================

const resourcePatterns = [
	// HTML
	'vs/code/electron-browser/workbench/workbench.html',
	'vs/code/electron-browser/workbench/workbench-dev.html',
	'vs/code/browser/workbench/workbench.html',
	'vs/code/browser/workbench/workbench-dev.html',
	'vs/code/browser/workbench/callback.html',
	'vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
	'vs/workbench/contrib/webview/browser/pre/*.html',

	// Fonts
	'vs/base/browser/ui/codicons/codicon/codicon.ttf',

	// Vendor JavaScript libraries (not transpiled)
	'vs/base/common/marked/marked.js',
	'vs/base/common/semver/semver.js',
	'vs/base/browser/dompurify/dompurify.js',

	// Electron preload (not bundled)
	'vs/base/parts/sandbox/electron-browser/preload.js',
	'vs/base/parts/sandbox/electron-browser/preload-aux.js',

	// Webview pre scripts
	'vs/workbench/contrib/webview/browser/pre/*.js',

	// Shell scripts
	'vs/base/node/*.sh',
	'vs/workbench/contrib/terminal/common/scripts/**/*.sh',
	'vs/workbench/contrib/terminal/common/scripts/**/*.ps1',
	'vs/workbench/contrib/terminal/common/scripts/**/*.psm1',
	'vs/workbench/contrib/terminal/common/scripts/**/*.fish',
	'vs/workbench/contrib/terminal/common/scripts/**/*.zsh',
	'vs/workbench/contrib/externalTerminal/**/*.scpt',

	// Media - audio
	'vs/platform/accessibilitySignal/browser/media/*.mp3',

	// Media - images
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.svg',
	'vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.png',
	'vs/workbench/contrib/extensions/browser/media/*.svg',
	'vs/workbench/contrib/extensions/browser/media/*.png',
	'vs/workbench/services/extensionManagement/common/media/*.svg',
	'vs/workbench/services/extensionManagement/common/media/*.png',
	'vs/workbench/browser/parts/editor/media/*.png',
	'vs/workbench/contrib/debug/browser/media/*.png',

	// Tree-sitter queries
	'vs/editor/common/languages/highlights/*.scm',
	'vs/editor/common/languages/injections/*.scm',
];

// Test fixtures (only copied for development builds, not production)
const testFixturePatterns = [
	'**/test/**/*.json',
	'**/test/**/*.txt',
	'**/test/**/*.snap',
	'**/test/**/*.tst',
	'**/test/**/*.html',
	'**/test/**/*.js',
	'**/test/**/*.jxs',
	'**/test/**/*.tsx',
	'**/test/**/*.png',
	'**/test/**/*.md',
	'**/test/**/*.zip',
	'**/test/**/*.pdf',
	'**/test/**/*.qwoff',
	'**/test/**/*.wuff',
	'**/test/**/*.less',
	// Files without extensions (executables, etc.)
	'**/test/**/fixtures/executable/*',
];

// ============================================================================
// Utilities
// ============================================================================

async function cleanDir(dir: string): Promise<void> {
	const fullPath = path.join(REPO_ROOT, dir);
	console.log(`[clean] ${dir}`);
	await fs.promises.rm(fullPath, { recursive: true, force: true });
	await fs.promises.mkdir(fullPath, { recursive: true });
}

async function copyCssFiles(outDir: string, excludeTests = false): Promise<number> {
	// Copy all CSS files from src to output (they're imported by JS)
	const cssFiles = await globAsync('**/*.css', {
		cwd: path.join(REPO_ROOT, SRC_DIR),
		ignore: excludeTests ? ['**/test/**'] : [],
	});

	for (const file of cssFiles) {
		const srcPath = path.join(REPO_ROOT, SRC_DIR, file);
		const destPath = path.join(REPO_ROOT, outDir, file);

		await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
		await fs.promises.copyFile(srcPath, destPath);
	}

	return cssFiles.length;
}

async function copyResources(outDir: string, excludeDevFiles = false, excludeTests = false): Promise<void> {
	console.log(`[resources] Copying to ${outDir}...`);
	let copied = 0;

	const ignorePatterns: string[] = [];
	if (excludeTests) {
		ignorePatterns.push('**/test/**');
	}
	if (excludeDevFiles) {
		ignorePatterns.push('**/*-dev.html');
	}

	for (const pattern of resourcePatterns) {
		const files = await globAsync(pattern, {
			cwd: path.join(REPO_ROOT, SRC_DIR),
			ignore: ignorePatterns,
		});

		for (const file of files) {
			const srcPath = path.join(REPO_ROOT, SRC_DIR, file);
			const destPath = path.join(REPO_ROOT, outDir, file);

			await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
			await fs.promises.copyFile(srcPath, destPath);
			copied++;
		}
	}

	// Copy test fixtures (only for development builds)
	if (!excludeTests) {
		for (const pattern of testFixturePatterns) {
			const files = await globAsync(pattern, {
				cwd: path.join(REPO_ROOT, SRC_DIR),
			});

			for (const file of files) {
				const srcPath = path.join(REPO_ROOT, SRC_DIR, file);
				const destPath = path.join(REPO_ROOT, outDir, file);

				await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
				await fs.promises.copyFile(srcPath, destPath);
				copied++;
			}
		}
	}

	// Copy CSS files
	const cssCount = await copyCssFiles(outDir, excludeTests);
	copied += cssCount;

	console.log(`[resources] Copied ${copied} files (${cssCount} CSS)`);
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

// ============================================================================
// Transpile (Goal 1: TS → JS)
// ============================================================================

async function transpile(): Promise<void> {
	const outDir = isBundle ? OUT_BUILD_DIR : OUT_DIR;

	await cleanDir(outDir);

	console.log(`[transpile] ${SRC_DIR} → ${outDir}`);
	const t1 = Date.now();

	// Find all .ts files (exclude tests only when bundling for production)
	const ignorePatterns = ['**/*.d.ts'];
	if (isBundle) {
		ignorePatterns.push('**/test/**');
	}

	const files = await globAsync('**/*.ts', {
		cwd: path.join(REPO_ROOT, SRC_DIR),
		ignore: ignorePatterns,
	});

	// Transpile with esbuild
	await esbuild.build({
		entryPoints: files.map(f => path.join(REPO_ROOT, SRC_DIR, f)),
		outdir: path.join(REPO_ROOT, outDir),
		outbase: path.join(REPO_ROOT, SRC_DIR),
		format: 'esm',
		target: ['es2024'],
		platform: 'neutral',
		sourcemap: isBundle ? 'external' : 'inline',
		sourcesContent: false,
		bundle: false,
		logLevel: 'warning',
		tsconfigRaw: JSON.stringify({
			compilerOptions: {
				experimentalDecorators: true,
				useDefineForClassFields: false,
			}
		}),
		logOverride: { 'unsupported-require-call': 'silent' },
	});

	// Copy resources (exclude tests only when bundling for production)
	await copyResources(outDir, false, isBundle);

	console.log(`[transpile] Done in ${Date.now() - t1}ms (${files.length} files)`);
}

// ============================================================================
// Bundle (Goal 2: JS → bundled JS)
// ============================================================================

async function bundle(): Promise<void> {
	await cleanDir(OUT_VSCODE_DIR);

	console.log(`[bundle] ${OUT_BUILD_DIR} → ${OUT_VSCODE_DIR}`);
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

	// All entry points to bundle
	const allEntryPoints = [
		...workerEntryPoints,
		...desktopEntryPoints,
		...codeEntryPoints,
		...webEntryPoints,
		...keyboardMapEntryPoints,
	];

	// Bundle each entry point
	let bundled = 0;
	await Promise.all(allEntryPoints.map(async (entryPoint) => {
		const entryPath = path.join(REPO_ROOT, OUT_BUILD_DIR, `${entryPoint}.js`);
		const outPath = path.join(REPO_ROOT, OUT_VSCODE_DIR, `${entryPoint}.js`);

		// Ensure output directory exists
		await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

		await esbuild.build({
			entryPoints: [entryPath],
			outfile: outPath,
			bundle: true,
			format: 'esm',
			platform: 'neutral',
			target: ['es2024'],
			packages: 'external',
			sourcemap: 'external',
			sourcesContent: false,
			minify: isMinify,
			treeShaking: true,
			banner,
			loader: {
				'.ttf': 'file',
				'.svg': 'file',
				'.png': 'file',
				'.sh': 'file',
			},
			assetNames: 'media/[name]',
			plugins: [cssExternalPlugin()],
			logLevel: 'warning',
			logOverride: { 'unsupported-require-call': 'silent' },
		});
		bundled++;
	}));

	// Bundle bootstrap files (with minimist inlined)
	for (const entry of bootstrapEntryPoints) {
		const entryPath = path.join(REPO_ROOT, OUT_BUILD_DIR, `${entry}.js`);
		if (!fs.existsSync(entryPath)) {
			console.log(`[bundle] Skipping ${entry} (not found)`);
			continue;
		}

		const outPath = path.join(REPO_ROOT, OUT_VSCODE_DIR, `${entry}.js`);

		await esbuild.build({
			entryPoints: [entryPath],
			outfile: outPath,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: ['es2024'],
			packages: 'external',
			sourcemap: 'external',
			sourcesContent: false,
			minify: isMinify,
			treeShaking: true,
			banner,
			plugins: [inlineMinimistPlugin()],
			logLevel: 'warning',
			logOverride: { 'unsupported-require-call': 'silent' },
		});
		bundled++;
	}

	// Copy resources (exclude dev files and tests for production)
	await copyResources(OUT_VSCODE_DIR, true, true);

	console.log(`[bundle] Done in ${Date.now() - t1}ms (${bundled} bundles)`);
}

// ============================================================================
// Watch Mode
// ============================================================================

async function watch(): Promise<void> {
	console.log('[watch] Starting...');

	// Initial transpile
	try {
		await transpile();
	} catch (err) {
		console.error('[watch] Initial build failed:', err);
		// Continue watching anyway
	}

	let debounce: NodeJS.Timeout | undefined;

	const rebuild = () => {
		if (debounce) {
			clearTimeout(debounce);
		}
		debounce = setTimeout(async () => {
			console.log('[watch] Rebuilding...');
			const t1 = Date.now();
			try {
				await transpile();
				console.log(`[watch] Rebuilt in ${Date.now() - t1}ms`);
			} catch (err) {
				console.error('[watch] Rebuild failed:', err);
				// Continue watching
			}
		}, 100);
	};

	// Watch src directory
	const subscription = await watcher.subscribe(
		path.join(REPO_ROOT, SRC_DIR),
		(err, events) => {
			if (err) {
				console.error('[watch] Watcher error:', err);
				return;
			}
			const relevantEvents = events.filter(e =>
				e.path.endsWith('.ts') && !e.path.includes('/test/')
			);
			if (relevantEvents.length > 0) {
				console.log(`[watch] ${relevantEvents.length} file(s) changed`);
				rebuild();
			}
		},
		{ ignore: ['**/test/**', '**/node_modules/**'] }
	);

	console.log('[watch] Watching src/**/*.ts (Ctrl+C to stop)');

	// Keep process alive
	process.on('SIGINT', async () => {
		console.log('\n[watch] Stopping...');
		await subscription.unsubscribe();
		process.exit(0);
	});
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	const t1 = Date.now();

	try {
		if (isWatch) {
			await watch();
		} else if (isBundle) {
			await transpile();
			await bundle();
		} else {
			await transpile();
		}

		if (!isWatch) {
			console.log(`\n✓ Total: ${Date.now() - t1}ms`);
		}
	} catch (err) {
		console.error('Build failed:', err);
		process.exit(1);
	}
}

main();
