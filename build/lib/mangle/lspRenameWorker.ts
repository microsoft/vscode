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

	private readonly _openedFiles = new Set<string>();
	private readonly _sourceFileCache = new Map<string, ts.SourceFile>();

	constructor(projectPath: string) {
		this.projectPath = projectPath;
	}

	private getOrCreateSourceFile(fileName: string): ts.SourceFile {
		let sourceFile = this._sourceFileCache.get(fileName);
		if (!sourceFile) {
			const fs = require('fs');
			const fileContent = fs.readFileSync(fileName, 'utf-8');
			sourceFile = ts.createSourceFile(fileName, fileContent, ts.ScriptTarget.Latest, true);
			this._sourceFileCache.set(fileName, sourceFile);
		}
		return sourceFile;
	}

	async start(): Promise<void> {
		const lspPath = path.join(__dirname, '..', '..', '..', 'node_modules', '@typescript', 'native-preview', 'bin', 'tsgo.js');

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

		// const rootUri = `file://${this.projectPath.replace(/\\/g, '/')}`;
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

	async findRenameLocations(fileName: string, position: number): Promise<readonly ts.RenameLocation[]> {
		await this.initializePromise;

		const sourceFile = this.getOrCreateSourceFile(fileName);
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(position);

		const uri = pathToFileURL(fileName).toString();

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

			const editSourceFile = this.getOrCreateSourceFile(filePath);

			for (const edit of edits as any[]) {
				// Convert LSP line/character to TypeScript offset
				const offset = editSourceFile.getPositionOfLineAndCharacter(edit.range.start.line, edit.range.start.character);
				const endOffset = editSourceFile.getPositionOfLineAndCharacter(edit.range.end.line, edit.range.end.character);

				const location: ts.RenameLocation = {
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
