/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
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
	private buffer = '';
	private initializePromise: Promise<void> | undefined;
	private projectPath: string;

	constructor(projectPath: string) {
		this.projectPath = projectPath;
	}

	async start(): Promise<void> {
		const lspPath = path.join(import.meta.dirname, '..', '..', '..', 'node_modules', '@typescript', 'native-preview', 'bin', 'tsgo.js');

		this.process = spawn('node', [lspPath, '--lsp', '--stdio'], {
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		this.process.stdout!.on('data', (data: Buffer) => {
			this.handleOutput(data.toString());
		});

		this.process.stderr!.on('data', (_data: Buffer) => {
			// console.error('LSP stderr:', data.toString());
		});

		this.initializePromise = this.initialize();
		await this.initializePromise;
	}

	private handleOutput(data: string): void {
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
				const message: LSPMessage = JSON.parse(messageText);
				this.handleMessage(message);
			} catch (e) {
				console.error('Failed to parse LSP message:', e);
			}
		}
	}

	private handleMessage(message: LSPMessage): void {
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

		await this.sendRequest<any>('initialize', {
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

	private readonly _openedFiles = new Set<string>();

	async findRenameLocations(fileName: string, position: number): Promise<readonly ts.RenameLocation[]> {
		await this.initializePromise;

		// Read the file to convert offset to line/character
		const fs = await import('fs');
		const fileContent = fs.readFileSync(fileName, 'utf-8');
		const lines = fileContent.substring(0, position).split('\n');
		const line = lines.length - 1;
		const character = lines[lines.length - 1].length;

		const uri = pathToFileURL(fileName).toString();

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

		const renameResult = await this.sendRequest<any>('textDocument/rename', {
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

		const locations: ts.RenameLocation[] = [];

		for (const [uri, edits] of Object.entries(renameResult.changes)) {
			const filePath = fileURLToPath(uri);

			for (const edit of edits as any[]) {
				const fileContent = fs.readFileSync(filePath, 'utf-8');
				const lines = fileContent.split('\n');

				let offset = 0;
				for (let i = 0; i < edit.range.start.line; i++) {
					offset += lines[i].length + 1; // +1 for newline
				}
				offset += edit.range.start.character;

				const location: ts.RenameLocation = {
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
	position: number,
): Promise<readonly ts.RenameLocation[]> {
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

workerpool.worker({
	findRenameLocations
});
