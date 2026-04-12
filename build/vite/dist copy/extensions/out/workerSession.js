"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWorkerSession = startWorkerSession;
const typingsInstaller_1 = require("./typingsInstaller/typingsInstaller");
const hrtime_1 = require("./util/hrtime");
const wasmCancellationToken_1 = require("./wasmCancellationToken");
function startWorkerSession(ts, host, fs, options, port, pathMapper, logger) {
    const indent = ts.server.indent;
    const worker = new class WorkerSession extends ts.server.Session {
        wasmCancellationToken;
        listener;
        constructor() {
            const cancellationToken = new wasmCancellationToken_1.WasmCancellationToken();
            const typingsInstaller = options.disableAutomaticTypingAcquisition || !fs ? ts.server.nullTypingsInstaller : new typingsInstaller_1.WebTypingsInstallerClient(host, '/vscode-global-typings/ts-nul-authority/projects');
            super({
                host,
                cancellationToken,
                ...options,
                typingsInstaller,
                byteLength: () => { throw new Error('Not implemented'); }, // Formats the message text in send of Session which is overridden in this class so not needed
                hrtime: // Formats the message text in send of Session which is overridden in this class so not needed
                hrtime_1.hrtime,
                logger: logger.tsLogger,
                canUseEvents: true,
            });
            this.wasmCancellationToken = cancellationToken;
            this.listener = (message) => {
                // TEMP fix since Cancellation.retrieveCheck is not correct
                function retrieveCheck2(data) {
                    if (!globalThis.crossOriginIsolated || !(data.$cancellationData instanceof SharedArrayBuffer)) {
                        return () => false;
                    }
                    const typedArray = new Int32Array(data.$cancellationData, 0, 1);
                    return () => {
                        return Atomics.load(typedArray, 0) === 1;
                    };
                }
                const shouldCancel = retrieveCheck2(message.data);
                if (shouldCancel) {
                    this.wasmCancellationToken.shouldCancel = shouldCancel;
                }
                try {
                    if (message.data.command === 'updateOpen') {
                        const args = message.data.arguments;
                        for (const open of args.openFiles ?? []) {
                            if (open.projectRootPath) {
                                pathMapper.addProjectRoot(open.projectRootPath);
                            }
                        }
                    }
                }
                catch {
                    // Noop
                }
                this.onMessage(message.data);
            };
        }
        send(msg) {
            if (msg.type === 'event' && !this.canUseEvents) {
                if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
                    this.logger.info(`Session does not support events: ignored event: ${JSON.stringify(msg)}`);
                }
                return;
            }
            if (this.logger.hasLevel(ts.server.LogLevel.verbose)) {
                this.logger.info(`${msg.type}:${indent(JSON.stringify(msg))}`);
            }
            port.postMessage(msg);
        }
        parseMessage(message) {
            return message;
        }
        toStringMessage(message) {
            return JSON.stringify(message, undefined, 2);
        }
        exit() {
            this.logger.info('Exiting...');
            port.removeEventListener('message', this.listener);
            this.projectService.closeLog();
            close();
        }
        listen() {
            this.logger.info(`webServer.ts: tsserver starting to listen for messages on 'message'...`);
            port.onmessage = this.listener;
        }
    }();
    worker.listen();
}
//# sourceMappingURL=workerSession.js.map