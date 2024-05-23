/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const yaserver = require('yaserver');
const http = require('http');
const cp = require('child_process');

const PORT = 8563;

yaserver.createServer({
	rootDir: __dirname
}).then((staticServer) => {
	const server = http.createServer((request, response) => {
		return staticServer.handle(request, response);
	});
	server.listen(PORT, '127.0.0.1', () => {
		runTests().then(() => {
			console.log(`All good`);
			process.exit(0);
		}, (err) => {
			console.error(err);
			process.exit(1);
		});
	});
});

function runTests() {
	return (
		runTest('chromium')
			.then(() => runTest('firefox'))
			// .then(() => runTest('webkit'))
	);
}

function runTest(browser) {
	return new Promise((resolve, reject) => {
		const proc = cp.spawn('node', ['../../node_modules/mocha/bin/mocha', 'out/*.test.js', '--headless'], {
			env: { BROWSER: browser, ...process.env },
			stdio: 'inherit'
		});
		proc.on('error', reject);
		proc.on('exit', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(code);
			}
		});
	});
}
