/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const perf = require('../base/common/performance');
const performance = require('perf_hooks').performance;
const product = require('../../../product.json');

perf.mark('code/server/start');
// @ts-ignore
global.vscodeServerStartTime = performance.now();

async function start() {
	if (process.argv[2] === '--exec') {
		process.argv.splice(1, 2);
		require(process.argv[1]);
		return;
	}

	const minimist = require('minimist');

	// Do a quick parse to determine if a server or the cli needs to be started
	const parsedArgs = minimist(process.argv.slice(2), {
		boolean: ['start-server', 'list-extensions', 'print-ip-address'],
		string: ['install-extension', 'install-builtin-extension', 'uninstall-extension', 'locate-extension', 'socket-path', 'host', 'port', 'pick-port']
	});

	const shouldSpawnCli = (
		!parsedArgs['start-server'] &&
		(!!parsedArgs['list-extensions'] || !!parsedArgs['install-extension'] || !!parsedArgs['install-builtin-extension'] || !!parsedArgs['uninstall-extension'] || !!parsedArgs['locate-extension'])
	);

	if (shouldSpawnCli) {
		loadCode().then((mod) => {
			mod.spawnCli();
		});
		return;
	}

	/**
	 * @typedef { import('./remoteExtensionHostAgentServer').IServerAPI } IServerAPI
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
	const nodeListenOptions = (
		parsedArgs['socket-path']
			? { path: parsedArgs['socket-path'] }
			: { host: parsedArgs['host'], port: await parsePort(parsedArgs['port'], parsedArgs['pick-port']) }
	);
	server.listen(nodeListenOptions, async () => {
		const serverGreeting = product.serverGreeting.join('\n');
		let output = serverGreeting ? `\n\n${serverGreeting}\n\n` : ``;

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
 * If `--pick-port` and `--port` is specified, connect to that port.
 *
 * If not and a port range is specified through `--pick-port`
 * then find a free port in that range. Throw error if no
 * free port available in range.
 *
 * If only `--port` is provided then connect to that port.
 *
 * In absence of specified ports, connect to port 8000.
 * @param {string | undefined} strPort
 * @param {string | undefined} strPickPort
 * @returns {Promise<number>}
 * @throws
 */
async function parsePort(strPort, strPickPort) {
	let specificPort = -1;

	if (strPort) {
		const port = parseInt(strPort, 10);
		if (!isNaN(port)) {
			specificPort = port;
		} else {
			console.log('Port is not a number, will default to 8000 if no pick-port is given.');
		}
	}

	if (strPickPort) {
		if (strPickPort.match(/^\d+-\d+$/)) {
			const [start, end] = strPickPort.split('-').map(numStr => { return parseInt(numStr, 10); });

			if (!isNaN(start) && !isNaN(end)) {
				if (specificPort !== -1 && specificPort >= start && specificPort <= end) {
					return specificPort;
				} else {
					return await findFreePort(start, start, end);
				}
			} else {
				console.log('Port range are not numbers, using 8000 instead.');
			}
		} else {
			console.log(`Port range: "${strPickPort}" is not properly formatted, using 8000 instead.`);
		}
	}

	if (specificPort !== -1) {
		return specificPort;
	}

	return 8000;
}

/**
 * Starting at the `start` port, look for a free port incrementing
 * by 1 until `end` inclusive. If no port is found error is thrown.
 *
 * @param {number} start
 * @param {number} port
 * @param {number} end
 * @returns {Promise<number>}
 * @throws
 */
async function findFreePort(start, port, end) {
	const http = require('http');
	return new Promise((resolve, reject) => {
		if (port > end) {
			throw new Error(`Could not find free port in range: ${start}-${end}`);
		}

		const server = http.createServer();
		server.listen(port, () => {
			server.close();
			resolve(port);
		}).on('error', () => {
			resolve(findFreePort(start, port + 1, end));
		});
	});
}

/** @returns { Promise<typeof import('./remoteExtensionHostAgent')> } */
function loadCode() {
	return new Promise((resolve, reject) => {
		const path = require('path');

		// Set default remote native node modules path, if unset
		process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(__dirname, '..', '..', '..', 'remote', 'node_modules');
		require('../../bootstrap-node').injectNodeModuleLookupPath(process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']);
		require('../../bootstrap-amd').load('vs/server/remoteExtensionHostAgent', resolve, reject);
	});
}

start();
