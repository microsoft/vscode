/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const perf = require('./vs/base/common/performance');
const performance = require('perf_hooks').performance;
const product = require('../product.json');
const readline = require('readline');
const http = require('http');

perf.mark('code/server/start');
// @ts-ignore
global.vscodeServerStartTime = performance.now();

async function start() {
	const minimist = require('minimist');

	// Do a quick parse to determine if a server or the cli needs to be started
	const parsedArgs = minimist(process.argv.slice(2), {
		boolean: ['start-server', 'list-extensions', 'print-ip-address', 'help', 'version', 'accept-server-license-terms'],
		string: ['install-extension', 'install-builtin-extension', 'uninstall-extension', 'locate-extension', 'socket-path', 'host', 'port', 'pick-port', 'compatibility'],
		alias: { help: 'h', version: 'v' }
	});

	const extensionLookupArgs = ['list-extensions', 'locate-extension'];
	const extensionInstallArgs = ['install-extension', 'install-builtin-extension', 'uninstall-extension'];

	const shouldSpawnCli = parsedArgs.help || parsedArgs.version || extensionLookupArgs.some(a => !!parsedArgs[a]) || (extensionInstallArgs.some(a => !!parsedArgs[a]) && !parsedArgs['start-server']);

	if (shouldSpawnCli) {
		loadCode().then((mod) => {
			mod.spawnCli();
		});
		return;
	}

	if (parsedArgs['compatibility'] === '1.63') {
		console.warn(`server.sh is being replaced by 'bin/${product.serverApplicationName}'. Please migrate to the new command and adopt the following new default behaviors:`);
		console.warn('* connection token is mandatory unless --without-connection-token is used');
		console.warn('* host defaults to `localhost`');
	}

	/**
	 * @typedef { import('./vs/server/node/remoteExtensionHostAgentServer').IServerAPI } IServerAPI
	 */
	/** @type {IServerAPI | null} */
	let _remoteExtensionHostAgentServer = null;
	/** @type {Promise<IServerAPI> | null} */
	let _remoteExtensionHostAgentServerPromise = null;
	/** @returns {Promise<IServerAPI>} */
	const getRemoteExtensionHostAgentServer = () => {
		if (!_remoteExtensionHostAgentServerPromise) {
			_remoteExtensionHostAgentServerPromise = loadCode().then((mod) => mod.createServer(address));
		}
		return _remoteExtensionHostAgentServerPromise;
	};

	const http = require('http');
	const os = require('os');

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
			: { host, port: await parsePort(host, sanitizeStringArg(parsedArgs['port']), sanitizeStringArg(parsedArgs['pick-port'])) }
	);
	server.listen(nodeListenOptions, async () => {
		let output = Array.isArray(product.serverGreeting) && product.serverGreeting.length ? `\n\n${product.serverGreeting.join('\n')}\n\n` : ``;

		if (typeof nodeListenOptions.port === 'number' && parsedArgs['print-ip-address']) {
			const ifaces = os.networkInterfaces();
			Object.keys(ifaces).forEach(function (ifname) {
				ifaces[ifname].forEach(function (iface) {
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
 * If `--pick-port` and `--port` is specified, connect to that port.
 *
 * If not and a port range is specified through `--pick-port`
 * then find a free port in that range. Throw error if no
 * free port available in range.
 *
 * If only `--port` is provided then connect to that port.
 *
 * In absence of specified ports, connect to port 8000.
 * @param {string | undefined} host
 * @param {string | undefined} strPort
 * @param {string | undefined} strPickPort
 * @returns {Promise<number>}
 * @throws
 */
async function parsePort(host, strPort, strPickPort) {
	let specificPort;
	if (strPort) {
		let range;
		if (strPort.match(/^\d+$/)) {
			specificPort = parseInt(strPort, 10);
			if (specificPort === 0 || !strPickPort) {
				return specificPort;
			}
		} else if (range = parseRange(strPort)) {
			const port = await findFreePort(host, range.start, range.end);
			if (port !== undefined) {
				return port;
			}
			console.warn(`--port: Could not find free port in range: ${range.start} - ${range.end} (inclusive).`);
			process.exit(1);

		} else {
			console.warn(`--port "${strPort}" is not a valid number or range. Ranges must be in the form 'from-to' with 'from' an integer larger than 0 and not larger than 'end'.`);
			process.exit(1);
		}
	}
	// pick-port is deprecated and will be removed soon
	if (strPickPort) {
		const range = parseRange(strPickPort);
		if (range) {
			if (range.start <= specificPort && specificPort <= range.end) {
				return specificPort;
			} else {
				const port = await findFreePort(host, range.start, range.end);
				if (port !== undefined) {
					return port;
				}
				console.log(`--pick-port: Could not find free port in range: ${range.start} - ${range.end}.`);
				process.exit(1);
			}
		} else {
			console.log(`--pick-port "${strPickPort}" is not a valid range. Ranges must be in the form 'from-to' with 'from' an integer larger than 0 and not larger than 'end'.`);
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
	const testPort = (port) => {
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

/** @returns { Promise<typeof import('./vs/server/node/server.main')> } */
function loadCode() {
	return new Promise((resolve, reject) => {
		const path = require('path');

		if (process.env['VSCODE_DEV']) {
			// When running out of sources, we need to load node modules from remote/node_modules,
			// which are compiled against nodejs, not electron
			process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(__dirname, '..', 'remote', 'node_modules');
			require('./bootstrap-node').injectNodeModuleLookupPath(process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']);
		} else {
			delete process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'];
		}
		require('./bootstrap-amd').load('vs/server/node/server.main', resolve, reject);
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
