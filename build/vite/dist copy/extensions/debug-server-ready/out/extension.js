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
const vscode = __importStar(require("vscode"));
const util = __importStar(require("util"));
const crypto_1 = require("crypto");
const PATTERN = 'listening on.* (https?://\\S+|[0-9]+)'; // matches "listening on port 3000" or "Now listening on: https://localhost:5001"
const URI_PORT_FORMAT = 'http://localhost:%s';
const URI_FORMAT = '%s';
const WEB_ROOT = '${workspaceFolder}';
// From src/vs/base/common/strings.ts
const CSI_SEQUENCE = /(?:\x1b\[|\x9b)[=?>!]?[\d;:]*["$#'* ]?[a-zA-Z@^`{}|~]/;
const OSC_SEQUENCE = /(?:\x1b\]|\x9d).*?(?:\x1b\\|\x07|\x9c)/;
const ESC_SEQUENCE = /\x1b(?:[ #%\(\)\*\+\-\.\/]?[a-zA-Z0-9\|}~@])/;
const CONTROL_SEQUENCES = new RegExp('(?:' + [
    CSI_SEQUENCE.source,
    OSC_SEQUENCE.source,
    ESC_SEQUENCE.source,
].join('|') + ')', 'g');
/**
 * Froms vs/base/common/strings.ts in core
 * @see https://github.com/microsoft/vscode/blob/22a2a0e833175c32a2005b977d7fbd355582e416/src/vs/base/common/strings.ts#L736
 */
function removeAnsiEscapeCodes(str) {
    if (str) {
        str = str.replace(CONTROL_SEQUENCES, '');
    }
    return str;
}
class Trigger {
    _fired = false;
    get hasFired() {
        return this._fired;
    }
    fire() {
        this._fired = true;
    }
}
class ServerReadyDetector extends vscode.Disposable {
    session;
    static detectors = new Map();
    static terminalDataListener;
    stoppedEmitter = new vscode.EventEmitter();
    onDidSessionStop = this.stoppedEmitter.event;
    disposables = new Set([]);
    trigger;
    shellPid;
    regexp;
    static start(session) {
        if (session.configuration.serverReadyAction) {
            let detector = ServerReadyDetector.detectors.get(session);
            if (!detector) {
                detector = new ServerReadyDetector(session);
                ServerReadyDetector.detectors.set(session, detector);
            }
            return detector;
        }
        return undefined;
    }
    static stop(session) {
        const detector = ServerReadyDetector.detectors.get(session);
        if (detector) {
            ServerReadyDetector.detectors.delete(session);
            detector.sessionStopped();
            detector.dispose();
        }
    }
    static rememberShellPid(session, pid) {
        const detector = ServerReadyDetector.detectors.get(session);
        if (detector) {
            detector.shellPid = pid;
        }
    }
    static async startListeningTerminalData() {
        if (!this.terminalDataListener) {
            this.terminalDataListener = vscode.window.onDidWriteTerminalData(async (e) => {
                // first find the detector with a matching pid
                const pid = await e.terminal.processId;
                const str = removeAnsiEscapeCodes(e.data);
                for (const [, detector] of this.detectors) {
                    if (detector.shellPid === pid) {
                        detector.detectPattern(str);
                        return;
                    }
                }
                // if none found, try all detectors until one matches
                for (const [, detector] of this.detectors) {
                    if (detector.detectPattern(str)) {
                        return;
                    }
                }
            });
        }
    }
    constructor(session) {
        super(() => this.internalDispose());
        this.session = session;
        // Re-used the triggered of the parent session, if one exists
        if (session.parentSession) {
            this.trigger = ServerReadyDetector.start(session.parentSession)?.trigger ?? new Trigger();
        }
        else {
            this.trigger = new Trigger();
        }
        this.regexp = new RegExp(session.configuration.serverReadyAction.pattern || PATTERN, 'i');
    }
    internalDispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables.clear();
    }
    sessionStopped() {
        this.stoppedEmitter.fire();
    }
    detectPattern(s) {
        if (!this.trigger.hasFired) {
            const matches = this.regexp.exec(s);
            if (matches && matches.length >= 1) {
                this.openExternalWithString(this.session, matches.length > 1 ? matches[1] : '');
                this.trigger.fire();
                return true;
            }
        }
        return false;
    }
    openExternalWithString(session, captureString) {
        const args = session.configuration.serverReadyAction;
        let uri;
        if (captureString === '') {
            // nothing captured by reg exp -> use the uriFormat as the target uri without substitution
            // verify that format does not contain '%s'
            const format = args.uriFormat || '';
            if (format.indexOf('%s') >= 0) {
                const errMsg = vscode.l10n.t("Format uri ('{0}') uses a substitution placeholder but pattern did not capture anything.", format);
                vscode.window.showErrorMessage(errMsg, { modal: true }).then(_ => undefined);
                return;
            }
            uri = format;
        }
        else {
            // if no uriFormat is specified guess the appropriate format based on the captureString
            const format = args.uriFormat || (/^[0-9]+$/.test(captureString) ? URI_PORT_FORMAT : URI_FORMAT);
            // verify that format only contains a single '%s'
            const s = format.split('%s');
            if (s.length !== 2) {
                const errMsg = vscode.l10n.t("Format uri ('{0}') must contain exactly one substitution placeholder.", format);
                vscode.window.showErrorMessage(errMsg, { modal: true }).then(_ => undefined);
                return;
            }
            uri = util.format(format, captureString);
        }
        this.openExternalWithUri(session, uri);
    }
    async openExternalWithUri(session, uri) {
        const args = session.configuration.serverReadyAction;
        switch (args.action || 'openExternally') {
            case 'openExternally':
                await vscode.env.openExternal(vscode.Uri.parse(uri));
                break;
            case 'debugWithChrome':
                await this.debugWithBrowser('pwa-chrome', session, uri);
                break;
            case 'debugWithEdge':
                await this.debugWithBrowser('pwa-msedge', session, uri);
                break;
            case 'startDebugging':
                if (args.config) {
                    await this.startDebugSession(session, args.config.name, args.config);
                }
                else {
                    await this.startDebugSession(session, args.name || 'unspecified');
                }
                break;
            default:
                // not supported
                break;
        }
    }
    async debugWithBrowser(type, session, uri) {
        const args = session.configuration.serverReadyAction;
        if (!args.killOnServerStop) {
            await this.startBrowserDebugSession(type, session, uri);
            return;
        }
        const trackerId = (0, crypto_1.randomUUID)();
        const cts = new vscode.CancellationTokenSource();
        const newSessionPromise = this.catchStartedDebugSession(session => session.configuration._debugServerReadySessionId === trackerId, cts.token);
        if (!await this.startBrowserDebugSession(type, session, uri, trackerId)) {
            cts.cancel();
            cts.dispose();
            return;
        }
        const createdSession = await newSessionPromise;
        cts.dispose();
        if (!createdSession) {
            return;
        }
        const stopListener = this.onDidSessionStop(async () => {
            stopListener.dispose();
            this.disposables.delete(stopListener);
            await vscode.debug.stopDebugging(createdSession);
        });
        this.disposables.add(stopListener);
    }
    startBrowserDebugSession(type, session, uri, trackerId) {
        return vscode.debug.startDebugging(session.workspaceFolder, {
            type,
            name: 'Browser Debug',
            request: 'launch',
            url: uri,
            webRoot: session.configuration.serverReadyAction.webRoot || WEB_ROOT,
            _debugServerReadySessionId: trackerId,
        });
    }
    /**
     * Starts a debug session given a debug configuration name (saved in launch.json) or a debug configuration object.
     *
     * @param session The parent debugSession
     * @param name The name of the configuration to launch. If config it set, it assumes it is the same as config.name.
     * @param config [Optional] Instead of starting a debug session by debug configuration name, use a debug configuration object instead.
     */
    async startDebugSession(session, name, config) {
        const args = session.configuration.serverReadyAction;
        if (!args.killOnServerStop) {
            await vscode.debug.startDebugging(session.workspaceFolder, config ?? name);
            return;
        }
        const cts = new vscode.CancellationTokenSource();
        const newSessionPromise = this.catchStartedDebugSession(x => x.name === name, cts.token);
        if (!await vscode.debug.startDebugging(session.workspaceFolder, config ?? name)) {
            cts.cancel();
            cts.dispose();
            return;
        }
        const createdSession = await newSessionPromise;
        cts.dispose();
        if (!createdSession) {
            return;
        }
        const stopListener = this.onDidSessionStop(async () => {
            stopListener.dispose();
            this.disposables.delete(stopListener);
            await vscode.debug.stopDebugging(createdSession);
        });
        this.disposables.add(stopListener);
    }
    catchStartedDebugSession(predicate, cancellationToken) {
        return new Promise(_resolve => {
            const done = (value) => {
                listener.dispose();
                cancellationListener.dispose();
                this.disposables.delete(listener);
                this.disposables.delete(cancellationListener);
                _resolve(value);
            };
            const cancellationListener = cancellationToken.onCancellationRequested(done);
            const listener = vscode.debug.onDidStartDebugSession(session => {
                if (predicate(session)) {
                    done(session);
                }
            });
            // In case the debug session of interest was never caught anyhow.
            this.disposables.add(listener);
            this.disposables.add(cancellationListener);
        });
    }
}
function activate(context) {
    context.subscriptions.push(vscode.debug.onDidStartDebugSession(session => {
        if (session.configuration.serverReadyAction) {
            const detector = ServerReadyDetector.start(session);
            if (detector) {
                ServerReadyDetector.startListeningTerminalData();
            }
        }
    }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(session => {
        ServerReadyDetector.stop(session);
    }));
    const trackers = new Set();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('*', {
        resolveDebugConfigurationWithSubstitutedVariables(_folder, debugConfiguration) {
            if (debugConfiguration.type && debugConfiguration.serverReadyAction) {
                if (!trackers.has(debugConfiguration.type)) {
                    trackers.add(debugConfiguration.type);
                    startTrackerForType(context, debugConfiguration.type);
                }
            }
            return debugConfiguration;
        }
    }));
}
function startTrackerForType(context, type) {
    // scan debug console output for a PORT message
    context.subscriptions.push(vscode.debug.registerDebugAdapterTrackerFactory(type, {
        createDebugAdapterTracker(session) {
            const detector = ServerReadyDetector.start(session);
            if (detector) {
                let runInTerminalRequestSeq;
                return {
                    onDidSendMessage: m => {
                        if (m.type === 'event' && m.event === 'output' && m.body) {
                            switch (m.body.category) {
                                case 'console':
                                case 'stderr':
                                case 'stdout':
                                    if (m.body.output) {
                                        detector.detectPattern(m.body.output);
                                    }
                                    break;
                                default:
                                    break;
                            }
                        }
                        if (m.type === 'request' && m.command === 'runInTerminal' && m.arguments) {
                            if (m.arguments.kind === 'integrated') {
                                runInTerminalRequestSeq = m.seq; // remember this to find matching response
                            }
                        }
                    },
                    onWillReceiveMessage: m => {
                        if (runInTerminalRequestSeq && m.type === 'response' && m.command === 'runInTerminal' && m.body && runInTerminalRequestSeq === m.request_seq) {
                            runInTerminalRequestSeq = undefined;
                            ServerReadyDetector.rememberShellPid(session, m.body.shellProcessId);
                        }
                    }
                };
            }
            return undefined;
        }
    }));
}
//# sourceMappingURL=extension.js.map