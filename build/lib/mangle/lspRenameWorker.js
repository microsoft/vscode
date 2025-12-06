"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const workerpool_1 = __importDefault(require("workerpool"));
class LSPClient {
    process;
    messageId = 0;
    pendingRequests = new Map();
    buffer = '';
    initializePromise;
    projectPath;
    constructor(projectPath) {
        this.projectPath = projectPath;
    }
    async start() {
        const lspPath = path_1.default.join(__dirname, '..', '..', '..', 'node_modules', '@typescript', 'native-preview', 'bin', 'tsgo.js');
        this.process = (0, child_process_1.spawn)('node', [lspPath, '--lsp', '--stdio'], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.process.stdout.on('data', (data) => {
            this.handleOutput(data.toString());
        });
        this.process.stderr.on('data', (_data) => {
            // console.error('LSP stderr:', data.toString());
        });
        this.initializePromise = this.initialize();
        await this.initializePromise;
    }
    handleOutput(data) {
        this.buffer += data;
        while (true) {
            const headerEnd = this.buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) {
                break;
            }
            const headers = this.buffer.substring(0, headerEnd);
            const contentLengthMatch = headers.match(/Content-Length: (\d+)/);
            if (!contentLengthMatch) {
                break;
            }
            const contentLength = parseInt(contentLengthMatch[1], 10);
            const messageStart = headerEnd + 4;
            const messageEnd = messageStart + contentLength;
            if (this.buffer.length < messageEnd) {
                break;
            }
            const messageText = this.buffer.substring(messageStart, messageEnd);
            this.buffer = this.buffer.substring(messageEnd);
            try {
                const message = JSON.parse(messageText);
                this.handleMessage(message);
            }
            catch (e) {
                console.error('Failed to parse LSP message:', e);
            }
        }
    }
    handleMessage(message) {
        if (message.id !== undefined && this.pendingRequests.has(message.id)) {
            const { resolve, reject } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);
            if (message.error) {
                reject(new Error(message.error.message || 'LSP request failed'));
            }
            else {
                resolve(message.result);
            }
        }
    }
    sendRequest(method, params) {
        if (!this.process || !this.process.stdin) {
            throw new Error('LSP process not started');
        }
        const id = ++this.messageId;
        const message = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };
        const messageText = JSON.stringify(message);
        const headers = `Content-Length: ${Buffer.byteLength(messageText)}\r\n\r\n`;
        this.process.stdin.write(headers + messageText);
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
        });
    }
    async initialize() {
        const rootUri = (0, url_1.pathToFileURL)(path_1.default.dirname(this.projectPath)).toString();
        await this.sendRequest('initialize', {
            processId: process.pid,
            rootUri,
            capabilities: {
                textDocument: {
                    rename: {
                        prepareSupport: true,
                    },
                },
            },
        });
        this.sendRequest('initialized', {});
    }
    _openedFiles = new Set();
    async findRenameLocations(fileName, position) {
        await this.initializePromise;
        // Read the file to convert offset to line/character
        const fs = await import('fs');
        const fileContent = fs.readFileSync(fileName, 'utf-8');
        const lines = fileContent.substring(0, position).split('\n');
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;
        const uri = (0, url_1.pathToFileURL)(fileName).toString();
        // Send didOpen notification to inform LSP server about the file
        if (!this._openedFiles.has(uri)) {
            this.sendRequest('textDocument/didOpen', {
                textDocument: {
                    uri,
                    languageId: 'typescript',
                    version: 1,
                    text: fileContent,
                },
            });
            this._openedFiles.add(uri);
        }
        const renameResult = await this.sendRequest('textDocument/rename', {
            textDocument: {
                uri,
            },
            position: {
                line,
                character,
            },
            newName: '__TEMP_RENAME__', // Temporary name, we just need locations
        });
        if (!renameResult || !renameResult.changes) {
            return [];
        }
        const locations = [];
        for (const [uri, edits] of Object.entries(renameResult.changes)) {
            const filePath = (0, url_1.fileURLToPath)(uri);
            for (const edit of edits) {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const lines = fileContent.split('\n');
                let offset = 0;
                for (let i = 0; i < edit.range.start.line; i++) {
                    offset += lines[i].length + 1; // +1 for newline
                }
                offset += edit.range.start.character;
                const location = {
                    fileName: filePath,
                    textSpan: {
                        start: offset,
                        length: edit.range.end.character - edit.range.start.character,
                    },
                };
                locations.push(location);
            }
        }
        return locations;
    }
    async dispose() {
        if (this.process) {
            await this.sendRequest('shutdown', {});
            this.process.kill();
            this.process = undefined;
        }
    }
}
let lspClient;
async function findRenameLocations(projectPath, fileName, position) {
    if (!lspClient) {
        lspClient = (async () => {
            const client = new LSPClient(projectPath);
            await client.start();
            return client;
        })();
    }
    const client = await lspClient;
    return client.findRenameLocations(fileName, position);
}
workerpool_1.default.worker({
    findRenameLocations
});
//# sourceMappingURL=lspRenameWorker.js.map