/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const electron: typeof import('electron') = require('electron');
const fs: typeof import('node:fs') = require('node:fs');
const path: typeof import('node:path') = require('node:path');
const urls: typeof import('node:url') = require('node:url');
const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const contract: {
	channel: string;
	isRegistrationModule(module: unknown): module is string;
	sanitizeRegistrationError(error: unknown, module: string): Error & { errorClass: string };
	writeOwnedFile(file: string, content: string): void;
	validateRegistration(value: unknown, module: string, title: string): { module: string; total: number; suites: { title: string; tests: number }[] };
	createProbeSources(main: string, html: string, renderer: string, prefix: string): { main: string; html: string; renderer: string };
} = require('./ossRegistrationContract.ts');

const output = process.env.AGENT_HOST_OSS_REGISTRATION_OUTPUT;
assert.ok(output, 'Supply the owned registration output path');
assert.ok(__dirname.endsWith(path.join('test', 'unit', 'electron')), 'Use the standard Electron bootstrap directory');
const expectedModule = process.env.AGENT_HOST_OSS_REGISTRATION_MODULE;
const expectedTitle = process.env.AGENT_HOST_OSS_REGISTRATION_TITLE;
const prefix = process.env.AGENT_HOST_OSS_REGISTRATION_PREFIX;
assert.ok(expectedModule && expectedTitle && prefix, 'Supply the expected module identity and owned bootstrap prefix');
assert.ok(contract.isRegistrationModule(expectedModule), 'Require exactly one known registration module');
const rootUrl = urls.pathToFileURL(path.resolve(__dirname, '../../..') + path.sep).href;

electron.ipcMain.handle(contract.channel, (_event, payload: unknown) => {
	try {
		const registration = contract.validateRegistration(payload, expectedModule, expectedTitle);
		contract.writeOwnedFile(output, JSON.stringify(registration));
		console.log(JSON.stringify({ gate: 'actual-registration', module: expectedModule, total: registration.total }));
		return { module: registration.module, total: registration.total };
	} catch (error) {
		const failure = contract.sanitizeRegistrationError(error, expectedModule);
		console.error(JSON.stringify({ gate: 'actual-registration', module: expectedModule, result: 'failed', errorClass: failure.errorClass }));
		throw failure;
	}
});
electron.app.on('browser-window-created', (_event, window) => {
	window.webContents.session.webRequest.onErrorOccurred(details => {
		if (details.url.startsWith(rootUrl)) {
			console.error(JSON.stringify({ gate: 'module-load', module: details.url.slice(rootUrl.length).split(/[?#]/, 1)[0], errorClass: details.error }));
		}
	});
});
const sources = contract.createProbeSources(
	fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8'),
	fs.readFileSync(path.join(__dirname, 'renderer.html'), 'utf8'),
	fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8'),
	prefix,
);
const created: string[] = [];
process.once('exit', () => {
	for (const file of created) {
		fs.unlinkSync(file);
	}
});
for (const [extension, content] of [['main.js', sources.main], ['html', sources.html], ['renderer.js', sources.renderer]]) {
	const file = path.join(__dirname, `${prefix}.${extension}`);
	contract.writeOwnedFile(file, content);
	created.push(file);
}
require(`./${prefix}.main.js`);
