/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import { copyFile, mkdir, readdir, rename } from 'fs/promises';
import { glob } from 'glob';
import * as path from 'path';

const REPO_ROOT = import.meta.dirname;
const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev');
const generateSourceMaps = process.argv.includes('--sourcemaps');
const sourceMapOutDir = './dist-sourcemaps';

const baseBuildOptions = {
	bundle: true,
	logLevel: 'info',
	minify: !isDev,
	outdir: './dist',
	// In dev mode, use linked source maps for debugging.
	// With --sourcemaps flag, generate external source maps (no sourceMappingURL comment in output).
	sourcemap: isDev ? 'linked' : (generateSourceMaps ? 'external' : false),
	sourcesContent: false,
	treeShaking: true
} satisfies esbuild.BuildOptions;

const baseNodeBuildOptions = {
	...baseBuildOptions,
	external: [
		'./package.json',
		'./.vscode-test.mjs',
		'playwright',
		'keytar',
		'@azure/functions-core',
		'applicationinsights-native-metrics',
		'@opentelemetry/instrumentation',
		'@azure/opentelemetry-instrumentation-azure-sdk',
		'electron', // this is for simulation workbench,
		'sqlite3',
		'node-pty', // Required by @github/copilot
		'@github/copilot',
		...(isDev ? [] : ['dotenv', 'source-map-support'])
	],
	platform: 'node',
	mainFields: ["module", "main"], // needed for jsonc-parser,
	define: {
		'process.env.APPLICATIONINSIGHTS_CONFIGURATION_CONTENT': JSON.stringify(JSON.stringify({
			proxyHttpUrl: "",
			proxyHttpsUrl: ""
		}))
	},
} satisfies esbuild.BuildOptions;

const webviewBuildOptions = {
	...baseBuildOptions,
	platform: 'browser',
	target: 'es2024', // Electron 34 -> Chrome 132 -> ES2024
	entryPoints: [
		{ in: 'src/extension/completions-core/vscode-node/extension/src/copilotPanel/webView/suggestionsPanelWebview.ts', out: 'suggestionsPanelWebview' },
	],
} satisfies esbuild.BuildOptions;

const nodeExtHostTestGlobs = [
	'src/**/vscode/**/*.test.{ts,tsx}',
	'src/**/vscode-node/**/*.test.{ts,tsx}',
	// deprecated
	'src/extension/**/*.test.{ts,tsx}'
];

const testBundlePlugin: esbuild.Plugin = {
	name: 'testBundlePlugin',
	setup(build) {
		build.onResolve({ filter: /[\/\\]test-extension\.ts$/ }, args => {
			if (args.kind !== 'entry-point') {
				return;
			}
			return { path: path.resolve(args.path) };
		});
		build.onLoad({ filter: /[\/\\]test-extension\.ts$/ }, async args => {
			let files = await glob(nodeExtHostTestGlobs, { cwd: REPO_ROOT, posix: true, ignore: ['src/extension/completions-core/**/*'] });
			files = files.map(f => path.posix.relative('src', f));
			if (files.length === 0) {
				throw new Error('No extension tests found');
			}
			return {
				contents: files
					.map(f => `require('./${f}');`)
					.join(''),
				watchDirs: files.map(path.dirname),
				watchFiles: files,
			};
		});
	}
};

const nodeExtHostSanityTestGlobs = [
	'src/**/vscode-node/**/*.sanity-test.{ts,tsx}',
];

const sanityTestBundlePlugin: esbuild.Plugin = {
	name: 'sanityTestBundlePlugin',
	setup(build) {
		build.onResolve({ filter: /[\/\\]sanity-test-extension\.ts$/ }, args => {
			if (args.kind !== 'entry-point') {
				return;
			}
			return { path: path.resolve(args.path) };
		});
		build.onLoad({ filter: /[\/\\]sanity-test-extension\.ts$/ }, async args => {
			let files = await glob(nodeExtHostSanityTestGlobs, { cwd: REPO_ROOT, posix: true, ignore: ['src/extension/completions-core/**/*'] });
			files = files.map(f => path.posix.relative('src', f));
			if (files.length === 0) {
				throw new Error('No extension tests found');
			}
			return {
				contents: files
					.map(f => `require('./${f}');`)
					.join(''),
				watchDirs: files.map(path.dirname),
				watchFiles: files,
			};
		});
	}
};

const importMetaPlugin: esbuild.Plugin = {
	name: 'claudeAgentSdkImportMetaPlugin',
	setup(build) {
		// Handle import.meta.url in @anthropic-ai/claude-agent-sdk package
		build.onLoad({ filter: /node_modules[\/\\]@anthropic-ai[\/\\]claude-agent-sdk[\/\\].*\.mjs$/ }, async (args) => {
			const contents = await fs.promises.readFile(args.path, 'utf8');
			return {
				contents: contents.replace(
					/import\.meta\.url/g,
					'require("url").pathToFileURL(__filename).href'
				),
				loader: 'js'
			};
		});
	}
};

const shimVsCodeTypesPlugin: esbuild.Plugin = {
	name: 'shimVsCodeTypesPlugin',
	setup(build) {
		// Create a virtual module that will try to require vscode at runtime
		build.onResolve({ filter: /^vscode$/ }, args => {
			return {
				path: 'vscode-dynamic',
				namespace: 'vscode-fallback'
			};
		});

		build.onLoad({ filter: /^vscode-dynamic$/, namespace: 'vscode-fallback' }, () => {
			return {
				contents: `
					let vscode;
					// See test/simulationExtension/extension.js for where and why this is created.
					if (typeof COPILOT_SIMULATION_VSCODE !== 'undefined') {
						vscode = COPILOT_SIMULATION_VSCODE;
					} else {
						try {
							vscode = eval('require(' + JSON.stringify('vscode') + ')');
						} catch (e) {
							vscode = require('./src/util/common/test/shims/vscodeTypesShim.ts');
						}
					}
					module.exports = vscode;
				`,
				resolveDir: REPO_ROOT
			};
		});
	}
};

const nodeExtHostBuildOptions = {
	...baseNodeBuildOptions,
	entryPoints: [
		{ in: './src/extension/extension/vscode-node/extension.ts', out: 'extension' },
		{ in: './src/platform/parser/node/parserWorker.ts', out: 'worker2' },
		{ in: './src/platform/tokenizer/node/tikTokenizerWorker.ts', out: 'tikTokenizerWorker' },
		{ in: './src/platform/diff/node/diffWorkerMain.ts', out: 'diffWorker' },
		{ in: './src/platform/tfidf/node/tfidfWorker.ts', out: 'tfidfWorker' },
		{ in: './src/extension/onboardDebug/node/copilotDebugWorker/index.ts', out: 'copilotDebugCommand' },
		{ in: './src/extension/chatSessions/vscode-node/copilotCLIShim.ts', out: 'copilotCLIShim' },
		{ in: './src/test-extension.ts', out: 'test-extension' },
		{ in: './src/sanity-test-extension.ts', out: 'sanity-test-extension' },
	],
	loader: { '.ps1': 'text' },
	plugins: [testBundlePlugin, sanityTestBundlePlugin, importMetaPlugin],
	external: [
		...baseNodeBuildOptions.external,
		'vscode'
	]
} satisfies esbuild.BuildOptions;

const webExtHostBuildOptions = {
	...baseBuildOptions,
	platform: 'browser',
	entryPoints: [
		{ in: './src/extension/extension/vscode-worker/extension.ts', out: 'web' },
	],
	format: 'cjs', // Necessary to export activate function from bundle for extension
	external: [
		'vscode',
		'http',
	]
} satisfies esbuild.BuildOptions;

const nodeExtHostSimulationTestOptions = {
	...nodeExtHostBuildOptions,
	outdir: '.vscode/extensions/test-extension/dist',
	entryPoints: [
		{ in: '.vscode/extensions/test-extension/main.ts', out: './simulation-extension' }
	]
} satisfies esbuild.BuildOptions;

const nodeSimulationBuildOptions = {
	...baseNodeBuildOptions,
	entryPoints: [
		{ in: './test/simulationMain.ts', out: 'simulationMain' },
	],
	plugins: [testBundlePlugin, shimVsCodeTypesPlugin],
	external: [
		...baseNodeBuildOptions.external,
	]
} satisfies esbuild.BuildOptions;

const nodeSimulationWorkbenchUIBuildOptions = {
	...baseNodeBuildOptions,
	platform: 'browser', // @ulugbekna: important to target 'browser' for correct bundling using 'window'
	mainFields: ["browser", "module", "main"],
	entryPoints: [
		{ in: './test/simulation/workbench/simulationWorkbench.tsx', out: 'simulationWorkbench' },
	],
	alias: {
		'vscode': './src/util/common/test/shims/vscodeTypesShim.ts'
	},
	external: [
		...baseNodeBuildOptions.external,

		'../../node_modules/monaco-editor/*',

		// @ulugbekna: libs provided by node that need to be specified manually because of 'platform' is set to 'browser'
		'fs',
		'path',
		'readline',
		'child_process',
		'http',
		'assert',
	],
} satisfies esbuild.BuildOptions;

async function typeScriptServerPluginPackageJsonInstall(): Promise<void> {
	await mkdir('./node_modules/@vscode/copilot-typescript-server-plugin', { recursive: true });
	const source = path.join(import.meta.dirname, './src/extension/typescriptContext/serverPlugin/package.json');
	const destination = path.join(import.meta.dirname, './node_modules/@vscode/copilot-typescript-server-plugin/package.json');
	try {
		await copyFile(source, destination);
	} catch (error) {
		console.error('Error copying package.json:', error);
	}
}

const typeScriptServerPluginBuildOptions = {
	bundle: true,
	format: 'cjs',
	// keepNames: true,
	logLevel: 'info',
	minify: !isDev,
	outdir: './node_modules/@vscode/copilot-typescript-server-plugin/dist',
	platform: 'node',
	sourcemap: isDev ? 'linked' : false,
	sourcesContent: false,
	treeShaking: true,
	external: [
		"typescript",
		"typescript/lib/tsserverlibrary"
	],
	entryPoints: [
		{ in: './src/extension/typescriptContext/serverPlugin/src/node/main.ts', out: 'main' },
	]
} satisfies esbuild.BuildOptions;

/**
 * Moves all .map files from the output directories to a separate source maps directory.
 * This keeps source maps out of the packaged extension while making them available for upload.
 */
async function moveSourceMapsToSeparateDir(): Promise<void> {
	if (!generateSourceMaps) {
		return;
	}

	const outputDirs = [
		'./dist',
		'./node_modules/@vscode/copilot-typescript-server-plugin/dist',
	];

	await mkdir(sourceMapOutDir, { recursive: true });

	for (const dir of outputDirs) {
		try {
			const files = await readdir(dir);
			for (const file of files) {
				if (file.endsWith('.map')) {
					const sourcePath = path.join(dir, file);
					// Prefix with directory name to avoid collisions
					const prefix = dir === './dist' ? '' : 'ts-plugin-';
					const destPath = path.join(sourceMapOutDir, prefix + file);
					await rename(sourcePath, destPath);
					console.log(`Moved source map: ${sourcePath} -> ${destPath}`);
				}
			}
		} catch (error) {
			// Directory might not exist in some build configurations
			console.warn(`Could not process directory ${dir}:`, error);
		}
	}
}

async function main() {
	if (process.env['BUILD_SOURCEVERSION']) {
		console.log('Running in CI environment, applying package.json patch for correct versioning and pre-release status...');
		applyPackageJsonPatch();
	}

	await typeScriptServerPluginPackageJsonInstall();

	if (isWatch) {

		const contexts: esbuild.BuildContext[] = [];

		const nodeExtHostContext = await esbuild.context(nodeExtHostBuildOptions);
		contexts.push(nodeExtHostContext);

		const webExtHostContext = await esbuild.context(webExtHostBuildOptions);
		contexts.push(webExtHostContext);

		const nodeSimulationContext = await esbuild.context(nodeSimulationBuildOptions);
		contexts.push(nodeSimulationContext);

		const nodeSimulationWorkbenchUIContext = await esbuild.context(nodeSimulationWorkbenchUIBuildOptions);
		contexts.push(nodeSimulationWorkbenchUIContext);

		const nodeExtHostSimulationContext = await esbuild.context(nodeExtHostSimulationTestOptions);
		contexts.push(nodeExtHostSimulationContext);

		const typeScriptServerPluginContext = await esbuild.context(typeScriptServerPluginBuildOptions);
		contexts.push(typeScriptServerPluginContext);

		let debounce: NodeJS.Timeout | undefined;

		const rebuild = async () => {
			if (debounce) {
				clearTimeout(debounce);
			}

			debounce = setTimeout(async () => {
				console.log('[watch] build started');
				for (const ctx of contexts) {
					try {
						await ctx.cancel();
						await ctx.rebuild();
					} catch (error) {
						console.error('[watch]', error);
					}
				}
				console.log('[watch] build finished');
			}, 100);
		};

		const watcher = await import('@parcel/watcher');
		watcher.subscribe(REPO_ROOT, (err, events) => {
			for (const event of events) {
				console.log(`File change detected: ${event.path}`);
			}
			rebuild();
		}, {
			ignore: [
				`**/.git/**`,
				`**/.simulation/**`,
				`**/test/outcome/**`,
				`.vscode-test/**`,
				`**/.venv/**`,
				`**/dist/**`,
				`**/node_modules/**`,
				`**/*.txt`,
				`**/baseline.json`,
				`**/baseline.old.json`,
				`**/*.w.json`,
				'**/*.sqlite',
				'**/*.sqlite-journal',
				'test/aml/out/**'
			]
		});
		rebuild();
	} else {
		await Promise.all([
			esbuild.build(nodeExtHostBuildOptions),
			esbuild.build(webExtHostBuildOptions),
			esbuild.build(nodeSimulationBuildOptions),
			esbuild.build(nodeSimulationWorkbenchUIBuildOptions),
			esbuild.build(nodeExtHostSimulationTestOptions),
			esbuild.build(typeScriptServerPluginBuildOptions),
			esbuild.build(webviewBuildOptions),
		]);

		// Run postinstall to copy static build assets (wasm, tiktoken, cli) to dist/.
		// This is needed because in CI, node_modules may be restored from cache,
		// skipping npm ci and thus the postinstall script.
		const child_process = await import('child_process');
		child_process.execFileSync(
			process.execPath,
			[
				path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
				path.join(REPO_ROOT, 'script', 'postinstall.ts'),
			],
			{ cwd: REPO_ROOT, stdio: 'inherit' },
		);

		// Move source maps to separate directory so they're not packaged with the extension
		await moveSourceMapsToSeparateDir();
	}
}

function applyPackageJsonPatch() {
	const quality = process.env['VSCODE_QUALITY'];

	if (!quality) {
		throw new Error('VSCODE_QUALITY environment variable is not set. This should be set by the build pipeline to ensure correct versioning and pre-release status in package.json.');
	}

	const packageJsonPath = path.join(import.meta.dirname, './package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	let version = packageJson.version;
	const isPreRelease = quality !== 'stable';

	if (isPreRelease) {
		const counterStr = process.env['VSCODE_PUBLISH_COUNTER'];

		if (!counterStr) {
			throw new Error('VSCODE_PUBLISH_COUNTER environment variable is not set. This should be set by the build pipeline to ensure unique versioning for each pre-release build.');
		}

		if (!/^\d+$/.test(counterStr)) {
			throw new Error('VSCODE_PUBLISH_COUNTER must be a non-negative integer. This should be set by the build pipeline to ensure unique versioning for each pre-release build.');
		}

		const counter = Number.parseInt(counterStr, 10);

		if (!Number.isInteger(counter) || counter >= 100) {
			throw new Error('VSCODE_PUBLISH_COUNTER is out of range. This should be a whole number between 0 and 99 that increments with each build, but resets periodically (e.g. daily) to avoid excessively long version numbers.');
		}

		const [major, minor] = version.split('.');
		version = `${major}.${minor}.${getDateBasedPatch(counter)}`;
	}

	const newProps = {
		buildType: 'prod',
		isPreRelease,
		version
	};

	fs.writeFileSync(packageJsonPath, JSON.stringify({ ...packageJson, ...newProps }, null, '\t'));
}

function getDateBasedPatch(counter: number): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}${month}${day}${String(counter).padStart(2, '0')}`;
}

main();
