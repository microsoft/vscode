/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { Readable, Writable } from 'stream';
import { raceTimeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentHostAcpAgentConfiguration } from '../../common/agentService.js';

const initializeTimeoutMs = 30_000;

type AcpSdk = typeof import('@agentclientprotocol/sdk');

export type AcpPermissionHandler = (request: import('@agentclientprotocol/sdk').RequestPermissionRequest) => Promise<import('@agentclientprotocol/sdk').RequestPermissionResponse>;

export class AcpConnection extends Disposable {
	private readonly _onDidClose = this._register(new Emitter<Error>());
	readonly onDidClose = this._onDidClose.event;

	private _child: ChildProcessWithoutNullStreams | undefined;
	private _sdk: AcpSdk | undefined;
	private _connection: import('@agentclientprotocol/sdk').ClientConnection | undefined;
	private _context: import('@agentclientprotocol/sdk').ClientContext | undefined;
	private _initializeResult: import('@agentclientprotocol/sdk').InitializeResponse | undefined;
	private _startPromise: Promise<void> | undefined;
	private _didReportClose = false;
	private _isDisposed = false;

	constructor(
		private readonly _configuration: IAgentHostAcpAgentConfiguration,
		private readonly _permissionHandler: AcpPermissionHandler,
		private readonly _logService: ILogService,
	) {
		super();
	}

	get initializeResult(): import('@agentclientprotocol/sdk').InitializeResponse | undefined {
		return this._initializeResult;
	}

	async createSession(cwd: string): Promise<import('@agentclientprotocol/sdk').ActiveSession> {
		await this._ensureReady(cwd);
		return this._requireContext().buildSession({ cwd, mcpServers: [] }).start();
	}

	async cancelSession(sessionId: import('@agentclientprotocol/sdk').SessionId): Promise<void> {
		await this._requireContext().notify(this._requireSdk().methods.agent.session.cancel, { sessionId });
	}

	async closeSession(sessionId: import('@agentclientprotocol/sdk').SessionId): Promise<void> {
		await this._requireContext().request(this._requireSdk().methods.agent.session.close, { sessionId });
	}

	async setSessionConfigOption(sessionId: import('@agentclientprotocol/sdk').SessionId, configId: string, value: string): Promise<readonly import('@agentclientprotocol/sdk').SessionConfigOption[]> {
		const result = await this._requireContext().request(this._requireSdk().methods.agent.session.setConfigOption, {
			sessionId,
			configId,
			value,
		});
		return result.configOptions;
	}

	private _ensureReady(cwd: string): Promise<void> {
		if (!this._startPromise) {
			this._startPromise = this._start(cwd).catch(error => {
				this._resetConnection();
				this._startPromise = undefined;
				throw error;
			});
		}
		return this._startPromise;
	}

	private async _start(cwd: string): Promise<void> {
		this._didReportClose = false;
		const acp = await import('@agentclientprotocol/sdk');
		this._sdk = acp;
		const child = spawn(this._configuration.command, [...this._configuration.args ?? []], {
			cwd,
			env: { ...process.env, ...this._configuration.env },
			shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(this._configuration.command),
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		this._child = child;

		await new Promise<void>((resolve, reject) => {
			child.once('spawn', resolve);
			child.once('error', reject);
		});

		child.stderr.setEncoding('utf8');
		child.stderr.on('data', this._handleStderr);
		child.on('exit', this._handleExit);

		const app = acp.client({ name: `vscode-agent-host-${this._configuration.id}` })
			.onRequest(acp.methods.client.session.requestPermission, context => this._permissionHandler(context.params));
		const stream = acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>);
		const connection = app.connect(stream);
		this._connection = connection;
		this._context = connection.agent;
		connection.closed.then(
			() => this._reportClose(new Error(localize('acp.connection.closed', "ACP agent connection closed."))),
			error => this._reportClose(error instanceof Error ? error : new Error(String(error))),
		);

		const initializeResult = await raceTimeout(connection.agent.request(acp.methods.agent.initialize, {
			protocolVersion: acp.PROTOCOL_VERSION,
			clientCapabilities: {},
			clientInfo: {
				name: 'vscode-agent-host',
				title: 'VS Code Agent Host',
				version: '1.0.0',
			},
		}), initializeTimeoutMs);
		if (!initializeResult) {
			const error = new Error(localize('acp.initialize.timeout', "ACP agent initialization timed out."));
			connection.close(error);
			throw error;
		}
		if (initializeResult.protocolVersion !== acp.PROTOCOL_VERSION) {
			const error = new Error(localize('acp.initialize.versionMismatch', "ACP agent negotiated unsupported protocol version {0}.", initializeResult.protocolVersion));
			connection.close(error);
			throw error;
		}

		this._initializeResult = initializeResult;
		this._logService.info(`[Agent Rosetta] Connected to ${this._configuration.id} using ACP v${initializeResult.protocolVersion}.`);
	}

	private _requireSdk(): AcpSdk {
		if (!this._sdk) {
			throw new Error(localize('acp.sdk.notReady', "ACP SDK is not ready."));
		}
		return this._sdk;
	}

	private _requireContext(): import('@agentclientprotocol/sdk').ClientContext {
		if (!this._context) {
			throw new Error(localize('acp.connection.notReady', "ACP agent connection is not ready."));
		}
		return this._context;
	}

	private readonly _handleStderr = (data: string): void => {
		const message = data.trimEnd();
		if (message) {
			this._logService.info(`[Agent Rosetta:${this._configuration.id}] ${message}`);
		}
	};

	private readonly _handleExit = (code: number | null, signal: NodeJS.Signals | null): void => {
		const detail = code !== null ? `exit code ${code}` : `signal ${signal ?? 'unknown'}`;
		const error = new Error(localize('acp.process.exited', "ACP agent process exited with {0}.", detail));
		this._connection?.close(error);
		this._reportClose(error);
	};

	private _reportClose(error: Error): void {
		if (this._didReportClose || this._isDisposed) {
			return;
		}
		this._didReportClose = true;
		this._resetConnection();
		this._startPromise = undefined;
		this._onDidClose.fire(error);
	}

	private _resetConnection(): void {
		this._connection = undefined;
		this._context = undefined;
		this._initializeResult = undefined;
		this._child = undefined;
	}

	override dispose(): void {
		this._isDisposed = true;
		this._connection?.close();
		this._child?.stderr.off('data', this._handleStderr);
		this._child?.off('exit', this._handleExit);
		this._child?.kill();
		super.dispose();
	}
}
