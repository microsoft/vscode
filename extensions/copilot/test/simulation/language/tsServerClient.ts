/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import path from 'path';
import ts from 'typescript/lib/tsserverlibrary';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../src/util/vs/base/common/async';
import { Range } from '../../../src/vscodeTypes';
import { REPO_ROOT } from '../../base/stest';
import { doRunNpmInstall } from '../diagnosticProviders/tsc';
import { setupTemporaryWorkspace } from '../diagnosticProviders/utils';
import { cleanTempDirWithRetry, createTempDir } from '../stestUtil';

class TSServerRPC {

	private _seq: number;

	private _awaitingResponse: Map<number /* seq id */, DeferredPromise<ts.server.protocol.Response>>;

	private _stdoutBuffer: string;

	constructor(
		private readonly _server: cp.ChildProcess
	) {
		_server.stdin?.setDefaultEncoding('utf8');
		_server.stdout?.setEncoding('utf8');
		_server.stderr?.setEncoding('utf8');
		_server.on('close', () => {
			for (const reply of this._awaitingResponse.values()) {
				reply.error(new Error('server closed'));
			}
		});

		this._seq = 0;
		this._awaitingResponse = new Map();
		this._stdoutBuffer = '';

		this._registerOnDataHandler();
	}

	send(data: Omit<ts.server.protocol.Request, 'seq'>) {
		const obj = { ...data, seq: this._seq++ };
		const objS = `${JSON.stringify(obj)}\r\n`;
		const reply = new DeferredPromise<ts.server.protocol.Response>();
		this._server.stdin!.write(objS, err => {
			if (err) {
				reply.error(err);
			}
		});
		this._awaitingResponse.set(obj.seq, reply);
		return reply.p;
	}

	emit(data: Omit<ts.server.protocol.Request, 'seq'>) {
		const obj = { ...data, seq: this._seq++ };
		const objS = `${JSON.stringify(obj)}\r\n`;
		this._server.stdin!.write(objS, (_err) => {
			// ignored, server closed
		});
	}

	private _registerOnDataHandler() {
		this._server.stdout!.on('data', (chunk) => {
			this._stdoutBuffer += chunk;
			this._tryProcessStdoutBuffer();
		});
		this._server.stderr!.on('data', (chunk) => {
			console.error(`stderr chunk: ${chunk}`);
		});
	}

	private _tryProcessStdoutBuffer() {
		do {
			const eolIndex = this._stdoutBuffer.indexOf('\r\n');
			if (eolIndex === -1) {
				break;
			}

			// parse header
			const firstLine = this._stdoutBuffer.substring(0, eolIndex);
			const contentLength = parseInt(firstLine.substring('Content-Length: '.length), 10);

			// try parse body
			const body = this._stdoutBuffer.substring(eolIndex + 4, eolIndex + 4 + contentLength);
			if (body.length < contentLength) {
				// entire body did not arrive yet
				break;
			}
			this._stdoutBuffer = this._stdoutBuffer.substring(eolIndex + 4 + contentLength);

			this._handleServerMessage(JSON.parse(body) as ts.server.protocol.Message);
		} while (true);
	}

	private _handleServerMessage(msg: ts.server.protocol.Message) {
		switch (msg.type) {
			case 'event':
			case 'request':
				break;
			case 'response': {
				const resp = msg as ts.server.protocol.Response;
				const respP = this._awaitingResponse.get(resp.request_seq);
				if (respP === undefined) {
					console.error(`received response for unexpected seq ${resp.request_seq}`);
				} else {
					respP.complete(resp);
				}
				break;
			}
		}
	}
}

type TSServerClientState =
	| { k: 'uninitialized' }
	| {
		k: 'initialized';
		workspacePath: string;
		files: { filePath: string; fileName: string; fileContents: string }[];
		tsServerCP: cp.ChildProcess;
		tsServerRpc: TSServerRPC;
	}
	;

export class TSServerClient {

	static readonly id = 'tsc-language-features';

	static cacheVersion(): number {
		return 1;
	}

	private _state: TSServerClientState;
	private _initPromise: Promise<void> | undefined;

	constructor(private readonly _workspaceFiles: { fileName: string; fileContents: string }[]) {
		this._state = { k: 'uninitialized' };
	}

	private async _init() {
		this._initPromise ??= (async () => {
			const { workspacePath, files } = await this._setUp(this._workspaceFiles);

			const tsserverPath = path.resolve(path.join(REPO_ROOT, 'node_modules/typescript/lib/tsserver.js'));
			const tsServerCP = cp.fork(tsserverPath, {
				cwd: workspacePath,
				stdio: ['pipe', 'pipe', 'pipe', 'ipc']
			});

			const tsServerRpc = new TSServerRPC(tsServerCP);

			this._state = {
				k: 'initialized',
				workspacePath,
				files,
				tsServerCP,
				tsServerRpc,
			};

			// send "open" notifications
			for (const file of files) {
				tsServerRpc.emit({
					'type': 'request',
					'command': 'open',
					'arguments': { 'file': file.filePath }
				});
			}
		})();

		await this._initPromise;
	}

	async teardown() {
		if (this._state.k === 'uninitialized') {
			return;
		}

		await this._state.tsServerRpc.send({
			'type': 'request',
			'command': 'exit',
		});

		await cleanTempDirWithRetry(this._state.workspacePath);
	}

	async findDefinitions(fileName: string, position: vscode.Position): Promise<{ fileName: string; range: vscode.Range }[]> {
		return this.find(ts.server.protocol.CommandTypes.DefinitionAndBoundSpan, fileName, position);
	}

	async findReferences(fileName: string, position: vscode.Position): Promise<{ fileName: string; range: vscode.Range }[]> {
		return this.find(ts.server.protocol.CommandTypes.References, fileName, position);
	}

	async find(
		command: ts.server.protocol.CommandTypes.References | ts.server.protocol.CommandTypes.DefinitionAndBoundSpan,
		fileName: string, position: vscode.Position
	): Promise<{ fileName: string; range: vscode.Range }[]> {
		await this._init();
		assert(this._state.k === 'initialized');

		const response = await this._state.tsServerRpc.send(
			{
				type: 'request',
				command,
				arguments: {
					file: this._state.files.find(file => file.fileName === fileName)!.filePath,
					line: position.line + 1,
					offset: position.character + 1,
				}
			} satisfies Omit<ts.server.protocol.Request, 'seq'>
		);

		assert(response.command === command);

		if (!response.success) {
			throw new Error(`Request failed: ${response.message}`);
		}

		const locations = command === ts.server.protocol.CommandTypes.DefinitionAndBoundSpan ? response.body.definitions : response.body.refs;
		const workspacePathWithSlash = path.join(this._state.workspacePath, '/');
		const resultingDefinitions = [];

		for (const location of locations) {
			if (path.normalize(location.file).startsWith(workspacePathWithSlash)) {
				const range = new Range(location.start.line - 1, location.start.offset - 1, location.end.line - 1, location.end.offset - 1);
				const fileName = location.file.substring(workspacePathWithSlash.length);
				resultingDefinitions.push({ fileName, range });
			} else {
				// ignore all matches in non-workspace files, e.g. in d.ts files
			}
		}
		return resultingDefinitions;
	}

	private async _setUp(_files: { fileName: string; fileContents: string }[] = []) {
		const workspacePath = await createTempDir();
		const files = await setupTemporaryWorkspace(workspacePath, _files);

		const packagejson = files.find(file => path.basename(file.fileName) === 'package.json');
		if (packagejson) {
			await doRunNpmInstall(path.dirname(packagejson.filePath));
		}

		const hasTSConfigFile = files.some(file => path.basename(file.fileName) === 'tsconfig.json');

		if (!hasTSConfigFile) {
			const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
			await fs.promises.writeFile(tsconfigPath, JSON.stringify({
				'compilerOptions': {
					'target': 'es2021',
					'strict': true,
					'module': 'commonjs',
					'outDir': 'out',
					'sourceMap': true
				},
				'exclude': [
					'node_modules',
					'outcome',
					'scenarios'
				]
			}));
		}

		return { workspacePath, files };
	}
}
