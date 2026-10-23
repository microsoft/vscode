/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const config = {
	exit: true,
	'node-option': 'unhandled-rejections=strict',
	reporter: 'mocha-multi-reporters',
	'reporter-option': [`configFile=${__dirname}/.mocha-multi-reporters.js`],
	require: ['tsx'],
	ui: 'tdd',
};

const cmd = process.env.npm_lifecycle_event;

if (['test:lsp-client'].includes(cmd) && !process.env.CI) {
	config.parallel = true;
}

if (['test:lsp-client', 'reverseProxyTests'].includes(cmd) && process.env.CI) {
	config.bail = true;
}

if (['test:lsp-client', 'test:lib-e2e'].includes(cmd) && process.env.CI) {
	config.retries = 3;
}

module.exports = config;
