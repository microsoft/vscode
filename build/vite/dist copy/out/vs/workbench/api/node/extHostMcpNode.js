/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { parseEnvFile } from '../../../base/common/envfile.js';
import { untildify } from '../../../base/common/labels.js';
import { Lazy } from '../../../base/common/lazy.js';
import { DisposableMap } from '../../../base/common/lifecycle.js';
import * as path from '../../../base/common/path.js';
import { URI } from '../../../base/common/uri.js';
import { StreamSplitter } from '../../../base/node/nodeStreams.js';
import { findExecutable } from '../../../base/node/processes.js';
import { LogLevel } from '../../../platform/log/common/log.js';
import { McpStdioStateHandler } from '../../contrib/mcp/node/mcpStdioStateHandler.js';
import { ExtHostMcpService, McpHTTPHandle } from '../common/extHostMcp.js';
export class NodeExtHostMpcService extends ExtHostMcpService {
    constructor() {
        super(...arguments);
        this.nodeServers = this._register(new DisposableMap());
    }
    _startMcp(id, launch, defaultCwd, errorOnUserInteraction) {
        if (launch.type === 1 /* McpServerTransportType.Stdio */) {
            this.startNodeMpc(id, launch, defaultCwd);
        }
        else if (launch.type === 2 /* McpServerTransportType.HTTP */) {
            this._sseEventSources.set(id, new McpHTTPHandleNode(id, launch, this._proxy, this._logService, errorOnUserInteraction));
        }
        else {
            super._startMcp(id, launch, defaultCwd, errorOnUserInteraction);
        }
    }
    $stopMcp(id) {
        const nodeServer = this.nodeServers.get(id);
        if (nodeServer) {
            nodeServer.stop(); // will get removed from map when process is fully stopped
        }
        else {
            super.$stopMcp(id);
        }
    }
    $sendMessage(id, message) {
        const nodeServer = this.nodeServers.get(id);
        if (nodeServer) {
            nodeServer.write(message);
        }
        else {
            super.$sendMessage(id, message);
        }
    }
    async startNodeMpc(id, launch, defaultCwd) {
        const onError = (err) => this._proxy.$onDidChangeState(id, {
            state: 3 /* McpConnectionState.Kind.Error */,
            // eslint-disable-next-line local/code-no-any-casts
            code: err.hasOwnProperty('code') ? String(err.code) : undefined,
            message: typeof err === 'string' ? err : err.message,
        });
        // MCP servers are run on the same authority where they are defined, so
        // reading the envfile based on its path off the filesystem here is fine.
        const env = { ...process.env };
        if (launch.envFile) {
            try {
                for (const [key, value] of parseEnvFile(await readFile(launch.envFile, 'utf-8'))) {
                    env[key] = value;
                }
            }
            catch (e) {
                onError(`Failed to read envFile '${launch.envFile}': ${e.message}`);
                return;
            }
        }
        for (const [key, value] of Object.entries(launch.env)) {
            // For PATH, we want to append to the existing PATH instead of overwriting it.
            if (key.toUpperCase() === 'PATH' && value !== null) {
                env[key] = env[key] ? `${env[key]}${path.delimiter}${String(value)}` : String(value);
                continue;
            }
            env[key] = value === null ? undefined : String(value);
        }
        let child;
        try {
            const home = homedir();
            let cwd = launch.cwd ? untildify(launch.cwd, home) : (defaultCwd?.fsPath || home);
            if (!path.isAbsolute(cwd)) {
                cwd = defaultCwd ? path.join(defaultCwd.fsPath, cwd) : path.join(home, cwd);
            }
            const { executable, args, shell } = await formatSubprocessArguments(untildify(launch.command, home), launch.args.map(a => untildify(a, home)), cwd, env);
            this._proxy.$onDidPublishLog(id, LogLevel.Debug, `Server command line: ${executable} ${args.join(' ')}`);
            child = spawn(executable, args, {
                stdio: 'pipe',
                cwd,
                env,
                shell,
            });
        }
        catch (e) {
            onError(e);
            return;
        }
        // Create the connection manager for graceful shutdown
        const connectionManager = new McpStdioStateHandler(child);
        this._proxy.$onDidChangeState(id, { state: 1 /* McpConnectionState.Kind.Starting */ });
        child.stdout.pipe(new StreamSplitter('\n')).on('data', line => this._proxy.$onDidReceiveMessage(id, line.toString()));
        child.stdin.on('error', onError);
        child.stdout.on('error', onError);
        // Stderr handling is not currently specified https://github.com/modelcontextprotocol/specification/issues/177
        // Just treat it as generic log data for now
        child.stderr.pipe(new StreamSplitter('\n')).on('data', line => this._proxy.$onDidPublishLog(id, LogLevel.Warning, `[server stderr] ${line.toString().trimEnd()}`));
        child.on('spawn', () => this._proxy.$onDidChangeState(id, { state: 2 /* McpConnectionState.Kind.Running */ }));
        child.on('error', e => {
            onError(e);
        });
        child.on('exit', code => {
            this.nodeServers.deleteAndDispose(id);
            if (code === 0 || connectionManager.stopped) {
                this._proxy.$onDidChangeState(id, { state: 0 /* McpConnectionState.Kind.Stopped */ });
            }
            else {
                this._proxy.$onDidChangeState(id, {
                    state: 3 /* McpConnectionState.Kind.Error */,
                    message: `Process exited with code ${code}`,
                });
            }
        });
        this.nodeServers.set(id, connectionManager);
    }
}
class McpHTTPHandleNode extends McpHTTPHandle {
    constructor() {
        super(...arguments);
        this._undici = new Lazy(() => import('undici'));
    }
    async _fetchInternal(url, init) {
        // Note: imported async so that we can ensure we load undici after proxy patches have been applied
        const { fetch, Agent } = await this._undici.value;
        const undiciInit = { ...init };
        let httpUrl = url;
        const uri = URI.parse(url);
        if (uri.scheme === 'unix' || uri.scheme === 'pipe') {
            // By convention, we put the *socket path* as the URI path, and the *request path* in the fragment
            // So, set the dispatcher with the socket path
            undiciInit.dispatcher = new Agent({
                socketPath: uri.path,
            });
            // And then rewrite the URL to be http://localhost/<fragment>
            httpUrl = uri.with({
                scheme: 'http',
                authority: 'localhost', // HTTP always wants a host (not that we're using it), but if we're using a socket or pipe then localhost is sorta right anyway
                path: uri.fragment,
            }).toString(true);
        }
        else {
            return super._fetchInternal(url, init);
        }
        const undiciResponse = await fetch(httpUrl, undiciInit);
        return {
            status: undiciResponse.status,
            statusText: undiciResponse.statusText,
            headers: undiciResponse.headers,
            body: undiciResponse.body, // Way down in `ReadableStreamReadDoneResult<T>`, `value` is optional in the undici type but required (yet can be `undefined`) in the standard type
            url: undiciResponse.url,
            json: () => undiciResponse.json(),
            text: () => undiciResponse.text(),
        };
    }
}
const windowsShellScriptRe = /\.(bat|cmd)$/i;
/**
 * Formats arguments to avoid issues on Windows for CVE-2024-27980.
 */
export const formatSubprocessArguments = async (executable, args, cwd, env) => {
    if (process.platform !== 'win32') {
        return { executable, args, shell: false };
    }
    const found = await findExecutable(executable, cwd, undefined, env);
    if (found && windowsShellScriptRe.test(found)) {
        const quote = (s) => s.includes(' ') ? `"${s}"` : s;
        return {
            executable: quote(found),
            args: args.map(quote),
            shell: true,
        };
    }
    return { executable, args, shell: false };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE1jcE5vZGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0SG9zdE1jcE5vZGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFrQyxLQUFLLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDdEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN2QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBRTdCLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0QsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3BELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNsRSxPQUFPLEtBQUssSUFBSSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN0RixPQUFPLEVBQXFDLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRTlHLE1BQU0sT0FBTyxxQkFBc0IsU0FBUSxpQkFBaUI7SUFBNUQ7O1FBQ1MsZ0JBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUFnQyxDQUFDLENBQUM7SUF5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