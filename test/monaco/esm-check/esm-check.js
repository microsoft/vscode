/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const fs = require('fs');
const path = require('path');
const playwright = require('@playwright/test');
const yaserver = require('yaserver');
const http = require('http');
const { glob } = require('glob');

const DEBUG_TESTS = false;
const SRC_DIR = path.join(__dirname, '../../../out-monaco-editor-core/esm');
const DST_DIR = path.join(__dirname, './out');
const PORT = 8562;

run();

async function run() {
	await extractSourcesWithoutCSS();
	const server = await startServer();

	const browser = await playwright['chromium'].launch({
		headless: !DEBUG_TESTS,
		devtools: DEBUG_TESTS
		// slowMo: DEBUG_TESTS ? 2000 : 0
	});

	const page = await browser.newPage({
		viewport: {
			width: 800,
			height: 600
		}
	});
	page.on('pageerror', (e) => {
		console.error(`[esm-check] A page error occurred:`);
		console.error(e);
		process.exit(1);
	});

	const URL = `http://127.0.0.1:${PORT}/index.html`;
	console.log(`[esm-check] Navigating to ${URL}`);
	const response = await page.goto(URL);
	if (!response) {
		console.error(`[esm-check] Missing response.`);
		process.exit(1);
	}
	if (response.status() !== 200) {
		console.error(`[esm-check] Response status ${response.status()} is not 200 .`);
		process.exit(1);
	}
	console.log(`[esm-check] All appears good.`);

	await page.close();
	await browser.close();

	server.close();
}

/**
 * @returns {Promise<http.Server>}
 */
async function startServer() {
	const staticServer = await yaserver.createServer({ rootDir: __dirname });
	return new Promise((resolve, reject) => {
		const server = http.createServer((request, response) => {
			return staticServer.handle(request, response);
		});
		server.listen(PORT, '127.0.0.1', () => {
			resolve(server);
		});
	});
}

async function extractSourcesWithoutCSS() {
	fs.rmSync(DST_DIR, { recursive: true, force: true });

	for (const file of glob.sync('**/*', { cwd: SRC_DIR, nodir: true })) {
		const srcFilename = path.join(SRC_DIR, file);
		if (!/\.js$/.test(srcFilename)) {
			continue;
		}

		const dstFilename = path.join(DST_DIR, file);

		let contents = fs.readFileSync(srcFilename).toString();
		contents = contents.replace(/import '[^']+\.css';/g, '');

		fs.mkdirSync(path.dirname(dstFilename), { recursive: true });
		fs.writeFileSync(dstFilename, contents);
	}
}
