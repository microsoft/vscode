/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
import { assert } from 'console';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'url';
import workerpool from 'workerpool';

interface LSPMessage {
	jsonrpc: '2.0';
	id?: number;
	method?: string;
	params?: any;
	result?: any;
	error?: any;
}

class LSPClient {
	private process: ChildProcess | undefined;
	private messageId = 0;
	private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();
	private buffer: Buffer = Buffer.alloc(0);
	private initializePromise: Promise<void> | undefined;
	private projectPath: string;

	constructor(projectPath: string) {
		this.projectPath = projectPath;
	}

	async start(): Promise<void> {
		const lspPath = path.join(import.meta.dirname, '..', '..', '..', 'node_modules', '@typescript', 'native-preview', 'bin', 'tsgo.js');

		this.process = spawn('node', [lspPath, '--lsp', '--stdio', '--pprofDir', '/Users/jrieken/Code/vscode/tsgo-perf'], {
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		this.process.stdout!.on('data', (data: Buffer) => {
			this.handleOutput(data);
		});

		this.process.stderr!.on('data', (data: Buffer) => {
			console.error('LSP stderr:', data.toString());
		});

		this.initializePromise = this.initialize();
		await this.initializePromise;
	}

	private handleOutput(data: Buffer): void {
		this.buffer = Buffer.concat([this.buffer, data]);

		while (true) {
			// Find the header end (CRLF CRLF in the buffer)
			const headerEnd = this.buffer.indexOf('\r\n\r\n');
			if (headerEnd === -1) {
				break;
			}

			const headers = this.buffer.subarray(0, headerEnd).toString('utf-8');
			const contentLengthMatch = headers.match(/Content-Length: (\d+)/);
			if (!contentLengthMatch) {
				break;
			}

			const contentLength = parseInt(contentLengthMatch[1], 10);
			const messageStart = headerEnd + 4; // Skip the \r\n\r\n
			const messageEnd = messageStart + contentLength;

			if (this.buffer.length < messageEnd) {
				break;
			}

			const messageBuffer = this.buffer.subarray(messageStart, messageEnd);
			this.buffer = this.buffer.subarray(messageEnd);

			try {
				const messageText = messageBuffer.toString('utf-8');
				const message: LSPMessage = JSON.parse(messageText);
				this.handleMessage(message);
			} catch (e) {
				console.error('Failed to parse LSP message:', e, 'message:', messageBuffer.toString('utf-8'));
			}
		}
	}

	private handleMessage(message: LSPMessage): void {
		// Handle server requests to client
		if (message.method === 'client/registerCapability' && message.id !== undefined) {
			this.sendResponse(message.id, null);
			return;
		}

		// Handle responses to client requests
		if (message.id !== undefined && this.pendingRequests.has(message.id)) {
			const { resolve, reject } = this.pendingRequests.get(message.id)!;
			this.pendingRequests.delete(message.id);

			if (message.error) {
				reject(new Error(message.error.message || 'LSP request failed'));
			} else {
				resolve(message.result);
			}
		}
	}

	private sendResponse(id: number, result: any): void {
		if (!this.process || !this.process.stdin) {
			throw new Error('LSP process not started');
		}

		const message: LSPMessage = {
			jsonrpc: '2.0',
			id,
			result,
		};

		const messageText = JSON.stringify(message);
		const headers = `Content-Length: ${Buffer.byteLength(messageText)}\r\n\r\n`;
		this.process.stdin.write(headers + messageText);
	}

	private sendRequest<T>(method: string, params: any): Promise<T> {
		if (!this.process || !this.process.stdin) {
			throw new Error('LSP process not started');
		}

		const id = ++this.messageId;
		const message: LSPMessage = {
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

	private async initialize(): Promise<void> {

		const rootUri = pathToFileURL(path.dirname(this.projectPath)).toString();

		const res = await this.sendRequest<any>('initialize', {
			processId: process.pid,
			rootUri,
			capabilities: {
				general: {
					positionEncodings: ['utf-8'],
				},
				workspace: {
					configuration: false,
				}
			},
		});

		this.sendRequest('initialized', {});

		assert(res.capabilities.renameProvider);

		// console.log(`[lspRenameWorker] initialized, rename?${res.capabilities.renameProvider}`);
	}

	private readonly _openedFiles = new Set<string>();

	async findRenameLocations(fileName: string, position: ts.LineAndCharacter): Promise<readonly (Partial<ts.RenameLocation> & { textRange: any })[]> {
		await this.initializePromise;

		// Read the file to convert offset to line/character
		const fs = await import('fs');
		const uri = pathToFileURL(fileName).toString();

		// Send didOpen notification to inform LSP server about the file
		if (!this._openedFiles.has(uri)) {
			const fileContent = fs.readFileSync(fileName, 'utf-8');
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
		const renameResult = await this.sendRequest<any>('textDocument/rename', {
			textDocument: {
				uri,
			},
			position: {
				line: position.line,
				character: position.character,
			},
			newName: '__TEMP_RENAME__', // Temporary name, we just need locations
		});

		if (!renameResult || !renameResult.changes) {
			return [];
		}

		const locations: (Partial<ts.RenameLocation> & { textRange: any })[] = [];

		for (const [uri, edits] of Object.entries(renameResult.changes)) {
			const filePath = fileURLToPath(uri);
			for (const edit of edits as any[]) {
				locations.push({
					fileName: filePath,
					textSpan: undefined,
					textRange: edit.range
				});
			}
		}

		return locations;
	}

	async dispose(): Promise<void> {
		if (this.process) {
			await this.sendRequest('shutdown', {});
			this.process.kill();
			this.process = undefined;
		}
	}
}

let lspClient: Promise<LSPClient> | undefined;

async function findRenameLocations(
	projectPath: string,
	fileName: string,
	_position: number,
	lineColumn: ts.LineAndCharacter
): Promise<readonly (Partial<ts.RenameLocation> & { textRange: any })[]> {
	if (!lspClient) {
		lspClient = (async () => {
			const client = new LSPClient(projectPath);
			await client.start();
			return client;
		})();
	}

	const client = await lspClient;
	return client.findRenameLocations(fileName, lineColumn);
}

async function terminate(): Promise<void> {
	if (lspClient) {
		const client = await lspClient;
		await client.dispose();
		lspClient = undefined;
	}
}

workerpool.worker({
	findRenameLocations,
	terminate
});
