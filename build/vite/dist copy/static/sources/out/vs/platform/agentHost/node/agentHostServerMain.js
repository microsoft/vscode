/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Standalone agent host server with WebSocket protocol transport.
// Start with: node out/vs/platform/agentHost/node/agentHostServerMain.js [--port <port>] [--host <host>] [--connection-token <token>] [--connection-token-file <path>] [--without-connection-token] [--enable-mock-agent] [--quiet] [--log <level>]
import { fileURLToPath } from 'url';
// This standalone process isn't bootstrapped via bootstrap-esm.ts, so we must
// set _VSCODE_FILE_ROOT ourselves so that FileAccess can resolve module paths.
// This file lives at out/vs/platform/agentHost/node/ - the root is `out/`.
globalThis._VSCODE_FILE_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
import * as fs from 'fs';
import * as os from 'os';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { parseArgs, OPTIONS } from '../../environment/node/argv.js';
import { getLogLevel, ILogService, NullLogService } from '../../log/common/log.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { CopilotAgent } from './copilot/copilotAgent.js';
import { AgentService } from './agentService.js';
import { WebSocketProtocolServer } from './webSocketTransport.js';
import { ProtocolServerHandler } from './protocolServerHandler.js';
import { FileService } from '../../files/common/fileService.js';
import { IFileService } from '../../files/common/files.js';
import { DiskFileSystemProvider } from '../../files/node/diskFileSystemProvider.js';
import { Schemas } from '../../../base/common/network.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { SessionDataService } from './sessionDataService.js';
import { AgentHostClientFileSystemProvider } from '../common/agentHostClientFileSystemProvider.js';
import { AGENT_CLIENT_SCHEME } from '../common/agentClientUri.js';
import { resolveServerUrls } from './serverUrls.js';
import { AgentPluginManager } from './agentPluginManager.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
/** Log to stderr so messages appear in the terminal alongside the process. */
function log(msg) {
    process.stderr.write(`[AgentHostServer] ${msg}\n`);
}
// ---- Options ----------------------------------------------------------------
const connectionTokenRegex = /^[0-9A-Za-z_-]+$/;
function parseServerOptions() {
    const argv = process.argv.slice(2);
    const envPort = parseInt(process.env['VSCODE_AGENT_HOST_PORT'] ?? '8081', 10);
    const portIdx = argv.indexOf('--port');
    const port = portIdx >= 0 ? parseInt(argv[portIdx + 1], 10) : envPort;
    const hostIdx = argv.indexOf('--host');
    const host = hostIdx >= 0 ? argv[hostIdx + 1] : undefined;
    const enableMockAgent = argv.includes('--enable-mock-agent');
    const quiet = argv.includes('--quiet');
    // Connection token
    const withoutConnectionToken = argv.includes('--without-connection-token');
    const connectionTokenIdx = argv.indexOf('--connection-token');
    const connectionTokenFileIdx = argv.indexOf('--connection-token-file');
    const rawToken = connectionTokenIdx >= 0 ? argv[connectionTokenIdx + 1] : undefined;
    const tokenFilePath = connectionTokenFileIdx >= 0 ? argv[connectionTokenFileIdx + 1] : undefined;
    let connectionToken;
    if (withoutConnectionToken) {
        if (rawToken !== undefined || tokenFilePath !== undefined) {
            log('Error: --without-connection-token cannot be used with --connection-token or --connection-token-file');
            process.exit(1);
        }
        connectionToken = undefined;
    }
    else if (tokenFilePath !== undefined) {
        if (rawToken !== undefined) {
            log('Error: --connection-token cannot be used with --connection-token-file');
            process.exit(1);
        }
        try {
            connectionToken = fs.readFileSync(tokenFilePath).toString().replace(/\r?\n$/, '');
        }
        catch {
            log(`Error: Unable to read connection token file at '${tokenFilePath}'`);
            process.exit(1);
        }
        if (!connectionTokenRegex.test(connectionToken)) {
            log(`Error: The connection token in '${tokenFilePath}' does not adhere to the characters 0-9, a-z, A-Z, _, or -.`);
            process.exit(1);
        }
    }
    else if (rawToken !== undefined) {
        if (!connectionTokenRegex.test(rawToken)) {
            log(`Error: The connection token '${rawToken}' does not adhere to the characters 0-9, a-z, A-Z, _, or -.`);
            process.exit(1);
        }
        connectionToken = rawToken;
    }
    else {
        // Default: generate a random token (secure by default)
        connectionToken = generateUuid();
    }
    return { port, host, enableMockAgent, quiet, connectionToken };
}
// ---- Main -------------------------------------------------------------------
async function main() {
    const options = parseServerOptions();
    const disposables = new DisposableStore();
    // Services
    const productService = { _serviceBrand: undefined, ...product };
    const args = parseArgs(process.argv.slice(2), OPTIONS);
    const environmentService = new NativeEnvironmentService(args, productService);
    // Logging — production logging unless --quiet
    let logService;
    let loggerService;
    if (options.quiet) {
        logService = new NullLogService();
    }
    else {
        const services = new ServiceCollection();
        services.set(IProductService, productService);
        services.set(INativeEnvironmentService, environmentService);
        loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
        const logger = loggerService.createLogger('agenthost-server', { name: localize('agentHostServer', "Agent Host Server") });
        logService = disposables.add(new LogService(logger));
        services.set(ILogService, logService);
        log('Starting standalone agent host server');
    }
    logService.info('[AgentHostServer] Starting standalone agent host server');
    // File service
    const fileService = disposables.add(new FileService(logService));
    disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
    // Session data service
    const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);
    // Create the agent service (owns SessionStateManager + AgentSideEffects internally)
    const agentService = new AgentService(logService, fileService, sessionDataService);
    disposables.add(agentService);
    // Register agents
    if (!options.quiet) {
        // Production agents (require DI)
        const diServices = new ServiceCollection();
        const pluginManager = new AgentPluginManager(URI.file(environmentService.userDataPath), fileService, logService);
        diServices.set(IProductService, productService);
        diServices.set(INativeEnvironmentService, environmentService);
        diServices.set(ILogService, logService);
        diServices.set(IFileService, fileService);
        diServices.set(ISessionDataService, sessionDataService);
        diServices.set(IAgentPluginManager, pluginManager);
        const instantiationService = new InstantiationService(diServices);
        const copilotAgent = disposables.add(instantiationService.createInstance(CopilotAgent));
        agentService.registerProvider(copilotAgent);
        log('CopilotAgent registered');
    }
    if (options.enableMockAgent) {
        // Dynamic import to avoid bundling test code in production
        import('../test/node/mockAgent.js').then(({ ScriptedMockAgent }) => {
            const mockAgent = disposables.add(new ScriptedMockAgent());
            agentService.registerProvider(mockAgent);
        }).catch(err => {
            logService.error('[AgentHostServer] Failed to load mock agent', err);
        });
    }
    // WebSocket server
    const wsServer = disposables.add(await WebSocketProtocolServer.create({
        port: options.port,
        host: options.host,
        connectionTokenValidate: options.connectionToken
            ? token => token === options.connectionToken
            : undefined,
    }, logService));
    const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
    disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));
    // Wire up protocol handler
    disposables.add(new ProtocolServerHandler(agentService, agentService.stateManager, wsServer, { defaultDirectory: URI.file(os.homedir()).toString() }, clientFileSystemProvider, logService));
    // Report ready
    function reportReady(addr) {
        const listeningPort = Number(addr.split(':').pop());
        process.stdout.write(`READY:${listeningPort}\n`);
        const urls = resolveServerUrls(options.host, listeningPort);
        for (const url of urls.local) {
            log(`  Local:   ${url}`);
            logService.info(`[AgentHostServer] Local:   ${url}`);
        }
        for (const url of urls.network) {
            log(`  Network: ${url}`);
            logService.info(`[AgentHostServer] Network: ${url}`);
        }
        if (urls.network.length === 0 && options.host === undefined) {
            log('  Network: use --host to expose');
            logService.info('[AgentHostServer] Network: use --host to expose');
        }
    }
    const address = wsServer.address;
    if (address) {
        reportReady(address);
    }
    else {
        const interval = setInterval(() => {
            const addr = wsServer.address;
            if (addr) {
                clearInterval(interval);
                reportReady(addr);
            }
        }, 10);
    }
    // Keep alive until stdin closes or signal
    process.stdin.resume();
    process.stdin.on('end', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    function shutdown() {
        logService.info('[AgentHostServer] Shutting down...');
        disposables.dispose();
        loggerService?.dispose();
        process.exit(0);
    }
}
main();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0U2VydmVyTWFpbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFNlcnZlck1haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsa0VBQWtFO0FBQ2xFLG9QQUFvUDtBQUVwUCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sS0FBSyxDQUFDO0FBRXBDLDhFQUE4RTtBQUM5RSwrRUFBK0U7QUFDL0UsMkVBQTJFO0FBQzNFLFVBQVUsQ0FBQyxpQkFBaUIsR0FBRyxhQUFhLENBQUMsSUFBSSxHQUFHLENBQUMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUV0RixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDeEYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNuRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0NBQWdDLENB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