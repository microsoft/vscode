/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './bootstrap-server.js'; // this MUST come before other imports as it changes global state
import * as path from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import * as readline from 'node:readline';
import { performance } from 'node:perf_hooks';
import minimist from 'minimist';
import { devInjectNodeModuleLookupPath, removeGlobalNodeJsModuleLookupPaths } from './bootstrap-node.js';
import { bootstrapESM } from './bootstrap-esm.js';
import { resolveNLSConfiguration } from './vs/base/node/nls.js';
import { product } from './bootstrap-meta.js';
import * as perf from './vs/base/common/performance.js';
perf.mark('code/server/start');
globalThis.vscodeServerStartTime = performance.now();
// Do a quick parse to determine if a server or the cli needs to be started
const parsedArgs = minimist(process.argv.slice(2), {
    boolean: ['start-server', 'list-extensions', 'print-ip-address', 'help', 'version', 'accept-server-license-terms', 'update-extensions'],
    string: ['install-extension', 'install-builtin-extension', 'uninstall-extension', 'locate-extension', 'socket-path', 'host', 'port', 'compatibility', 'agent-host-port', 'agent-host-path'],
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
const nlsConfiguration = await resolveNLSConfiguration({ userLocale: 'en', osLocale: 'en', commit: product.commit, userDataPath: '', nlsMetadataPath: import.meta.dirname });
if (shouldSpawnCli) {
    loadCode(nlsConfiguration).then((mod) => {
        mod.spawnCli();
    });
}
else {
    let _remoteExtensionHostAgentServer = null;
    let _remoteExtensionHostAgentServerPromise = null;
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
            }
            catch (e) {
                console.log(e);
                process.exit(1);
            }
        }
    }
    let firstRequest = true;
    let firstWebSocket = true;
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
        // @ts-expect-error
        return remoteExtensionHostAgentServer.handleUpgrade(req, socket);
    });
    server.on('error', async (err) => {
        const remoteExtensionHostAgentServer = await getRemoteExtensionHostAgentServer();
        return remoteExtensionHostAgentServer.handleServerError(err);
    });
    const host = sanitizeStringArg(parsedArgs['host']) || (parsedArgs['compatibility'] !== '1.63' ? 'localhost' : undefined);
    const nodeListenOptions = (parsedArgs['socket-path']
        ? { path: sanitizeStringArg(parsedArgs['socket-path']) }
        : { host, port: await parsePort(host, sanitizeStringArg(parsedArgs['port'])) });
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
        globalThis.vscodeServerListenTime = performance.now();
        await getRemoteExtensionHostAgentServer();
    });
    process.on('exit', () => {
        server.close();
        if (_remoteExtensionHostAgentServer) {
            _remoteExtensionHostAgentServer.dispose();
        }
    });
}
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
 */
async function parsePort(host, strPort) {
    if (strPort) {
        let range;
        if (strPort.match(/^\d+$/)) {
            return parseInt(strPort, 10);
        }
        else if (range = parseRange(strPort)) {
            const port = await findFreePort(host, range.start, range.end);
            if (port !== undefined) {
                return port;
            }
            // Remote-SSH extension relies on this exact port error message, treat as an API
            console.warn(`--port: Could not find free port in range: ${range.start} - ${range.end} (inclusive).`);
            process.exit(1);
        }
        else {
            console.warn(`--port "${strPort}" is not a valid number or range. Ranges must be in the form 'from-to' with 'from' an integer larger than 0 and not larger than 'end'.`);
            process.exit(1);
        }
    }
    return 8000;
}
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
async function loadCode(nlsConfiguration) {
    // required for `bootstrap-esm` to pick up NLS messages
    process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfiguration);
    // See https://github.com/microsoft/vscode-remote-release/issues/6543
    // We would normally install a SIGPIPE listener in bootstrap-node.js
    // But in certain situations, the console itself can be in a broken pipe state
    // so logging SIGPIPE to the console will cause an infinite async loop
    process.env['VSCODE_HANDLES_SIGPIPE'] = 'true';
    if (process.env['VSCODE_DEV']) {
        // When running out of sources, we need to load node modules from remote/node_modules,
        // which are compiled against nodejs, not electron
        process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(import.meta.dirname, '..', 'remote', 'node_modules');
        devInjectNodeModuleLookupPath(process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH']);
    }
    else {
        delete process.env['VSCODE_DEV_INJECT_NODE_MODULE_LOOKUP_PATH'];
    }
    // Remove global paths from the node module lookup (node.js only)
    removeGlobalNodeJsModuleLookupPaths();
    // Bootstrap ESM
    await bootstrapESM();
    // Load Server
    return import('./vs/server/node/server.main.js');
}
function hasStdinWithoutTty() {
    try {
        return !process.stdin.isTTY; // Via https://twitter.com/MylesBorins/status/782009479382626304
    }
    catch (error) {
        // Windows workaround for https://github.com/nodejs/node/issues/11656
    }
    return false;
}
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
            }
            else if (str === 'n' || str === 'no') {
                resolve(false);
            }
            else {
                process.stdout.write('\nInvalid Response. Answer either yes (y, yes) or no (n, no)\n');
                resolve(await prompt(question));
            }
        });
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyLW1haW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJzZXJ2ZXItbWFpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLHVCQUF1QixDQUFDLENBQUMsaUVBQWlFO0FBQ2pHLE9BQU8sS0FBSyxJQUFJLE1BQU0sV0FBVyxDQUFDO0FBQ2xDLE9BQU8sS0FBSyxJQUFJLE1BQU0sV0FBVyxDQUFDO0FBRWxDLE9BQU8sS0FBSyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQzlCLE9BQU8sS0FBSyxRQUFRLE1BQU0sZUFBZSxDQUFDO0FBQzFDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUM5QyxPQUFPLFFBQVEsTUFBTSxVQUFVLENBQUM7QUFDaEMsT0FBTyxFQUFFLDZCQUE2QixFQUFFLG1DQUFtQyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDekcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2xELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUM5QyxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBSXhELElBQUksQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUM5QixVQUFpRCxDQUFDLHFCQUFxQixHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUU3RiwyRUFBMkU7QUFDM0UsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFO0lBQ2xELE9BQU8sRUFBRSxDQUFDLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLDZC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