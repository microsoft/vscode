/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

/**
 * @import { INLSConfiguration } from './vs/nls'
 * @import { IServerAPI } from './vs/server/node/remoteExtensionHostAgentServer'
 */

// ESM-comment-begin
// Keep bootstrap-amd.js from redefining 'fs'.
delete process.env['ELECTRON_RUN_AS_NODE'];

const path = require('path');
const http = require('http');
const os = require('os');
const readline = require('readline');
const performance = require('perf_hooks').performance;
const bootstrapNode = require('./bootstrap-node');
const bootstrapAmd = require('./bootstrap-amd');
const { resolveNLSConfiguration } = require('./vs/base/node/nls');
const product = require('./bootstrap-meta').product;
const perf = require(`./vs/base/common/performance`);
const minimist = require('minimist');
// ESM-comment-end
// ESM-uncomment-begin
// import './bootstrap-server.js'; // this MUST come before other imports as it changes global state
// import * as path from 'path';
// import * as http from 'http';
// import * as os from 'os';
// import * as readline from 'readline';
// import { performance }from 'perf_hooks';
// import { fileURLToPath } from 'url';
// import minimist from 'minimist';
// import * as bootstrapNode from './bootstrap-node.js';
// import * as bootstrapAmd from './bootstrap-amd.js';
// import { resolveNLSConfiguration } from './vs/base/node/nls.js';
// import { product } from './bootstrap-meta.js';
// import * as perf from './vs/base/common/performance.js';
//
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ESM-uncomment-end

perf.mark('code/server/start');
// @ts-ignore
global.vscodeServerStartTime = performance.now();

async function start() {

	// Do a quick parse to determine if a server or the cli needs to be started
	const parsedArgs = minimist(process.argv.slice(2), {
		boolean: ['start-server', 'list-extensions', 'print-ip-address', 'help', 'version', 'accept-server-license-terms', 'update-extensions'],
		string: ['install-extension', 'install-builtin-extension', 'uninstall-extension', 'locate-extension', 'socket-path', 'host', 'port', 'compatibility'],
		alias: { help: 'h', version: 'v' }
	});
	['host', 'port', 'accept-server-license-terms'].forEach(e => {
		if (!parsedArgs[e]) {
			const envValue = process.env[`VSCODE_SERVER_${e.toUpperCase().replace('-', '_')}`];
			if (envValue) {
				parsedArgs[e] = envValue;
			}
		}
	});

	const extensionLookupArgs = ['list-extensions', 'locate-extension'];
	const extensionInstallArgs = ['install-extension', 'install-builtin-extension', 'uninstall-extension', 'update-extensions'];

	const shouldSpawnCli = parsedArgs.help || parsedArgs.version || extensionLookupArgs.some(a => !!parsedArgs[a]) || (extensionInstallArgs.some(a => !!parsedArgs[a]) && !parsedArgs['start-server']);

	const nlsConfiguration = await resolveNLSConfiguration({ userLocale: 'en', osLocale: 'en', commit: product.commit, userDataPath: '', nlsMetadataPath: __dirname });

	if (shouldSpawnCli) {
		loadCode(nlsConfiguration).then((mod) => {
			mod.spawnCli();
		});
		return;
	}

	/** @type {IServerAPI | null} */
	let _remoteExtensionHostAgentServer = null;
	/** @type {Promise<IServerAPI> | null} */
	let _remoteExtensionHostAgentServerPromise = null;
	/** @returns {Promise<IServerAPI>} */
	const getRemoteExtensionHostAgentServer = () => {
		if (!_remoteExtensionHostAgentServerPromise) {
			_remoteExtensionHostAgentServerPromise = loadCode(nlsConfiguration).then(async (mod) => {
				const server = await mod.createServer(address);
				_remoteExtensionHostAgentServer = server;
				return server;
			});
		}
		return _remoteExtensionHostAgentServerPromise;
	};

	if (Array.isArray(product.serverLicense) && product.serverLicense.length) {
		console.log(product.serverLicense.join('\n'));
		if (product.serverLicensePrompt && parsedArgs['accept-server-license-terms'] !== true) {
			if (hasStdinWithoutTty()) {
				console.log('To accept the license terms, start the server with --accept-server-license-terms');
				process.exit(1);
			}
			try {
				const accept = await prompt(product.serverLicensePrompt);
				if (!accept) {
					process.exit(1);
				}
			} catch (e) {
				console.log(e);
				process.exit(1);
			}
		}
	}

	let firstRequest = true;
	let firstWebSocket = true;

	/** @type {string | import('net').AddressInfo | null} */
	let address = null;
	const server = http.createServer(async (req, res) => {
		if (firstRequest) {
			firstRequest = false;
			perf.mark('code/server/firstRequest');
		}
		const remoteExtensionHostAgentServer = await getRemoteExtensionHostAgentServer();
		return remoteExtensionHostAgentServer.handleRequest(req, res);
	});
	server.on('upgrade', async (req, socket) => {
		if (firstWebSocket) {
			firstWebSocket = false;
			perf.mark('code/server/firstWebSocket');
		}
		const remoteExtensionHostAgentServer = await getRemoteExtensionHostAgentServer();
		// @ts-ignore
		return remoteExtensionHostAgentServer.handleUpgrade(req, socket);
	});
	server.on('error', async (err) => {
		const remoteExtensionHostAgentServer = await getRemoteExtensionHostAgentServer();
		return remoteExtensionHostAgentServer.handleServerError(err);
	});

	const host = sanitizeStringArg(parsedArgs['host']) || (parsedArgs['compatibility'] !== '1.63' ? 'localhost' : undefined);
	const nodeListenOptions = (
		parsedArgs['socket-path']
			? { path: sanitizeStringArg(parsedArgs['socket-path']) }
			: { host, port: await parsePort(host, sanitizeStringArg(parsedArgs['port'])) }
	);
	server.listen(nodeListenOptions, async () => {
		let output = Array.isArray(product.serverGreeting) && product.serverGreeting.length ? `\n\n${product.serverGreeting.join('\n')}\n\n` : ``;

		if (typeof nodeListenOptions.port === 'number' && parsedArgs['print-ip-address']) {
			const ifaces = os.networkInterfaces();
			Object.keys(ifaces).forEach(function (ifname) {
				ifaces[ifname]?.forEach(function (iface) {
					if (!iface.internal && iface.family === 'IPv4') {
						output += `IP Address: ${iface.address}\n`;
					}
				});
			});
		}

		address = server.address();
		if (address === null) {
			throw new Error('Unexpected server address');
		}

		output += `Server bound to ${typeof address === 'string' ? address : `${address.address}:${address.port} (${address.family})`}\n`;
		// Do not change this line. VS Code looks for this in the output.
		output += `Extension host agent listening on ${typeof address === 'string' ? address : address.port}\n`;
		console.log(output);

		perf.mark('code/server/started');
		// @ts-ignore
		global.vscodeServerListenTime = performance.now();

		await getRemoteExtensionHostAgentServer();
	});

	process.on('exit', () => {
		server.close();
		if (_remoteExtensionHostAgentServer) {
			_remoteExtensionHostAgentServer.dispose();
		}
	});
}
/**
 * @param {any} val
 * @returns {string | undefined}
 */
function sanitizeStringArg(val) {
	if (Array.isArray(val)) { // if an argument is passed multiple times, minimist creates an array
		val = val.pop(); // take the last item
	}
	return typeof val === 'string' ? val : undefined;
}

/**
 * If `--port` is specified and describes a single port, connect to that port.
 *
 * If `--port`describes a port range
 * then find a free port in that range. Throw error if no
 * free port available in range.
 *
 * In absence of specified ports, connect to port 8000.
 * @param {string | undefined} host
 * @param {string | undefined} strPort
 * @returns {Promise<number>}
 * @throws
 */
async function parsePort(host, strPort) {
	if (strPort) {
		let range;
		if (strPort.match(/^\d+$/)) {
			return parseInt(strPort, 10);
		} else if (range = parseRange(strPort)) {
			const port = await findFreePort(host, range.start, range.end);
			if (port !== undefined) {
				return port;
			}
			// Remote-SSH extension relies on this exact port error message, treat as an API
			console.warn(`--port: Could not find free port in range: ${range.start} - ${range.end} (inclusive).`);
			process.exit(1);

		} else {
			console.warn(`--port "${strPort}" is not a valid number or range. Ranges must be in the form 'from-to' with 'from' an integer larger than 0 and not larger than 'end'.`);
			process.exit(1);
		}
	}
	return 8000;
}

/**
 * @param {string} strRange
 * @returns {{ start: number; end: number } | undefined}
 */
function parseRange(strRange) {
	const match = strRange.match(/^(\d+)-(\d+)$/);
	if (match) {
		const start = parseInt(match[1], 10), end = parseInt(match[2], 10);
		if (start > 0 && start <= end && end <= 65535) {
			return { start, end };
		}
	}
	return undefined;
}

/**
 * Starting at the `start` port, look for a free port incrementing
 * by 1 until `end` inclusive. If no free port is found, undefined is returned.
 *
 * @param {string | undefined} host
 * @param {number} start
 * @param {number} end
 * @returns {Promise<number | undefined>}
 * @throws
 */
async function findFreePort(host, start, end) {
	const testPort = (/** @type {number} */ port) => {
		return new Promise((resolve) => {
			const server = http.createServer();
			server.listen(port, host, () => {
				server.close();
				resolve(true);
			}).on('error', () => {
				resolve(false);
			});
		});
	};
	for (let port = start; port <= end; port++) {
		if (await testPort(port)) {
			return port;
		}
	}
	return undefined;
}

/**
 * @param {INLSConfiguration} nlsConfiguration
 * @returns { Promise<typeof import('./vs/server/node/server.main')> }
 */
function loadCode(nlsConfiguration) {
	return new Promise((resolve, reject) => {

		/** @type {INLSConfiguration} */
		process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfiguration); // required for `bootstrap-amd` to pick up NLS messages

		// See https://github.com/microsoft/vscode-remote-release/issues/6543
		// We would normally install a SIGPIPE listener in bootstrap-node.js
		// But in certain situations, the console itself can be in a broken pipe state
		// so logging SIGPIPE to the console will cause an infinite async loop
		process.env['VSCODE_HANDLES_SIGPIPE'] = 'true';

		if (process.env['VSCODE_DEV']) {
			// When running out of sources, we need to load node modules from remote/node_modules,
			// which are compiled against nodejs, not electron
			process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(__dirname, '..', 'remote', 'node_modules');
			bootstrapNode.devInjectNodeModuleLookupPath(process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']);
		} else {
			delete process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'];
		}
		bootstrapAmd.load('vs/server/node/server.main', resolve, reject);
	});
}

function hasStdinWithoutTty() {
	try {
		return !process.stdin.isTTY; // Via https://twitter.com/MylesBorins/status/782009479382626304
	} catch (error) {
		// Windows workaround for https://github.com/nodejs/node/issues/11656
	}
	return false;
}

/**
 * @param {string} question
 * @returns { Promise<boolean> }
 */
function prompt(question) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	return new Promise((resolve, reject) => {
		rl.question(question + ' ', async function (data) {
			rl.close();
			const str = data.toString().trim().toLowerCase();
			if (str === '' || str === 'y' || str === 'yes') {
				resolve(true);
			} else if (str === 'n' || str === 'no') {
				resolve(false);
			} else {
				process.stdout.write('\nInvalid Response. Answer either yes (y, yes) or no (n, no)\n');
				resolve(await prompt(question));
			}
		});
	});
}

start();
