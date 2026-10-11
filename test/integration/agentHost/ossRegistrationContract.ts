/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert: typeof import('node:assert/strict') = require('node:assert/strict');
const fs: typeof import('node:fs') = require('node:fs');

interface IRegistrationReceipt {
	module: string;
	total: number;
	suites: { title: string; tests: number }[];
}

const channel = 'oss-registration:ready';

function isRegistrationModule(module: unknown): module is string {
	return typeof module === 'string' && /^src\/vs\/platform\/agentHost\/test\/node\/e2e\/(conformance\/agentHostConformance|providers\/(claudeAgentHostE2E|codexAgentHostE2E|copilotAgentHostE2E|copilotOtelAgentHostE2E|copilotManagedSettingsAgentHostE2E))\.integrationTest\.ts$/.test(module);
}

class RegistrationError extends Error {
	readonly errorClass: string;

	constructor(errorClass: string, module: string) {
		super(JSON.stringify({ gate: 'actual-registration', module: isRegistrationModule(module) ? module : 'invalid-module', errorClass }));
		this.errorClass = errorClass;
		this.stack = this.message;
	}
}

function sanitizeRegistrationError(error: unknown, module: string): RegistrationError {
	const errorClass = error instanceof RegistrationError ? error.errorClass
		: error instanceof assert.AssertionError ? 'AssertionError'
			: error instanceof SyntaxError ? 'SyntaxError'
				: isPayload(error) && typeof error.code === 'string' && ['EEXIST', 'EIO', 'ENOENT', 'ENOSPC', 'EACCES'].includes(error.code) ? error.code
					: 'Error';
	return new RegistrationError(errorClass, module);
}

const rendererHandshake = `
	const ossRegistration = {
		module: opts.run,
		total: mocha.suite.total(),
		suites: mocha.suite.suites.map(suite => ({ title: suite.title, tests: suite.total() }))
	};
	const ossAcknowledgment = await ipcRenderer.invoke('${channel}', ossRegistration);
	if (!ossAcknowledgment || ossAcknowledgment.module !== ossRegistration.module || ossAcknowledgment.total !== ossRegistration.total) {
		throw new Error('Registration handshake was not acknowledged');
	}
`;

function isPayload(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatePayload(value: unknown, module: string, title: string): IRegistrationReceipt {
	assert.ok(isRegistrationModule(module), 'Require exactly one known registration module');
	assert.ok(isPayload(value) && Object.hasOwn(value, 'module') && Object.hasOwn(value, 'total') && Object.hasOwn(value, 'suites'), 'Registration receipt is missing required fields');
	assert.deepEqual(Object.keys(value).sort(), ['module', 'suites', 'total'], 'Registration receipt has unexpected fields');
	assert.equal(value.module, module, 'Registration receipt came from an unexpected module');
	assert.ok(typeof value.total === 'number' && Number.isInteger(value.total) && value.total > 0, 'Registration receipt has no actual registered tests');
	assert.ok(Array.isArray(value.suites), 'Registration suites are invalid');
	const suites: IRegistrationReceipt['suites'] = value.suites.map((suite: unknown) => {
		assert.ok(isPayload(suite) && Object.hasOwn(suite, 'title') && Object.hasOwn(suite, 'tests'), 'Registration suite is invalid');
		assert.deepEqual(Object.keys(suite).sort(), ['tests', 'title'], 'Registration suite has unexpected fields');
		assert.ok(typeof suite.title === 'string' && typeof suite.tests === 'number' && Number.isInteger(suite.tests) && suite.tests >= 0, 'Registration suite count is invalid');
		return { title: suite.title, tests: suite.tests };
	});
	assert.ok(suites.some(suite => suite.title === title && suite.tests > 0), 'Expected module registered no tests');
	assert.equal(suites.reduce((total, suite) => total + suite.tests, 0), value.total, 'Registration total must match actual suite counts');
	return { module, total: value.total, suites };
}

function validateRegistration(value: unknown, module: string, title: string): IRegistrationReceipt {
	try {
		return validatePayload(value, module, title);
	} catch (error) {
		throw sanitizeRegistrationError(error, module);
	}
}

function readRegistrationReceipt(output: string, module: string, title: string): IRegistrationReceipt {
	try {
		return validateRegistration(JSON.parse(fs.readFileSync(output, 'utf8')), module, title);
	} catch (error) {
		throw sanitizeRegistrationError(error, module);
	}
}

function verifyMissingReceipt(output: string, module: string, title: string): void {
	assert.throws(() => readRegistrationReceipt(output, module, title), error => error instanceof RegistrationError && error.errorClass === 'ENOENT', 'Stock early completion must fail the real registration receipt contract');
}

function writeOwnedFile(file: string, content: string): void {
	const descriptor = fs.openSync(file, 'wx');
	let completed = false;
	try {
		try {
			fs.writeFileSync(descriptor, content);
		} finally {
			fs.closeSync(descriptor);
		}
		completed = true;
	} finally {
		if (!completed) {
			fs.unlinkSync(file);
		}
	}
}

function replaceOnce(source: string, marker: string, replacement: string): string {
	assert.equal(source.split(marker).length, 2, 'Pinned registration bootstrap boundary is not unique');
	return source.replace(marker, replacement);
}

function createProbeSources(main: string, html: string, renderer: string, prefix: string) {
	assert.ok(/^ossRegistration-[A-Za-z0-9-]+$/.test(prefix), 'Require an owned safe bootstrap prefix');
	const mainSource = replaceOnce(main, 'path.join(__dirname, \'renderer.html\')', `path.join(__dirname, '${prefix}.html')`);
	const htmlSource = replaceOnce(html, '<script src="./renderer.js"></script>', `<script src="./${prefix}.renderer.js"></script>`);
	const rendererSource = replaceOnce(renderer, '\tawait loadTests(opts);\n\n\tconst runner = mocha.run', `\tawait loadTests(opts);\n${rendererHandshake}\n\tconst runner = mocha.run`);
	return { main: mainSource, html: htmlSource, renderer: rendererSource };
}

module.exports = { channel, rendererHandshake, isRegistrationModule, sanitizeRegistrationError, validateRegistration, readRegistrationReceipt, verifyMissingReceipt, writeOwnedFile, createProbeSources };
