/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { createRequire } from 'node:module';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { dirname, join, isAbsolute, basename } from '../../../base/common/path.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
const _require = createRequire(import.meta.url);
const LOG_PREFIX = '[SSHRemoteAgentHost]';
/** Install location for the VS Code CLI on the remote machine. */
function getRemoteCLIDir(quality) {
    return quality === 'stable' || !quality ? '~/.vscode-cli' : `~/.vscode-cli-${quality}`;
}
function getRemoteCLIBin(quality) {
    const binaryName = quality === 'stable' ? 'code' : 'code-insiders';
    return `${getRemoteCLIDir(quality)}/${binaryName}`;
}
/** Escape a string for use as a single shell argument (single-quote wrapping). */
function shellEscape(s) {
    // Wrap in single quotes; escape embedded single quotes as: '\''
    const escaped = s.replace(/'/g, '\'\\\'\'');
    return `'${escaped}'`;
}
function resolveRemotePlatform(unameS, unameM) {
    const os = unameS.trim().toLowerCase();
    const machine = unameM.trim().toLowerCase();
    let platformOs;
    if (os === 'linux') {
        platformOs = 'linux';
    }
    else if (os === 'darwin') {
        platformOs = 'darwin';
    }
    else {
        return undefined;
    }
    let arch;
    if (machine === 'x86_64' || machine === 'amd64') {
        arch = 'x64';
    }
    else if (machine === 'aarch64' || machine === 'arm64') {
        arch = 'arm64';
    }
    else if (machine === 'armv7l') {
        arch = 'armhf';
    }
    else {
        return undefined;
    }
    return { os: platformOs, arch };
}
function buildCLIDownloadUrl(os, arch, quality) {
    return `https://update.code.visualstudio.com/latest/cli-${os}-${arch}/${quality}`;
}
function sshExec(client, command, opts) {
    return new Promise((resolve, reject) => {
        client.exec(command, (err, stream) => {
            if (err) {
                reject(err);
                return;
            }
            let stdout = '';
            let stderr = '';
            let settled = false;
            const finish = (error, code) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (error) {
                    reject(error);
                    return;
                }
                if (code !== 0 && !opts?.ignoreExitCode) {
                    reject(new Error(`SSH command failed (exit ${code}): ${command}\nstderr: ${stderr}`));
                }
                else {
                    resolve({ stdout, stderr, code: code ?? 0 });
                }
            };
            stream.on('data', (data) => { stdout += data.toString(); });
            stream.stderr.on('data', (data) => { stderr += data.toString(); });
            stream.on('error', (streamErr) => finish(streamErr, undefined));
            stream.on('close', (code) => finish(undefined, code));
        });
    });
}
/** Redact connection tokens from log output. */
function redactToken(text) {
    return text.replace(/\?tkn=[^\s&]+/g, '?tkn=***');
}
function startRemoteAgentHost(client, logService, quality, commandOverride) {
    return new Promise((resolve, reject) => {
        const baseCmd = commandOverride ?? `${getRemoteCLIBin(quality)} agent-host --port 0 --accept-server-license-terms`;
        // Wrap in a login shell so the agent host process inherits the
        // user's PATH and environment from ~/.bash_profile / ~/.bashrc
        // (ssh2 exec runs a non-interactive non-login shell by default).
        const cmd = `bash -l -c ${shellEscape(baseCmd)}`;
        logService.info(`${LOG_PREFIX} Starting remote agent host: ${cmd}`);
        client.exec(cmd, (err, stream) => {
            if (err) {
                reject(err);
                return;
            }
            let resolved = false;
            let outputBuf = '';
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error(`${LOG_PREFIX} Timed out waiting for agent host to start.\noutput so far: ${redactToken(outputBuf)}`));
                }
            }, 60_000);
            const checkForAddress = () => {
                if (!resolved) {
                    const match = outputBuf.match(/ws:\/\/127\.0\.0\.1:(\d+)(?:\?tkn=([^\s&]+))?/);
                    if (match) {
                        resolved = true;
                        clearTimeout(timeout);
                        const port = parseInt(match[1], 10);
                        const connectionToken = match[2] || undefined;
                        logService.info(`${LOG_PREFIX} Remote agent host listening on port ${port}`);
                        resolve({ port, connectionToken, stream });
                    }
                }
            };
            stream.stderr.on('data', (data) => {
                const text = data.toString();
                outputBuf += text;
                logService.trace(`${LOG_PREFIX} remote stderr: ${redactToken(text.trimEnd())}`);
                checkForAddress();
            });
            stream.on('data', (data) => {
                const text = data.toString();
                outputBuf += text;
                logService.trace(`${LOG_PREFIX} remote stdout: ${redactToken(text.trimEnd())}`);
                checkForAddress();
            });
            stream.on('close', (code) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(new Error(`${LOG_PREFIX} Agent host process exited with code ${code} before becoming ready.\noutput: ${redactToken(outputBuf)}`));
                }
            });
        });
    });
}
/**
 * Create a WebSocket connection to the remote agent host via an SSH forwarded channel.
 * Uses the `ws` library to speak WebSocket over the SSH channel.
 * Messages are relayed to the renderer via IPC events.
 */
function createWebSocketRelay(client, dstHost, dstPort, connectionToken, logService, onMessage, onClose) {
    return new Promise((resolve, reject) => {
        client.forwardOut('127.0.0.1', 0, dstHost, dstPort, (err, channel) => {
            if (err) {
                reject(err);
                return;
            }
            const WS = _require('ws');
            let url = `ws://${dstHost}:${dstPort}`;
            if (connectionToken) {
                url += `?tkn=${encodeURIComponent(connectionToken)}`;
            }
            // The SSH channel is a duplex stream compatible with ws's createConnection,
            // but our minimal SSHChannel interface doesn't carry the full Node Duplex shape.
            const ws = new WS(url, { createConnection: (() => channel) });
            ws.on('open', () => {
                logService.info(`${LOG_PREFIX} WebSocket relay connected to remote agent host`);
                resolve({
                    send: (data) => {
                        if (ws.readyState === ws.OPEN) {
                            ws.send(data);
                        }
                    },
                    close: () => ws.close(),
                });
            });
            ws.on('message', (data) => {
                if (Array.isArray(data)) {
                    onMessage(Buffer.concat(data).toString());
                }
                else if (data instanceof ArrayBuffer) {
                    onMessage(Buffer.from(new Uint8Array(data)).toString());
                }
                else {
                    onMessage(data.toString());
                }
            });
            ws.on('close', onClose);
            ws.on('error', (wsErr) => {
                logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
                reject(wsErr);
            });
        });
    });
}
function sanitizeConfig(config) {
    const { password: _p, privateKeyPath: _k, ...sanitized } = config;
    return sanitized;
}
class SSHConnection extends Disposable {
    constructor(fullConfig, connectionId, address, name, connectionToken, sshClient, _relay, remoteStream) {
        super();
        this.connectionId = connectionId;
        this.address = address;
        this.name = name;
        this.connectionToken = connectionToken;
        this._relay = _relay;
        this._onDidClose = this._register(new Emitter());
        this.onDidClose = this._onDidClose.event;
        this._closed = false;
        this.config = sanitizeConfig(fullConfig);
        this._register(toDisposable(() => {
            if (this._closed) {
                return;
            }
            this._closed = true;
            this._relay.close();
            remoteStream.close();
            sshClient.end();
            this._onDidClose.fire();
        }));
        sshClient.on('close', () => {
            this.dispose();
        });
        sshClient.on('error', () => {
            this.dispose();
        });
    }
    relaySend(data) {
        this._relay.send(data);
    }
}
import { parseSSHConfigHostEntries, parseSSHGOutput, stripSSHComment } from '../common/sshConfigParsing.js';
let SSHRemoteAgentHostMainService = class SSHRemoteAgentHostMainService extends Disposable {
    constructor(_logService, _productService) {
        super();
        this._logService = _logService;
        this._productService = _productService;
        this._onDidChangeConnections = this._register(new Emitter());
        this.onDidChangeConnections = this._onDidChangeConnections.event;
        this._onDidCloseConnection = this._register(new Emitter());
        this.onDidCloseConnection = this._onDidCloseConnection.event;
        this._onDidReportConnectProgress = this._register(new Emitter());
        this.onDidReportConnectProgress = this._onDidReportConnectProgress.event;
        this._onDidRelayMessage = this._register(new Emitter());
        this.onDidRelayMessage = this._onDidRelayMessage.event;
        this._onDidRelayClose = this._register(new Emitter());
        this.onDidRelayClose = this._onDidRelayClose.event;
        this._connections = new Map();
    }
    async connect(config) {
        const connectionKey = config.sshConfigHost
            ? `ssh:${config.sshConfigHost}`
            : `${config.username}@${config.host}:${config.port ?? 22}`;
        const existing = this._connections.get(connectionKey);
        if (existing) {
            return {
                connectionId: existing.connectionId,
                address: existing.address,
                name: existing.name,
                connectionToken: existing.connectionToken,
                config: existing.config,
            };
        }
        this._logService.info(`${LOG_PREFIX} Connecting to ${connectionKey}...`);
        let sshClient;
        try {
            const ssh2Module = _require('ssh2');
            const reportProgress = (message) => {
                this._onDidReportConnectProgress.fire({ connectionKey, message });
            };
            // 1. Establish SSH connection
            reportProgress(localize('sshProgressConnecting', "Establishing SSH connection..."));
            sshClient = await this._connectSSH(config, ssh2Module.Client);
            if (config.remoteAgentHostCommand) {
                // Dev override: skip platform detection and CLI install,
                // use the provided command directly.
                this._logService.info(`${LOG_PREFIX} Using custom agent host command: ${config.remoteAgentHostCommand}`);
            }
            else {
                // 2. Detect remote platform
                const { stdout: unameS } = await sshExec(sshClient, 'uname -s');
                const { stdout: unameM } = await sshExec(sshClient, 'uname -m');
                const platform = resolveRemotePlatform(unameS, unameM);
                if (!platform) {
                    throw new Error(`${LOG_PREFIX} Unsupported remote platform: ${unameS.trim()} ${unameM.trim()}`);
                }
                this._logService.info(`${LOG_PREFIX} Remote platform: ${platform.os}-${platform.arch}`);
                // 3. Install CLI if needed
                reportProgress(localize('sshProgressInstallingCLI', "Checking remote CLI installation..."));
                await this._ensureCLIInstalled(sshClient, platform, reportProgress);
            }
            // 4. Start agent-host and capture port/token
            reportProgress(localize('sshProgressStartingAgent', "Starting remote agent host..."));
            const { port: remotePort, connectionToken, stream: agentStream } = await startRemoteAgentHost(sshClient, this._logService, this._quality, config.remoteAgentHostCommand);
            // 5. Connect to remote agent host via WebSocket relay (no local TCP port)
            reportProgress(localize('sshProgressForwarding', "Connecting to remote agent host..."));
            const connectionId = connectionKey;
            const relay = await createWebSocketRelay(sshClient, '127.0.0.1', remotePort, connectionToken, this._logService, (data) => this._onDidRelayMessage.fire({ connectionId, data }), () => this._onDidRelayClose.fire(connectionId));
            // 6. Create connection object
            const address = connectionKey;
            const conn = new SSHConnection(config, connectionId, address, config.name, connectionToken, sshClient, relay, agentStream);
            conn.onDidClose(() => {
                this._connections.delete(connectionKey);
                this._onDidCloseConnection.fire(connectionId);
                this._onDidChangeConnections.fire();
            });
            this._connections.set(connectionKey, conn);
            sshClient = undefined; // ownership transferred to SSHConnection
            this._onDidChangeConnections.fire();
            return {
                connectionId,
                address,
                name: config.name,
                connectionToken,
                config: conn.config,
                sshConfigHost: config.sshConfigHost,
            };
        }
        catch (err) {
            sshClient?.end();
            throw err;
        }
    }
    async disconnect(host) {
        for (const [key, conn] of this._connections) {
            if (key === host || conn.connectionId === host) {
                conn.dispose();
                return;
            }
        }
    }
    async relaySend(connectionId, message) {
        for (const conn of this._connections.values()) {
            if (conn.connectionId === connectionId) {
                conn.relaySend(message);
                return;
            }
        }
    }
    async reconnect(sshConfigHost, name, remoteAgentHostCommand) {
        this._logService.info(`${LOG_PREFIX} Reconnecting via SSH config host: ${sshConfigHost}`);
        const resolved = await this.resolveSSHConfig(sshConfigHost);
        let authMethod = "agent" /* SSHAuthMethod.Agent */;
        let privateKeyPath;
        const defaultKeys = ['~/.ssh/id_rsa', '~/.ssh/id_ecdsa', '~/.ssh/id_ed25519', '~/.ssh/id_dsa', '~/.ssh/id_xmss'];
        if (resolved.identityFile.length > 0 && !defaultKeys.includes(resolved.identityFile[0])) {
            authMethod = "keyFile" /* SSHAuthMethod.KeyFile */;
            privateKeyPath = resolved.identityFile[0];
        }
        return this.connect({
            host: resolved.hostname,
            port: resolved.port !== 22 ? resolved.port : undefined,
            username: resolved.user ?? sshConfigHost,
            authMethod,
            privateKeyPath,
            name,
            sshConfigHost,
            remoteAgentHostCommand,
        });
    }
    async listSSHConfigHosts() {
        const configPath = join(os.homedir(), '.ssh', 'config');
        try {
            const content = await fsp.readFile(configPath, 'utf-8');
            return this._parseSSHConfigHosts(content, dirname(configPath));
        }
        catch {
            this._logService.info(`${LOG_PREFIX} Could not read SSH config at ${configPath}`);
            return [];
        }
    }
    async resolveSSHConfig(host) {
        return new Promise((resolve, reject) => {
            cp.execFile('ssh', ['-G', host], { timeout: 5000 }, (err, stdout) => {
                if (err) {
                    reject(new Error(`${LOG_PREFIX} ssh -G failed for ${host}: ${err.message}`));
                    return;
                }
                const config = this._parseSSHGOutput(stdout);
                resolve(config);
            });
        });
    }
    async _parseSSHConfigHosts(content, configDir, visited) {
        const seen = visited ?? new Set();
        const hosts = [];
        // Extract hosts from this file directly
        hosts.push(...parseSSHConfigHostEntries(content));
        // Follow Include directives
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            const includeMatch = trimmed.match(/^Include\s+(.+)$/i);
            if (!includeMatch) {
                continue;
            }
            const rawValue = stripSSHComment(includeMatch[1]);
            const patterns = rawValue.split(/\s+/).filter(Boolean);
            for (const rawPattern of patterns) {
                const pattern = rawPattern.replace(/^~/, os.homedir());
                const resolvedPattern = isAbsolute(pattern) ? pattern : join(configDir, pattern);
                if (seen.has(resolvedPattern)) {
                    continue;
                }
                seen.add(resolvedPattern);
                try {
                    const stat = await fsp.stat(resolvedPattern);
                    if (stat.isDirectory()) {
                        const files = await fsp.readdir(resolvedPattern);
                        for (const file of files) {
                            try {
                                const sub = await fsp.readFile(join(resolvedPattern, file), 'utf-8');
                                hosts.push(...await this._parseSSHConfigHosts(sub, resolvedPattern, seen));
                            }
                            catch { /* skip unreadable files */ }
                        }
                    }
                    else {
                        const sub = await fsp.readFile(resolvedPattern, 'utf-8');
                        hosts.push(...await this._parseSSHConfigHosts(sub, dirname(resolvedPattern), seen));
                    }
                }
                catch {
                    const dir = dirname(resolvedPattern);
                    const base = basename(resolvedPattern);
                    if (base.includes('*')) {
                        try {
                            const files = await fsp.readdir(dir);
                            for (const file of files) {
                                const regex = new RegExp('^' + base.replace(/\*/g, '.*') + '$');
                                if (regex.test(file)) {
                                    try {
                                        const sub = await fsp.readFile(join(dir, file), 'utf-8');
                                        hosts.push(...await this._parseSSHConfigHosts(sub, dir, seen));
                                    }
                                    catch { /* skip */ }
                                }
                            }
                        }
                        catch { /* skip unreadable dirs */ }
                    }
                }
            }
        }
        return hosts;
    }
    _parseSSHGOutput(stdout) {
        return parseSSHGOutput(stdout);
    }
    async _connectSSH(config, SSHClientCtor) {
        const connectConfig = {
            host: config.host,
            port: config.port ?? 22,
            username: config.username,
            readyTimeout: 30_000,
            keepaliveInterval: 15_000,
        };
        switch (config.authMethod) {
            case "agent" /* SSHAuthMethod.Agent */: {
                const agentSock = process.env['SSH_AUTH_SOCK'];
                this._logService.info(`${LOG_PREFIX} Using SSH agent: ${agentSock ?? '(not set)'}`);
                connectConfig.agent = agentSock;
                break;
            }
            case "keyFile" /* SSHAuthMethod.KeyFile */:
                if (config.privateKeyPath) {
                    const keyPath = config.privateKeyPath.replace(/^~/, os.homedir());
                    connectConfig.privateKey = await fsp.readFile(keyPath);
                }
                break;
            case "password" /* SSHAuthMethod.Password */:
                connectConfig.password = config.password;
                break;
        }
        return new Promise((resolve, reject) => {
            const client = new SSHClientCtor();
            client.on('ready', () => {
                this._logService.info(`${LOG_PREFIX} SSH connection established to ${config.host}`);
                resolve(client);
            });
            client.on('error', (err) => {
                this._logService.error(`${LOG_PREFIX} SSH connection error: ${err.message}`);
                reject(err);
            });
            client.connect(connectConfig);
        });
    }
    get _quality() {
        return this._productService.quality || 'insider';
    }
    async _ensureCLIInstalled(client, platform, reportProgress) {
        const cliDir = getRemoteCLIDir(this._quality);
        const cliBin = getRemoteCLIBin(this._quality);
        const { code } = await sshExec(client, `${cliBin} --version`, { ignoreExitCode: true });
        if (code === 0) {
            this._logService.info(`${LOG_PREFIX} VS Code CLI already installed on remote`);
            return;
        }
        reportProgress(localize('sshProgressDownloadingCLI', "Installing VS Code CLI on remote..."));
        const url = buildCLIDownloadUrl(platform.os, platform.arch, this._quality);
        const installCmd = [
            `mkdir -p ${cliDir}`,
            `curl -fsSL '${url}' | tar xz -C ${cliDir}`,
            `chmod +x ${cliBin}`,
        ].join(' && ');
        await sshExec(client, installCmd);
        this._logService.info(`${LOG_PREFIX} VS Code CLI installed successfully`);
    }
    dispose() {
        for (const conn of this._connections.values()) {
            conn.dispose();
        }
        this._connections.clear();
        super.dispose();
    }
};
SSHRemoteAgentHostMainService = __decorate([
    __param(0, ILogService),
    __param(1, IProductService)
], SSHRemoteAgentHostMainService);
export { SSHRemoteAgentHostMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NoUmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NzaFJlbW90ZUFnZW50SG9zdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUM1QyxPQUFPLEVBQUUsUUFBUSxJQUFJLEdBQUcsRUFBRSxNQUFNLElBQUksQ0FBQztBQUNyQyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEtBQUssRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNwQyxPQUFPLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFZekUsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7QUF1QmhELE1BQU0sVUFBVSxHQUFHLHNCQUFzQixDQUFDO0FBRTFDLGtFQUFrRTtBQUNsRSxTQUFTLGVBQWUsQ0FBQyxPQUFlO0lBQ3ZDLE9BQU8sT0FBTyxLQUFLLFFBQVEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxp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