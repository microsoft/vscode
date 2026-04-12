"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const deferredPromise_1 = require("./deferredPromise");
const split_1 = require("./split");
/**
 * Timeout after the last port forwarding is disposed before we'll tear down
 * the CLI. This is primarily used since privacy changes to port will appear
 * as a dispose+re-create call, and we don't want to have to restart the CLI.
 */
const CLEANUP_TIMEOUT = 10_000;
const versionFolder = vscode.env.appCommit?.substring(0, 10);
let cliPath;
if (process.env.VSCODE_FORWARDING_IS_DEV) {
    cliPath = path.join(__dirname, '../../../cli/target/debug/code');
}
else {
    let binPath;
    if (process.platform === 'darwin') {
        binPath = 'bin';
    }
    else if (process.platform === 'win32' && versionFolder && vscode.env.appRoot.includes(versionFolder)) {
        binPath = '../../../bin';
    }
    else {
        binPath = '../../bin';
    }
    const cliName = vscode.env.appQuality === 'stable' ? 'code-tunnel' : 'code-tunnel-insiders';
    const extension = process.platform === 'win32' ? '.exe' : '';
    cliPath = path.join(vscode.env.appRoot, binPath, cliName) + extension;
}
class Tunnel {
    remoteAddress;
    privacy;
    protocol;
    disposeEmitter = new vscode.EventEmitter();
    onDidDispose = this.disposeEmitter.event;
    localAddress;
    constructor(remoteAddress, privacy, protocol) {
        this.remoteAddress = remoteAddress;
        this.privacy = privacy;
        this.protocol = protocol;
    }
    setPortFormat(formatString) {
        this.localAddress = formatString.replace('{port}', String(this.remoteAddress.port));
    }
    dispose() {
        this.disposeEmitter.fire();
    }
}
async function activate(context) {
    if (vscode.env.remoteAuthority) {
        return; // forwarding is local-only at the moment
    }
    const logger = new Logger(vscode.l10n.t('Port Forwarding'));
    const provider = new TunnelProvider(logger, context);
    context.subscriptions.push(vscode.commands.registerCommand('tunnel-forwarding.showLog', () => logger.show()), vscode.commands.registerCommand('tunnel-forwarding.restart', () => provider.restart()), provider.onDidStateChange(s => {
        vscode.commands.executeCommand('setContext', 'tunnelForwardingIsRunning', s.state !== 2 /* State.Inactive */);
    }), await vscode.workspace.registerTunnelProvider(provider, {
        tunnelFeatures: {
            elevation: false,
            protocol: true,
            privacyOptions: [
                { themeIcon: 'globe', id: "public" /* TunnelPrivacyId.Public */, label: vscode.l10n.t('Public') },
                { themeIcon: 'lock', id: "private" /* TunnelPrivacyId.Private */, label: vscode.l10n.t('Private') },
            ],
        },
    }));
}
function deactivate() { }
class Logger {
    label;
    outputChannel;
    constructor(label) {
        this.label = label;
    }
    show() {
        return this.outputChannel?.show();
    }
    clear() {
        this.outputChannel?.clear();
    }
    log(logLevel, message, ...args) {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel(this.label, { log: true });
            vscode.commands.executeCommand('setContext', 'tunnelForwardingHasLog', true);
        }
        this.outputChannel[logLevel](message, ...args);
    }
}
const didWarnPublicKey = 'didWarnPublic';
class TunnelProvider {
    logger;
    context;
    tunnels = new Set();
    stateChange = new vscode.EventEmitter();
    _state = { state: 2 /* State.Inactive */ };
    get state() {
        return this._state;
    }
    set state(state) {
        this._state = state;
        this.stateChange.fire(state);
    }
    onDidStateChange = this.stateChange.event;
    constructor(logger, context) {
        this.logger = logger;
        this.context = context;
    }
    /** @inheritdoc */
    async provideTunnel(tunnelOptions) {
        if (tunnelOptions.privacy === "public" /* TunnelPrivacyId.Public */) {
            if (!(await this.consentPublicPort(tunnelOptions.remoteAddress.port))) {
                return;
            }
        }
        const tunnel = new Tunnel(tunnelOptions.remoteAddress, tunnelOptions.privacy || "private" /* TunnelPrivacyId.Private */, tunnelOptions.protocol === 'https' ? 'https' : 'http');
        this.tunnels.add(tunnel);
        tunnel.onDidDispose(() => {
            this.tunnels.delete(tunnel);
            this.updateActivePortsIfRunning();
        });
        switch (this.state.state) {
            case 3 /* State.Error */:
            case 2 /* State.Inactive */:
                await this.setupPortForwardingProcess();
            // fall through since state is now starting
            case 0 /* State.Starting */:
                this.updateActivePortsIfRunning();
                return new Promise((resolve, reject) => {
                    const l = this.stateChange.event(state => {
                        if (state.state === 1 /* State.Active */) {
                            tunnel.setPortFormat(state.portFormat);
                            l.dispose();
                            resolve(tunnel);
                        }
                        else if (state.state === 3 /* State.Error */) {
                            l.dispose();
                            reject(new Error(state.error));
                        }
                    });
                });
            case 1 /* State.Active */:
                tunnel.setPortFormat(this.state.portFormat);
                this.updateActivePortsIfRunning();
                return tunnel;
        }
    }
    /** Re/starts the port forwarding system. */
    async restart() {
        this.killRunningProcess();
        await this.setupPortForwardingProcess(); // will show progress
        this.updateActivePortsIfRunning();
    }
    async consentPublicPort(portNumber) {
        const didWarn = this.context.globalState.get(didWarnPublicKey, false);
        if (didWarn) {
            return true;
        }
        const continueOpt = vscode.l10n.t('Continue');
        const dontShowAgain = vscode.l10n.t("Don't show again");
        const r = await vscode.window.showWarningMessage(vscode.l10n.t("You're about to create a publicly forwarded port. Anyone on the internet will be able to connect to the service listening on port {0}. You should only proceed if this service is secure and non-sensitive.", portNumber), { modal: true }, continueOpt, dontShowAgain);
        if (r === continueOpt) {
            // continue
        }
        else if (r === dontShowAgain) {
            await this.context.globalState.update(didWarnPublicKey, true);
        }
        else {
            return false;
        }
        return true;
    }
    isInStateWithProcess(process) {
        return ((this.state.state === 0 /* State.Starting */ || this.state.state === 1 /* State.Active */) &&
            this.state.process === process);
    }
    killRunningProcess() {
        if (this.state.state === 0 /* State.Starting */ || this.state.state === 1 /* State.Active */) {
            this.logger.log('info', '[forwarding] no more ports, stopping forwarding CLI');
            this.state.process.kill();
            this.state = { state: 2 /* State.Inactive */ };
        }
    }
    updateActivePortsIfRunning() {
        if (this.state.state !== 0 /* State.Starting */ && this.state.state !== 1 /* State.Active */) {
            return;
        }
        const ports = [...this.tunnels].map(t => ({ number: t.remoteAddress.port, privacy: t.privacy, protocol: t.protocol }));
        this.state.process.stdin.write(`${JSON.stringify(ports)}\n`);
        if (ports.length === 0 && !this.state.cleanupTimeout) {
            this.state.cleanupTimeout = setTimeout(() => this.killRunningProcess(), CLEANUP_TIMEOUT);
        }
        else if (ports.length > 0 && this.state.cleanupTimeout) {
            clearTimeout(this.state.cleanupTimeout);
            this.state.cleanupTimeout = undefined;
        }
    }
    async setupPortForwardingProcess() {
        const session = await vscode.authentication.getSession('github', ['user:email', 'read:org'], {
            createIfNone: true,
        });
        const args = [
            '--verbose',
            'tunnel',
            'forward-internal',
            '--provider',
            'github',
        ];
        this.logger.log('info', '[forwarding] starting CLI');
        const child = (0, child_process_1.spawn)(cliPath, args, { stdio: 'pipe', env: { ...process.env, NO_COLOR: '1', VSCODE_CLI_ACCESS_TOKEN: session.accessToken } });
        this.state = { state: 0 /* State.Starting */, process: child };
        const progressP = new deferredPromise_1.DeferredPromise();
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: vscode.l10n.t({
                comment: ['do not change link format [Show Log](command), only change the text "Show Log"'],
                message: 'Starting port forwarding system ([Show Log]({0}))',
                args: ['command:tunnel-forwarding.showLog']
            }),
        }, () => progressP.p);
        let lastPortFormat;
        child.on('exit', status => {
            const msg = `[forwarding] exited with code ${status}`;
            this.logger.log('info', msg);
            progressP.complete(); // make sure to clear progress on unexpected exit
            if (this.isInStateWithProcess(child)) {
                this.state = { state: 3 /* State.Error */, error: msg };
            }
        });
        child.on('error', err => {
            this.logger.log('error', `[forwarding] ${err}`);
            progressP.complete(); // make sure to clear progress on unexpected exit
            if (this.isInStateWithProcess(child)) {
                this.state = { state: 3 /* State.Error */, error: String(err) };
            }
        });
        child.stdout
            .pipe((0, split_1.splitNewLines)())
            .on('data', line => this.logger.log('info', `[forwarding] ${line}`))
            .resume();
        child.stderr
            .pipe((0, split_1.splitNewLines)())
            .on('data', line => {
            try {
                const l = JSON.parse(line);
                if (l.port_format && l.port_format !== lastPortFormat) {
                    this.state = {
                        state: 1 /* State.Active */,
                        portFormat: l.port_format, process: child,
                        cleanupTimeout: 'cleanupTimeout' in this.state ? this.state.cleanupTimeout : undefined,
                    };
                    progressP.complete();
                }
            }
            catch (e) {
                this.logger.log('error', `[forwarding] ${line}`);
            }
        })
            .resume();
        await new Promise((resolve, reject) => {
            child.on('spawn', resolve);
            child.on('error', reject);
        });
    }
}
//# sourceMappingURL=extension.js.map