/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../base/common/strings.js';
import { RunOnceWorker } from '../../../../base/common/async.js';
export class UrlFinder extends Disposable {
    /**
     * Debounce time in ms before processing accumulated terminal data.
     */
    static { this.dataDebounceTimeout = 500; }
    /**
     * Maximum amount of data to accumulate before skipping URL detection.
     * When data exceeds this threshold, it indicates high-throughput scenarios
     * (like games or animations) where URL detection is unlikely to find useful results.
     */
    static { this.maxDataLength = 10000; }
    /**
     * Local server url pattern matching following urls:
     * http://localhost:3000/ - commonly used across multiple frameworks
     * https://127.0.0.1:5001/ - ASP.NET
     * http://:8080 - Beego Golang
     * http://0.0.0.0:4000 - Elixir Phoenix
     */
    static { this.localUrlRegex = /\b\w{0,20}(?::\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{2,5})[\w\-\.\~:\/\?\#[\]\@!\$&\(\)\*\+\,\;\=]*/gim; }
    static { this.extractPortRegex = /(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/; }
    /**
     * https://github.com/microsoft/vscode-remote-release/issues/3949
     */
    static { this.localPythonServerRegex = /HTTP\son\s(127\.0\.0\.1|0\.0\.0\.0)\sport\s(\d+)/; }
    static { this.excludeTerminals = ['Dev Containers']; }
    constructor(terminalService, debugService) {
        super();
        this._onDidMatchLocalUrl = this._register(new Emitter());
        this.onDidMatchLocalUrl = this._onDidMatchLocalUrl.event;
        this.listeners = new Map();
        this.terminalDataWorkers = this._register(new DisposableMap());
        this.replPositions = new Map();
        // Terminal
        terminalService.instances.forEach(instance => {
            this.registerTerminalInstance(instance);
        });
        this._register(terminalService.onDidCreateInstance(instance => {
            this.registerTerminalInstance(instance);
        }));
        this._register(terminalService.onDidDisposeInstance(instance => {
            this.listeners.get(instance)?.dispose();
            this.listeners.delete(instance);
            this.terminalDataWorkers.deleteAndDispose(instance);
        }));
        // Debug
        this._register(debugService.onDidNewSession(session => {
            if (!session.parentSession || (session.parentSession && session.hasSeparateRepl())) {
                this.listeners.set(session.getId(), session.onDidChangeReplElements(() => {
                    this.processNewReplElements(session);
                }));
            }
        }));
        this._register(debugService.onDidEndSession(({ session }) => {
            if (this.listeners.has(session.getId())) {
                this.listeners.get(session.getId())?.dispose();
                this.listeners.delete(session.getId());
            }
        }));
    }
    registerTerminalInstance(instance) {
        if (!UrlFinder.excludeTerminals.includes(instance.title)) {
            this.listeners.set(instance, instance.onData(data => {
                this.getOrCreateWorker(instance).work(data);
            }));
        }
    }
    getOrCreateWorker(instance) {
        let worker = this.terminalDataWorkers.get(instance);
        if (!worker) {
            worker = new RunOnceWorker(chunks => this.processTerminalData(chunks), UrlFinder.dataDebounceTimeout);
            this.terminalDataWorkers.set(instance, worker);
        }
        return worker;
    }
    processTerminalData(chunks) {
        // Skip processing if data exceeds threshold (high-throughput scenario like games)
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        if (totalLength > UrlFinder.maxDataLength) {
            return;
        }
        this.processData(chunks.join(''));
    }
    processNewReplElements(session) {
        const oldReplPosition = this.replPositions.get(session.getId());
        const replElements = session.getReplElements();
        this.replPositions.set(session.getId(), { position: replElements.length - 1, tail: replElements[replElements.length - 1] });
        if (!oldReplPosition && replElements.length > 0) {
            replElements.forEach(element => this.processData(element.toString()));
        }
        else if (oldReplPosition && (replElements.length - 1 !== oldReplPosition.position)) {
            // Process lines until we reach the old "tail"
            for (let i = replElements.length - 1; i >= 0; i--) {
                const element = replElements[i];
                if (element === oldReplPosition.tail) {
                    break;
                }
                else {
                    this.processData(element.toString());
                }
            }
        }
    }
    dispose() {
        super.dispose();
        for (const listener of this.listeners.values()) {
            listener.dispose();
        }
    }
    processData(data) {
        // strip ANSI terminal codes
        data = removeAnsiEscapeCodes(data);
        const urlMatches = data.match(UrlFinder.localUrlRegex) || [];
        if (urlMatches && urlMatches.length > 0) {
            urlMatches.forEach((match) => {
                // check if valid url
                let serverUrl;
                try {
                    serverUrl = new URL(match);
                }
                catch (e) {
                    // Not a valid URL
                }
                if (serverUrl) {
                    // check if the port is a valid integer value
                    const portMatch = match.match(UrlFinder.extractPortRegex);
                    const port = parseFloat(serverUrl.port ? serverUrl.port : (portMatch ? portMatch[2] : 'NaN'));
                    if (!isNaN(port) && Number.isInteger(port) && port > 0 && port <= 65535) {
                        // normalize the host name
                        let host = serverUrl.hostname;
                        if (host !== '0.0.0.0' && host !== '127.0.0.1') {
                            host = 'localhost';
                        }
                        // Exclude node inspect, except when using default port
                        if (port !== 9229 && data.startsWith('Debugger listening on')) {
                            return;
                        }
                        this._onDidMatchLocalUrl.fire({ port, host });
                    }
                }
            });
        }
        else {
            // Try special python case
            const pythonMatch = data.match(UrlFinder.localPythonServerRegex);
            if (pythonMatch && pythonMatch.length === 3) {
                this._onDidMatchLocalUrl.fire({ host: pythonMatch[1], port: Number(pythonMatch[2]) });
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJsRmluZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcmVtb3RlL2Jyb3dzZXIvdXJsRmluZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBRTlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVqRSxNQUFNLE9BQU8sU0FBVSxTQUFRLFVBQVU7SUFDeEM7O09BRUc7YUFDcUIsd0JBQW1CLEdBQUcsR0FBRyxBQUFOLENBQU87SUFFbEQ7Ozs7T0FJRzthQUNxQixrQkFBYSxHQUFHLEtBQUssQUFBUixDQUFTO0lBQzlDOzs7Ozs7T0FNRzthQUNxQixrQkFBYSxHQUFHLGdIQUFnSCxBQUFuSCxDQUFvSDthQUNqSSxxQkFBZ0IsR0FBRywrQ0FBK0MsQUFBbEQsQ0FBbUQ7SUFDM0Y7O09BRUc7YUFDcUIsMkJBQXNCLEdBQUcsa0RBQWtELEFBQXJELENBQXNEO2FBRTVFLHFCQUFnQixHQUFHLENBQUMsZ0JBQWdCLENBQUMsQUFBckIsQ0FBc0I7SUFPOUQsWUFBWSxlQUFpQyxFQUFFLFlBQTJCO1FBQ3pFLEtBQUssRUFBRSxDQUFDO1FBTlEsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBa0MsQ0FBQyxDQUFDO1FBQzVGLHVCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFDNUMsY0FBUyxHQUFpRCxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3BFLHdCQUFtQixHQUFHLElB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