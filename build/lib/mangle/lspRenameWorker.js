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
const typescript_1 = __importDefault(require("typescript"));
const url_1 = require("url");
const workerpool_1 = __importDefault(require("workerpool"));
class LSPClient {
    process;
    messageId = 0;
    pendingRequests = new Map();
    buffer = '';
    initializePromise;
    projectPath;
    _openedFiles = new Set();
    _sourceFileCache = new Map();
    constructor(projectPath) {
        this.projectPath = projectPath;
    }
    getOrCreateSourceFile(fileName) {
        let sourceFile = this._sourceFileCache.get(fileName);
        if (!sourceFile) {
            const fs = require('fs');
            const fileContent = fs.readFileSync(fileName, 'utf-8');
            sourceFile = typescript_1.default.createSourceFile(fileName, fileContent, typescript_1.default.ScriptTarget.Latest, true);
            this._sourceFileCache.set(fileName, sourceFile);
        }
        return sourceFile;
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
        // const rootUri = `file://${this.projectPath.replace(/\\/g, '/')}`;
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
    async findRenameLocations(fileName, position) {
        await this.initializePromise;
        const sourceFile = this.getOrCreateSourceFile(fileName);
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);
        const uri = (0, url_1.pathToFileURL)(fileName).toString();
        // Send didOpen notification to inform LSP server about the file
        if (!this._openedFiles.has(uri)) {
            this.sendRequest('textDocument/didOpen', {
                textDocument: {
                    uri,
                    languageId: 'typescript',
                    version: 1,
                    text: sourceFile.getFullText(),
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
            const editSourceFile = this.getOrCreateSourceFile(filePath);
            for (const edit of edits) {
                // Convert LSP line/character to TypeScript offset
                const offset = editSourceFile.getPositionOfLineAndCharacter(edit.range.start.line, edit.range.start.character);
                const endOffset = editSourceFile.getPositionOfLineAndCharacter(edit.range.end.line, edit.range.end.character);
                const location = {
                    fileName: filePath,
                    textSpan: {
                        start: offset,
                        length: endOffset - offset,
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