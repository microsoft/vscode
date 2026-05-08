/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn as defaultSpawn } from 'child_process';
import { Emitter, type Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue, type IObservable } from '../../../../base/common/observable.js';
import type { JsonRpcMessage } from '../../../../base/common/jsonRpcProtocol.js';
import type { ILogger } from '../../../log/common/log.js';
import { StreamSplitter } from '../../../../base/node/nodeStreams.js';
import type { IMcpStdioServerConfiguration } from '../../../mcp/common/mcpPlatformTypes.js';
import { McpServerStatusKind, type McpServerStatus } from '../../common/state/protocol/state.js';
import { McpStdioStateHandler } from './mcpStdioStateHandler.js';
import type { IMcpUpstream, IMcpUpstreamCapabilities } from './mcpUpstream.js';

/** Spawn function (injectable for tests). */
export type StdioSpawn = (command: string, args: readonly string[], options: {
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
}) => ChildProcessWithoutNullStreams;

export interface IMcpStdioUpstreamOptions {
	readonly config: IMcpStdioServerConfiguration;
	readonly logger: ILogger;
	/** Test seam — defaults to Node `child_process.spawn`. */
	readonly spawn?: StdioSpawn;
}

/**
 * MCP upstream backed by a child process speaking JSON-RPC over
 * NDJSON on stdin/stdout (the canonical "stdio" transport).
 *
 * The child is spawned lazily on the first call to {@link start}; the
 * constructor performs no I/O. Bearer tokens are not plumbed through
 * stdio transports — see {@link setBearerToken}.
 */
export class McpStdioUpstream extends Disposable implements IMcpUpstream {

	private readonly _status = observableValue<McpServerStatus>(this, { kind: McpServerStatusKind.Stopped });
	public readonly status: IObservable<McpServerStatus> = this._status;

	private readonly _onMessage = this._register(new Emitter<JsonRpcMessage>());
	public readonly onMessage: Event<JsonRpcMessage> = this._onMessage.event;

	private readonly _upstreamCapabilities = observableValue<IMcpUpstreamCapabilities | undefined>(this, undefined);
	public readonly upstreamCapabilities: IObservable<IMcpUpstreamCapabilities | undefined> = this._upstreamCapabilities;

	private readonly _config: IMcpStdioServerConfiguration;
	private readonly _logger: ILogger;
	private readonly _spawn: StdioSpawn;

	private _stateHandler: McpStdioStateHandler | undefined;
	private _disposed = false;
	private _stopRequested = false;

	constructor(options: IMcpStdioUpstreamOptions) {
		super();
		this._config = options.config;
		this._logger = options.logger;
		this._spawn = options.spawn ?? defaultSpawn;
		this._register(toDisposable(() => this._stop()));
	}

	public async start(): Promise<McpServerStatus> {
		if (this._disposed) {
			return this._status.get();
		}
		const current = this._status.get();
		if (current.kind === McpServerStatusKind.Ready) {
			return current;
		}
		if (current.kind === McpServerStatusKind.Starting) {
			return current;
		}

		this._status.set({ kind: McpServerStatusKind.Starting }, undefined);

		try {
			// TODO(mcp/sandbox): the workbench-side McpServerLaunch path consults
			// `IMcpSandboxConfiguration` for stdio servers (see
			// `src/vs/platform/mcp/common/mcpPlatformTypes.ts` and the launcher in
			// `src/vs/workbench/contrib/mcp/`). The agent-host proxy currently
			// spawns unsandboxed; this matches the existing workbench gateway as
			// of v1.
			const child = this._spawn(this._config.command, this._config.args ?? [], {
				cwd: this._config.cwd,
				env: this._buildEnv(),
			});
			this._stateHandler = new McpStdioStateHandler(child);
			this._wireChild(child);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const status: McpServerStatus = {
				kind: McpServerStatusKind.Error,
				error: { errorType: 'spawnFailed', message },
			};
			this._status.set(status, undefined);
			return status;
		}

		this._status.set({ kind: McpServerStatusKind.Ready }, undefined);
		return this._status.get();
	}

	public async send(message: JsonRpcMessage): Promise<void> {
		const current = this._status.get();
		if (current.kind !== McpServerStatusKind.Ready) {
			throw new Error(`McpStdioUpstream: cannot send while in state '${current.kind}'`);
		}
		this._stateHandler!.write(JSON.stringify(message));
	}

	public setBearerToken(_token: string | undefined): void {
		// no-op for stdio; tokens are not yet plumbed through stdio MCP transports.
	}

	public setUpstreamCapabilities(caps: IMcpUpstreamCapabilities | undefined): void {
		this._upstreamCapabilities.set(caps, undefined);
	}

	private _buildEnv(): NodeJS.ProcessEnv | undefined {
		if (!this._config.env) {
			return undefined;
		}
		const env: NodeJS.ProcessEnv = { ...process.env };
		for (const [key, value] of Object.entries(this._config.env)) {
			if (value === null) {
				delete env[key];
			} else {
				env[key] = String(value);
			}
		}
		return env;
	}

	private _wireChild(child: ChildProcessWithoutNullStreams): void {
		// `StreamSplitter` emits one chunk per `\n`-delimited line and also
		// flushes any unterminated trailing chunk on stream end, so we don't
		// have to keep our own line buffer or hand-roll an exit-time flush.
		child.stdout.pipe(new StreamSplitter('\n')).on('data', (chunk: Buffer) => this._onStdoutLine(chunk)).resume();
		child.stderr.pipe(new StreamSplitter('\n')).on('data', (chunk: Buffer) => this._onStderrLine(chunk)).resume();

		child.on('error', (err: Error) => {
			this._logger.error(`McpStdioUpstream: child error: ${err.message}`);
			if (this._disposed || this._stopRequested) {
				return;
			}
			const current = this._status.get();
			if (current.kind === McpServerStatusKind.Error || current.kind === McpServerStatusKind.Stopped) {
				return;
			}
			this._status.set({
				kind: McpServerStatusKind.Error,
				error: { errorType: 'spawnFailed', message: err.message },
			}, undefined);
		});

		child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
			this._onChildExit(code, signal);
		});
	}

	private _onStdoutLine(chunk: Buffer): void {
		const trimmed = chunk.toString('utf8').trimEnd();
		if (!trimmed) {
			return;
		}
		let parsed: JsonRpcMessage;
		try {
			parsed = JSON.parse(trimmed) as JsonRpcMessage;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logger.error(`McpStdioUpstream: failed to parse stdout line: ${message}`);
			return;
		}
		this._onMessage.fire(parsed);
	}

	private _onStderrLine(chunk: Buffer): void {
		const text = chunk.toString('utf8').trimEnd();
		if (text.length > 0) {
			this._logger.info(`McpStdioUpstream[stderr]: ${text}`);
		}
	}

	private _onChildExit(code: number | null, signal: NodeJS.Signals | null): void {
		if (this._disposed || this._stopRequested) {
			this._status.set({ kind: McpServerStatusKind.Stopped }, undefined);
			return;
		}
		if (code !== null && code !== 0) {
			this._status.set({
				kind: McpServerStatusKind.Error,
				error: {
					errorType: 'childExited',
					message: `MCP stdio child exited with code ${code}${signal ? ` (signal ${signal})` : ''}`,
				},
			}, undefined);
		} else {
			this._status.set({ kind: McpServerStatusKind.Stopped }, undefined);
		}
	}

	private _stop(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._stopRequested = true;
		this._upstreamCapabilities.set(undefined, undefined);
		const handler = this._stateHandler;
		this._stateHandler = undefined;
		if (handler) {
			handler.stop();
			handler.dispose();
		}
	}

	public override dispose(): void {
		this._stop();
		super.dispose();
	}
}
