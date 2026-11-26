/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

// Bundles `out-monaco-editor-core` like Monaco's users do (Vite, with `?esm` worker URLs handled by
// @vscode/rollup-plugin-esm-url), then loads the bundle in a browser: an editor, and a diff editor whose
// diff is computed in the editor worker. This checks that everything the standalone editor imports,
// including npm packages and workers, can be bundled and runs.

const fs = require('fs');
const path = require('path');
const http = require('http');
const playwright = require('@playwright/test');
const yaserver = require('yaserver');

const DEBUG_TESTS = false;
const MONACO_ESM_DIR = path.join(__dirname, '../../../out-monaco-editor-core/esm');
const OUT_DIR = path.join(__dirname, './out');
const PORT = 8562;

/** The diff of `a b c` against `a B c d` in index.js, as [originalStart, originalEnd, modifiedStart, modifiedEnd]. */
const EXPECTED_LINE_CHANGES = [[2, 2, 2, 2], [3, 0, 4, 4]];

run().catch(e => {
	console.error(`[esm-check] ${e?.stack ?? e}`);
	process.exit(1);
});

async function run() {
	await bundle();
	const server = await startServer();

	const browser = await playwright.chromium.launch({
		headless: !DEBUG_TESTS,
		devtools: DEBUG_TESTS
	});
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

	const errors = [];
	page.on('pageerror', e => errors.push(`page error: ${e.stack ?? e}`));
	page.on('console', message => {
		if (message.type() === 'error') {
			errors.push(`console error: ${message.text()}`);
		}
	});
	const workers = [];
	page.on('worker', worker => workers.push(worker.url()));

	const url = `http://127.0.0.1:${PORT}/index.html`;
	console.log(`[esm-check] Navigating to ${url}`);
	const response = await page.goto(url);
	if (response?.status() !== 200) {
		throw new Error(`Response status ${response?.status()} is not 200.`);
	}

	await page.waitForFunction(() => /** @type {any} */ (globalThis).esmCheck?.done, undefined, { timeout: 30_000 });
	const lineChanges = await page.evaluate(() => /** @type {any} */ (globalThis).esmCheck.lineChanges);

	await page.close();
	await browser.close();
	server.close();

	if (errors.length > 0) {
		throw new Error(`The page reported errors:\n${errors.join('\n')}`);
	}
	if (workers.length === 0) {
		throw new Error('The diff was not computed in a web worker.');
	}
	if (JSON.stringify(lineChanges) !== JSON.stringify(EXPECTED_LINE_CHANGES)) {
		throw new Error(`Unexpected diff: ${JSON.stringify(lineChanges)}, expected ${JSON.stringify(EXPECTED_LINE_CHANGES)}.`);
	}
	console.log(`[esm-check] All appears good (workers: ${workers.map(w => path.basename(new URL(w).pathname)).join(', ')}).`);
}

async function bundle() {
	if (!fs.existsSync(MONACO_ESM_DIR)) {
		throw new Error(`${MONACO_ESM_DIR} does not exist. Run \`pnpm run gulp editor-distro\` first.`);
	}
	const { build } = await import('vite');
	const { esmUrlPlugin } = await import('@vscode/rollup-plugin-esm-url');
	console.log(`[esm-check] Bundling with Vite`);
	await build({
		configFile: false,
		root: __dirname,
		logLevel: 'warn',
		resolve: {
			alias: { 'monaco-editor-core': path.join(MONACO_ESM_DIR, 'vs/editor/editor.main.js') },
		},
		plugins: [esmUrlPlugin()],
		build: {
			outDir: OUT_DIR,
			emptyOutDir: true,
			minify: false,
		},
	});
}

/**
 * @returns {Promise<http.Server>}
 */
async function startServer() {
	const staticServer = await yaserver.createServer({ rootDir: OUT_DIR });
	return new Promise(resolve => {
		const server = http.createServer((request, response) => staticServer.handle(request, response));
		server.listen(PORT, '127.0.0.1', () => resolve(server));
	});
}
