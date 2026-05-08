/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview esbuild config for the Task Board webview React bundle.
 *
 * Produces `dist/board.js` — a single self-contained IIFE that bundles
 * React, react-dom, both `@copilotkit/*` packages and our local TSX
 * sources. The webview can't load ESM from disk via `webview.asWebviewUri`,
 * so IIFE is the only viable format.
 *
 * Kept separate from the main `esbuild.mts` (which targets Node / CJS) so
 * the two builds don't have to share platform / format / external lists.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import esbuild from 'esbuild';
import type { Plugin } from 'esbuild';

const srcDir = path.join(import.meta.dirname, 'src', 'board', 'webview');
const outFile = path.join(import.meta.dirname, 'dist', 'board.js');
const stubsDir = path.join(import.meta.dirname, 'src', 'board', 'webview', '_stubs');

const isWatch = process.argv.includes('--watch');

/**
 * CopilotKit's react-core eagerly references markdown rendering deps
 * (`shiki`, `mermaid`, `katex`, `cytoscape`) and the dev console
 * (`@copilotkit/web-inspector`) via dynamic `import()` calls. We don't
 * use the chat UI / inspector in this bundle, but esbuild bakes them
 * into the IIFE because dynamic imports can't be code-split in IIFE
 * format. Stubbing them shrinks the bundle from ~15 MB to ~1 MB.
 *
 * The stub returns `Promise.reject(...)`; the consuming code path in
 * `react-core` already wraps each dynamic import in a `.catch()`, so
 * the rejection is swallowed and the surrounding feature degrades to
 * its no-op fallback.
 */
const stripHeavyDepsPlugin: Plugin = {
	name: 'sota-strip-heavy-deps',
	setup(build) {
		const matcher = /^(?:@copilotkit\/web-inspector|shiki|shiki\/.*|@shikijs\/.*|mermaid|mermaid\/.*|@mermaid-js\/.*|katex|katex\/.*|cytoscape|cytoscape-.*|streamdown|streamdown\/.*)$/;
		const stubPath = path.join(stubsDir, 'empty-module.js');
		build.onResolve({ filter: matcher }, () => ({ path: stubPath }));
	},
};

const buildOptions: esbuild.BuildOptions = {
	platform: 'browser',
	entryPoints: [path.join(srcDir, 'index.tsx')],
	outfile: outFile,
	bundle: true,
	minify: true,
	treeShaking: true,
	sourcemap: true,
	target: ['es2020'],
	format: 'iife',
	jsx: 'automatic',
	jsxDev: false,
	mainFields: ['browser', 'module', 'main'],
	loader: {
		'.css': 'text',
	},
	define: {
		'process.env.NODE_ENV': '"production"',
	},
	// React + CopilotKit are *bundled in*, not externalised — the webview has
	// no node_modules to resolve from.
	external: [],
	plugins: [stripHeavyDepsPlugin],
	logOverride: {
		'import-is-undefined': 'error',
	},
};

// Ensure the stub module exists before esbuild tries to read it.
//
// The stub uses a Proxy so any named import (e.g. `import { foo } from 'shiki'`)
// resolves to a no-op function. Several stubbed packages (`shiki`, `streamdown`)
// re-export named symbols through the dynamic import path; without the proxy,
// esbuild errors with "No matching export". The runtime never executes these
// (their callers are gated behind feature flags or wrapped in `.catch()`).
function ensureStubFile(): void {
	if (!fs.existsSync(stubsDir)) {
		fs.mkdirSync(stubsDir, { recursive: true });
	}
	const stubPath = path.join(stubsDir, 'empty-module.js');
	const desired =
		'// Auto-generated stub for heavy CopilotKit deps not used by the board.\n' +
		'const noop = () => undefined;\n' +
		'const handler = { get: () => noop };\n' +
		'const stub = new Proxy({}, handler);\n' +
		'export default stub;\n' +
		'// eslint-disable-next-line\n' +
		'export const __sotaStub = true;\n' +
		// Named-export passthroughs for the symbols streamdown / shiki call by name.
		'export const createHighlighter = noop;\n' +
		'export const bundledLanguages = {};\n' +
		'export const bundledThemes = {};\n' +
		'export const createJavaScriptRegexEngine = noop;\n' +
		'export const createOnigurumaEngine = noop;\n' +
		'export const getHighlighter = noop;\n' +
		'export const codeToHast = noop;\n' +
		'export const codeToHtml = noop;\n' +
		'export const codeToTokens = noop;\n' +
		'export const renderMathInElement = noop;\n' +
		'export const render = noop;\n' +
		// React-component stubs. Returning `null` makes them harmless when
		// rendered; we only mount these via CopilotKit code paths the board
		// never enters (chat markdown rendering, dev console, etc.).
		'export const Streamdown = () => null;\n' +
		'export const ShikiHighlighter = () => null;\n' +
		'export const Mermaid = () => null;\n' +
		'export const Katex = () => null;\n' +
		'export const __esModule = true;\n';
	if (!fs.existsSync(stubPath) || fs.readFileSync(stubPath, 'utf8') !== desired) {
		fs.writeFileSync(stubPath, desired, 'utf8');
	}
}

export async function build(): Promise<void> {
	ensureStubFile();
	if (isWatch) {
		const ctx = await esbuild.context(buildOptions);
		await ctx.watch();
		console.log('[board] watching…');
		return;
	}
	await esbuild.build(buildOptions);
	console.log(`[board] built ${path.relative(import.meta.dirname, outFile)}`);
}

// Allow `tsx esbuild.board.mts` direct invocation as well as imported `build()`.
if (import.meta.url === `file://${process.argv[1]}`) {
	build().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
