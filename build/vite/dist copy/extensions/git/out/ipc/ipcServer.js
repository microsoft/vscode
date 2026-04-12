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
exports.IPCServer = void 0;
exports.createIPCServer = createIPCServer;
const util_1 = require("../util");
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const crypto = __importStar(require("crypto"));
function getIPCHandlePath(id) {
    if (process.platform === 'win32') {
        return `\\\\.\\pipe\\vscode-git-${id}-sock`;
    }
    if (process.platform !== 'darwin' && process.env['XDG_RUNTIME_DIR']) {
        return path.join(process.env['XDG_RUNTIME_DIR'], `vscode-git-${id}.sock`);
    }
    return path.join(os.tmpdir(), `vscode-git-${id}.sock`);
}
async function createIPCServer(context) {
    const server = http.createServer();
    const hash = crypto.createHash('sha256');
    if (!context) {
        const buffer = await new Promise((c, e) => crypto.randomBytes(20, (err, buf) => err ? e(err) : c(buf)));
        hash.update(buffer);
    }
    else {
        hash.update(context);
    }
    const ipcHandlePath = getIPCHandlePath(hash.digest('hex').substring(0, 10));
    if (process.platform !== 'win32') {
        try {
            await fs.promises.unlink(ipcHandlePath);
        }
        catch {
            // noop
        }
    }
    return new Promise((c, e) => {
        try {
            server.on('error', err => e(err));
            server.listen(ipcHandlePath);
            c(new IPCServer(server, ipcHandlePath));
        }
        catch (err) {
            e(err);
        }
    });
}
class IPCServer {
    server;
    _ipcHandlePath;
    handlers = new Map();
    get ipcHandlePath() { return this._ipcHandlePath; }
    constructor(server, _ipcHandlePath) {
        this.server = server;
        this._ipcHandlePath = _ipcHandlePath;
        this.server.on('request', this.onRequest.bind(this));
    }
    registerHandler(name, handler) {
        this.handlers.set(`/${name}`, handler);
        return (0, util_1.toDisposable)(() => this.handlers.delete(name));
    }
    onRequest(req, res) {
        if (!req.url) {
            console.warn(`Request lacks url`);
            return;
        }
        const handler = this.handlers.get(req.url);
        if (!handler) {
            console.warn(`IPC handler for ${req.url} not found`);
            return;
        }
        const chunks = [];
        req.on('data', d => chunks.push(d));
        req.on('end', () => {
            const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            handler.handle(request).then(result => {
                res.writeHead(200);
                res.end(JSON.stringify(result));
            }, () => {
                res.writeHead(500);
                res.end();
            });
        });
    }
    getEnv() {
        return { VSCODE_GIT_IPC_HANDLE: this.ipcHandlePath };
    }
    getTerminalEnv() {
        return { VSCODE_GIT_IPC_HANDLE: this.ipcHandlePath };
    }
    dispose() {
        this.handlers.clear();
        this.server.close();
        if (this._ipcHandlePath && process.platform !== 'win32') {
            fs.unlinkSync(this._ipcHandlePath);
        }
    }
}
exports.IPCServer = IPCServer;
//# sourceMappingURL=ipcServer.js.map