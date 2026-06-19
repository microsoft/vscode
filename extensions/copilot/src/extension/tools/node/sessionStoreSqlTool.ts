/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { IChatDebugFileLoggerService } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { ISessionStore } from '../../../platform/chronicle/common/sessionStore';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { SessionIndexingPreference } from '../../chronicle/common/sessionIndexingPreference';
import { CloudSessionStoreClient } from '../../chronicle/node/cloudSessionStoreClient';
import { reindexSessions } from '../../chronicle/node/sessionReindexer';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

/** Max rows to return to avoid blowing up the context window. */
const MAX_ROWS = 100;

/** Dangerous SQL patterns that should be blocked. */
const BLOCKED_PATTERNS = [
	/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE)\b/i,
	/\bATTACH\b/i,
	/\bDETACH\b/i,
	/\bPRAGMA\b(?!\s+data_version)/i,
	// File-system or maintenance side effects (e.g. VACUUM INTO copies the DB to a chosen path)
	/\bVACUUM\b/i,
	/\bREINDEX\b/i,
	/\bANALYZE\b/i,
	// Native-code load via SQL function — would be RCE if SQLite is built with extension loading
	/\bLOAD_EXTENSION\b/i,
	// Transaction control — meaningless via prepare().all() but reject for clarity
	/\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i,
];

/** Strip leading SQL line and block comments plus whitespace, used by the allowlist check. */
function stripLeadingCommentsAndWhitespace(sql: string): string {
	let s = sql;
	let prev: string;
	do {
		prev = s;
		s = s.replace(/^\s+/, '');
		s = s.replace(/^--[^\n]*\n?/, '');
		s = s.replace(/^\/\*[\s\S]*?\*\//, '');
	} while (s !== prev);
	return s;
}

export interface SessionStoreSqlParams {
	readonly action?: 'query' | 'reindex';
	readonly query?: string;
	readonly force?: boolean;
	readonly description: string;
	/** Originating /chronicle slash command (e.g. 'tips', 'cost-tips', 'search', 'improve'). Used for telemetry attribution only. */
	readonly subcommand?: 'standup' | 'tips' | 'cost-tips' | 'search' | 'improve' | 'reindex';
}

/** Model description when cloud sync is enabled — uses DuckDB SQL syntax. */
const CLOUD_MODEL_DESCRIPTION = `Query the cloud session store containing ALL past coding sessions across devices and agents. Uses DuckDB syntax (NOT SQLite). SQL queries are read-only — only SELECT and WITH are allowed. Use \`now() - INTERVAL '1 day'\` for date math (NOT \`datetime('now', '-1 day')\` — that's SQLite-only), \`ILIKE\` for text search (no FTS5/MATCH).

Tables: \`sessions\`, \`turns\`, \`session_files\`, \`session_refs\`, \`checkpoints\`, \`events\`, \`tool_requests\`. For column details and query patterns, use the **chronicle** skill.

Actions: 'query' (execute DuckDB SQL), 'reindex' (rebuild index + cloud sync).`;

class SessionStoreSqlTool implements ICopilotTool<SessionStoreSqlParams> {
	public static readonly toolName = ToolName.SessionStoreSql;
	public static readonly nonDeferred = true;

	private readonly _indexingPreference: SessionIndexingPreference;

	constructor(
		@ISessionStore private readonly _sessionStore: ISessionStore,
		@ICopilotTokenManager private readonly _tokenManager: ICopilotTokenManager,
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IConfigurationService configService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@IChatDebugFileLoggerService private readonly _debugLogService: IChatDebugFileLoggerService,
		@IRunCommandExecutionService private readonly _runCommandService: IRunCommandExecutionService,
	) {
		this._indexingPreference = new SessionIndexingPreference(configService);
	}

	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<SessionStoreSqlParams>,
		token: CancellationToken,
	): Promise<vscode.LanguageModelToolResult> {
		const action = options.input.action ?? 'query';
		const subcommand = options.input.subcommand;

		switch (action) {
			case 'reindex':
				return this._invokeReindex(options.input.force ?? false, subcommand ?? 'reindex', token);
			default:
				return this._invokeQuery(options.input.query ?? '', subcommand, token);
		}
	}
	private async _invokeQuery(rawQuery: string, subcommand: SessionStoreSqlParams['subcommand'], token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		// Strip trailing semicolons — models often append them
		const sql = rawQuery.trim().replace(/;+\s*$/, '');

		if (!sql) {
			return new LanguageModelToolResult([new LanguageModelTextPart('Error: Empty query provided.')]);
		}

		// Security check: block mutating / side-effecting statements
		for (const pattern of BLOCKED_PATTERNS) {
			if (pattern.test(sql)) {
				this._sendTelemetry({ command: 'query', subcommand, target: 'local', blocked: true, rowCount: 0, durationMs: 0, success: false, error: 'blocked_mutating_sql' });
				return new LanguageModelToolResult([
					new LanguageModelTextPart('Error: Blocked SQL statement. Only SELECT or WITH queries are allowed.'),
				]);
			}
		}

		// Allowlist: model-supplied SQL must be a SELECT or WITH (CTE) statement. Strip leading
		// comments first so a comment prefix cannot smuggle a non-query past the check.
		const firstKeywordSrc = stripLeadingCommentsAndWhitespace(sql);
		if (!/^(SELECT|WITH)\b/i.test(firstKeywordSrc)) {
			this._sendTelemetry({ command: 'query', subcommand, target: 'local', blocked: true, rowCount: 0, durationMs: 0, success: false, error: 'blocked_not_select_or_with' });
			return new LanguageModelToolResult([
				new LanguageModelTextPart('Error: Blocked SQL statement. Only SELECT or WITH queries are allowed.'),
			]);
		}

		// Block multiple statements — only one query per call
		if (sql.includes(';')) {
			this._sendTelemetry({ command: 'query', subcommand, target: 'local', blocked: true, rowCount: 0, durationMs: 0, success: false, error: 'multiple_statements' });
			return new LanguageModelToolResult([
				new LanguageModelTextPart('Error: Only one SQL statement per call. Remove semicolons and split into separate calls.'),
			]);
		}

		// Determine query target based on consent
		const hasCloud = this._indexingPreference.hasCloudConsent();
		const startTime = Date.now();
		let source = hasCloud ? 'cloud' : 'local';
		let target: 'local' | 'cloud' = hasCloud ? 'cloud' : 'local';
		let fallback = false;

		try {
			let rows: Record<string, unknown>[];
			let truncated = false;

			if (hasCloud) {
				// Cloud is enabled — model receives DuckDB description via alternativeDefinition
				const client = new CloudSessionStoreClient(this._tokenManager, this._authService, this._fetcherService);
				const cloudResult = await client.executeQuery(sql);

				if (cloudResult && 'error' in cloudResult) {
					// Cloud query failed — surface the error so model can fix its query
					this._sendTelemetry({ command: 'query', subcommand, target: 'cloud', rowCount: 0, durationMs: Date.now() - startTime, success: false, error: cloudResult.error.substring(0, 100) });
					return new LanguageModelToolResult([new LanguageModelTextPart(
						`Error from cloud: ${cloudResult.error}\n\nReminder: Cloud uses DuckDB SQL syntax. Use \`now() - INTERVAL '1 day'\` for date math, \`ILIKE\` for text search (no FTS5/MATCH).`
					)]);
				} else if (!cloudResult) {
					// Auth/network failure — fall back to local
					source = 'local_fallback';
					target = 'local';
					fallback = true;
					rows = this._executeLocal(sql);
				} else {
					rows = cloudResult.rows;
					truncated = cloudResult.truncated;
				}
			} else {
				rows = this._executeLocal(sql);
			}

			// Cap rows
			if (rows.length > MAX_ROWS) {
				rows = rows.slice(0, MAX_ROWS);
				truncated = true;
			}

			this._sendTelemetry({ command: 'query', subcommand, target, fallback, rowCount: rows.length, durationMs: Date.now() - startTime, success: true });

			// Format as table
			const result = formatSqlResult(rows, truncated, source);
			return new LanguageModelToolResult([new LanguageModelTextPart(result)]);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._sendTelemetry({ command: 'query', subcommand, target, fallback, rowCount: 0, durationMs: Date.now() - startTime, success: false, error: message.substring(0, 100) });
			return new LanguageModelToolResult([new LanguageModelTextPart(`Error: ${message}`)]);
		}
	}

	/**
	 * Execute a model-supplied SQL query against the local SQLite session store.
	 * The query has already been validated by the allowlist + blocklist in `_invokeQuery`.
	 * `executeReadOnly` adds engine-level enforcement via `setAuthorizer` when available.
	 */
	private _executeLocal(sql: string): Record<string, unknown>[] {
		return this._sessionStore.executeReadOnly(sql);
	}

	/**
	 * Reindex action: rebuild the local session store from debug logs,
	 * then trigger cloud sync if enabled.
	 */
	private async _invokeReindex(force: boolean, subcommand: NonNullable<SessionStoreSqlParams['subcommand']>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const startTime = Date.now();
		const hadCloudConsent = this._indexingPreference.hasCloudConsent();
		const target: 'local' | 'cloud' = hadCloudConsent ? 'cloud' : 'local';

		try {
			const statsBefore = this._sessionStore.getStats();

			const result = await reindexSessions(
				this._sessionStore,
				this._debugLogService,
				() => { /* progress not streamed for tool results */ },
				token,
				force,
			);

			const statsAfter = this._sessionStore.getStats();

			const lines: string[] = [];
			if (result.cancelled) {
				lines.push('Reindex cancelled.');
			} else {
				lines.push('Local reindex complete.');
			}

			lines.push('');
			lines.push('| | Before | After | Delta |');
			lines.push('|---|---|---|---|');
			lines.push(`| Sessions | ${statsBefore.sessions} | ${statsAfter.sessions} | +${statsAfter.sessions - statsBefore.sessions} |`);
			lines.push(`| Turns | ${statsBefore.turns} | ${statsAfter.turns} | +${statsAfter.turns - statsBefore.turns} |`);
			lines.push(`| Files | ${statsBefore.files} | ${statsAfter.files} | +${statsAfter.files - statsBefore.files} |`);
			lines.push(`| Refs | ${statsBefore.refs} | ${statsAfter.refs} | +${statsAfter.refs - statsBefore.refs} |`);
			lines.push('');
			lines.push(`${result.processed} session(s) processed, ${result.skipped} skipped.`);

			// Cloud reindex phase — gated by cloud sync settings in RemoteSessionExporter
			if (!result.cancelled && !token.isCancellationRequested) {
				try {
					const cloudResult = await this._runCommandService.executeCommand(
						'github.copilot.sessionSync.reindex',
						() => { /* progress not streamed for tool results */ },
						token,
					) as { created: number; eventsUploaded: number; failed: number; backfillQueued: number } | undefined;
					if (cloudResult && cloudResult.created > 0) {
						lines.push(`${cloudResult.created} session(s) synced to cloud.`);
					}
				} catch {
					// Cloud phase failure is non-fatal — local reindex already succeeded
				}
			}

			this._sendTelemetry({ command: 'reindex', subcommand, target, rowCount: result.processed, durationMs: Date.now() - startTime, success: true });
			return new LanguageModelToolResult([new LanguageModelTextPart(lines.join('\n'))]);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._sendTelemetry({ command: 'reindex', subcommand, target, rowCount: 0, durationMs: Date.now() - startTime, success: false, error: message.substring(0, 100) });
			return new LanguageModelToolResult([new LanguageModelTextPart(`Error during reindex: ${message}`)]);
		}
	}

	private _sendTelemetry(args: {
		command: 'query' | 'reindex';
		subcommand?: SessionStoreSqlParams['subcommand'];
		target: 'local' | 'cloud';
		blocked?: boolean;
		fallback?: boolean;
		rowCount: number;
		durationMs: number;
		success: boolean;
		error?: string;
	}): void {
		const { command, subcommand, target, blocked, fallback, rowCount, durationMs, success, error } = args;
		// Back-compat: derive the original `source` value so existing dashboards keep working.
		const source = blocked
			? 'blocked'
			: fallback
				? 'local_fallback'
				: command === 'query'
					? target
					: command;
		const properties = {
			command,
			subcommand: subcommand ?? 'unknown',
			target,
			source,
			success: success ? 'true' : 'false',
		};
		const measurements = { rowCount, durationMs };
		if (success) {
			/* __GDPR__
"chronicle.sqlQuery" : {
"owner": "vijayu",
"comment": "Tracks chronicle session-store tool invocations (query/reindex) and outcomes",
"command": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Tool action invoked: query or reindex." },
"subcommand": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Originating /chronicle slash command (standup, tips, cost-tips, search, improve, reindex) or 'unknown' for ad-hoc model calls." },
"target": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the invocation primarily targeted the local SQLite store or the cloud session store." },
"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Fine-grained source: local, cloud, local_fallback, blocked, or reindex (kept for back-compat)." },
"success": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the invocation succeeded (true/false)." },
"error": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Truncated error message." },
"rowCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of rows returned." },
"durationMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Invocation duration in milliseconds." }
}
*/
			this._telemetryService.sendMSFTTelemetryEvent('chronicle.sqlQuery', properties, measurements);
		} else {

			this._telemetryService.sendMSFTTelemetryErrorEvent('chronicle.sqlQuery', {
				...properties,
				error: error ?? 'unknown',
			}, measurements);
		}
	}

	prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<SessionStoreSqlParams>,
		_token: CancellationToken,
	) {
		const action = options.input.action ?? 'query';
		switch (action) {
			case 'reindex':
				return {
					invocationMessage: l10n.t('Reindexing session store'),
					pastTenseMessage: l10n.t('Reindexed session store'),
				};
			default:
				return {
					invocationMessage: l10n.t('Querying session store'),
					pastTenseMessage: l10n.t('Queried session store'),
				};
		}
	}

	alternativeDefinition(tool: vscode.LanguageModelToolInformation): vscode.LanguageModelToolInformation {
		const hasCloud = this._indexingPreference.hasCloudConsent();
		if (!hasCloud) {
			return tool;
		}

		// When cloud is enabled, swap the description and inputSchema to use DuckDB syntax
		const cloudInputSchema = {
			...tool.inputSchema,
			properties: {
				...(tool.inputSchema as Record<string, unknown>).properties as Record<string, unknown>,
				query: {
					type: 'string',
					description: 'A single DuckDB SQL query to execute. Required when action is \'query\'. Read-only queries only (SELECT, WITH). Use now() - INTERVAL for date math, ILIKE for text search. Only one statement per call — do not combine multiple queries with semicolons.',
				},
			},
		};

		return {
			...tool,
			description: CLOUD_MODEL_DESCRIPTION,
			inputSchema: cloudInputSchema,
		};
	}
}

/** Max total characters for the formatted result to avoid blowing up the context window. */
const TOTAL_FORMAT_BUDGET = 30_000;

function formatSqlResult(rows: Record<string, unknown>[], truncated: boolean, source: string): string {
	if (rows.length === 0) {
		return `No results found (source: ${source}).`;
	}

	const columns = Object.keys(rows[0]);

	// Adaptive per-cell limit: distribute budget evenly across all cells
	const cellCount = rows.length * columns.length;
	const perCellLimit = Math.floor(TOTAL_FORMAT_BUDGET / cellCount);

	const lines: string[] = [];
	lines.push(`Results: ${rows.length} rows (source: ${source})${truncated ? ' [TRUNCATED]' : ''}`);
	lines.push('');
	lines.push(`| ${columns.join(' | ')} |`);
	lines.push(`| ${columns.map(() => '---').join(' | ')} |`);
	for (const row of rows) {
		const values = columns.map(c => {
			const v = row[c];
			if (v === null || v === undefined) {
				return '';
			}
			const s = String(v);
			return s.length > perCellLimit ? s.slice(0, perCellLimit) + '...' : s;
		});
		lines.push(`| ${values.join(' | ')} |`);
	}

	if (truncated) {
		lines.push('');
		lines.push('⚠️ Results were truncated. Add a LIMIT clause or narrow your query.');
	}

	let result = lines.join('\n');

	// Hard budget enforcement — truncate the entire output if it still exceeds the budget
	if (result.length > TOTAL_FORMAT_BUDGET) {
		result = result.slice(0, TOTAL_FORMAT_BUDGET) + '\n\n⚠️ Output truncated to stay within context budget.';
	}

	return result;
}

ToolRegistry.registerTool(SessionStoreSqlTool);
