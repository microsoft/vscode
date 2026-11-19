/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession } from '@microsoft/copilot-sdk';
import { raceCancellationError, Sequencer, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, type IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService, LogLevel } from '../../../log/common/log.js';
import { levelToSeverityNumber, logLevelToOtlpSeverity, type IOtlpLogRecord, type OtlpLogLevelName } from '../../common/otlp/otlpLogEmitter.js';

type DiagnosticEntry = Awaited<ReturnType<CopilotSession['rpc']['diagnostics']['read']>>['entries'][number];
type DiagnosticLogLevel = NonNullable<Parameters<CopilotSession['rpc']['diagnostics']['configure']>[0]['sources']['mcp']>['level'];

const diagnosticLevels = {
	error: LogLevel.Error,
	warning: LogLevel.Warning,
	info: LogLevel.Info,
	debug: LogLevel.Debug,
	trace: LogLevel.Trace,
};

export function getEagerMcpDiagnosticLevel(level: LogLevel): 'trace' | 'debug' | undefined {
	return level === LogLevel.Trace ? 'trace' : level === LogLevel.Debug ? 'debug' : undefined;
}

/** Formats sensitive diagnostic content only for the requesting client's output channel. */
export function mcpDiagnosticEntryToLogRecord(entry: DiagnosticEntry): IOtlpLogRecord {
	let body: string;
	switch (entry.details.kind) {
		case 'protocol':
			body = `[${entry.details.direction === 'client-to-server' ? 'client -> server' : 'server -> client'}] ${entry.details.data ?? entry.message}`;
			break;
		case 'stderr':
			body = `[stderr] ${entry.message}`;
			break;
		case 'http':
			body = `[http] ${entry.message}${entry.details.data ? ` ${entry.details.data}` : ''}`;
			break;
		default:
			body = entry.message;
	}
	if (entry.agentId) {
		body = `[subagent ${entry.agentId}] ${body}`;
	}
	if (entry.truncated) {
		body += entry.originalBytes !== undefined ? ` (truncated from ${entry.originalBytes} bytes)` : ' (truncated)';
	}
	const timestamp = Date.parse(entry.timestamp);
	return {
		timeUnixNano: `${Number.isFinite(timestamp) ? timestamp : 0}000000`,
		...logLevelToOtlpSeverity(diagnosticLevels[entry.level]),
		body,
	};
}

/** Owns capture thresholds and independent readers for one live SDK session. */
export class CopilotMcpServerLogs extends Disposable {
	private readonly _subscriptions = this._register(new DisposableStore());
	private readonly _levels = new Map<symbol, OtlpLogLevelName>();
	private readonly _configure = new Sequencer();
	private readonly _unsupported = new WeakSet<CopilotSession>();
	private _configuredSession: CopilotSession | undefined;
	private _configuredLevel: DiagnosticLogLevel | undefined;

	constructor(
		private readonly _getSession: () => CopilotSession | undefined,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(_logService.onDidChangeLogLevel(() => { void this.refresh(); }));
	}

	refresh(): Promise<void> {
		return this._configure.queue(async () => {
			const session = this._getSession();
			if (this._store.isDisposed || !session || this._unsupported.has(session)) {
				return;
			}
			let level: OtlpLogLevelName | undefined = getEagerMcpDiagnosticLevel(this._logService.getLevel());
			for (const subscribed of this._levels.values()) {
				if (!level || levelToSeverityNumber(subscribed) < levelToSeverityNumber(level)) {
					level = subscribed;
				}
			}
			const sdkLevel: DiagnosticLogLevel = level === 'warn' ? 'warning' : level === 'fatal' ? 'error' : level ?? 'off';
			if (this._configuredSession === session && this._configuredLevel === sdkLevel) {
				return;
			}
			try {
				if (typeof session.rpc.diagnostics?.configure !== 'function' || typeof session.rpc.diagnostics?.read !== 'function') {
					this._markUnsupported(session);
					return;
				}
				await session.rpc.diagnostics.configure({ sources: { mcp: { level: sdkLevel } } });
				this._configuredSession = session;
				this._configuredLevel = sdkLevel;
			} catch (error) {
				if (isMethodNotFound(error)) {
					this._markUnsupported(session);
				}
			}
		});
	}

	subscribe(serverName: string, level: OtlpLogLevelName, onRecords: (records: readonly IOtlpLogRecord[]) => void): IDisposable {
		const key = Symbol();
		const store = this._subscriptions.add(new DisposableStore());
		const cancellation = new CancellationTokenSource();
		store.add(toDisposable(() => cancellation.dispose(true)));
		store.add(toDisposable(() => {
			cancellation.cancel();
			this._levels.delete(key);
			void this.refresh();
		}));
		this._levels.set(key, level);
		void this._read(serverName, level, onRecords, cancellation.token);
		return toDisposable(() => this._subscriptions.delete(store));
	}

	private async _read(serverName: string, level: OtlpLogLevelName, onRecords: (records: readonly IOtlpLogRecord[]) => void, token: CancellationToken): Promise<void> {
		let previousSession: CopilotSession | undefined;
		let cursor: string | undefined;
		while (!token.isCancellationRequested) {
			const session = this._getSession();
			try {
				if (!session) {
					await timeout(1000, token);
					continue;
				}
				if (this._unsupported.has(session)) {
					return;
				}
				if (session !== previousSession) {
					cursor = undefined;
					previousSession = session;
				}
				await raceCancellationError(this.refresh(), token);
				if (this._unsupported.has(session)) {
					return;
				}
				if (this._configuredSession !== session) {
					await timeout(1000, token);
					continue;
				}
				const page = await raceCancellationError(session.rpc.diagnostics.read({ sources: ['mcp'], cursor, max: 500, waitMs: 30000 }), token);
				if (session !== this._getSession()) {
					await timeout(1000, token);
					continue;
				}
				cursor = page.cursor;
				const records = page.entries
					.filter(entry => entry.details.serverName === serverName)
					.map(mcpDiagnosticEntryToLogRecord)
					.filter(record => record.severityNumber >= levelToSeverityNumber(level));
				if (page.cursorStatus === 'expired' || page.droppedCount) {
					records.unshift({
						timeUnixNano: `${Date.now()}000000`,
						...logLevelToOtlpSeverity(LogLevel.Warning),
						body: page.droppedCount ? `MCP diagnostic entries were dropped (${page.droppedCount} entries).` : 'MCP diagnostic cursor expired; some entries may have been dropped.',
					});
				}
				if (records.length) {
					onRecords(records);
				}
			} catch (error) {
				if (token.isCancellationRequested) {
					return;
				}
				if (session && isMethodNotFound(error)) {
					this._markUnsupported(session);
					return;
				}
				try {
					await timeout(1000, token);
				} catch {
					return;
				}
			}
		}
	}

	private _markUnsupported(session: CopilotSession): void {
		if (!this._unsupported.has(session)) {
			this._unsupported.add(session);
			this._logService.trace('[Copilot] MCP session diagnostics are not supported by this runtime.');
		}
	}
}

function isMethodNotFound(error: unknown): boolean {
	return (error instanceof Error && /method.*not found/i.test(error.message))
		|| (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === -32601);
}
