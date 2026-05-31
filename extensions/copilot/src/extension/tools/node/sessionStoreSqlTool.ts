/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { IChatDebugFileLoggerService } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { type SessionRow, type RefRow, ISessionStore } from '../../../platform/chronicle/common/sessionStore';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { type AnnotatedSession, type AnnotatedRef, type SessionFileInfo, type SessionTurnInfo, SESSIONS_QUERY_SQLITE, buildRefsQuery, buildFilesQuery, buildTurnsQuery, buildStandupPrompt } from '../../chronicle/common/standupPrompt';
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
	readonly action?: 'query' | 'standup' | 'reindex';
	readonly query?: string;
	readonly force?: boolean;
	readonly description: string;
	/** Originating /chronicle slash command (e.g. 'tips', 'cost-tips', 'search', 'improve'). Used for telemetry attribution only. */
	readonly subcommand?: 'standup' | 'tips' | 'cost-tips' | 'search' | 'improve' | 'reindex';
}

/** Cloud SQL dialect sessions query. */
const SESSIONS_QUERY_CLOUD = `SELECT *
	FROM sessions
	WHERE updated_at >= now() - INTERVAL '1 day'
	ORDER BY updated_at DESC
	LIMIT 100`;

/** Model description when cloud sync is enabled — uses DuckDB SQL syntax. */
const CLOUD_MODEL_DESCRIPTION = `Query the cloud session store containing ALL past coding sessions across devices and agents. Uses DuckDB syntax (NOT SQLite). SQL queries are read-only — only SELECT and WITH are allowed. Use \`now() - INTERVAL '1 day'\` for date math (NOT \`datetime('now', '-1 day')\` — that's SQLite-only), \`ILIKE\` for text search (no FTS5/MATCH).

Tables: \`sessions\`, \`turns\`, \`session_files\`, \`session_refs\`, \`checkpoints\`, \`events\`, \`tool_requests\`. For column details and query patterns, use the **chronicle** skill.

Actions: 'query' (execute DuckDB SQL), 'standup' (pre-fetch last 24h data), 'reindex' (rebuild index + cloud sync).`;

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
			case 'standup':
				return this._invokeStandup(subcommand ?? 'standup', token);
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
	 * Standup action: pre-fetch last 24h sessions + turns + files + refs,
	 * merge local/cloud, dedup, and return formatted data for the model to summarise.
	 */
	private async _invokeStandup(subcommand: NonNullable<SessionStoreSqlParams['subcommand']>, _token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const startTime = Date.now();
		const hadCloudConsent = this._indexingPreference.hasCloudConsent();
		const target: 'local' | 'cloud' = hadCloudConsent ? 'cloud' : 'local';

		try {
			// Always query local SQLite (has current machine's sessions)
			const localSessions = this._queryLocalStore();

			// Query cloud if user has cloud consent
			let cloudSessions: { sessions: AnnotatedSession[]; refs: AnnotatedRef[] } = { sessions: [], refs: [] };
			if (hadCloudConsent) {
				cloudSessions = await this._queryCloudStore();
			}

			// Merge and dedup by session ID (cloud wins on conflict)
			const seenIds = new Set<string>();
			const sessions: AnnotatedSession[] = [];
			const refs: AnnotatedRef[] = [];

			for (const s of cloudSessions.sessions) {
				if (!seenIds.has(s.id)) {
					seenIds.add(s.id);
					sessions.push(s);
				}
			}
			for (const s of localSessions.sessions) {
				if (!seenIds.has(s.id)) {
					seenIds.add(s.id);
					sessions.push(s);
				}
			}

			const seenRefs = new Set<string>();
			for (const r of [...cloudSessions.refs, ...localSessions.refs]) {
				const key = `${r.session_id}:${r.ref_type}:${r.ref_value}`;
				if (!seenRefs.has(key)) {
					seenRefs.add(key);
					refs.push(r);
				}
			}

			// Sort by updated_at descending, cap to 20
			sessions.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
			const capped = sessions.slice(0, 20);
			const cappedIds = new Set(capped.map(s => s.id));
			const cappedRefs = refs.filter(r => cappedIds.has(r.session_id));

			// Fetch turns and files for capped sessions
			let cappedTurns: SessionTurnInfo[] = [];
			let cappedFiles: SessionFileInfo[] = [];
			if (capped.length > 0) {
				const ids = capped.map(s => s.id);
				try {
					cappedTurns = this._sessionStore.executeReadOnlyFallback(buildTurnsQuery(ids)) as unknown as SessionTurnInfo[];
				} catch { /* non-fatal */ }
				try {
					cappedFiles = this._sessionStore.executeReadOnlyFallback(buildFilesQuery(ids)) as unknown as SessionFileInfo[];
				} catch { /* non-fatal */ }

				if (this._indexingPreference.hasCloudConsent()) {
					const cloudDetail = await this._queryCloudTurnsAndFiles(ids);

					if (cloudDetail.turns.length > 0) {
						const seenTurns = new Set(cappedTurns.map(t => `${t.session_id}:${t.turn_index}`));
						for (const t of cloudDetail.turns) {
							if (!seenTurns.has(`${t.session_id}:${t.turn_index}`)) {
								cappedTurns.push(t);
							}
						}
					}

					if (cloudDetail.files.length > 0) {
						const seenFiles = new Set(cappedFiles.map(f => `${f.session_id}:${f.file_path}`));
						for (const f of cloudDetail.files) {
							if (!seenFiles.has(`${f.session_id}:${f.file_path}`)) {
								cappedFiles.push(f);
							}
						}
					}
				}
			}

			const prompt = buildStandupPrompt(capped, cappedRefs, cappedTurns, cappedFiles);
			this._sendTelemetry({ command: 'standup', subcommand, target, rowCount: capped.length, durationMs: Date.now() - startTime, success: true });
			return new LanguageModelToolResult([new LanguageModelTextPart(prompt)]);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._sendTelemetry({ command: 'standup', subcommand, target, rowCount: 0, durationMs: Date.now() - startTime, success: false, error: message.substring(0, 100) });
			return new LanguageModelToolResult([new LanguageModelTextPart(`Error fetching standup data: ${message}`)]);
		}
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

	/**
	 * Query the local SQLite session store for sessions and refs.
	 */
	private _queryLocalStore(): { sessions: AnnotatedSession[]; refs: AnnotatedRef[] } {
		try {
			const rawSessions = this._sessionStore.executeReadOnlyFallback(SESSIONS_QUERY_SQLITE) as unknown as SessionRow[];
			const sessions: AnnotatedSession[] = rawSessions.map(s => ({ ...s, source: 'vscode' as const }));

			let refs: AnnotatedRef[] = [];
			if (sessions.length > 0) {
				const ids = sessions.map(s => s.id);
				const rawRefs = this._sessionStore.executeReadOnlyFallback(buildRefsQuery(ids)) as unknown as RefRow[];
				refs = rawRefs.map(r => ({ ...r, source: 'vscode' as const }));
			}

			return { sessions, refs };
		} catch {
			return { sessions: [], refs: [] };
		}
	}

	private async _queryCloudStore(): Promise<{ sessions: AnnotatedSession[]; refs: AnnotatedRef[] }> {
		const empty = { sessions: [] as AnnotatedSession[], refs: [] as AnnotatedRef[] };
		try {
			const client = new CloudSessionStoreClient(this._tokenManager, this._authService, this._fetcherService);

			const sessionsResult = await client.executeQuery(SESSIONS_QUERY_CLOUD);
			if (!sessionsResult || 'error' in sessionsResult || sessionsResult.rows.length === 0) {
				return empty;
			}

			const sessions: AnnotatedSession[] = sessionsResult.rows.map(r => ({
				id: r.id as string,
				summary: r.summary as string | undefined,
				branch: r.branch as string | undefined,
				repository: r.repository as string | undefined,
				agent_name: r.agent_name as string | undefined,
				agent_description: r.agent_description as string | undefined,
				created_at: r.created_at as string | undefined,
				updated_at: r.updated_at as string | undefined,
				source: 'cloud' as const,
			}));

			const ids = sessions.map(s => s.id);
			let refs: AnnotatedRef[] = [];
			try {
				const refsQuery = `SELECT session_id, ref_type, ref_value FROM session_refs WHERE session_id IN (${ids.map(s => `'${s.replace(/'/g, '\'\'')}'`).join(',')})`;
				const refsResult = await client.executeQuery(refsQuery);
				if (refsResult && !('error' in refsResult) && refsResult.rows.length > 0) {
					refs = refsResult.rows.map(r => ({
						session_id: r.session_id as string,
						ref_type: r.ref_type as 'commit' | 'pr' | 'issue',
						ref_value: r.ref_value as string,
						source: 'cloud' as const,
					}));
				}
			} catch { /* non-fatal */ }

			return { sessions, refs };
		} catch {
			return empty;
		}
	}

	private async _queryCloudTurnsAndFiles(sessionIds: string[]): Promise<{ turns: SessionTurnInfo[]; files: SessionFileInfo[] }> {
		const empty = { turns: [] as SessionTurnInfo[], files: [] as SessionFileInfo[] };
		try {
			const client = new CloudSessionStoreClient(this._tokenManager, this._authService, this._fetcherService);
			const inClause = sessionIds.map(s => `'${s.replace(/'/g, '\'\'')}'`).join(',');

			let turns: SessionTurnInfo[] = [];
			try {
				const turnsQuery = `SELECT session_id, turn_index, substring(user_message, 1, 120) as user_message, substring(assistant_response, 1, 200) as assistant_response FROM turns WHERE session_id IN (${inClause}) AND (user_message IS NOT NULL OR assistant_response IS NOT NULL) ORDER BY session_id, turn_index LIMIT 200`;
				const turnsResult = await client.executeQuery(turnsQuery);
				if (turnsResult && !('error' in turnsResult) && turnsResult.rows.length > 0) {
					turns = turnsResult.rows.map(r => ({
						session_id: r.session_id as string,
						turn_index: r.turn_index as number,
						user_message: r.user_message as string | undefined,
						assistant_response: r.assistant_response as string | undefined,
					}));
				}
			} catch { /* non-fatal */ }

			let files: SessionFileInfo[] = [];
			try {
				const filesQuery = `SELECT session_id, file_path, tool_name FROM session_files WHERE session_id IN (${inClause}) LIMIT 200`;
				const filesResult = await client.executeQuery(filesQuery);
				if (filesResult && !('error' in filesResult) && filesResult.rows.length > 0) {
					files = filesResult.rows.map(r => ({
						session_id: r.session_id as string,
						file_path: r.file_path as string,
						tool_name: r.tool_name as string | undefined,
					}));
				}
			} catch { /* non-fatal */ }

			return { turns, files };
		} catch {
			return empty;
		}
	}

	private _sendTelemetry(args: {
		command: 'query' | 'standup' | 'reindex';
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
"comment": "Tracks chronicle session-store tool invocations (query/standup/reindex) and outcomes",
"command": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Tool action invoked: query, standup, or reindex." },
"subcommand": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Originating /chronicle slash command (standup, tips, cost-tips, search, improve, reindex) or 'unknown' for ad-hoc model calls." },
"target": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the invocation primarily targeted the local SQLite store or the cloud session store." },
"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Fine-grained source: local, cloud, local_fallback, blocked, standup, or reindex (kept for back-compat)." },
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
			case 'standup':
				return {
					invocationMessage: l10n.t('Fetching standup data'),
					pastTenseMessage: l10n.t('Fetched standup data'),
				};
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
